import { z } from 'zod';

export const memoryCategory = z.enum([
  'people',
  'topics',
  'events',
  'preferences',
  'organizations',
  'locations',
]);
export type MemoryCategory = z.infer<typeof memoryCategory>;

export const extractedMemorySchema = z.object({
  category: memoryCategory,
  slug: z.string().regex(/^[a-z0-9-]+$/, 'slug must be lowercase-hyphenated'),
  title: z.string().min(1),
  tags: z.array(z.string()),
  content: z.string().min(1),
  confidence: z.number().min(0).max(1).optional(),
  eventDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export type ExtractedMemory = z.infer<typeof extractedMemorySchema>;
export const extractedMemoriesSchema = z.array(extractedMemorySchema);

export const memoryIndexEntrySchema = z.object({
  path: z.string(),
  category: memoryCategory,
  title: z.string(),
  tags: z.array(z.string()),
  sources: z.array(z.number()),
  confidence: z.number().optional(),
  created: z.string(),
  updated: z.string(),
});

export type MemoryIndexEntry = z.infer<typeof memoryIndexEntrySchema>;

export const memoryIndexSchemaV2 = z.object({
  lastUpdated: z.string(),
  entries: z.array(memoryIndexEntrySchema),
  byCategory: z.record(memoryCategory, z.array(z.string())).optional(),
});

export type MemoryIndexV2 = z.infer<typeof memoryIndexSchemaV2>;
