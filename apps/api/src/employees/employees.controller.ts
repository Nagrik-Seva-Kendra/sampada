import { Body, Controller, Delete, Get, Param, Post, UseGuards } from "@nestjs/common";
import { CreateEmployeeInput, EmployeeSignupInput, type EmployeeItem } from "@sampada/shared";
import { JwtAdminGuard } from "../auth/jwt-admin.guard.js";
import { UsersService, type StoredUser } from "../users/users.service.js";
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
  };
}

@Controller("employees")
export class EmployeesController {
  constructor(
    private readonly users: UsersService,
    private readonly otp: OtpService,
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

  /** Admin-only: active employees. */
  @Get()
  @UseGuards(JwtAdminGuard)
  async list(): Promise<EmployeeItem[]> {
    const users = await this.users.list();
    return users
      .filter((u) => u.role === "EMPLOYEE" && u.status === "ACTIVE")
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

  /** Admin-only: reveal the password an employee set at signup. */
  @Get(":id/password")
  @UseGuards(JwtAdminGuard)
  async password(@Param("id") id: string): Promise<{ password: string }> {
    return { password: await this.users.getPassword(id) };
  }
}
