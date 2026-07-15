import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";

export interface GuidelineDocMeta {
    id: string;
    title: string;
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

const META = {
    id: true,
    title: true,
    fileName: true,
    mimeType: true,
    size: true,
    uploadedByName: true,
    createdAt: true,
} as const;

function toMeta(r: {
    id: string;
    title: string;
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
 * (enforced in the controller via JwtAdminGuard). Bytes live in Postgres for
 * the same reason as Party/DeedNaxa: the API host has no persistent disk.
 */
@Injectable()
  export class GuidelineService {
    constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<GuidelineDocMeta[]> {
        const rows = await this.prisma.guidelineDocument.findMany({
                orderBy: { createdAt: "desc" },
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
        return { fileName: row.fileName, mimeType: row.mimeType, data: Buffer.from(row.data) };
  }

  async add(input: {
        title: string;
        file: UploadedDoc;
        uploadedById?: string;
        uploadedByName?: string;
  }): Promise<GuidelineDocMeta> {
        const row = await this.prisma.guidelineDocument.create({
                data: {
                          title: input.title,
                          fileName: input.file.originalname ?? "guideline.pdf",
                          mimeType: input.file.mimetype ?? "application/pdf",
                          size: input.file.buffer.length,
                          data: input.file.buffer as unknown as GuidelineBytes,
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
