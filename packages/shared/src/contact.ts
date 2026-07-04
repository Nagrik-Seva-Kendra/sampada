import { z } from "zod";

/** A citizen contact / enquiry message. */
export const ContactInput = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().email(),
  phone: z.string().trim().max(20).optional().default(""),
  message: z.string().trim().min(1).max(2000),
});
export type ContactInput = z.infer<typeof ContactInput>;

export const ContactMessage = ContactInput.extend({
  id: z.string(),
  createdAt: z.string(),
});
export type ContactMessage = z.infer<typeof ContactMessage>;
