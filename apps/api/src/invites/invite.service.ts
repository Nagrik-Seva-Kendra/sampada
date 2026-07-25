import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { createTransport, type Transporter } from "nodemailer";
import { ClsService } from "nestjs-cls";
import type { AcceptInviteInput, AuthResponse, CreateInviteInput, InviteItem, InviteLink } from "@sampada/shared";
import { PrismaService } from "../prisma/prisma.service.js";
import { UsersService, hashPassword, toStoredUser } from "../users/users.service.js";
import { AuthService } from "../auth/auth.service.js";
import { requireTenantContext } from "../tenant/current-tenant.js";
import { nextEmployeeCodeTx } from "../organizations/employee-code.js";
import { appBaseUrl, hashToken } from "../lib/link-tokens.js";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Admin/owner invites someone by email to join the org with a chosen role
 * (never OWNER — ownership transfer is a separate, not-yet-built flow).
 * Single-use, 7-day, hashed-at-rest, revocable. Accepting logs the person in
 * immediately (ACTIVE, no approval queue) since the admin already vetted them
 * by inviting — unlike public employee self-signup, which stays PENDING.
 */
@Injectable()
export class InviteService {
  private transporter: Transporter | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly auth: AuthService,
    private readonly cls: ClsService,
  ) {}

  private requireOrgId(): string {
    return requireTenantContext(this.cls).organizationId;
  }

  /** Mint a fresh invite, retiring any earlier live one for the same org+email. */
  async createInvite(invitedById: string, input: CreateInviteInput): Promise<InviteLink> {
    const organizationId = this.requireOrgId();
    const email = input.email.trim().toLowerCase();
    await this.users.assertStaffLoginAvailable(email, null);

    // One live invite per org+email: retire any earlier unused, unrevoked one.
    await this.prisma.invite.updateMany({
      where: { organizationId, email, usedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    const raw = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    await this.prisma.invite.create({
      data: { organizationId, email, role: input.role, tokenHash: hashToken(raw), invitedById, expiresAt },
    });

    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true } });
    const inviteUrl = `${appBaseUrl()}/accept-invite?token=${raw}`;
    const emailed = await this.tryEmail(email, org.name, input.role, inviteUrl).catch(() => false);
    return { inviteUrl, emailed, expiresAt: expiresAt.toISOString() };
  }

  /** Live (unused, unrevoked) invites for the caller's org, newest first. */
  async listInvites(): Promise<InviteItem[]> {
    const organizationId = this.requireOrgId();
    const rows = await this.prisma.invite.findMany({
      where: { organizationId, usedAt: null, revokedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
    });
    return rows.map((r) => ({
      id: r.id,
      email: r.email,
      role: r.role as "EMPLOYEE" | "ADMIN",
      expiresAt: r.expiresAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /** Cancel a live invite early. Scoped to the caller's org so one org can never revoke another's. */
  async revokeInvite(id: string): Promise<void> {
    const organizationId = this.requireOrgId();
    const result = await this.prisma.invite.updateMany({
      where: { id, organizationId, usedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (result.count === 0) throw new NotFoundException("Invite not found.");
  }

  /** Consume an invite token: creates the User + Membership and logs them in immediately. */
  async acceptInvite(rawToken: string, input: AcceptInviteInput): Promise<AuthResponse> {
    const record = await this.prisma.invite.findUnique({ where: { tokenHash: hashToken(rawToken) } });
    if (!record || record.usedAt || record.revokedAt || record.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException("This invite link is invalid or has expired.");
    }

    const username = input.username ? input.username.trim().toLowerCase() : null;
    await this.users.assertStaffLoginAvailable(record.email, username);
    const passwordHash = await hashPassword(input.password);
    const role = record.role === "EMPLOYEE" ? "EMPLOYEE" : "ADMIN";

    const user = await this.prisma.$transaction(async (tx) => {
      const employeeCode = role === "EMPLOYEE" ? await nextEmployeeCodeTx(tx, record.organizationId) : null;
      const created = await tx.user.create({
        data: {
          email: record.email,
          username,
          passwordHash,
          role,
          fname: input.fname,
          lname: input.lname,
          status: "ACTIVE",
          employeeCode,
        },
      });
      await tx.membership.create({
        data: {
          userId: created.id,
          organizationId: record.organizationId,
          role: record.role,
          status: "ACTIVE",
          employeeCode,
        },
      });
      await tx.invite.update({ where: { id: record.id }, data: { usedAt: new Date() } });
      return created;
    });
    return this.auth.issueSession(toStoredUser(user));
  }

  /** Returns true if the invite was emailed; false (not thrown) when SMTP is absent. */
  private async tryEmail(to: string, orgName: string, role: string, inviteUrl: string): Promise<boolean> {
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    if (!user || !pass) return false;
    if (!this.transporter) {
      this.transporter = createTransport({ service: "gmail", auth: { user, pass } });
    }
    await this.transporter.sendMail({
      from: user,
      to,
      subject: `You've been invited to join ${orgName} on Sampada`,
      text: `You've been invited to join ${orgName} as ${role}. Open this link within 7 days to accept: ${inviteUrl}\n\nIf you weren't expecting this, you can ignore this email.`,
      html: `<p>You've been invited to join <strong>${orgName}</strong> as <strong>${role}</strong>.</p><p><a href="${inviteUrl}">Accept the invite</a> — this link expires in 7 days.</p><p>If you weren't expecting this, you can ignore this email.</p>`,
    });
    return true;
  }
}
