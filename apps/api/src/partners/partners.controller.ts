import { Body, Controller, Delete, Get, Param, Post, UseGuards } from "@nestjs/common";
import { CreatePartnerInput, PartnerSignupInput, type PartnerItem } from "@sampada/shared";
import { JwtAdminGuard } from "../auth/jwt-admin.guard.js";
import { UsersService, type StoredUser } from "../users/users.service.js";
import { DeedsService } from "../deeds/deeds.service.js";
import { OtpService } from "../otp/otp.service.js";

function toItem(user: StoredUser, deedCount: number): PartnerItem {
  return {
    id: user.id,
    fname: user.fname,
    lname: user.lname,
    email: user.email,
    phone: user.phone,
    username: user.username,
    createdAt: user.createdAt,
    deedCount,
    status: user.status,
  };
}

@Controller("partners")
export class PartnersController {
  constructor(
    private readonly users: UsersService,
    private readonly deeds: DeedsService,
    private readonly otp: OtpService,
  ) {}

  /** Public: partner self-signup. Requires a verified email OTP. Stays PENDING until the admin approves it. */
  @Post("signup")
  async signup(@Body() body: unknown): Promise<PartnerItem> {
    const input = PartnerSignupInput.parse(body);
    this.otp.assertVerified(input.email, input.emailOtp);
    const user = await this.users.signupPartner(input);
    return toItem(user, 0);
  }

  /** Admin-only: create a partner that's immediately active. */
  @Post()
  @UseGuards(JwtAdminGuard)
  async create(@Body() body: unknown): Promise<PartnerItem> {
    const user = await this.users.createPartner(CreatePartnerInput.parse(body));
    return toItem(user, 0);
  }

  /** Admin-only: active partners, with deed counts. */
  @Get()
  @UseGuards(JwtAdminGuard)
  async list(): Promise<PartnerItem[]> {
    const [users, counts] = await Promise.all([
      this.users.list(),
      this.deeds.countsByCreator(),
    ]);
    return users
      .filter((u) => u.role === "PARTNER" && u.status === "ACTIVE")
      .map((u) => toItem(u, counts[u.id] ?? 0))
      .reverse();
  }

  /** Admin-only: signups awaiting approval. */
  @Get("pending")
  @UseGuards(JwtAdminGuard)
  async pending(): Promise<PartnerItem[]> {
    const users = await this.users.listPendingPartners();
    return users.map((u) => toItem(u, 0)).reverse();
  }

  /** Admin-only: approve a pending signup. */
  @Post(":id/approve")
  @UseGuards(JwtAdminGuard)
  async approve(@Param("id") id: string): Promise<PartnerItem> {
    const user = await this.users.approvePartner(id);
    return toItem(user, 0);
  }

  /** Admin-only: reject (delete) a pending signup. */
  @Delete(":id")
  @UseGuards(JwtAdminGuard)
  async reject(@Param("id") id: string): Promise<void> {
    await this.users.rejectPartner(id);
  }
}
