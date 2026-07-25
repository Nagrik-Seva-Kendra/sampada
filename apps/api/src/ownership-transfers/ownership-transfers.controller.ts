import { Body, Controller, Delete, Get, Param, Post, UseGuards } from "@nestjs/common";
import {
  AcceptOwnershipTransferInput,
  CreateOwnershipTransferInput,
  type OwnershipTransferItem,
  type OwnershipTransferLink,
} from "@sampada/shared";
import { JwtAdminGuard } from "../auth/jwt-admin.guard.js";
import { PermissionGuard } from "../auth/permission.guard.js";
import { RequirePermission } from "../auth/require-permission.decorator.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { StaffUser } from "../auth/jwt-staff.guard.js";
import { OwnershipTransferService } from "./ownership-transfer.service.js";

@Controller("ownership-transfers")
export class OwnershipTransfersController {
  constructor(private readonly transfers: OwnershipTransferService) {}

  @Post()
  @UseGuards(JwtAdminGuard, PermissionGuard)
  @RequirePermission("org.ownershipTransfer")
  async create(@Body() body: unknown, @CurrentUser() user: StaffUser): Promise<OwnershipTransferLink> {
    return this.transfers.createTransfer(user.id, CreateOwnershipTransferInput.parse(body));
  }

  @Get()
  @UseGuards(JwtAdminGuard, PermissionGuard)
  @RequirePermission("org.ownershipTransfer")
  async list(): Promise<OwnershipTransferItem[]> {
    return this.transfers.listTransfers();
  }

  @Delete(":id")
  @UseGuards(JwtAdminGuard, PermissionGuard)
  @RequirePermission("org.ownershipTransfer")
  async cancel(@Param("id") id: string): Promise<void> {
    await this.transfers.cancelTransfer(id);
  }

  /** Public: the nominee confirms via the emailed token link. */
  @Post("accept")
  async accept(@Body() body: unknown): Promise<void> {
    const input = AcceptOwnershipTransferInput.parse(body);
    await this.transfers.acceptTransfer(input.token);
  }
}
