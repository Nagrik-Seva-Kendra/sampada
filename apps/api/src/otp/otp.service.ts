import { BadRequestException, HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { randomInt } from "node:crypto";
import { createTransport, type Transporter } from "nodemailer";

interface OtpRecord {
  code: string;
  expiresAt: number;
  attempts: number;
  lastSentAt: number;
}

const OTP_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

/**
 * Interim email-OTP store: in-memory (DB-free), same spirit as the JSONL
 * stores elsewhere. Codes are short-lived so losing them on server restart
 * is fine. Swap for a persisted store only if that ever becomes a problem.
 */
@Injectable()
export class OtpService {
  private readonly records = new Map<string, OtpRecord>();
  private transporter: Transporter | null = null;

  private getTransporter(): Transporter {
    if (this.transporter) return this.transporter;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    if (!user || !pass) {
      throw new HttpException(
        "Email sending isn't configured on the server yet.",
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    this.transporter = createTransport({
      service: "gmail",
      auth: { user, pass },
    });
    return this.transporter;
  }

  async sendEmailOtp(email: string): Promise<void> {
    const key = email.trim().toLowerCase();
    const existing = this.records.get(key);
    if (existing && Date.now() - existing.lastSentAt < RESEND_COOLDOWN_MS) {
      throw new HttpException(
        "Please wait a minute before requesting another code.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    this.records.set(key, {
      code,
      expiresAt: Date.now() + OTP_TTL_MS,
      attempts: 0,
      lastSentAt: Date.now(),
    });

    await this.getTransporter().sendMail({
      from: process.env.SMTP_USER,
      to: key,
      subject: "Your Sampada verification code",
      text: `Your verification code is ${code}. It expires in 10 minutes.`,
      html: `<p>Your verification code is <strong>${code}</strong>. It expires in 10 minutes.</p>`,
    });
  }

  /** Checks the code without consuming it (used for an explicit "Verify" button ahead of final signup). */
  checkCode(email: string, code: string): void {
    const key = email.trim().toLowerCase();
    const record = this.records.get(key);
    if (!record) throw new BadRequestException("Request a verification code for this email first.");
    if (Date.now() > record.expiresAt) {
      this.records.delete(key);
      throw new BadRequestException("That code has expired — request a new one.");
    }
    if (record.attempts >= MAX_ATTEMPTS) {
      this.records.delete(key);
      throw new BadRequestException("Too many incorrect attempts — request a new code.");
    }
    if (record.code !== code.trim()) {
      record.attempts += 1;
      throw new BadRequestException("Incorrect verification code.");
    }
  }

  /** Throws if the code is missing, expired, or wrong; consumes the code on success. */
  assertVerified(email: string, code: string): void {
    this.checkCode(email, code);
    this.records.delete(email.trim().toLowerCase());
  }
}
