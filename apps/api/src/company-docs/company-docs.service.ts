import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { CompanyDocCategory, CompanyDocItem } from "@sampada/shared";

interface UploadedDoc {
  buffer: Buffer;
  originalname?: string;
  mimetype?: string;
}

const SEP = "__";

/** Interim per-site document store: files on disk (DB-free), same pattern as GuidelineDocsService. */
@Injectable()
export class CompanyDocsService {
  private readonly baseDir =
    process.env.UPLOAD_DIR
      ? path.join(process.env.UPLOAD_DIR, "..", "company-docs")
      : path.resolve(process.cwd(), "uploads", "company-docs");

  private siteDir(siteId: string) {
    return path.join(this.baseDir, siteId);
  }

  /** Save one document under a site + category + free-text label. */
  async save(
    siteId: string,
    category: CompanyDocCategory,
    label: string,
    file: UploadedDoc,
  ): Promise<CompanyDocItem> {
    const name = file.originalname ?? "document.pdf";
    const isPdf = file.mimetype === "application/pdf" || name.toLowerCase().endsWith(".pdf");
    if (!isPdf) throw new BadRequestException("Only PDF files are allowed.");

    const dir = this.siteDir(siteId);
    await fs.mkdir(dir, { recursive: true });

    const id = randomUUID();
    const safeName = path.basename(name).replace(/[^\w.\-]+/g, "_");
    // Filename encodes: <id>__<category>__<url-encoded label>__<safe name> (keeps it DB-free).
    const stored = `${id}${SEP}${category}${SEP}${encodeURIComponent(label)}${SEP}${safeName}`;
    await fs.writeFile(path.join(dir, stored), file.buffer);

    return this.item(siteId, id, category, label, safeName, file.buffer.length, new Date());
  }

  /** All documents for a site, newest first. */
  async listBySite(siteId: string): Promise<CompanyDocItem[]> {
    let names: string[];
    try {
      names = await fs.readdir(this.siteDir(siteId));
    } catch {
      return [];
    }
    const items = await Promise.all(
      names
        .filter((n) => n.split(SEP).length >= 4)
        .map(async (n) => {
          const [id, category, encLabel, ...rest] = n.split(SEP);
          const stat = await fs.stat(path.join(this.siteDir(siteId), n));
          return this.item(
            siteId,
            id!,
            category as CompanyDocCategory,
            safeDecode(encLabel!),
            rest.join(SEP),
            stat.size,
            stat.mtime,
          );
        }),
    );
    return items.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  }

  /** Number of documents filed under a site. */
  async countBySite(siteId: string): Promise<number> {
    return (await this.listBySite(siteId)).length;
  }

  /** Absolute path + display name of one document, for streaming. */
  async resolveFile(siteId: string, id: string): Promise<{ filePath: string; fileName: string }> {
    let names: string[];
    try {
      names = await fs.readdir(this.siteDir(siteId));
    } catch {
      throw new NotFoundException("Document not found.");
    }
    const match = names.find((n) => n.startsWith(`${id}${SEP}`));
    if (!match) throw new NotFoundException("Document not found.");
    const parts = match.split(SEP);
    return {
      filePath: path.join(this.siteDir(siteId), match),
      fileName: parts.slice(3).join(SEP),
    };
  }

  stream(filePath: string) {
    return createReadStream(filePath);
  }

  /** Delete one document. */
  async remove(siteId: string, id: string): Promise<void> {
    const { filePath } = await this.resolveFile(siteId, id);
    await fs.unlink(filePath);
  }

  /** Delete every document filed under a site (cascade, when the site itself is deleted). */
  async removeAllForSite(siteId: string): Promise<void> {
    await fs.rm(this.siteDir(siteId), { recursive: true, force: true });
  }

  private item(
    siteId: string,
    id: string,
    category: CompanyDocCategory,
    label: string,
    fileName: string,
    sizeBytes: number,
    uploadedAt: Date,
  ): CompanyDocItem {
    return {
      id,
      siteId,
      category,
      label,
      fileName,
      sizeBytes,
      uploadedAt: uploadedAt.toISOString(),
      url: `/api/v1/company-docs/${siteId}/${id}/file`,
    };
  }
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
