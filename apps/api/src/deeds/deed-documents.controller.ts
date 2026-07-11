import {
  BadRequestException,
  Body,
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
import { JwtStaffGuard } from "../auth/jwt-staff.guard.js";
import { DeedDocumentsService, type PartyRole } from "./deed-documents.service.js";

interface UploadedDoc {
  buffer: Buffer;
  originalname?: string;
  mimetype?: string;
}

const MAX_FILE = 15 * 1024 * 1024;

function parseRole(raw: unknown): PartyRole {
  if (raw === "buyer" || raw === "seller") return raw;
  throw new BadRequestException("role must be buyer or seller.");
}

/**
 * Aadhaar cards (deduped, reusable people) and per-deed property maps (naxa).
 * Staff (admin + employee) only. File bytes are streamed behind the auth guard,
 * so the web app fetches them with its bearer token and shows a blob preview.
 */
@Controller()
@UseGuards(JwtStaffGuard)
export class DeedDocumentsController {
  constructor(private readonly service: DeedDocumentsService) {}

  // ---- People picker (reuse across deeds) ----

  @Get("parties")
  searchParties(@Query("q") q?: string) {
    return this.service.searchParties(q ?? "");
  }

  @Get("parties/:id/file")
  async partyFile(
    @Param("id") id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const f = await this.service.partyFile(id);
    res.set({
      "Content-Type": f.mimeType,
      "Content-Disposition": "inline; filename=" + JSON.stringify(f.fileName),
    });
    return new StreamableFile(f.data);
  }

  // ---- Deed <-> people ----

  @Get("deeds/:deedId/parties")
  listParties(@Param("deedId") deedId: string) {
    return this.service.listDeedParties(deedId);
  }

  @Post("deeds/:deedId/parties")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_FILE } }))
  addParty(
    @Param("deedId") deedId: string,
    @Body() body: { role?: unknown; partyId?: string; name?: string; aadhaarNumber?: string },
    @UploadedFile() file?: UploadedDoc,
  ) {
    return this.service.addDeedParty({
      deedId,
      role: parseRole(body.role),
      partyId: body.partyId || undefined,
      name: body.name,
      aadhaarNumber: body.aadhaarNumber,
      file: file
        ? { buffer: file.buffer, originalname: file.originalname, mimetype: file.mimetype }
        : undefined,
    });
  }

  @Delete("deeds/:deedId/parties/:linkId")
  async removeParty(@Param("deedId") deedId: string, @Param("linkId") linkId: string) {
    await this.service.removeDeedParty(deedId, linkId);
    return { removed: true };
  }

  // ---- Naxa (per-deed property map) ----

  @Get("deeds/:deedId/naxa")
  listNaxa(@Param("deedId") deedId: string) {
    return this.service.listNaxa(deedId);
  }

  @Post("deeds/:deedId/naxa")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_FILE } }))
  addNaxa(@Param("deedId") deedId: string, @UploadedFile() file?: UploadedDoc) {
    if (!file) throw new BadRequestException("A file is required.");
    return this.service.addNaxa({
      deedId,
      file: { buffer: file.buffer, originalname: file.originalname, mimetype: file.mimetype },
    });
  }

  @Get("deeds/:deedId/naxa/:id/file")
  async naxaFile(
    @Param("id") id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const f = await this.service.naxaFile(id);
    res.set({
      "Content-Type": f.mimeType,
      "Content-Disposition": "inline; filename=" + JSON.stringify(f.fileName),
    });
    return new StreamableFile(f.data);
  }

  @Delete("deeds/:deedId/naxa/:id")
  async removeNaxa(@Param("deedId") deedId: string, @Param("id") id: string) {
    await this.service.removeNaxa(deedId, id);
    return { removed: true };
  }
}
