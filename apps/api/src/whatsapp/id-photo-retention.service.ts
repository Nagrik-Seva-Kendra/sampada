import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { DEFAULT_ID_PHOTO_RETENTION_DAYS } from "@sampada/shared";
import { PrismaService } from "../prisma/prisma.service.js";
import { deleteMedia } from "./wa-media.js";
import { requestRef } from "./wa-requests.mapper.js";

/** WA_ID_PHOTO_RETENTION_DAYS (owner-configurable), default 90; invalid values fall back to the default. */
export function retentionDays(env: string | undefined = process.env.WA_ID_PHOTO_RETENTION_DAYS): number {
  const n = Number(env);
  return env !== undefined && env.trim() !== "" && Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_ID_PHOTO_RETENTION_DAYS;
}

/** Every stored ID-photo key of a request (including blurry retries), de-duplicated. */
export function idPhotoKeys(data: any): string[] {
  const keys = new Set<string>();
  for (const k of Array.isArray(data?.idFiles) ? data.idFiles : []) if (typeof k === "string") keys.add(k);
  for (const kinds of Object.values(data?.idPhotos ?? {})) {
    for (const k of Object.values((kinds as Record<string, unknown>) ?? {})) {
      if (typeof k === "string" && k.startsWith("whatsapp/")) keys.add(k);
    }
  }
  return [...keys];
}

/** The request's data after its photos are deleted: photo slots read "deleted", raw card readings dropped. */
export function purgedData(data: any): any {
  const out = { ...(data ?? {}) };
  if (out.idPhotos) {
    out.idPhotos = Object.fromEntries(
      Object.entries(out.idPhotos).map(([p, kinds]) => [
        p,
        Object.fromEntries(Object.entries((kinds as Record<string, unknown>) ?? {}).map(([k, v]) => [k, v === "later" ? v : "deleted"])),
      ]),
    );
  }
  delete out.idFiles;
  delete out.idPending;
  return out;
}

const DAY_MS = 24 * 3600 * 1000;
const EVERY_MS = 6 * 3600 * 1000;

/**
 * Deletes WhatsApp ID-card photos WA_ID_PHOTO_RETENTION_DAYS after the request
 * was closed (DONE/REJECTED). Runs shortly after start and then every 6 hours.
 * Logs request refs and counts only.
 */
@Injectable()
export class IdPhotoRetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger("IdPhotoRetention");
  private timer?: NodeJS.Timeout;
  private first?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === "test") return;
    const run = () => this.purge().catch((e) => this.log.error(`purge failed: ${e?.name ?? "error"}`));
    this.first = setTimeout(run, 60_000);
    this.timer = setInterval(run, EVERY_MS);
    this.first.unref?.();
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    clearTimeout(this.first);
    clearInterval(this.timer);
  }

  /** Purges every due request; returns how many were purged. */
  async purge(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - retentionDays() * DAY_MS);
    const due = await this.prisma.draftIntake.findMany({
      where: { closedAt: { lte: cutoff }, idPhotosPurgedAt: null, workStatus: { in: ["DONE", "REJECTED"] } },
      select: { id: true, data: true },
      take: 200,
    });
    let done = 0;
    for (const row of due) {
      const keys = idPhotoKeys(row.data);
      let failed = 0;
      for (const key of keys) {
        try {
          await deleteMedia(key);
        } catch {
          failed++;
        }
      }
      if (failed) {
        // Retried on the next run; the row keeps its keys until every file is gone.
        this.log.warn(`request ${requestRef(row.id)}: ${failed}/${keys.length} ID photos not deleted yet`);
        continue;
      }
      await this.prisma.draftIntake.update({ where: { id: row.id }, data: { data: purgedData(row.data), idPhotosPurgedAt: now } });
      this.log.log(`request ${requestRef(row.id)}: ${keys.length} ID photos deleted (retention)`);
      done++;
    }
    return done;
  }
}
