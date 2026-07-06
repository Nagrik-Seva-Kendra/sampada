import { Body, Controller, Post } from "@nestjs/common";
import { SendEmailOtpInput, VerifyEmailOtpInput } from "@sampada/shared";
import { OtpService } from "./otp.service.js";

/** Public: request/check an email verification code (used by signup forms). */
@Controller("otp")
export class OtpController {
  constructor(private readonly otp: OtpService) {}

  @Post("send-email")
  async sendEmail(@Body() body: unknown): Promise<{ sent: true }> {
    const { email } = SendEmailOtpInput.parse(body);
    await this.otp.sendEmailOtp(email);
    return { sent: true };
  }

  /** Checks the code without consuming it; final signup re-checks and consumes it. */
  @Post("verify-email")
  async verifyEmail(@Body() body: unknown): Promise<{ verified: true }> {
    const { email, code } = VerifyEmailOtpInput.parse(body);
    this.otp.checkCode(email, code);
    return { verified: true };
  }
}
