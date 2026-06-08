import { z } from 'zod';
import { conversationMessageSchema } from './create-transcript.dto';

export const transcriptResponseSchema = z.object({
  id: z.number(),
  content: z.array(conversationMessageSchema),
  status: z.enum(['pending', 'processing', 'done', 'failed']),
  createdAt: z.string(),
  processedAt: z.string().nullable(),
});

export type TranscriptResponseDto = z.infer<typeof transcriptResponseSchema>;
