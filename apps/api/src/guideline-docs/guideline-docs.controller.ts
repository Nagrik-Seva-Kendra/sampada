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
import { District, GuidelineYear } from "@sampada/shared";
import { JwtAdminGuard } from "../auth/jwt-admin.guard.js";
import { GuidelineDocsService } from "./guideline-docs.service.js";

interface UploadedPdf {
  buffer: Buffer;
  originalname?: string;
  mimetype?: string;
}

@Controller("guideline-docs")
export class GuidelineDocsController {
  constructor(private readonly service: GuidelineDocsService) {}

  /** Public: years 2015→current + how many PDFs each has. */
  @Get("years")
  years() {
    return this.service.years();
  }

  /** Public: list a year's PDFs (optionally filtered by district). */
  @Get()
  list(@Query("year") yearRaw: unknown, @Query("district") district?: string) {
    const year = GuidelineYear.parse(yearRaw);
    return this.service.listByYear(year, district?.trim() || undefined);
  }

  /** Public: view/download a PDF inline. */
  @Get(":year/:id/file")
  async file(
    @Param("year") yearRaw: string,
    @Param("id") id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const year = GuidelineYear.parse(yearRaw);
    const { filePath, fileName } = await this.service.resolveFile(year, id);
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${fileName}"`,
    });
    return new StreamableFile(this.service.stream(filePath));
  }

  /** Admin only: upload a PDF for a year. */
  @Post("upload")
  @UseGuards(JwtAdminGuard)
  @UseInterceptors(FileInterceptor("file"))
  upload(
    @Query("year") yearRaw: unknown,
    @Query("district") districtRaw: unknown,
    @UploadedFile() file?: UploadedPdf,
  ) {
    const year = GuidelineYear.parse(yearRaw);
    const district = District.parse(districtRaw);
    if (!file) throw new BadRequestException("PDF file is required (field 'file').");
    return this.service.save(year, district, file);
  }

  /** Admin only: delete a PDF. */
  @Delete(":year/:id")
  @UseGuards(JwtAdminGuard)
  async remove(@Param("year") yearRaw: string, @Param("id") id: string) {
    await this.service.remove(GuidelineYear.parse(yearRaw), id);
    return { deleted: true };
  }
}
