import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { readFile } from "node:fs/promises";
import { ClsService } from "nestjs-cls";
import type {
  WaAssignee,
  WaRequestDetail,
  WaRequestList,
  WaRequestSummary,
  WaRequestUpdateInput,
  WaRevealResult,
  WaWorkStatus,
} from "@sampada/shared";
import { r2Configured, r2Get } from "../guideline/r2.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { requireTenantContext } from "../tenant/current-tenant.js";
import type { TenantContext } from "../tenant/tenant-context.js";
import {
  documentKeyAt,
  type DraftIntakeRow,
  idPhotoKeyAt,
  localMediaPath,
  mimeForKey,
  requestRef,
  revealSecrets,
  toDetail,
  toListItem,
} from "./wa-requests.mapper.js";

/** OWNER/ADMIN manage every request of the org: see all, assign, reveal Aadhaar/PAN. */
export const isManagerRole = (role: string): boolean => role === "OWNER" || role === "ADMIN";
/** Kept for callers/tests that ask specifically about revealing. */
export const canRevealRole = isManagerRole;

/**
 * Which DraftIntake rows the caller may touch at all. OWNER/ADMIN: the whole
 * organization. Everyone else: only requests assigned to them -- anything else
 * (unassigned, someone else's) is simply not found (404), never 403, so an id
 * can't be probed.
 */
export function visibleWhere(tenant: Pick<TenantContext, "organizationId" | "userId" | "role">) {
  return isManagerRole(tenant.role)
    ? { organizationId: tenant.organizationId }
    : { organizationId: tenant.organizationId, assigneeId: tenant.userId };
}

/** closedAt for a status change: set when it becomes DONE/REJECTED, kept if already closed, cleared on reopen. */
export function closedAtFor(row: { workStatus: string | null; closedAt?: Date | null }, next: string, now = new Date()): Date | null {
  const closed = (s: string | null) => s === "DONE" || s === "REJECTED";
  if (!closed(next)) return null;
  return closed(row.workStatus) && row.closedAt ? row.closedAt : now;
}

/** Badge count: NEW for managers; an employee's own open work (NEW + IN_PROGRESS). */
function pendingWhere(tenant: Pick<TenantContext, "organizationId" | "userId" | "role">) {
  return isManagerRole(tenant.role)
    ? { ...visibleWhere(tenant), workStatus: "NEW" }
    : { ...visibleWhere(tenant), workStatus: { in: ["NEW", "IN_PROGRESS"] } };
}

/**
 * Office view of WhatsApp draft requests. DraftIntake is not in TENANT_MODELS
 * (the public webhook writes it with no tenant context), so every query here
 * filters by the caller's organizationId explicitly -- never trust an id alone --
 * and, for non-managers, by assigneeId = caller (visibleWhere).
 */
@Injectable()
export class WaRequestsService {
  private readonly log = new Logger("WhatsappRequests");

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  async list(filters: { workStatus?: WaWorkStatus; needsStaff?: boolean }): Promise<WaRequestList> {
    const tenant = requireTenantContext(this.cls);
    const rows = (await this.prisma.draftIntake.findMany({
      where: {
        ...visibleWhere(tenant),
        ...(filters.workStatus ? { workStatus: filters.workStatus } : {}),
        ...(filters.needsStaff !== undefined ? { needsStaff: filters.needsStaff } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    })) as DraftIntakeRow[];
    const newCount = await this.prisma.draftIntake.count({ where: pendingWhere(tenant) });
    const names = await this.userNames(rows.map((r) => r.assigneeId));
    return { data: rows.map((r) => toListItem(r, r.assigneeId ? (names.get(r.assigneeId) ?? null) : null)), newCount };
  }

  /** Sidebar: badge count, and whether the item is shown at all (employees: only with ≥1 assigned request). */
  async summary(): Promise<WaRequestSummary> {
    const tenant = requireTenantContext(this.cls);
    const canManage = isManagerRole(tenant.role);
    const [newCount, visibleCount] = await Promise.all([
      this.prisma.draftIntake.count({ where: pendingWhere(tenant) }),
      canManage ? Promise.resolve(0) : this.prisma.draftIntake.count({ where: visibleWhere(tenant) }),
    ]);
    return { newCount, canManage, visible: canManage || visibleCount > 0 };
  }

  async detail(id: string): Promise<WaRequestDetail> {
    const tenant = requireTenantContext(this.cls);
    const row = await this.find(id, tenant);
    const names = await this.userNames([row.assigneeId]);
    return toDetail(row, row.assigneeId ? (names.get(row.assigneeId) ?? null) : null, isManagerRole(tenant.role));
  }

  /** OWNER/ADMIN only (checked by the caller's org role). Logs who revealed which request, never the values. */
  async reveal(id: string): Promise<WaRevealResult> {
    const tenant = requireTenantContext(this.cls);
    if (!isManagerRole(tenant.role)) {
      throw new ForbiddenException("केवल मालिक या एडमिन आधार/PAN देख सकते हैं।");
    }
    const row = await this.find(id, tenant);
    const result = revealSecrets(row);
    this.log.log(`request ${requestRef(row.id)} (${row.id}): Aadhaar/PAN revealed by user ${tenant.userId} role=${tenant.role}`);
    return result;
  }

  /**
   * Status/note: managers on any request, others only on their own (find()
   * 404s otherwise). Changing the assignee is OWNER/ADMIN only.
   */
  async update(id: string, input: WaRequestUpdateInput): Promise<WaRequestDetail> {
    const tenant = requireTenantContext(this.cls);
    const before = await this.find(id, tenant);
    if (input.assigneeId !== undefined && !isManagerRole(tenant.role)) {
      throw new ForbiddenException("केवल मालिक या एडमिन अनुरोध किसी को सौंप सकते हैं।");
    }
    if (input.assigneeId) {
      const member = await this.prisma.membership.findFirst({
        where: { organizationId: tenant.organizationId, userId: input.assigneeId, status: "ACTIVE" },
        select: { id: true },
      });
      if (!member) throw new BadRequestException("यह व्यक्ति इस संस्था का सक्रिय सदस्य नहीं है।");
    }
    await this.prisma.draftIntake.updateMany({
      where: { id, ...visibleWhere(tenant) },
      data: {
        ...(input.workStatus !== undefined ? { workStatus: input.workStatus, closedAt: closedAtFor(before, input.workStatus) } : {}),
        ...(input.assigneeId !== undefined ? { assigneeId: input.assigneeId } : {}),
        ...(input.staffNote !== undefined ? { staffNote: input.staffNote?.trim() || null } : {}),
      },
    });
    return this.detail(id);
  }

  /** OWNER/ADMIN only -- only they assign. */
  async assignees(): Promise<WaAssignee[]> {
    const tenant = requireTenantContext(this.cls);
    if (!isManagerRole(tenant.role)) {
      throw new ForbiddenException("केवल मालिक या एडमिन अनुरोध किसी को सौंप सकते हैं।");
    }
    const { organizationId } = tenant;
    const members = await this.prisma.membership.findMany({
      where: { organizationId, status: "ACTIVE" },
      select: { user: { select: { id: true, fname: true, lname: true } } },
    });
    return members
      .map((m) => ({ id: m.user.id, name: `${m.user.fname} ${m.user.lname}`.trim() }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * One ID-card photo (Aadhaar/PAN/passport photo). Same visibility as the
   * request itself: OWNER/ADMIN, or the employee it is assigned to (find() 404s
   * for anyone else). Logs who viewed which request's photo, never its content.
   */
  async idPhoto(id: string, party: string, kind: string): Promise<{ data: Buffer; mimeType: string; fileName: string }> {
    const tenant = requireTenantContext(this.cls);
    const row = await this.find(id, tenant);
    const key = idPhotoKeyAt(row, party, kind);
    if (!key) throw new NotFoundException("फ़ोटो उपलब्ध नहीं है।");
    const data = await this.readMedia(key).catch((e: any) => {
      this.log.warn(`ID photo for request ${requestRef(row.id)} unavailable: ${e?.code ?? e?.name ?? "error"}`);
      throw new NotFoundException("फ़ोटो उपलब्ध नहीं है।");
    });
    this.log.log(`request ${requestRef(row.id)} (${row.id}): ID photo ${party}/${kind} viewed by user ${tenant.userId} role=${tenant.role}`);
    const ext = key.includes(".") ? key.slice(key.lastIndexOf(".")) : "";
    return { data, mimeType: mimeForKey(key), fileName: `whatsapp-${requestRef(row.id)}-${party}-${kind}${ext}` };
  }

  private async readMedia(key: string): Promise<Buffer> {
    if (r2Configured()) return r2Get(key);
    const path = localMediaPath(key);
    if (!path) throw new Error("invalid media path");
    return readFile(path);
  }

  /** The customer's original file: from R2 when configured, else the local media dir. */
  async document(id: string, index: number): Promise<{ data: Buffer; mimeType: string; fileName: string }> {
    const row = await this.find(id, requireTenantContext(this.cls));
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

  /** The request if the caller may see it (visibleWhere), else 404. */
  private async find(id: string, tenant: TenantContext): Promise<DraftIntakeRow> {
    const row = (await this.prisma.draftIntake.findFirst({ where: { id, ...visibleWhere(tenant) } })) as DraftIntakeRow | null;
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
