import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { CreatePartnerInput, type PartnerItem } from "@sampada/shared";
import { JwtAdminGuard } from "../auth/jwt-admin.guard.js";
import { UsersService } from "../users/users.service.js";
import { DeedsService } from "../deeds/deeds.service.js";

/** Admin-only partner account management. */
@Controller("partners")
@UseGuards(JwtAdminGuard)
export class PartnersController {
  constructor(
    private readonly users: UsersService,
    private readonly deeds: DeedsService,
  ) {}

  @Post()
  async create(@Body() body: unknown): Promise<PartnerItem> {
    const user = await this.users.createPartner(CreatePartnerInput.parse(body));
    return {
      id: user.id,
      fname: user.fname,
      lname: user.lname,
      email: user.email,
      createdAt: user.createdAt,
      deedCount: 0,
    };
  }

  @Get()
  async list(): Promise<PartnerItem[]> {
    const [users, counts] = await Promise.all([
      this.users.list(),
      this.deeds.countsByCreator(),
    ]);
    return users
      .filter((u) => u.role === "PARTNER")
      .map((u) => ({
        id: u.id,
        fname: u.fname,
        lname: u.lname,
        email: u.email,
        createdAt: u.createdAt,
        deedCount: counts[u.id] ?? 0,
      }))
      .reverse();
  }
}
