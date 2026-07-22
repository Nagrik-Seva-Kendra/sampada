import { BadRequestException, Body, Controller, Param, Post, UploadedFile, UploadedFiles, UseInterceptors } from "@nestjs/common";
import { FileFieldsInterceptor, FileInterceptor } from "@nestjs/platform-express";
import { DeedDocumentsService, type PartyRole, type PartyType } from "./deed-documents.service.js";
import { PublicDeedTenantInterceptor } from "../tenant/public-deed-tenant.interceptor.js";

interface UploadedDoc {
  buffer: Buffer;
  originalname?: string;
  mimetype?: string;
}

const MAX_FILE = 15 * 1024 * 1024;

function parseRole(raw: unknown): PartyRole {
  return raw === "buyer" ? "buyer" : "seller";
}

function parsePartyType(raw: unknown): PartyType {
  return raw === "company" ? "company" : "individual";
}

/**
 * Party-facing equivalents of DeedDocumentsController's addParty / addNaxa /
 * updatePartyFiles routes: no auth, gated only by the deed's own unguessable
 * id -- same trust model as PublicDeedsController. Used by the legacy
 * paper-form page (legacy-deed-form.html) so a party filling that form in
 * from a share link saves straight into the SAME parties/naxa storage staff
 * already use for this deed, not a separate document store.
 */
@Controller("public")
@UseInterceptors(PublicDeedTenantInterceptor)
export class PublicDeedDocumentsController {
  constructor(private readonly service: DeedDocumentsService) {}

  @Post("deeds/:deedId/parties")
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: "file", maxCount: 1 },
        { name: "aadhaarBackFile", maxCount: 1 },
        { name: "panFile", maxCount: 1 },
      ],
      { limits: { fileSize: MAX_FILE } },
    ),
  )
  addParty(
    @Param("deedId") deedId: string,
    @Body()
    body: {
      role?: unknown;
      name?: string;
      partyType?: unknown;
      dob?: string;
      address?: string;
      aadhaarNumber?: string;
      panNumber?: string;
    },
    @UploadedFiles() files?: { file?: UploadedDoc[]; aadhaarBackFile?: UploadedDoc[]; panFile?: UploadedDoc[] },
  ) {
    const file = files?.file?.[0];
    const aadhaarBackFile = files?.aadhaarBackFile?.[0];
    const panFile = files?.panFile?.[0];
    return this.service.addDeedParty({
      deedId,
      role: parseRole(body.role),
      name: body.name,
      partyType: parsePartyType(body.partyType),
      dob: body.dob,
      address: body.address,
      aadhaarNumber: body.aadhaarNumber,
      panNumber: body.panNumber,
      file: file ? { buffer: file.buffer, originalname: file.originalname, mimetype: file.mimetype } : undefined,
      aadhaarBackFile: aadhaarBackFile
        ? { buffer: aadhaarBackFile.buffer, originalname: aadhaarBackFile.originalname, mimetype: aadhaarBackFile.mimetype }
        : undefined,
      panFile: panFile ? { buffer: panFile.buffer, originalname: panFile.originalname, mimetype: panFile.mimetype } : undefined,
    });
  }

  @Post("parties/:id/files")
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: "file", maxCount: 1 },
        { name: "aadhaarBackFile", maxCount: 1 },
        { name: "panFile", maxCount: 1 },
      ],
      { limits: { fileSize: MAX_FILE } },
    ),
  )
  updatePartyFiles(
    @Param("id") id: string,
    @UploadedFiles() files?: { file?: UploadedDoc[]; aadhaarBackFile?: UploadedDoc[]; panFile?: UploadedDoc[] },
  ) {
    const file = files?.file?.[0];
    const aadhaarBackFile = files?.aadhaarBackFile?.[0];
    const panFile = files?.panFile?.[0];
    return this.service.updatePartyFiles(id, {
      file: file ? { buffer: file.buffer, originalname: file.originalname, mimetype: file.mimetype } : undefined,
      aadhaarBackFile: aadhaarBackFile
        ? { buffer: aadhaarBackFile.buffer, originalname: aadhaarBackFile.originalname, mimetype: aadhaarBackFile.mimetype }
        : undefined,
      panFile: panFile ? { buffer: panFile.buffer, originalname: panFile.originalname, mimetype: panFile.mimetype } : undefined,
    });
  }

    /**
       * Update a saved person/company's own fields (name, DOB, Aadhaar/PAN
          * number) -- the text-field counterpart to updatePartyFiles above. The
             * party form's auto-save re-checks these on every field edit and only
                * calls this when something actually changed.
                   */
    @Post("parties/:id/fields")
    updatePartyFields(
          @Param("id") id: string,
          @Body() body: { name?: string; address?: string; dob?: string; aadhaarNumber?: string; panNumber?: string },
        ) {
          return this.service.updatePartyFields(id, body);
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

  /**
   * Structured field extraction from a photographed Aadhaar/PAN card, used
   * by the legacy paper-form page's auto-fill (name/DOB/Aadhaar/PAN off the
   * card photo). No auth -- same trust model as the rest of this controller;
   * this route does not touch any deed, it only forwards an image + prompt
   * to Claude's vision API and returns whatever JSON fields it reads back.
   */
  @Post("extract-document")
  extractDocument(@Body() body: { imageBase64?: string; mediaType?: string; prompt?: string }) {
    return this.service.extractDocumentFields(body.imageBase64 ?? "", body.mediaType ?? "image/jpeg", body.prompt ?? "");
  }

}
