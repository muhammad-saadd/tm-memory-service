import { z } from 'zod';

export const lsEntrySchema = z.object({
  name: z.string(),
  type: z.enum(['file', 'directory']),
  size: z.number().optional(),
  updated: z.string().optional(),
});

export const lsResponseSchema = z.object({
  path: z.string(),
  entries: z.array(lsEntrySchema),
  pagination: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    totalPages: z.number(),
  }).optional(),
});

export type LsEntry = z.infer<typeof lsEntrySchema>;
export type LsResponseDto = z.infer<typeof lsResponseSchema>;

export const lsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type LsQuery = z.infer<typeof lsQuerySchema>;
