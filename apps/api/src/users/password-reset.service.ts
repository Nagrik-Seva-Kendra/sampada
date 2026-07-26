import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { createTransport, type Transporter } from "nodemailer";
import type { PasswordResetLink } from "@sampada/shared";
import { PrismaService } from "../prisma/prisma.service.js";
import { UsersService } from "./users.service.js";
import { appBaseUrl, hashToken } from "../lib/link-tokens.js";

const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Admin-triggered password reset via a single-use, 1-hour link. Replaces the
 * old plaintext-password lookup. Email is best-effort: if SMTP isn't
 * configured the admin still gets a copyable link (this market often shares a
 * single, rarely-checked inbox).
 */
@Injectable()
export class PasswordResetService {
  private transporter: Transporter | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  /**
   * Public self-service "forgot password": if the identifier matches a staff
   * account, email them a reset link — same as the admin-triggered flow, just
   * without returning the link (would let a caller confirm which emails have
   * accounts). Always resolves either way; the controller sends one generic
   * response regardless of whether anything actually matched.
   */
  async requestReset(login: string): Promise<void> {
    const user = await this.users.findByLogin(login);
    if (!user) return;
    await this.createLink(user.id);
  }

  /** Mint a fresh reset link for a user, invalidating any earlier unused ones. */
  async createLink(userId: string): Promise<PasswordResetLink> {
    const user = await this.users.findById(userId);
    if (!user) throw new NotFoundException("User not found.");

    // One live token per user: retire any earlier unused ones.
    await this.prisma.passwordResetToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });

    const raw = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + RESET_TTL_MS);
    await this.prisma.passwordResetToken.create({
      data: { userId, tokenHash: hashToken(raw), expiresAt },
    });

    const resetUrl = `${appBaseUrl()}/reset-password?token=${raw}`;
    const emailed = await this.tryEmail(user.email, resetUrl).catch(() => false);
    return { resetUrl, emailed, expiresAt: expiresAt.toISOString() };
  }

  /** Consume a reset token and set the new password (single-use, expiry-checked). */
  async consume(rawToken: string, newPassword: string): Promise<void> {
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
    });
    if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException("This reset link is invalid or has expired.");
    }
    await this.users.resetPassword(record.userId, newPassword);
    await this.prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });
  }

  /** Returns true if the link was emailed; false (not thrown) when SMTP is absent. */
  private async tryEmail(to: string, resetUrl: string): Promise<boolean> {
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    if (!user || !pass) return false;
    if (!this.transporter) {
      this.transporter = createTransport({ service: "gmail", auth: { user, pass } });
    }
    await this.transporter.sendMail({
      from: user,
      to,
      subject: "Reset your Sampada password",
      text: `A password reset was requested for your account. Open this link within 1 hour to set a new password: ${resetUrl}\n\nIf you didn't request this, you can ignore this email.`,
      html: `<p>A password reset was requested for your account.</p><p><a href="${resetUrl}">Set a new password</a> — this link expires in 1 hour.</p><p>If you didn't request this, you can ignore this email.</p>`,
    });
    return true;
  }
}
