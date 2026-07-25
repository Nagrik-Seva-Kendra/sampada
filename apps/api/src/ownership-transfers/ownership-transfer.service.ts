import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { createTransport, type Transporter } from "nodemailer";
import { ClsService } from "nestjs-cls";
import type { CreateOwnershipTransferInput, OwnershipTransferItem, OwnershipTransferLink } from "@sampada/shared";
import { PrismaService } from "../prisma/prisma.service.js";
import { requireTenantContext } from "../tenant/current-tenant.js";
import { appBaseUrl, hashToken } from "../lib/link-tokens.js";

const TRANSFER_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Owner nominates an existing, active Admin to become the org's new Owner.
 * The owner's authenticated request to create this IS their confirmation;
 * the nominee confirms by visiting the emailed link. Single-use, 7-day,
 * hashed-at-rest, cancellable. No last-owner-invariant check needed — this
 * is a 1-for-1 role swap inside one transaction, never zero owners at any
 * point another request could observe.
 */
@Injectable()
export class OwnershipTransferService {
  private transporter: Transporter | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  private requireOrgId(): string {
    return requireTenantContext(this.cls).organizationId;
  }

  /** Mint a fresh transfer, retiring any earlier live one for the org. */
  async createTransfer(fromUserId: string, input: CreateOwnershipTransferInput): Promise<OwnershipTransferLink> {
    const organizationId = this.requireOrgId();
    if (input.toUserId === fromUserId) {
      throw new BadRequestException("Choose a different admin to nominate.");
    }
    const nominee = await this.prisma.membership.findFirst({
      where: { userId: input.toUserId, organizationId, status: "ACTIVE", role: "ADMIN" },
    });
    if (!nominee) {
      throw new BadRequestException("That person isn't an active admin in your organization.");
    }

    // Only one live transfer per org at a time: retire any earlier one.
    await this.prisma.ownershipTransfer.updateMany({
      where: { organizationId, confirmedAt: null, cancelledAt: null },
      data: { cancelledAt: new Date() },
    });

    const raw = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + TRANSFER_TTL_MS);
    await this.prisma.ownershipTransfer.create({
      data: { organizationId, fromUserId, toUserId: input.toUserId, tokenHash: hashToken(raw), expiresAt },
    });

    const [org, nomineeUser] = await Promise.all([
      this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true } }),
      this.prisma.user.findUniqueOrThrow({ where: { id: input.toUserId }, select: { email: true } }),
    ]);
    const transferUrl = `${appBaseUrl()}/confirm-ownership-transfer?token=${raw}`;
    const emailed = await this.tryEmail(nomineeUser.email, org.name, transferUrl).catch(() => false);
    return { transferUrl, emailed, expiresAt: expiresAt.toISOString() };
  }

  /** Live (unconfirmed, uncancelled) transfers for the caller's org. */
  async listTransfers(): Promise<OwnershipTransferItem[]> {
    const organizationId = this.requireOrgId();
    const rows = await this.prisma.ownershipTransfer.findMany({
      where: { organizationId, confirmedAt: null, cancelledAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, toUserId: true, expiresAt: true, createdAt: true },
    });
    return rows.map((r) => ({
      id: r.id,
      toUserId: r.toUserId,
      expiresAt: r.expiresAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /** Cancel a live transfer early. Scoped to the caller's org. */
  async cancelTransfer(id: string): Promise<void> {
    const organizationId = this.requireOrgId();
    const result = await this.prisma.ownershipTransfer.updateMany({
      where: { id, organizationId, confirmedAt: null, cancelledAt: null },
      data: { cancelledAt: new Date() },
    });
    if (result.count === 0) throw new NotFoundException("Transfer not found.");
  }

  /** Consume a transfer token: swaps OWNER/ADMIN roles atomically. No session issued — the nominee already has an account. */
  async acceptTransfer(rawToken: string): Promise<void> {
    const record = await this.prisma.ownershipTransfer.findUnique({ where: { tokenHash: hashToken(rawToken) } });
    if (!record || record.confirmedAt || record.cancelledAt || record.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException("This ownership-transfer link is invalid or has expired.");
    }

    await this.prisma.$transaction(async (tx) => {
      // Re-verify both sides are still exactly as they were when the transfer was created.
      const [fromMembership, toMembership] = await Promise.all([
        tx.membership.findFirst({
          where: { userId: record.fromUserId, organizationId: record.organizationId, status: "ACTIVE", role: "OWNER" },
        }),
        tx.membership.findFirst({
          where: { userId: record.toUserId, organizationId: record.organizationId, status: "ACTIVE", role: "ADMIN" },
        }),
      ]);
      if (!fromMembership || !toMembership) {
        throw new BadRequestException("This transfer is no longer valid — one of the accounts has changed.");
      }
      await tx.membership.update({ where: { id: fromMembership.id }, data: { role: "ADMIN" } });
      await tx.membership.update({ where: { id: toMembership.id }, data: { role: "OWNER" } });
      // Bump both sessions — good hygiene for a high-privilege change, though
      // not required for correctness (guards always re-fetch the live role).
      await tx.user.update({ where: { id: record.fromUserId }, data: { tokenVersion: { increment: 1 } } });
      await tx.user.update({ where: { id: record.toUserId }, data: { tokenVersion: { increment: 1 } } });
      await tx.ownershipTransfer.update({ where: { id: record.id }, data: { confirmedAt: new Date() } });
    });
  }

  /** Returns true if the confirmation link was emailed; false (not thrown) when SMTP is absent. */
  private async tryEmail(to: string, orgName: string, transferUrl: string): Promise<boolean> {
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    if (!user || !pass) return false;
    if (!this.transporter) {
      this.transporter = createTransport({ service: "gmail", auth: { user, pass } });
    }
    await this.transporter.sendMail({
      from: user,
      to,
      subject: `You've been nominated as the new owner of ${orgName} on Sampada`,
      text: `You've been nominated to become the owner of ${orgName}. Open this link within 7 days to confirm: ${transferUrl}\n\nIf you weren't expecting this, you can ignore this email.`,
      html: `<p>You've been nominated to become the owner of <strong>${orgName}</strong>.</p><p><a href="${transferUrl}">Confirm ownership transfer</a> — this link expires in 7 days.</p><p>If you weren't expecting this, you can ignore this email.</p>`,
    });
    return true;
  }
}
