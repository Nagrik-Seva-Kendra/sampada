import { BadRequestException, Body, Controller, Get, Param, Post, Put, Req, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Request } from "express";
import { ColonyProjectInput, ColonySaleInput } from "@sampada/shared";
import { z } from "zod";
import { JwtStaffGuard, type StaffUser } from "../auth/jwt-staff.guard.js";
import { ColonyService } from "./colony.service.js";

const upload = FileInterceptor("file", { limits: { fileSize: 5 * 1024 * 1024 } });
type Upload = { buffer: Buffer; originalname: string } | undefined;
const need = (f: Upload) => {
  if (!f?.buffer?.length) throw new BadRequestException("फ़ाइल नहीं मिली।");
  return f;
};

/** Colony auto-draft: setup OWNER/ADMIN (live: OWNER), sales and deeds any staff member. */
@Controller("colony")
@UseGuards(JwtStaffGuard)
export class ColonyController {
  constructor(private readonly service: ColonyService) {}

  @Get("projects")
  projects() {
    return this.service.projects();
  }

  @Post("projects")
  create(@Body() body: unknown) {
    return this.service.create(ColonyProjectInput.parse(body));
  }

  @Put("projects/:id")
  update(@Param("id") id: string, @Body() body: unknown) {
    return this.service.update(id, ColonyProjectInput.parse(body));
  }

  @Put("projects/:id/live")
  live(@Param("id") id: string, @Body() body: unknown) {
    return this.service.setLive(id, z.object({ live: z.boolean() }).parse(body).live);
  }

  @Get("template-suggest/:deedId")
  suggest(@Param("deedId") deedId: string) {
    return this.service.suggest(deedId);
  }

  @Get("projects/:id/dashboard")
  dashboard(@Param("id") id: string) {
    return this.service.dashboard(id);
  }

  @Get("projects/:id/plots")
  plots(@Param("id") id: string) {
    return this.service.plots(id);
  }

  @Post("projects/:id/plots/import")
  @UseInterceptors(upload)
  importPlots(@Param("id") id: string, @UploadedFile() file: Upload) {
    return this.service.importPlots(id, need(file));
  }

  @Get("projects/:id/sales")
  sales(@Param("id") id: string) {
    return this.service.sales(id);
  }

  @Post("projects/:id/sales")
  createSale(@Param("id") id: string, @Body() body: unknown) {
    return this.service.createSale(id, ColonySaleInput.parse(body));
  }

  @Post("projects/:id/sales/import")
  @UseInterceptors(upload)
  importSales(@Param("id") id: string, @UploadedFile() file: Upload) {
    return this.service.importSales(id, need(file));
  }

  @Put("projects/:id/sales/:saleId")
  updateSale(@Param("id") id: string, @Param("saleId") saleId: string, @Body() body: unknown) {
    return this.service.updateSale(id, saleId, ColonySaleInput.parse(body));
  }

  @Post("projects/:id/sales/:saleId/cancel")
  cancel(@Param("id") id: string, @Param("saleId") saleId: string) {
    return this.service.cancelSale(id, saleId);
  }

  @Post("projects/:id/sales/:saleId/deed")
  deed(@Param("id") id: string, @Param("saleId") saleId: string, @Req() req: Request & { user: StaffUser }) {
    return this.service.createDeed(id, saleId, req.user);
  }
}
