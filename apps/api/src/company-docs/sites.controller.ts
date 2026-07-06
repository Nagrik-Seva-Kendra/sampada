import { Body, Controller, Delete, Get, Param, Post, UseGuards } from "@nestjs/common";
import { CreateSiteInput, type SiteItem } from "@sampada/shared";
import { JwtAdminGuard } from "../auth/jwt-admin.guard.js";
import { SitesService } from "./sites.service.js";
import { CompanyDocsService } from "./company-docs.service.js";

/** Admin-only: sites (properties/projects) that company documents are filed under. */
@Controller("sites")
@UseGuards(JwtAdminGuard)
export class SitesController {
  constructor(
    private readonly sites: SitesService,
    private readonly docs: CompanyDocsService,
  ) {}

  @Post()
  async create(@Body() body: unknown): Promise<SiteItem> {
    const site = await this.sites.create(CreateSiteInput.parse(body));
    return { ...site, docCount: 0 };
  }

  @Get()
  async list(): Promise<SiteItem[]> {
    const sites = await this.sites.list();
    const counts = await Promise.all(sites.map((s) => this.docs.countBySite(s.id)));
    return sites.map((s, i) => ({ ...s, docCount: counts[i]! })).reverse();
  }

  /** Deletes the site and every document filed under it. */
  @Delete(":id")
  async remove(@Param("id") id: string) {
    await this.sites.remove(id);
    await this.docs.removeAllForSite(id);
    return { deleted: true };
  }
}
