import { z } from "zod";

/** Admin creates partner accounts; partners can also self-register (see PartnersController). */
export const CreatePartnerInput = z.object({
  fname: z.string().trim().min(1).max(100),
  lname: z.string().trim().min(1).max(100),
  email: z.string().email(),
  phone: z.string().trim().regex(/^[0-9]{10}$/, "Enter a valid 10-digit mobile number"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});
export type CreatePartnerInput = z.infer<typeof CreatePartnerInput>;

/** Public self-signup: same as CreatePartnerInput plus a chosen username and a verified-email OTP. */
export const PartnerSignupInput = CreatePartnerInput.extend({
  username: z
    .string()
    .trim()
    .min(3)
    .max(50)
    .regex(/^[a-zA-Z0-9_.-]+$/, "Letters, numbers, dot, underscore, hyphen only"),
  emailOtp: z.string().trim().length(6, "Enter the 6-digit code"),
});
export type PartnerSignupInput = z.infer<typeof PartnerSignupInput>;

/** Partner/employee self-service profile edit (all fields optional; only send what's changing). */
export const UpdateProfileInput = z
  .object({
    fname: z.string().trim().min(1).max(100).optional(),
    lname: z.string().trim().min(1).max(100).optional(),
    email: z.string().email().optional(),
    username: z
      .string()
      .trim()
      .min(3)
      .max(50)
      .regex(/^[a-zA-Z0-9_.-]+$/, "Letters, numbers, dot, underscore, hyphen only")
      .optional(),
    currentPassword: z.string().optional(),
    password: z.string().min(8, "Password must be at least 8 characters").optional(),
  })
  .refine((v) => !v.password || !!v.currentPassword, {
    message: "Current password is required to set a new password.",
    path: ["currentPassword"],
  });
export type UpdateProfileInput = z.infer<typeof UpdateProfileInput>;

/** Partner as listed to the admin (never exposes the password hash). */
export const PartnerItem = z.object({
  id: z.string(),
  fname: z.string(),
  lname: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  username: z.string().nullable(),
  createdAt: z.string(),
  deedCount: z.number().int(),
  status: z.enum(["PENDING", "ACTIVE"]),
});
export type PartnerItem = z.infer<typeof PartnerItem>;
