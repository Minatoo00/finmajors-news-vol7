import { z } from 'zod';

const booleanFromEnv = z.preprocess((value) => {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'off', ''].includes(normalized)) {
      return false;
    }
  }
  return value;
}, z.boolean());

const cronExpression = z
  .string()
  .min(1, 'cron expression must not be empty')
  .regex(
    /^([^\s]+\s){4}[^\s]+$/,
    'cron expression must contain five sections',
  );

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid URL'),
  DIRECT_DATABASE_URL: z
    .string()
    .url('DIRECT_DATABASE_URL must be a valid URL')
    .optional(),
  OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is required'),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  ENABLE_INTERNAL_CRON: booleanFromEnv.default(false),
  INGEST_CRON: cronExpression.default('5 * * * *'),
  INGEST_CONCURRENCY: z.coerce.number().int().positive().max(10).default(5),
  INGEST_RETRY_LIMIT: z.coerce.number().int().nonnegative().max(5).default(2),
  INGEST_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .max(60_000)
    .default(10_000),
  INGEST_JOB_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .max(480_000)
    .default(480_000),
  INGEST_MAX_ARTICLES_PER_PERSON: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(10),
  BASIC_AUTH_USER: z.string().min(1, 'BASIC_AUTH_USER is required'),
  BASIC_AUTH_PASS: z.string().min(1, 'BASIC_AUTH_PASS is required'),
  ALLOWED_ADMIN_IPS: z
    .string()
    .optional()
    .transform((value) =>
      value ? value.split(',').map((ip) => ip.trim()).filter(Boolean) : [],
    ),
});

export type AppEnv = z.infer<typeof envSchema>;

export function loadEnv(
  input: NodeJS.ProcessEnv = process.env,
): AppEnv {
  const result = envSchema.safeParse(input);
  if (!result.success) {
    const messages = result.error.issues.map((issue) => issue.message);
    throw new Error(`Invalid environment variables: ${messages.join(', ')}`);
  }
  return result.data;
}

let cachedEnv: AppEnv | null = null;

export function getEnv(): AppEnv {
  if (!cachedEnv) {
    cachedEnv = loadEnv();
  }
  return cachedEnv;
}

export function resetEnvCache(): void {
  cachedEnv = null;
}
