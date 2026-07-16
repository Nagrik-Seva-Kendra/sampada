import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";
import { newGuidelineKey, r2Configured, r2Get, r2Put } from "./r2.js";

export interface GuidelineDocMeta {
  id: string;
  title: string;
  district: string;
  session: number;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedByName: string | null;
  createdAt: string;
}

interface UploadedDoc {
  buffer: Buffer;
  originalname?: string;
  mimetype?: string;
}

/** Bytes column value; cast through the exact create-input field type (see DeedDocumentsService for why). */
type GuidelineBytes = Prisma.GuidelineDocumentCreateInput["data"];

// When R2 is configured, the actual PDF lives in R2 and the `data` column holds
// a tiny pointer of the form "r2:<object-key>" instead of the file bytes. Real
// PDFs start with "%PDF", so this marker never collides with legacy rows whose
// `data` holds the actual bytes.
const R2_MARKER = "r2:";

const META = {
  id: true,
  title: true,
  district: true,
  session: true,
  fileName: true,
  mimeType: true,
  size: true,
  uploadedByName: true,
  createdAt: true,
} as const;

function toMeta(r: {
  id: string;
  title: string;
  district: string;
  session: number;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedByName: string | null;
  createdAt: Date;
}): GuidelineDocMeta {
  return { ...r, createdAt: r.createdAt.toISOString() };
}

/**
 * Guideline documents (official circulars/rate PDFs), uploaded by admins via
 * the Manage Guideline admin page. List/download are public so the site-wide
 * Guideline page works without login; only upload/delete require admin auth
 * (enforced in the controller via JwtAdminGuard). When R2 env vars are set the
 * PDF bytes live in Cloudflare R2 (the `data` column stores an "r2:<key>"
 * pointer); otherwise they fall back to Postgres bytes (legacy behavior), so
 * old rows keep working unchanged. Each document is filed under a district (52
 * MP districts) and a session (registration session's starting year — e.g.
 * 2015 means "2015-2016").
 */
@Injectable()
export class GuidelineService {
  constructor(private readonly prisma: PrismaService) {}

  async list(filters?: { district?: string; session?: number }): Promise<GuidelineDocMeta[]> {
    const rows = await this.prisma.guidelineDocument.findMany({
      where: {
        ...(filters?.district ? { district: filters.district } : {}),
        ...(filters?.session ? { session: filters.session } : {}),
      },
      orderBy: [{ session: "desc" }, { createdAt: "desc" }],
      select: META,
    });
    return rows.map(toMeta);
  }

  async file(id: string): Promise<{ fileName: string; mimeType: string; data: Buffer }> {
    const row = await this.prisma.guidelineDocument.findUnique({
      where: { id },
      select: { fileName: true, mimeType: true, data: true },
    });
    if (!row) throw new NotFoundException("Document not found.");
    const stored = Buffer.from(row.data);
    if (stored.subarray(0, R2_MARKER.length).toString("latin1") === R2_MARKER) {
      const key = stored.toString("utf8").slice(R2_MARKER.length);
      const data = await r2Get(key);
      return { fileName: row.fileName, mimeType: row.mimeType, data };
    }
    return { fileName: row.fileName, mimeType: row.mimeType, data: stored };
  }

  async add(input: {
    title: string;
    district: string;
    session: number;
    file: UploadedDoc;
    uploadedById?: string;
    uploadedByName?: string;
  }): Promise<GuidelineDocMeta> {
    const mimeType = input.file.mimetype ?? "application/pdf";
    const size = input.file.buffer.length;

    // Store the actual bytes in R2 when configured; otherwise keep them in
    // Postgres (legacy). Either way `size` records the real file size so the
    // listing shows it correctly.
    let stored: Buffer;
    if (r2Configured()) {
      const key = newGuidelineKey();
      await r2Put(key, input.file.buffer, mimeType);
      stored = Buffer.from(R2_MARKER + key);
    } else {
      stored = input.file.buffer;
    }

    const row = await this.prisma.guidelineDocument.create({
      data: {
        title: input.title,
        district: input.district,
        session: input.session,
        fileName: input.file.originalname ?? "guideline.pdf",
        mimeType,
        size,
        data: stored as unknown as GuidelineBytes,
        uploadedById: input.uploadedById ?? null,
        uploadedByName: input.uploadedByName ?? null,
      },
      select: META,
    });
    return toMeta(row);
  }

  async remove(id: string): Promise<void> {
    const found = await this.prisma.guidelineDocument.findUnique({ where: { id }, select: { id: true } });
    if (!found) throw new NotFoundException("Document not found.");
    await this.prisma.guidelineDocument.delete({ where: { id } });
  }
}
