import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { CreateDeedInput, DeedRecordItem, UpdateDeedInput } from "@sampada/shared";
import type { StaffUser } from "../auth/jwt-staff.guard.js";

/**
 * Interim deed register: JSONL on disk (DB-free), same pattern as ContactService.
 * Visibility rules live here:
 *   - everyone sees only their OWN deeds in their register
 *   - ADMIN can additionally list any partner's deeds (kept separate from own)
 * Swap for the Prisma Deed table in the DB phase.
 */
@Injectable()
export class DeedsService {
  private readonly baseDir =
    process.env.UPLOAD_DIR
      ? path.join(process.env.UPLOAD_DIR, "..", "deeds")
      : path.resolve(process.cwd(), "uploads", "deeds");
  private readonly file = path.join(this.baseDir, "deeds.jsonl");

  private async readAll(): Promise<DeedRecordItem[]> {
    let text: string;
    try {
      text = await fs.readFile(this.file, "utf8");
    } catch {
      return [];
    }
    return text
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as DeedRecordItem);
  }

  private async writeAll(deeds: DeedRecordItem[]): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true });
    const body = deeds.map((d) => JSON.stringify(d)).join("\n");
    await fs.writeFile(this.file, body ? body + "\n" : "", "utf8");
  }

  async create(input: CreateDeedInput, user: StaffUser): Promise<DeedRecordItem> {
    const deed: DeedRecordItem = {
      ...input,
      id: randomUUID(),
      createdById: user.id,
      createdByName: user.name,
      createdByRole: user.role,
      createdAt: new Date().toISOString(),
    };
    await fs.mkdir(this.baseDir, { recursive: true });
    await fs.appendFile(this.file, JSON.stringify(deed) + "\n", "utf8");
    return deed;
  }

  /** The caller's own deeds (admin's own register excludes partner deeds). */
  async listOwn(user: StaffUser): Promise<DeedRecordItem[]> {
    return (await this.readAll())
      .filter((d) => d.createdById === user.id)
      .reverse();
  }

  /** ADMIN: all deeds created by one partner, newest first. */
  async listByCreator(creatorId: string): Promise<DeedRecordItem[]> {
    return (await this.readAll())
      .filter((d) => d.createdById === creatorId)
      .reverse();
  }

  /** ADMIN: every partner's deeds combined (excludes the admin's own), newest first. */
  async listAllPartners(): Promise<DeedRecordItem[]> {
    return (await this.readAll())
      .filter((d) => d.createdByRole === "PARTNER")
      .reverse();
  }

  /** EMPLOYEE (view-all access): literally every deed — admin's, every partner's, every employee's. */
  async listEveryone(): Promise<DeedRecordItem[]> {
    return (await this.readAll()).reverse();
  }

  /** Deed counts per creator id (for the admin's partner list). */
  async countsByCreator(): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    for (const d of await this.readAll()) {
      counts[d.createdById] = (counts[d.createdById] ?? 0) + 1;
    }
    return counts;
  }

  /** Edit own deed; ADMIN and EMPLOYEE may edit any. */
  async update(id: string, input: UpdateDeedInput, user: StaffUser): Promise<DeedRecordItem> {
    const canEditAny = user.role === "ADMIN" || user.role === "EMPLOYEE";
    const deeds = await this.readAll();
    const index = deeds.findIndex((d) => d.id === id);
    if (index === -1 || (!canEditAny && deeds[index]!.createdById !== user.id)) {
      throw new NotFoundException("Deed not found.");
    }
    const updated = { ...deeds[index]!, ...input };
    deeds[index] = updated;
    await this.writeAll(deeds);
    return updated;
  }

  /** Delete own deed; ADMIN may delete any. EMPLOYEE can never delete. */
  async remove(id: string, user: StaffUser): Promise<void> {
    if (user.role === "EMPLOYEE") {
      throw new ForbiddenException("Employees cannot delete deeds.");
    }
    const deeds = await this.readAll();
    const deed = deeds.find((d) => d.id === id);
    if (!deed || (user.role !== "ADMIN" && deed.createdById !== user.id)) {
      throw new NotFoundException("Deed not found.");
    }
    await this.writeAll(deeds.filter((d) => d.id !== id));
  }
}
