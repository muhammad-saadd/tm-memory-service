import { z } from 'zod';

export const grepMatchLineSchema = z.object({
  lineNumber: z.number(),
  content: z.string(),
  section: z.enum(['frontmatter', 'body']),
});

export const grepFileMatchSchema = z.object({
  file: z.string(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  matchCount: z.number(),
  score: z.number(),
  lines: z.array(grepMatchLineSchema),
});

export const grepResponseSchema = z.object({
  query: z.string(),
  path: z.string(),
  scope: z.enum(['all', 'frontmatter', 'body']),
  totalMatches: z.number(),
  matches: z.array(grepFileMatchSchema),
});

export type GrepResponseDto = z.infer<typeof grepResponseSchema>;

export const grepQuerySchema = z.object({
  q: z.string().min(1, 'query parameter q is required').max(200),
  path: z.string().optional().default('/'),
  scope: z.enum(['all', 'frontmatter', 'body']).optional().default('all'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type GrepQuery = z.infer<typeof grepQuerySchema>;
