import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { CreatePartnerInput, PartnerSignupInput, type PartnerItem } from "@sampada/shared";
import { JwtAdminGuard } from "../auth/jwt-admin.guard.js";
import { JwtStaffGuard, type StaffUser } from "../auth/jwt-staff.guard.js";
import { UsersService, type StoredUser } from "../users/users.service.js";
import { SampleDeedsService } from "../deeds/sample-deeds.service.js";
import { OtpService } from "../otp/otp.service.js";

type StaffRequest = Request & { user: StaffUser };

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
    private readonly deeds: SampleDeedsService,
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

  /** Admin/Employee: approved partners (active and discontinued; excludes pending signups), with deed counts. */
  @Get()
  @UseGuards(JwtStaffGuard)
  async list(@Req() req: StaffRequest): Promise<PartnerItem[]> {
    if (req.user.role !== "ADMIN" && req.user.role !== "EMPLOYEE") {
      throw new ForbiddenException("Only admin/employee can view the partner list.");
    }
    const [users, counts] = await Promise.all([
      this.users.list(),
      this.deeds.countsByCreator(),
    ]);
    return users
      .filter((u) => u.role === "PARTNER" && u.status !== "PENDING")
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

  /** Admin-only: discontinue a partner's services (blocks login, keeps the record). */
  @Post(":id/deactivate")
  @UseGuards(JwtAdminGuard)
  async deactivate(@Param("id") id: string): Promise<PartnerItem> {
    const user = await this.users.deactivatePartner(id);
    return toItem(user, 0);
  }

  /** Admin-only: restore a discontinued partner's access. */
  @Post(":id/reactivate")
  @UseGuards(JwtAdminGuard)
  async reactivate(@Param("id") id: string): Promise<PartnerItem> {
    const user = await this.users.reactivatePartner(id);
    return toItem(user, 0);
  }

  /** Admin-only: reveal the password a partner set at signup. */
  @Get(":id/password")
  @UseGuards(JwtAdminGuard)
  async password(@Param("id") id: string): Promise<{ password: string }> {
    return { password: await this.users.getPassword(id) };
  }
}
