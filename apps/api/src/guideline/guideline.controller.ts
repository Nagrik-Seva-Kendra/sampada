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
import { JwtAdminGuard } from "../auth/jwt-admin.guard.js";
import { GuidelineService } from "./guideline.service.js";

interface UploadedDoc {
  buffer: Buffer;
  originalname?: string;
  mimetype?: string;
}

const MAX_FILE = 15 * 1024 * 1024;

type AuthedRequest = Request & { user?: { id: string; name: string } };

/**
 * Guideline documents (official circulars/rate PDFs), filed under a district
 * (52 MP districts) and a session (registration session's starting year, e.g.
 * 2015 means "2015-2016"). List and download are public — no login needed to
 * view or download them. Upload and delete are admin-only (JwtAdminGuard),
 * managed from the Manage Guideline admin page.
 */
@Controller("guideline-documents")
export class GuidelineController {
  constructor(private readonly service: GuidelineService) {}

  @Get()
  list(@Query("district") district?: string, @Query("session") sessionRaw?: string) {
    const session = sessionRaw ? Number(sessionRaw) : undefined;
    return this.service.list({
      district: district?.trim() || undefined,
      session: session && !Number.isNaN(session) ? session : undefined,
    });
  }

  @Get(":id/file")
  async file(
    @Param("id") id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const f = await this.service.file(id);
    res.set({
      "Content-Type": f.mimeType,
      "Content-Disposition": "attachment; filename=" + JSON.stringify(f.fileName),
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

  @Delete(":id")
  @UseGuards(JwtAdminGuard)
  async remove(@Param("id") id: string) {
    await this.service.remove(id);
    return { removed: true };
  }
}
