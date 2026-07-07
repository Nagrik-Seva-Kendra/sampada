import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { DeedType } from "@sampada/shared";
import type { CreateSampleDeedInput, SampleDeedItem, UpdateSampleDeedInput } from "@sampada/shared";
import type { StaffUser } from "../auth/jwt-staff.guard.js";

/**
 * Example deeds shown on a deed-type's public info page. Each staff member
 * (admin or partner) can draft their own; ADMIN additionally sees everyone's.
 * Interim on-disk storage (DB-free): one JSON file per record, named
 * `<type>__<id>.json` in `records/`. Each type's records are cached in
 * memory after first use (a type like sale-deed has 4000+ legacy records,
 * so reading them is real I/O, not overhead) — but every access re-checks
 * the directory listing (cheap: just filenames) and only reads content for
 * files the cache doesn't have yet, so a file that appears or disappears
 * outside our own create/update/remove calls is never silently stale.
 */
@Injectable()
export class SampleDeedsService {
  private readonly baseDir =
    process.env.UPLOAD_DIR
      ? path.join(process.env.UPLOAD_DIR, "..", "sample-deeds", "records")
      : path.resolve(process.cwd(), "uploads", "sample-deeds", "records");

  /** type -> (id -> item), populated lazily per type on first access. */
  private readonly cache = new Map<DeedType, Map<string, SampleDeedItem>>();
  /** id -> type, so update/remove can find an item's cache bucket without knowing its type upfront. */
  private readonly typeById = new Map<string, DeedType>();
  /** In-flight loads/syncs, so concurrent requests for a type share one directory scan. */
  private readonly loading = new Map<DeedType, Promise<Map<string, SampleDeedItem>>>();

  private fileFor(type: DeedType, id: string): string {
    return path.join(this.baseDir, `${type}__${id}.json`);
  }

  /** Return a type's cache, reconciled against the live directory listing. */
  private async loadType(type: DeedType): Promise<Map<string, SampleDeedItem>> {
    const inFlight = this.loading.get(type);
    if (inFlight) return inFlight;

    const promise = (async () => {
      const bucket = this.cache.get(type) ?? new Map<string, SampleDeedItem>();
      this.cache.set(type, bucket);

      let names: string[];
      try {
        names = await fs.readdir(this.baseDir);
      } catch {
        names = [];
      }
      const prefix = `${type}__`;
      const suffix = ".json";
      const onDisk = new Map<string, string>(); // id -> filename
      for (const n of names) {
        if (n.startsWith(prefix) && n.endsWith(suffix)) {
          onDisk.set(n.slice(prefix.length, n.length - suffix.length), n);
        }
      }
      // Evict cache entries whose file is gone.
      for (const id of bucket.keys()) {
        if (!onDisk.has(id)) {
          bucket.delete(id);
          this.typeById.delete(id);
        }
      }
      // Read content only for files the cache doesn't already have.
      const toRead = [...onDisk].filter(([id]) => !bucket.has(id));
      const items = await Promise.all(
        toRead.map(([, n]) =>
          fs.readFile(path.join(this.baseDir, n), "utf8").then((t) => JSON.parse(t) as SampleDeedItem),
        ),
      );
      for (const item of items) {
        bucket.set(item.id, item);
        this.typeById.set(item.id, item.type);
      }
      return bucket;
    })();
    this.loading.set(type, promise);
    try {
      return await promise;
    } finally {
      this.loading.delete(type);
    }
  }

  /** Locate an item by id alone, loading its type's cache bucket first if needed. */
  private async findById(id: string): Promise<SampleDeedItem | null> {
    const knownType = this.typeById.get(id);
    if (knownType) return (await this.loadType(knownType)).get(id) ?? null;
    // Not indexed yet: check disk for the file's type prefix, then load (and cache) that type.
    let names: string[];
    try {
      names = await fs.readdir(this.baseDir);
    } catch {
      return null;
    }
    const match = names.find((n) => n.endsWith(`__${id}.json`));
    if (!match) return null;
    const type = match.slice(0, match.indexOf("__")) as DeedType;
    return (await this.loadType(type)).get(id) ?? null;
  }

  /**
   * ADMIN and EMPLOYEE see every ADMIN/EMPLOYEE deed of this type combined
   * (partners' own drafts are excluded here — those surface only in the
   * partner's own register / the admin's "All Partner Deeds" page). PARTNER
   * sees only their own. Newest first.
   */
  async listByType(type: DeedType, user: StaffUser): Promise<SampleDeedItem[]> {
    const items = [...(await this.loadType(type)).values()];
    const canViewAll = user.role === "ADMIN" || user.role === "EMPLOYEE";
    const visible = canViewAll
      ? items.filter((i) => i.createdByRole !== "PARTNER")
      : items.filter((i) => i.createdById === user.id);
    return visible.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /**
   * ADMIN/EMPLOYEE: every partner's sample deeds across every deed type,
   * combined, newest first — powers the admin's "All Partner Deeds" page.
   * Pass creatorId to narrow it down to one partner.
   */
  async listPartners(creatorId?: string): Promise<SampleDeedItem[]> {
    const buckets = await Promise.all(DeedType.options.map((t) => this.loadType(t)));
    const all = buckets.flatMap((bucket) => [...bucket.values()]);
    const visible = all.filter(
      (i) => i.createdByRole === "PARTNER" && (!creatorId || i.createdById === creatorId),
    );
    return visible.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** Draft a new deed for a type, owned by the caller. */
  async create(input: CreateSampleDeedInput, user: StaffUser): Promise<SampleDeedItem> {
    const item: SampleDeedItem = {
      ...input,
      id: randomUUID(),
      status: "active",
      createdById: user.id,
      createdByName: user.name,
      createdByRole: user.role,
      createdAt: new Date().toISOString(),
    };
    await fs.mkdir(this.baseDir, { recursive: true });
    await fs.writeFile(this.fileFor(item.type, item.id), JSON.stringify(item), "utf8");
    (await this.loadType(item.type)).set(item.id, item);
    this.typeById.set(item.id, item.type);
    return item;
  }

  /** Edit own deed (ADMIN and EMPLOYEE: any deed). */
  async update(id: string, input: UpdateSampleDeedInput, user: StaffUser): Promise<SampleDeedItem> {
    const canEditAny = user.role === "ADMIN" || user.role === "EMPLOYEE";
    const item = await this.findById(id);
    if (!item || (!canEditAny && item.createdById !== user.id)) {
      throw new NotFoundException("Deed not found.");
    }
    const updated = { ...item, ...input };
    await fs.writeFile(this.fileFor(updated.type, id), JSON.stringify(updated), "utf8");
    (await this.loadType(updated.type)).set(id, updated);
    return updated;
  }

  /** Delete own deed (ADMIN: any deed). EMPLOYEE can never delete. */
  async remove(id: string, user: StaffUser): Promise<void> {
    if (user.role === "EMPLOYEE") {
      throw new ForbiddenException("Employees cannot delete deeds.");
    }
    const item = await this.findById(id);
    if (!item || (user.role !== "ADMIN" && item.createdById !== user.id)) {
      throw new NotFoundException("Sample deed not found.");
    }
    await fs.unlink(this.fileFor(item.type, id));
    this.cache.get(item.type)?.delete(id);
    this.typeById.delete(id);
  }
}
