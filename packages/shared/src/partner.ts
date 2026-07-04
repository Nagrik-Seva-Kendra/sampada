import { z } from "zod";

/** Admin creates partner accounts (no self-registration yet). */
export const CreatePartnerInput = z.object({
  fname: z.string().trim().min(1).max(100),
  lname: z.string().trim().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});
export type CreatePartnerInput = z.infer<typeof CreatePartnerInput>;

/** Partner as listed to the admin (never exposes the password hash). */
export const PartnerItem = z.object({
  id: z.string(),
  fname: z.string(),
  lname: z.string(),
  email: z.string(),
  createdAt: z.string(),
  deedCount: z.number().int(),
});
export type PartnerItem = z.infer<typeof PartnerItem>;
