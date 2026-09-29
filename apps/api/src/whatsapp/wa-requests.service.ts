import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { readFile } from "node:fs/promises";
import { ClsService } from "nestjs-cls";
import type {
  WaAssignee,
  WaRequestDetail,
  WaRequestList,
  WaRequestUpdateInput,
  WaRevealResult,
  WaWorkStatus,
} from "@sampada/shared";
import { r2Configured, r2Get } from "../guideline/r2.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { requireTenantContext } from "../tenant/current-tenant.js";
import {
  documentKeyAt,
  type DraftIntakeRow,
  localMediaPath,
  mimeForKey,
  requestRef,
  revealSecrets,
  toDetail,
  toListItem,
} from "./wa-requests.mapper.js";

export const canRevealRole = (role: string): boolean => role === "OWNER" || role === "ADMIN";

/**
 * Office view of WhatsApp draft requests. DraftIntake is not in TENANT_MODELS
 * (the public webhook writes it with no tenant context), so every query here
 * filters by the caller's organizationId explicitly -- never trust an id alone.
 */
@Injectable()
export class WaRequestsService {
  private readonly log = new Logger("WhatsappRequests");

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  async list(filters: { workStatus?: WaWorkStatus; needsStaff?: boolean }): Promise<WaRequestList> {
    const { organizationId } = requireTenantContext(this.cls);
    const rows = (await this.prisma.draftIntake.findMany({
      where: {
        organizationId,
        ...(filters.workStatus ? { workStatus: filters.workStatus } : {}),
        ...(filters.needsStaff !== undefined ? { needsStaff: filters.needsStaff } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    })) as DraftIntakeRow[];
    const newCount = await this.prisma.draftIntake.count({ where: { organizationId, workStatus: "NEW" } });
    const names = await this.userNames(rows.map((r) => r.assigneeId));
    return { data: rows.map((r) => toListItem(r, r.assigneeId ? (names.get(r.assigneeId) ?? null) : null)), newCount };
  }

  async newCount(): Promise<{ newCount: number }> {
    const { organizationId } = requireTenantContext(this.cls);
    return { newCount: await this.prisma.draftIntake.count({ where: { organizationId, workStatus: "NEW" } }) };
  }

  async detail(id: string): Promise<WaRequestDetail> {
    const tenant = requireTenantContext(this.cls);
    const row = await this.find(id, tenant.organizationId);
    const names = await this.userNames([row.assigneeId]);
    return toDetail(row, row.assigneeId ? (names.get(row.assigneeId) ?? null) : null, canRevealRole(tenant.role));
  }

  /** OWNER/ADMIN only (checked by the caller's org role). Logs who revealed which request, never the values. */
  async reveal(id: string): Promise<WaRevealResult> {
    const tenant = requireTenantContext(this.cls);
    if (!canRevealRole(tenant.role)) {
      throw new ForbiddenException("केवल मालिक या एडमिन आधार/PAN देख सकते हैं।");
    }
    const row = await this.find(id, tenant.organizationId);
    const result = revealSecrets(row);
    this.log.log(`request ${requestRef(row.id)} (${row.id}): Aadhaar/PAN revealed by user ${tenant.userId} role=${tenant.role}`);
    return result;
  }

  async update(id: string, input: WaRequestUpdateInput): Promise<WaRequestDetail> {
    const tenant = requireTenantContext(this.cls);
    await this.find(id, tenant.organizationId);
    if (input.assigneeId) {
      const member = await this.prisma.membership.findFirst({
        where: { organizationId: tenant.organizationId, userId: input.assigneeId, status: "ACTIVE" },
        select: { id: true },
      });
      if (!member) throw new BadRequestException("यह व्यक्ति इस संस्था का सक्रिय सदस्य नहीं है।");
    }
    await this.prisma.draftIntake.updateMany({
      where: { id, organizationId: tenant.organizationId },
      data: {
        ...(input.workStatus !== undefined ? { workStatus: input.workStatus } : {}),
        ...(input.assigneeId !== undefined ? { assigneeId: input.assigneeId } : {}),
        ...(input.staffNote !== undefined ? { staffNote: input.staffNote?.trim() || null } : {}),
      },
    });
    return this.detail(id);
  }

  async assignees(): Promise<WaAssignee[]> {
    const { organizationId } = requireTenantContext(this.cls);
    const members = await this.prisma.membership.findMany({
      where: { organizationId, status: "ACTIVE" },
      select: { user: { select: { id: true, fname: true, lname: true } } },
    });
    return members
      .map((m) => ({ id: m.user.id, name: `${m.user.fname} ${m.user.lname}`.trim() }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** The customer's original file: from R2 when configured, else the local media dir. */
  async document(id: string, index: number): Promise<{ data: Buffer; mimeType: string; fileName: string }> {
    const { organizationId } = requireTenantContext(this.cls);
    const row = await this.find(id, organizationId);
    const key = documentKeyAt(row, index);
    if (!key) throw new NotFoundException("दस्तावेज़ नहीं मिला।");
    const ext = key.includes(".") ? key.slice(key.lastIndexOf(".")) : "";
    const fileName = `whatsapp-${requestRef(row.id)}-${index === 0 ? "registry" : `doc-${index}`}${ext}`;
    let data: Buffer;
    try {
      if (r2Configured()) {
        data = await r2Get(key);
      } else {
        const path = localMediaPath(key);
        if (!path) throw new Error("invalid media path");
        data = await readFile(path);
      }
    } catch (e: any) {
      this.log.warn(`document ${index} for request ${requestRef(row.id)} unavailable: ${e?.code ?? e?.name ?? "error"}`);
      throw new NotFoundException("दस्तावेज़ उपलब्ध नहीं है।");
    }
    return { data, mimeType: mimeForKey(key), fileName };
  }

  private async find(id: string, organizationId: string): Promise<DraftIntakeRow> {
    const row = (await this.prisma.draftIntake.findFirst({ where: { id, organizationId } })) as DraftIntakeRow | null;
    if (!row) throw new NotFoundException("अनुरोध नहीं मिला।");
    return row;
  }

  private async userNames(ids: (string | null)[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((x): x is string => !!x))];
    if (!unique.length) return new Map();
    const users = await this.prisma.user.findMany({
      where: { id: { in: unique } },
      select: { id: true, fname: true, lname: true },
    });
    return new Map(users.map((u) => [u.id, `${u.fname} ${u.lname}`.trim()]));
  }
}
