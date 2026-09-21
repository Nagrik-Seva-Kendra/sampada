import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Request, Response } from "express";
import { JwtStaffGuard, type StaffUser } from "../auth/jwt-staff.guard.js";
import { DeedVisibleGuard } from "./deed-visible.guard.js";
import {
  DeedSourceDocumentsService,
  MAX_SOURCE_DOC,
  parseDocumentRole,
  parseOrganisations,
  parsePickedPeople,
  parseMessage,
  parseSingleFact,
  type UploadedDoc,
} from "./deed-source-documents.service.js";

type StaffRequest = Request & { user: StaffUser };

/**
 * The paperwork behind one deed: Aadhaar, PAN, khasra, an older registry --
 * whatever that property came with, uploaded in one place and read back as
 * fields the drafter can drop into the text.
 *
 * Every route names a deed and carries DeedVisibleGuard, so another
 * organization's deed is a 404 here rather than an empty list.
 */
@Controller("deeds/:deedId/source-documents")
@UseGuards(JwtStaffGuard, DeedVisibleGuard)
export class DeedSourceDocumentsController {
  constructor(private readonly service: DeedSourceDocumentsService) {}

  @Get()
  list(@Param("deedId") deedId: string) {
    return this.service.list(deedId);
  }

  @Post()
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_SOURCE_DOC } }))
  add(
    @Param("deedId") deedId: string,
    @UploadedFile() file: UploadedDoc | undefined,
    @Body() body: { role?: unknown },
    @Req() req: StaffRequest,
  ) {
    if (!file) throw new BadRequestException("A file is required.");
    return this.service.add(deedId, file, parseDocumentRole(body.role), req.user);
  }

  /** Read a stored document again -- for the one that failed the first time. */
  @Post(":id/read")
  read(@Param("id") id: string) {
    return this.service.reread(id);
  }

  /**
   * Where each read fact belongs in the deed. Proposes only; writes nothing.
   * `kind` is what the panel shows the deed as -- detected or chosen -- and for
   * farmland the seller is named from the land record. `people` are saved
   * people placed in the seller or buyer slot, by id. `partyTypes` says which
   * side is an organisation, so it is written as one.
   */
  @Post("propose-fill")
  proposeFill(
    @Param("deedId") deedId: string,
    @Body() body: { kind?: unknown; people?: unknown; partyTypes?: unknown; only?: unknown; message?: unknown },
  ) {
    return this.service.proposeFill(
      deedId,
      body?.kind === "agriculture",
      parsePickedPeople(body?.people),
      parseOrganisations(body?.partyTypes),
      parseSingleFact(body?.only),
      parseMessage(body?.message),
    );
  }

  /**
   * Farmland: do the seller IDs match the owners on the land record? A POST
   * so the editor can send the deed as it is on screen -- the saved copy trails
   * the typing by a moment. Reads only; nothing is written.
   */
  @Post("name-check")
  nameCheck(@Param("deedId") deedId: string, @Body() body: { content?: unknown; people?: unknown }) {
    return this.service.nameCheck(
      deedId,
      typeof body?.content === "string" ? body.content : undefined,
      parsePickedPeople(body?.people),
    );
  }

  @Get(":id/file")
  async file(@Param("id") id: string, @Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    const f = await this.service.file(id);
    res.set({
      "Content-Type": f.mimeType,
      "Content-Disposition": "inline; filename=" + JSON.stringify(f.fileName),
    });
    return new StreamableFile(f.data);
  }

  @Delete(":id")
  async remove(@Param("id") id: string) {
    await this.service.remove(id);
    return { removed: true };
  }
}
