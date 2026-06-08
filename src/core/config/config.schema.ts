import { z } from 'zod';

export const configSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  API_KEY: z.string().min(1),

  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().default(5432),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  DB_NAME: z.string().default('transcripts'),

  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),

  STORAGE_ENDPOINT: z.string().url(),
  STORAGE_REGION: z.string().default('us-east-1'),
  STORAGE_ACCESS_KEY: z.string().min(1),
  STORAGE_SECRET_KEY: z.string().min(1),
  STORAGE_BUCKET: z.string().default('memories'),
  STORAGE_FORCE_PATH_STYLE: z.coerce.boolean().default(true),

  PROCESSOR_POLL_INTERVAL_MS: z.coerce.number().default(5000),
  PROCESSOR_MAX_ATTEMPTS: z.coerce.number().default(3),
});

export type AppConfig = z.infer<typeof configSchema>;
