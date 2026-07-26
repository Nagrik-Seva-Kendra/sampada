import { z } from "zod";
import { Role } from "./enums.js";
import { OrganizationSummary } from "./organization.js";

export const LoginInput = z.object({
  /** Email or username — the account's own stored role decides admin vs. employee, no tab to pick. */
  login: z.string().trim().min(1),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof LoginInput>;

/** Employee self-service profile edit (all fields optional; only send what's changing). */
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

export const AuthUser = z.object({
  id: z.string(),
  email: z.string().email(),
  username: z.string().nullable(),
  fname: z.string(),
  lname: z.string(),
  role: Role,
  /** Platform staff — gates back-office capabilities like the shared guideline library. */
  isPlatformAdmin: z.boolean(),
  /** The org this session currently acts under; null only if the user has no active membership at all. */
  activeOrganization: OrganizationSummary.nullable(),
});
export type AuthUser = z.infer<typeof AuthUser>;

export const AuthResponse = z.object({
  accessToken: z.string(),
  /** Long-lived, single-use-by-rotation token for POST /auth/refresh. */
  refreshToken: z.string(),
  user: AuthUser,
});
export type AuthResponse = z.infer<typeof AuthResponse>;

/** Body for POST /auth/refresh — exchanges a valid refresh token for a new pair. */
export const RefreshInput = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshInput = z.infer<typeof RefreshInput>;

/** Public: consume an admin-issued reset link and set a new password. */
export const ResetPasswordInput = z.object({
  token: z.string().min(1),
  password: z.string().min(8, "Password must be at least 8 characters"),
});
export type ResetPasswordInput = z.infer<typeof ResetPasswordInput>;

/** Public "forgot password" request — same email/username the account logs in with. */
export const ForgotPasswordInput = z.object({
  login: z.string().trim().min(1),
});
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordInput>;

/** Admin "send reset link" result: the link to copy plus whether it was emailed. */
export const PasswordResetLink = z.object({
  resetUrl: z.string(),
  emailed: z.boolean(),
  expiresAt: z.string(),
});
export type PasswordResetLink = z.infer<typeof PasswordResetLink>;
