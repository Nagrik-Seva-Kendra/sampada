import { Body, Controller, ForbiddenException, Get, Injectable, Logger, Param, Post, Put, UseGuards } from "@nestjs/common";
import { ClsService } from "nestjs-cls";
import { DEFAULT_OFFICE_FEES, type WaBlockedContact, WaOfficeFees } from "@sampada/shared";
import { JwtStaffGuard } from "../auth/jwt-staff.guard.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { requireTenantContext } from "../tenant/current-tenant.js";
import { isManagerRole } from "./wa-requests.service.js";
import { maskPhone } from "./webhook-diagnostics.js";

/** OWNER/ADMIN settings of the WhatsApp bot: office fee table, blocked numbers. */
@Injectable()
export class WaAdminService {
  private readonly log = new Logger("WhatsappAdmin");
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  private manager() {
    const tenant = requireTenantContext(this.cls);
    if (!isManagerRole(tenant.role)) throw new ForbiddenException("केवल मालिक या एडमिन।");
    return tenant;
  }

  async getFees(): Promise<WaOfficeFees> {
    const { organizationId } = this.manager();
    const row = await this.prisma.waOfficeFeeConfig.findUnique({ where: { organizationId } });
    const parsed = WaOfficeFees.safeParse(row?.config);
    return parsed.success ? parsed.data : DEFAULT_OFFICE_FEES;
  }

  async setFees(input: WaOfficeFees): Promise<WaOfficeFees> {
    const tenant = this.manager();
    const config = { ...input, registrySlabs: [...input.registrySlabs].sort((a, b) => a.upTo - b.upTo) };
    await this.prisma.waOfficeFeeConfig.upsert({
      where: { organizationId: tenant.organizationId },
      create: { organizationId: tenant.organizationId, config, updatedById: tenant.userId },
      update: { config, updatedById: tenant.userId },
    });
    this.log.log(`office fees updated by user ${tenant.userId}`);
    return config;
  }

  async blocked(): Promise<WaBlockedContact[]> {
    const { organizationId } = this.manager();
    const rows = await this.prisma.waContact.findMany({
      where: { organizationId, blockedAt: { not: null } },
      orderBy: { blockedAt: "desc" },
      take: 200,
    });
    return rows.map((r) => ({
      phone: r.phone,
      phoneMasked: maskPhone(r.phone),
      reason: r.blockReason === "abuse" ? "abuse" : "spam",
      blockedAt: r.blockedAt!.toISOString(),
    }));
  }

  async unblock(phone: string): Promise<void> {
    const tenant = this.manager();
    const res = await this.prisma.waContact.updateMany({
      where: { phone, organizationId: tenant.organizationId },
      data: { blockedAt: null, blockReason: null, gibberishStreak: 0, mutedUntil: null },
    });
    this.log.log(`${maskPhone(phone)} unblocked by user ${tenant.userId} (${res.count})`);
  }
}

@Controller("whatsapp")
@UseGuards(JwtStaffGuard)
export class WaAdminController {
  constructor(private readonly service: WaAdminService) {}

  @Get("fees")
  fees() {
    return this.service.getFees();
  }

  @Put("fees")
  setFees(@Body() body: unknown) {
    return this.service.setFees(WaOfficeFees.parse(body));
  }

  @Get("contacts/blocked")
  blocked() {
    return this.service.blocked();
  }

  @Post("contacts/:phone/unblock")
  async unblock(@Param("phone") phone: string) {
    await this.service.unblock(phone);
    return { ok: true };
  }
}
