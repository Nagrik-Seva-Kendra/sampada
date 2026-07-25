import { z } from "zod";
import { StaffRole } from "./enums.js";

/** Admin/owner invites someone by email to join the org with a chosen role (never OWNER — see ownership transfer). */
export const CreateInviteInput = z.object({
  email: z.string().email(),
  role: StaffRole,
});
export type CreateInviteInput = z.infer<typeof CreateInviteInput>;

export const InviteLink = z.object({
  inviteUrl: z.string(),
  emailed: z.boolean(),
  expiresAt: z.string(),
});
export type InviteLink = z.infer<typeof InviteLink>;

/** A live (unused, unrevoked) invite as listed to the admin. */
export const InviteItem = z.object({
  id: z.string(),
  email: z.string(),
  role: StaffRole,
  expiresAt: z.string(),
  createdAt: z.string(),
});
export type InviteItem = z.infer<typeof InviteItem>;

/** Accepting an invite: email comes from the invite record itself, not user-submitted. */
export const AcceptInviteInput = z.object({
  token: z.string().min(1),
  fname: z.string().trim().min(1).max(100),
  lname: z.string().trim().min(1).max(100),
  username: z
    .string()
    .trim()
    .min(3)
    .max(50)
    .regex(/^[a-zA-Z0-9_.-]+$/, "Letters, numbers, dot, underscore, hyphen only")
    .optional(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});
export type AcceptInviteInput = z.infer<typeof AcceptInviteInput>;
