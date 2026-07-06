import { z } from "zod";
import { Role, StaffRole } from "./enums.js";

export const LoginInput = z.object({
  /** Which login tab the user picked — the resolved account must match this role. */
  role: StaffRole,
  /** Partner/Employee: username (or email, kept working as a fallback). Admin: email. */
  login: z.string().trim().min(1),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof LoginInput>;

export const RegisterInput = z.object({
  fname: z.string().trim().min(1).max(100),
  lname: z.string().trim().min(1).max(100),
  email: z.string().email(),
  mobile: z.string().trim().min(7).max(20),
  address: z.string().trim().max(500).optional(),
  occupation: z.string().trim().max(100).optional(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});
export type RegisterInput = z.infer<typeof RegisterInput>;

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
  user: AuthUser,
});
export type AuthResponse = z.infer<typeof AuthResponse>;
