import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Request, Response } from "express";
import { get as httpsGet } from "node:https";
import { JwtAdminGuard } from "../auth/jwt-admin.guard.js";
import { GuidelineService } from "./guideline.service.js";
import { PrismaService } from "../prisma/prisma.service.js";

interface UploadedDoc {
  buffer: Buffer;
  originalname?: string;
  mimetype?: string;
}

const MAX_FILE = 15 * 1024 * 1024;

type AuthedRequest = Request & { user?: { id: string; name: string } };

interface ImportItem {
  district?: string;
  session?: number | string;
  title?: string;
  url?: string;
}

/**
 * Download a URL to a Buffer using Node's https module. TLS verification is
 * relaxed and a browser User-Agent is sent because some government sites (e.g.
 * MPIGR) present an incomplete certificate chain / block non-browser agents,
 * which makes the global fetch() reject with "fetch failed". Follows a single
 * redirect. Used only by the admin bulk-import endpoint below.
 */
function downloadPdf(url: string, redirects = 0): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const req = httpsGet(
      url,
      { rejectUnauthorized: false, headers: { "User-Agent": "Mozilla/5.0" } },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location && redirects < 3) {
          res.resume();
          downloadPdf(res.headers.location, redirects + 1).then(resolve, reject);
          return;
        }
        if (status !== 200) {
          res.resume();
          reject(new Error("download HTTP " + status));
          return;
        }
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks)));
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    req.setTimeout(90000, () => req.destroy(new Error("download timeout")));
  });
}

/**
 * Guideline documents (official circulars/rate PDFs), filed under a district
 * (52 MP districts) and a session (registration session's starting year, e.g.
 * 2015 means "2015-2016"). List and download are public — no login needed to
 * view or download them. Upload and delete are admin-only (JwtAdminGuard),
 * managed from the Manage Guideline admin page.
 */
@Controller("guideline-documents")
export class GuidelineController {
  constructor(
    private readonly service: GuidelineService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  list(@Query("district") district?: string, @Query("session") sessionRaw?: string) {
    const session = sessionRaw ? Number(sessionRaw) : undefined;
    return this.service.list({
      district: district?.trim() || undefined,
      session: session && !Number.isNaN(session) ? session : undefined,
    });
  }

  /** Public: stream the PDF. Pass ?view=1 to preview inline in the browser tab
   * instead of forcing a download (the default). */
  @Get(":id/file")
  async file(
    @Param("id") id: string,
    @Query("view") view: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const f = await this.service.file(id);
    const disposition = view ? "inline" : "attachment";
    res.set({
      "Content-Type": f.mimeType,
      "Content-Disposition": disposition + "; filename=" + JSON.stringify(f.fileName),
    });
    return new StreamableFile(f.data);
  }

  @Post()
  @UseGuards(JwtAdminGuard)
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_FILE } }))
  upload(
    @Req() req: AuthedRequest,
    @Body() body: { title?: string; district?: string; session?: string },
    @UploadedFile() file?: UploadedDoc,
  ) {
    if (!file) throw new BadRequestException("A PDF file is required.");
    if (file.mimetype !== "application/pdf") {
      throw new BadRequestException("Only PDF files are allowed.");
    }
    const district = (body?.district || "").toString().trim();
    if (!district) throw new BadRequestException("District is required.");
    const session = Number(body?.session);
    if (!session || Number.isNaN(session)) throw new BadRequestException("Session is required.");
    const title = (body?.title || file.originalname || "Guideline document").toString().trim();
    return this.service.add({
      title: title || "Guideline document",
      district,
      session,
      file,
      uploadedById: req.user?.id,
      uploadedByName: req.user?.name,
    });
  }

  /**
   * Admin bulk import: downloads each PDF (e.g. from MPIGR) server-side and
   * stores it via the normal add() path (so it lands in R2). Pass
   * deleteExisting:true on the first batch to clear old documents. Keep each
   * batch small (~6 items) to stay within the free-tier request timeout.
   */
  @Post("import")
  @UseGuards(JwtAdminGuard)
  async import(
    @Req() req: AuthedRequest,
    @Body() body: { items?: ImportItem[]; deleteExisting?: boolean },
  ) {
    if (body?.deleteExisting) await this.prisma.guidelineDocument.deleteMany({});
    const items = Array.isArray(body?.items) ? body.items : [];
    const results: Array<{ url?: string; district?: string; ok: boolean; error?: string }> = [];
    for (const it of items) {
      const url = (it.url || "").toString();
      const district = (it.district || "").toString().trim();
      try {
        const session = Number(it.session);
        if (!district || !session || Number.isNaN(session) || !url) {
          throw new Error("district, session and url are required");
        }
        const buffer = await downloadPdf(url);
        if (buffer.length < 100) throw new Error("empty/too-small file");
        await this.service.add({
          title: (it.title || district + " Guideline").toString().trim(),
          district,
          session,
          file: {
            buffer,
            originalname: (it.title || district + "-guideline") + ".pdf",
            mimetype: "application/pdf",
          },
          uploadedById: req.user?.id,
          uploadedByName: req.user?.name,
        });
        results.push({ url, district, ok: true });
      } catch (e) {
        results.push({ url, district, ok: false, error: (e as Error).message });
      }
    }
    return {
      imported: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    };
  }

  @Delete(":id")
  @UseGuards(JwtAdminGuard)
  async remove(@Param("id") id: string) {
    await this.service.remove(id);
    return { removed: true };
  }
}
