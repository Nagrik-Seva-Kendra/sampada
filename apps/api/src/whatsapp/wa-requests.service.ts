import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from "@nestjs/common";
import { readFile } from "node:fs/promises";
import { ClsService } from "nestjs-cls";
import {
  statusText,
  WA_NOTIFY_STATUSES,
  WA_STATUS_PHRASE,
  WA_TEMPLATES,
  type WaAssignee,
  type WaBulkDeleteResult,
  type WaDeleteResult,
  type WaNotification,
  type WaRequestDetail,
  type WaRequestList,
  type WaRequestSummary,
  type WaRegistryWhen,
  type WaRequestUpdateInput,
  type WaRevealResult,
  type WaWorkStatus,
} from "@sampada/shared";
import { r2Configured, r2Get } from "../guideline/r2.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { addDay, istToday } from "./registry-date.js";
import { effectiveKind } from "./call-rules.js";
import { FollowUpService } from "./followup.service.js";
import { SatisfactionService } from "./satisfaction.service.js";
import { registryConfirmText, registryWhenHi } from "./registry-flow.js";
import { requireTenantContext } from "../tenant/current-tenant.js";
import type { TenantContext } from "../tenant/tenant-context.js";
import { WaOutboxService } from "./wa-outbox.service.js";
import { deleteMedia } from "./wa-media.js";
import { requestMediaKeys } from "./wa-request-delete.js";
import {
  documentKeyAt,
  draftReviewOf,
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
/** Requests whose registry day (confirmed, else the customer's preferred one) is today / tomorrow / within 7 days. */
export function registryWhere(when: WaRegistryWhen, now = new Date()) {
  const today = istToday(now);
  const [from, to] = when === "today" ? [today, today] : when === "tomorrow" ? [addDay(today, 1), addDay(today, 1)] : [today, addDay(today, 6)];
  const range = { gte: from, lte: to };
  return { OR: [{ registryDate: range }, { registryDate: null, preferredDate: range }] };
}

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
    private readonly outbox: WaOutboxService,
    @Optional() private readonly followups?: FollowUpService,
    @Optional() private readonly satisfaction?: SatisfactionService,
  ) {}

  async list(filters: { workStatus?: WaWorkStatus; needsStaff?: boolean; registry?: WaRegistryWhen }): Promise<WaRequestList> {
    const tenant = requireTenantContext(this.cls);
    const rows = (await this.prisma.draftIntake.findMany({
      where: {
        ...visibleWhere(tenant),
        ...(filters.workStatus ? { workStatus: filters.workStatus } : {}),
        ...(filters.needsStaff !== undefined ? { needsStaff: filters.needsStaff } : {}),
        ...(filters.registry ? registryWhere(filters.registry) : {}),
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
    const deedId = (row as { deedTemplateId?: string | null }).deedTemplateId ?? null;
    const [names, notifications, deed] = await Promise.all([
      this.userNames([row.assigneeId]),
      this.outbox.list(row.id),
      deedId
        ? this.prisma.deedTemplate.findFirst({ where: { id: deedId, organizationId: tenant.organizationId }, select: { id: true, type: true, title: true } })
        : Promise.resolve(null),
    ]);
    const canManage = isManagerRole(tenant.role);
    return {
      ...toDetail(row, row.assigneeId ? (names.get(row.assigneeId) ?? null) : null, canManage),
      notifications,
      deed: deed ?? null,
      draftReview: draftReviewOf(row.data),
      canSendDraft: canManage && !!deed && row.workStatus === "DRAFT_READY",
      followUp: await this.followUpOf(row),
    };
  }

  private async followUpOf(row: DraftIntakeRow): Promise<WaRequestDetail["followUp"]> {
    if (!this.followups) return undefined;
    const choice = (["auto", "none", "agreement", "patta"] as const).find((k) => k === row.followUpKind) ?? "auto";
    return {
      kind: choice,
      termEndDate: row.termEndDate ?? null,
      effectiveKind: effectiveKind((row.data as any)?.deedType, choice),
      items: await this.followups.forRequest(row.id),
      optedOut: await this.followups.optedOut(row.phone),
    };
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
    const prevStatus = before.workStatus;
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
    if (input.deedTemplateId) {
      const deed = await this.prisma.deedTemplate.findFirst({
        where: { id: input.deedTemplateId, organizationId: tenant.organizationId },
        select: { id: true },
      });
      if (!deed) throw new BadRequestException("यह डीड इस संस्था में नहीं मिली।");
    }
    const nextDate = input.registryDate !== undefined ? input.registryDate : (before.registryDate ?? null);
    const nextTime = input.registryTime !== undefined ? input.registryTime : (before.registryTime ?? null);
    if (input.registryDate && input.registryDate < istToday()) throw new BadRequestException("रजिस्ट्री की तारीख पिछली नहीं हो सकती।");
    const registryChanged = nextDate !== (before.registryDate ?? null) || (nextDate !== null && nextTime !== (before.registryTime ?? null));
    await this.prisma.draftIntake.updateMany({
      where: { id, ...visibleWhere(tenant) },
      data: {
        ...(input.workStatus !== undefined ? { workStatus: input.workStatus, closedAt: closedAtFor(before, input.workStatus) } : {}),
        ...(input.assigneeId !== undefined ? { assigneeId: input.assigneeId } : {}),
        ...(input.staffNote !== undefined ? { staffNote: input.staffNote?.trim() || null } : {}),
        ...(input.deedTemplateId !== undefined ? { deedTemplateId: input.deedTemplateId } : {}),
        ...(input.registryDate !== undefined ? { registryDate: input.registryDate } : {}),
        ...(input.registryTime !== undefined ? { registryTime: input.registryTime } : {}),
        ...(registryChanged ? { registryReminderSentAt: null } : {}),
        ...(input.geoTagPhotos !== undefined ? { geoTagPhotos: input.geoTagPhotos } : {}),
        ...(input.geoTagTaken !== undefined ? { geoTagTakenAt: input.geoTagTaken ? (before.geoTagTakenAt ?? new Date()) : null } : {}),
        ...(input.followUpKind !== undefined ? { followUpKind: input.followUpKind } : {}),
        ...(input.termEndDate !== undefined ? { termEndDate: input.termEndDate } : {}),
      },
    });
    // Follow-ups: planned when the request becomes DONE, re-planned when their inputs change (cancelled when reopened).
    const followUpChanged =
      (input.workStatus !== undefined && input.workStatus !== prevStatus && (input.workStatus === "DONE" || prevStatus === "DONE")) ||
      (input.followUpKind !== undefined && input.followUpKind !== (before.followUpKind ?? "auto")) ||
      (input.termEndDate !== undefined && input.termEndDate !== (before.termEndDate ?? null)) ||
      (input.registryDate !== undefined && input.registryDate !== (before.registryDate ?? null));
    if (followUpChanged && this.followups && before.status === "SUBMITTED") {
      const after = (await this.prisma.draftIntake.findFirst({ where: { id } })) as DraftIntakeRow | null;
      if (after) await this.followups.scheduleFor(after).catch((e) => this.log.error(`follow-up for request ${requestRef(id)} not planned: ${e?.name ?? "error"}`));
    }
    if (registryChanged && nextDate && before.status === "SUBMITTED") await this.notifyRegistry(before, nextDate, nextTime);
    if (input.workStatus !== undefined && input.workStatus !== prevStatus && before.status === "SUBMITTED") {
      await this.notifyStatus(before, input.workStatus);
      if (input.workStatus === "DONE" && this.satisfaction) {
        const after = (await this.prisma.draftIntake.findFirst({ where: { id } })) as any;
        if (after) await this.satisfaction.onDone(after).catch((e) => this.log.error(`packet for request ${requestRef(id)} failed: ${e?.name ?? "error"}`));
      }
    }
    return this.detail(id);
  }

  /**
   * Tells the customer about a status change on WhatsApp (request number +
   * Hindi text; the approved template outside the 24h window). A failure never
   * blocks the status change: the message is stored PENDING for a manual resend.
   */
  private async notifyStatus(row: DraftIntakeRow, status: WaWorkStatus): Promise<void> {
    const s = (WA_NOTIFY_STATUSES as readonly string[]).includes(status) ? (status as (typeof WA_NOTIFY_STATUSES)[number]) : null;
    if (!s) return;
    const ref = requestRef(row.id);
    await this.outbox
      .send({
        organizationId: row.organizationId,
        draftIntakeId: row.id,
        kind: "STATUS",
        to: row.phone,
        text: statusText(ref, s),
        template: { name: WA_TEMPLATES.status.name, language: WA_TEMPLATES.status.language, params: [ref, WA_STATUS_PHRASE[s]] },
      })
      .catch((e) => this.log.error(`status message for request ${ref} not recorded: ${e?.code ?? e?.name ?? "error"}`));
  }

  /** Tells the customer the confirmed registry date (same window/template rules as status updates). */
  private async notifyRegistry(row: DraftIntakeRow, date: string, time: string | null): Promise<void> {
    const ref = requestRef(row.id);
    await this.outbox
      .send({
        organizationId: row.organizationId,
        draftIntakeId: row.id,
        kind: "REGISTRY",
        to: row.phone,
        text: registryConfirmText(ref, date, time),
        template: { name: WA_TEMPLATES.registryDate.name, language: WA_TEMPLATES.registryDate.language, params: [ref, registryWhenHi(date, time)] },
      })
      .catch((e) => this.log.error(`registry date message for request ${ref} not recorded: ${e?.code ?? e?.name ?? "error"}`));
  }

  /** Resend a PENDING message of a request the caller may see (same access as the request). */
  async resendNotification(id: string, notificationId: string): Promise<WaNotification> {
    const row = await this.find(id, requireTenantContext(this.cls));
    return this.outbox.resend(row.id, notificationId);
  }

  /**
   * Permanently deletes a request: first every stored file (R2 / local), then
   * -- only if all of them are gone -- its WaNotification rows and the
   * DraftIntake row, in one transaction. A deed made from it is kept (only the
   * link goes with the row). WaContact, WaInboundMessage and other requests are
   * untouched. OWNER/ADMIN only; `confirm` must be the request number.
   */
  async remove(id: string, confirm: string): Promise<WaDeleteResult> {
    const tenant = requireTenantContext(this.cls);
    if (!isManagerRole(tenant.role)) throw new ForbiddenException("केवल मालिक या एडमिन अनुरोध हटा सकते हैं।");
    const row = await this.find(id, tenant);
    if (confirm.trim().toUpperCase() !== requestRef(row.id)) {
      throw new BadRequestException("अनुरोध नंबर मेल नहीं खाता — अनुरोध नहीं हटाया गया।");
    }
    return this.erase(row, tenant);
  }

  /** Several requests at once; confirm must be "DELETE <count>". Each is deleted (or fails) on its own. */
  async removeMany(ids: string[], confirm: string): Promise<WaBulkDeleteResult> {
    const tenant = requireTenantContext(this.cls);
    if (!isManagerRole(tenant.role)) throw new ForbiddenException("केवल मालिक या एडमिन अनुरोध हटा सकते हैं।");
    const unique = [...new Set(ids)];
    if (confirm.trim().replace(/\s+/g, " ").toUpperCase() !== `DELETE ${unique.length}`) {
      throw new BadRequestException(`पुष्टि के लिए "DELETE ${unique.length}" लिखें — कुछ नहीं हटाया गया।`);
    }
    const result: WaBulkDeleteResult = { deleted: [], failed: [] };
    for (const id of unique) {
      const row = (await this.prisma.draftIntake.findFirst({ where: { id, ...visibleWhere(tenant) } })) as DraftIntakeRow | null;
      if (!row) {
        result.failed.push({ id, ref: requestRef(id), reason: "नहीं मिला" });
        continue;
      }
      try {
        result.deleted.push(await this.erase(row, tenant));
      } catch (e: any) {
        result.failed.push({ id, ref: requestRef(id), reason: e?.message ?? "हटाया नहीं जा सका" });
      }
    }
    return result;
  }

  private async erase(row: DraftIntakeRow, tenant: TenantContext): Promise<WaDeleteResult> {
    const ref = requestRef(row.id);
    const notes = await this.prisma.waNotification.findMany({ where: { draftIntakeId: row.id }, select: { template: true } });
    const keys = requestMediaKeys(row, notes.map((n) => n.template));
    // Files first: if any cannot be deleted, keep the row so nothing is left orphaned (retry is safe).
    const failed: string[] = [];
    for (const key of keys) {
      try {
        await deleteMedia(key);
      } catch {
        failed.push(key);
      }
    }
    if (failed.length) {
      this.log.warn(`request ${ref} org ${tenant.organizationId}: delete stopped, ${failed.length}/${keys.length} files not deleted (user ${tenant.userId})`);
      throw new ServiceUnavailableException("दस्तावेज़/फ़ोटो की फ़ाइलें नहीं हट सकीं, इसलिए अनुरोध नहीं हटाया गया। कृपया थोड़ी देर बाद फिर कोशिश करें।");
    }
    await this.prisma.$transaction([
      this.prisma.waNotification.deleteMany({ where: { draftIntakeId: row.id } }),
      this.prisma.draftIntake.deleteMany({ where: { id: row.id, organizationId: tenant.organizationId } }),
    ]);
    this.log.log(`request ${ref} deleted from org ${tenant.organizationId} by user ${tenant.userId} role=${tenant.role} (${keys.length} files)`);
    return { ref, deedTemplateId: (row as { deedTemplateId?: string | null }).deedTemplateId ?? null, filesDeleted: keys.length };
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
