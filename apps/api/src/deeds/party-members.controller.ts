import { Body, Controller, Delete, Get, Param, Post, UseGuards } from "@nestjs/common";
import { JwtStaffGuard } from "../auth/jwt-staff.guard.js";
import { PartyMembersService, parseDesignation } from "./party-members.service.js";

/**
 * A saved organisation's partners and directors. Staff only; the tenant-scoped
 * client keeps each workspace to its own firms and people.
 */
@Controller("parties/:firmId/members")
@UseGuards(JwtStaffGuard)
export class PartyMembersController {
  constructor(private readonly service: PartyMembersService) {}

  @Get()
  list(@Param("firmId") firmId: string) {
    return this.service.list(firmId);
  }

  @Post()
  add(@Param("firmId") firmId: string, @Body() body: { personId?: unknown; designation?: unknown }) {
    const personId = typeof body?.personId === "string" ? body.personId : "";
    return this.service.add(firmId, personId, parseDesignation(body?.designation));
  }

  @Delete(":personId")
  remove(@Param("firmId") firmId: string, @Param("personId") personId: string) {
    return this.service.remove(firmId, personId);
  }
}
