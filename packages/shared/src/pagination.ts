import { z } from "zod";

/**
 * Cursor-based pagination — powers the frontend's infinite scroll and avoids
 * slow OFFSET scans over the large (289 MB) legacy dataset.
 */
export const CursorQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
});
export type CursorQuery = z.infer<typeof CursorQuery>;

/** Standard list envelope returned by every paginated endpoint. */
export function paginated<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    data: z.array(item),
    nextCursor: z.string().nullable(),
  });
}
