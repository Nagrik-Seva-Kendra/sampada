import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { CreateUserInput, type EmployeeItem, type StaffRole } from "@sampada/shared";
import { JwtAdminGuard } from "../auth/jwt-admin.guard.js";
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
}
