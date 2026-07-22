import { z } from "zod";
import { Role, StaffRole } from "./enums.js";

export const LoginInput = z.object({
  /** Which login tab the user picked — the resolved account must match this role. */
  role: StaffRole,
  /** Employee: username (or email, kept working as a fallback). Admin: email. */
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
