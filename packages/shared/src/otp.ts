import { z } from "zod";

/** Request a 6-digit code to be emailed to this address (used to verify signup emails). */
export const SendEmailOtpInput = z.object({
  email: z.string().email(),
});
export type SendEmailOtpInput = z.infer<typeof SendEmailOtpInput>;

/** Check a received code ahead of final signup (does not consume it). */
export const VerifyEmailOtpInput = z.object({
  email: z.string().email(),
  code: z.string().trim().length(6, "Enter the 6-digit code"),
});
export type VerifyEmailOtpInput = z.infer<typeof VerifyEmailOtpInput>;
