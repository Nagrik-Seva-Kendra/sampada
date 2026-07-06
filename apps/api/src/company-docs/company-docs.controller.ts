import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { CompanyDocCategory } from "@sampada/shared";
import { JwtAdminGuard } from "../auth/jwt-admin.guard.js";
import { CompanyDocsService } from "./company-docs.service.js";

interface UploadedDoc {
  buffer: Buffer;
  originalname?: string;
  mimetype?: string;
}

/** Admin-only: documents filed under a site (Aadhar cards, permissions, etc. — kept private). */
@Controller("company-docs")
@UseGuards(JwtAdminGuard)
export class CompanyDocsController {
  constructor(private readonly service: CompanyDocsService) {}

  @Get()
  list(@Query("siteId") siteId?: string) {
    if (!siteId) throw new BadRequestException("siteId is required.");
    return this.service.listBySite(siteId);
  }

  @Get(":siteId/:id/file")
  async file(
    @Param("siteId") siteId: string,
    @Param("id") id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { filePath, fileName } = await this.service.resolveFile(siteId, id);
    res.set({ "Content-Disposition": `inline; filename="${fileName}"` });
    return new StreamableFile(this.service.stream(filePath));
  }

  @Post("upload")
  @UseInterceptors(FileInterceptor("file"))
  upload(
    @Query("siteId") siteId: string | undefined,
    @Query("category") categoryRaw: unknown,
    @Query("label") labelRaw: unknown,
    @UploadedFile() file?: UploadedDoc,
  ) {
    if (!siteId) throw new BadRequestException("siteId is required.");
    const category = CompanyDocCategory.parse(categoryRaw);
    const label = typeof labelRaw === "string" ? labelRaw.trim() : "";
    if (!file) throw new BadRequestException("File is required (field 'file').");
    return this.service.save(siteId, category, label, file);
  }

  @Delete(":siteId/:id")
  async remove(@Param("siteId") siteId: string, @Param("id") id: string) {
    await this.service.remove(siteId, id);
    return { deleted: true };
  }
}
