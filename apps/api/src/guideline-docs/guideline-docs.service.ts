import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { guidelineYears, type GuidelineDocItem, type GuidelineYearInfo } from "@sampada/shared";

interface UploadedPdf {
  buffer: Buffer;
  originalname?: string;
  mimetype?: string;
}

const SEP = "__";

@Injectable()
export class GuidelineDocsService {
  /** Root storage dir (interim local disk; swap for R2/S3 later). */
  private readonly baseDir =
    process.env.UPLOAD_DIR ?? path.resolve(process.cwd(), "uploads", "guideline");

  private yearDir(year: number) {
    return path.join(this.baseDir, String(year));
  }

  /** Save one PDF under a year + district. Rejects anything that isn't a PDF. */
  async save(year: number, district: string, file: UploadedPdf): Promise<GuidelineDocItem> {
    const name = file.originalname ?? "guideline.pdf";
    const isPdf =
      file.mimetype === "application/pdf" || name.toLowerCase().endsWith(".pdf");
    if (!isPdf) throw new BadRequestException("Only PDF files are allowed.");

    const dir = this.yearDir(year);
    await fs.mkdir(dir, { recursive: true });

    const id = randomUUID();
    const safeName = ensurePdfExt(path.basename(name).replace(/[^\w.\-]+/g, "_"));
    // Filename encodes: <id>__<url-encoded district>__<safe name> (keeps it DB-free).
    const stored = `${id}${SEP}${encodeURIComponent(district)}${SEP}${safeName}`;
    await fs.writeFile(path.join(dir, stored), file.buffer);

    return this.item(year, id, district, safeName, file.buffer.length, new Date());
  }

  /** All years 2015→current with a count of PDFs each. */
  async years(): Promise<GuidelineYearInfo[]> {
    return Promise.all(
      guidelineYears().map(async (year) => ({
        year,
        count: (await this.listByYear(year)).length,
      })),
    );
  }

  /** PDFs for a given year (optionally one district), newest first. */
  async listByYear(year: number, district?: string): Promise<GuidelineDocItem[]> {
    let names: string[];
    try {
      names = await fs.readdir(this.yearDir(year));
    } catch {
      return [];
    }
    const items = await Promise.all(
      names
        .filter((n) => n.split(SEP).length >= 3)
        .map(async (n) => {
          const [id, encDistrict, ...rest] = n.split(SEP);
          const stat = await fs.stat(path.join(this.yearDir(year), n));
          return this.item(
            year,
            id!,
            safeDecode(encDistrict!),
            rest.join(SEP),
            stat.size,
            stat.mtime,
          );
        }),
    );
    const filtered = district
      ? items.filter((i) => i.district.toLowerCase() === district.toLowerCase())
      : items;
    return filtered.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  }

  /** Absolute path + display name of one PDF, for streaming. */
  async resolveFile(year: number, id: string): Promise<{ filePath: string; fileName: string }> {
    let names: string[];
    try {
      names = await fs.readdir(this.yearDir(year));
    } catch {
      throw new NotFoundException("Document not found.");
    }
    const match = names.find((n) => n.startsWith(`${id}${SEP}`));
    if (!match) throw new NotFoundException("Document not found.");
    return {
      filePath: path.join(this.yearDir(year), match),
      fileName: match.slice(match.indexOf(SEP) + SEP.length),
    };
  }

  stream(filePath: string) {
    return createReadStream(filePath);
  }

  /** Delete one PDF. */
  async remove(year: number, id: string): Promise<void> {
    const { filePath } = await this.resolveFile(year, id);
    await fs.unlink(filePath);
  }

  private item(
    year: number,
    id: string,
    district: string,
    fileName: string,
    sizeBytes: number,
    uploadedAt: Date,
  ): GuidelineDocItem {
    return {
      id,
      year,
      district,
      fileName,
      sizeBytes,
      uploadedAt: uploadedAt.toISOString(),
      url: `/api/v1/guideline-docs/${year}/${id}/file`,
    };
  }
}

function ensurePdfExt(name: string): string {
  return name.toLowerCase().endsWith(".pdf") ? name : `${name}.pdf`;
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
