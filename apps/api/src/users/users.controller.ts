import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { CreateUserInput, UpdateUserInput, type EmployeeItem, type StaffRole } from "@sampada/shared";
import { JwtAdminGuard } from "../auth/jwt-admin.guard.js";
import { PermissionGuard } from "../auth/permission.guard.js";
import { RequirePermission } from "../auth/require-permission.decorator.js";
import { UsersService, type StoredUser } from "./users.service.js";

/** Maps a stored staff account to the admin-facing list item (role included). */
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

/** Admin-only staff directory backing the "Manage Team → User Management" tab. */
@Controller("users")
@UseGuards(JwtAdminGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /** Every approved staff account — employees and admins alike (newest first). */
  @Get()
  async list(): Promise<EmployeeItem[]> {
    const users = await this.users.listStaff();
    return users.map(toItem).reverse();
  }

  /** Create an employee or another admin; the account is active immediately. */
  @Post()
  async create(@Body() body: unknown): Promise<EmployeeItem> {
    const user = await this.users.createUser(CreateUserInput.parse(body));
    return toItem(user);
  }

  /** Edit a staff account's details, role, and/or reset its password. */
  @Patch(":id")
  async update(@Param("id") id: string, @Body() body: unknown): Promise<EmployeeItem> {
    const user = await this.users.adminUpdateUser(id, UpdateUserInput.parse(body));
    return toItem(user);
  }

  /** Discontinue any staff member's services — employee, admin, or the org's owner. */
  @Post(":id/deactivate")
  @UseGuards(PermissionGuard)
  @RequirePermission("members.remove")
  async deactivate(@Param("id") id: string): Promise<EmployeeItem> {
    return toItem(await this.users.deactivateMember(id));
  }

  /** Restore a discontinued staff member's access. */
  @Post(":id/reactivate")
  @UseGuards(PermissionGuard)
  @RequirePermission("members.remove")
  async reactivate(@Param("id") id: string): Promise<EmployeeItem> {
    return toItem(await this.users.reactivateMember(id));
  }
}
