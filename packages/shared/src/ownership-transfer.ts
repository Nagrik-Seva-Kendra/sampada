import { z } from "zod";

/** Owner nominates an existing, active Admin in their org to become the new Owner. */
export const CreateOwnershipTransferInput = z.object({
  toUserId: z.string().min(1),
});
export type CreateOwnershipTransferInput = z.infer<typeof CreateOwnershipTransferInput>;

export const OwnershipTransferLink = z.object({
  transferUrl: z.string(),
  emailed: z.boolean(),
  expiresAt: z.string(),
});
export type OwnershipTransferLink = z.infer<typeof OwnershipTransferLink>;

/** A live (unconfirmed, uncancelled) transfer as listed to the owner. */
export const OwnershipTransferItem = z.object({
  id: z.string(),
  toUserId: z.string(),
  expiresAt: z.string(),
  createdAt: z.string(),
});
export type OwnershipTransferItem = z.infer<typeof OwnershipTransferItem>;

export const AcceptOwnershipTransferInput = z.object({
  token: z.string().min(1),
});
export type AcceptOwnershipTransferInput = z.infer<typeof AcceptOwnershipTransferInput>;
