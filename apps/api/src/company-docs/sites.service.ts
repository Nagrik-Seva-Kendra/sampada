import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { CreateSiteInput } from "@sampada/shared";

export interface StoredSite {
  id: string;
  name: string;
  createdAt: string;
}

/** Interim site registry: JSONL on disk (DB-free), same pattern as UsersService. */
@Injectable()
export class SitesService {
  private readonly baseDir =
    process.env.UPLOAD_DIR
      ? path.join(process.env.UPLOAD_DIR, "..", "sites")
      : path.resolve(process.cwd(), "uploads", "sites");
  private readonly file = path.join(this.baseDir, "sites.jsonl");

  async list(): Promise<StoredSite[]> {
    let text: string;
    try {
      text = await fs.readFile(this.file, "utf8");
    } catch {
      return [];
    }
    return text
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as StoredSite);
  }

  async create(input: CreateSiteInput): Promise<StoredSite> {
    const sites = await this.list();
    const name = input.name.trim();
    if (sites.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
      throw new ConflictException("A site with this name already exists.");
    }
    const site: StoredSite = { id: randomUUID(), name, createdAt: new Date().toISOString() };
    await this.writeAll([...sites, site]);
    return site;
  }

  async remove(id: string): Promise<void> {
    const sites = await this.list();
    if (!sites.some((s) => s.id === id)) throw new NotFoundException("Site not found.");
    await this.writeAll(sites.filter((s) => s.id !== id));
  }

  private async writeAll(sites: StoredSite[]): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true });
    const body = sites.map((s) => JSON.stringify(s)).join("\n");
    await fs.writeFile(this.file, body ? body + "\n" : "", "utf8");
  }
}
