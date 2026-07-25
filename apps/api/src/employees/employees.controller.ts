import { Body, Controller, Delete, Get, Param, Post, UseGuards } from "@nestjs/common";
import {
  CreateEmployeeInput,
  EmployeeSignupInput,
  type EmployeeItem,
  type PasswordResetLink,
  type StaffRole,
} from "@sampada/shared";
import { JwtAdminGuard } from "../auth/jwt-admin.guard.js";
import { PermissionGuard } from "../auth/permission.guard.js";
import { RequirePermission } from "../auth/require-permission.decorator.js";
import { UsersService, type StoredUser } from "../users/users.service.js";
import { PasswordResetService } from "../users/password-reset.service.js";
import { OtpService } from "../otp/otp.service.js";

function toItem(user: StoredUser): EmployeeItem {
  return {
    id: user.id,
    employeeCode: user.employeeCode,
    fname: user.fname,
    lname: user.lname,
    email: user.email,
    phone: user.phone,
    username: user.username,
    createdAt: user.createdAt,
    status: user.status,
    role: user.role as StaffRole,
  };
}

@Controller("employees")
export class EmployeesController {
  constructor(
    private readonly users: UsersService,
    private readonly otp: OtpService,
    private readonly passwordReset: PasswordResetService,
  ) {}

  /** Public: employee self-signup. Requires a verified email OTP. Stays PENDING until the admin approves it. */
  @Post("signup")
  async signup(@Body() body: unknown): Promise<EmployeeItem> {
    const input = EmployeeSignupInput.parse(body);
    this.otp.assertVerified(input.email, input.emailOtp);
    const user = await this.users.signupEmployee(input);
    return toItem(user);
  }

  /** Admin-only: create an employee that's immediately active. */
  @Post()
  @UseGuards(JwtAdminGuard)
  async create(@Body() body: unknown): Promise<EmployeeItem> {
    const user = await this.users.createEmployee(CreateEmployeeInput.parse(body));
    return toItem(user);
  }

  /** Admin-only: approved employees (active and discontinued; excludes pending signups). */
  @Get()
  @UseGuards(JwtAdminGuard)
  async list(): Promise<EmployeeItem[]> {
    const users = await this.users.list();
    return users
      .filter((u) => u.role === "EMPLOYEE" && u.status !== "PENDING")
      .map(toItem)
      .reverse();
  }

  /** Admin-only: signups awaiting approval. */
  @Get("pending")
  @UseGuards(JwtAdminGuard)
  async pending(): Promise<EmployeeItem[]> {
    const users = await this.users.listPendingEmployees();
    return users.map(toItem).reverse();
  }

  /** Admin-only: approve a pending signup. */
  @Post(":id/approve")
  @UseGuards(JwtAdminGuard)
  async approve(@Param("id") id: string): Promise<EmployeeItem> {
    const user = await this.users.approveEmployee(id);
    return toItem(user);
  }

  /** Admin-only: reject (delete) a pending signup. */
  @Delete(":id")
  @UseGuards(JwtAdminGuard)
  async reject(@Param("id") id: string): Promise<void> {
    await this.users.rejectEmployee(id);
  }

  /** Admin-only: discontinue an employee's services (blocks login, keeps the record). */
  @Post(":id/deactivate")
  @UseGuards(JwtAdminGuard, PermissionGuard)
  @RequirePermission("members.remove")
  async deactivate(@Param("id") id: string): Promise<EmployeeItem> {
    const user = await this.users.deactivateMember(id);
    return toItem(user);
  }

  /** Admin-only: restore a discontinued employee's access. */
  @Post(":id/reactivate")
  @UseGuards(JwtAdminGuard, PermissionGuard)
  @RequirePermission("members.remove")
  async reactivate(@Param("id") id: string): Promise<EmployeeItem> {
    const user = await this.users.reactivateMember(id);
    return toItem(user);
  }

  /**
   * Admin-only: mint a single-use, 1-hour password reset link for a staff
   * member. Best-effort emails it and always returns a copyable link.
   */
  @Post(":id/reset-link")
  @UseGuards(JwtAdminGuard)
  async resetLink(@Param("id") id: string): Promise<PasswordResetLink> {
    return this.passwordReset.createLink(id);
  }
}
