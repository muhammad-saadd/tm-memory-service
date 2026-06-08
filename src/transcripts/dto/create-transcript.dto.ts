import { z } from 'zod';

export const conversationMessageSchema = z.object({
  id: z.number(),
  name: z.string().min(1),
  content: z.string().min(1),
  tone: z.string().min(1),
});

export const createTranscriptSchema = z.object({
  content: z
    .array(conversationMessageSchema)
    .min(1, 'content must contain at least one message'),
});

export type CreateTranscriptDto = z.infer<typeof createTranscriptSchema>;
