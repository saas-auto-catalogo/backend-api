import { z, type ZodError } from 'zod';

const DEV_DEFAULTS = {
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/auto_catalogo_db?schema=public',
  JWT_SECRET: 'super-secret-jwt-signing-key-for-auth-minimum-32-chars',
  REDIS_URL: 'redis://localhost:6379',
  FEED_TOKEN_SECRET: 'feed-secret-salt-key-minimum-32-chars-length',
  FRONTEND_URL: 'http://localhost:3000',
} as const;

const OPTIONAL_WARN_VARS = ['RESEND_API_KEY', 'META_APP_ID', 'META_APP_SECRET'] as const;

const STRIPE_PRICE_ENV_KEYS = [
  'STRIPE_STARTER_MONTHLY_PRICE_ID',
  'STRIPE_STARTER_YEARLY_PRICE_ID',
  'STRIPE_PRO_MONTHLY_PRICE_ID',
  'STRIPE_PRO_YEARLY_PRICE_ID',
  'STRIPE_ENTERPRISE_MONTHLY_PRICE_ID',
  'STRIPE_ENTERPRISE_YEARLY_PRICE_ID',
] as const;

const secretMin32 = z.string().min(32, 'String must contain at least 32 character(s)');

const postgresUrl = z
  .string()
  .url()
  .refine(
    (value) => value.startsWith('postgresql://') || value.startsWith('postgres://'),
    'Must be a PostgreSQL connection URL'
  );

const redisUrl = z
  .string()
  .url()
  .refine(
    (value) => value.startsWith('redis://') || value.startsWith('rediss://'),
    'Must be a Redis connection URL'
  );

const httpUrl = z
  .string()
  .url()
  .refine(
    (value) => value.startsWith('http://') || value.startsWith('https://'),
    'Must be an HTTP(S) URL'
  );

const stripeSk = z.string().startsWith('sk_', 'Must start with sk_');
const stripeWhsec = z.string().startsWith('whsec_', 'Must start with whsec_');
const stripePriceId = z.string().min(1, 'Required');

const envRecordSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).optional(),
  DATABASE_URL: z.string().optional(),
  JWT_SECRET: z.string().optional(),
  REDIS_URL: z.string().optional(),
  FEED_TOKEN_SECRET: z.string().optional(),
  FRONTEND_URL: z.string().optional(),
  STRIPE_MOCK: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_STARTER_MONTHLY_PRICE_ID: z.string().optional(),
  STRIPE_STARTER_YEARLY_PRICE_ID: z.string().optional(),
  STRIPE_PRO_MONTHLY_PRICE_ID: z.string().optional(),
  STRIPE_PRO_YEARLY_PRICE_ID: z.string().optional(),
  STRIPE_ENTERPRISE_MONTHLY_PRICE_ID: z.string().optional(),
  STRIPE_ENTERPRISE_YEARLY_PRICE_ID: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
});

export type Env = {
  NODE_ENV: 'development' | 'production' | 'test';
  DATABASE_URL: string;
  JWT_SECRET: string;
  REDIS_URL: string;
  FEED_TOKEN_SECRET: string;
  FRONTEND_URL: string;
  STRIPE_MOCK: boolean;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_STARTER_MONTHLY_PRICE_ID?: string;
  STRIPE_STARTER_YEARLY_PRICE_ID?: string;
  STRIPE_PRO_MONTHLY_PRICE_ID?: string;
  STRIPE_PRO_YEARLY_PRICE_ID?: string;
  STRIPE_ENTERPRISE_MONTHLY_PRICE_ID?: string;
  STRIPE_ENTERPRISE_YEARLY_PRICE_ID?: string;
  RESEND_API_KEY?: string;
  META_APP_ID?: string;
  META_APP_SECRET?: string;
};

let cachedEnv: Env | null = null;

export function isStripeRealMode(nodeEnv: string, stripeMock?: string): boolean {
  return nodeEnv === 'production' && stripeMock !== 'true';
}

function readRawEnv(): z.infer<typeof envRecordSchema> {
  return envRecordSchema.parse(process.env);
}

function addStripeProductionIssues(
  data: z.infer<typeof envRecordSchema>,
  ctx: z.RefinementCtx
): void {
  if (!isStripeRealMode(data.NODE_ENV ?? 'development', data.STRIPE_MOCK)) {
    return;
  }

  if (!data.STRIPE_SECRET_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['STRIPE_SECRET_KEY'],
      message: 'Required',
    });
  } else {
    const skResult = stripeSk.safeParse(data.STRIPE_SECRET_KEY);
    if (!skResult.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['STRIPE_SECRET_KEY'],
        message: skResult.error.issues[0]?.message ?? 'Invalid',
      });
    }
  }

  if (!data.STRIPE_WEBHOOK_SECRET) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['STRIPE_WEBHOOK_SECRET'],
      message: 'Required',
    });
  } else {
    const whsecResult = stripeWhsec.safeParse(data.STRIPE_WEBHOOK_SECRET);
    if (!whsecResult.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['STRIPE_WEBHOOK_SECRET'],
        message: whsecResult.error.issues[0]?.message ?? 'Invalid',
      });
    }
  }

  for (const key of STRIPE_PRICE_ENV_KEYS) {
    const value = data[key];
    if (!value) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: 'Required',
      });
      continue;
    }

    const priceResult = stripePriceId.safeParse(value);
    if (!priceResult.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: priceResult.error.issues[0]?.message ?? 'Invalid',
      });
    }
  }
}

const productionSchema = envRecordSchema
  .extend({
    NODE_ENV: z.literal('production'),
    DATABASE_URL: postgresUrl,
    JWT_SECRET: secretMin32,
    REDIS_URL: redisUrl,
    FEED_TOKEN_SECRET: secretMin32,
    FRONTEND_URL: httpUrl,
  })
  .superRefine(addStripeProductionIssues);

const relaxedSchema = envRecordSchema.extend({
  DATABASE_URL: postgresUrl,
  JWT_SECRET: secretMin32,
  REDIS_URL: redisUrl,
  FEED_TOKEN_SECRET: secretMin32,
  FRONTEND_URL: httpUrl,
});

function normalizeEnv(raw: z.infer<typeof envRecordSchema>): Env {
  return {
    NODE_ENV: (raw.NODE_ENV ?? 'development') as Env['NODE_ENV'],
    DATABASE_URL: raw.DATABASE_URL!,
    JWT_SECRET: raw.JWT_SECRET!,
    REDIS_URL: raw.REDIS_URL!,
    FEED_TOKEN_SECRET: raw.FEED_TOKEN_SECRET!,
    FRONTEND_URL: raw.FRONTEND_URL!,
    STRIPE_MOCK: raw.STRIPE_MOCK === 'true',
    STRIPE_SECRET_KEY: raw.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: raw.STRIPE_WEBHOOK_SECRET,
    STRIPE_STARTER_MONTHLY_PRICE_ID: raw.STRIPE_STARTER_MONTHLY_PRICE_ID,
    STRIPE_STARTER_YEARLY_PRICE_ID: raw.STRIPE_STARTER_YEARLY_PRICE_ID,
    STRIPE_PRO_MONTHLY_PRICE_ID: raw.STRIPE_PRO_MONTHLY_PRICE_ID,
    STRIPE_PRO_YEARLY_PRICE_ID: raw.STRIPE_PRO_YEARLY_PRICE_ID,
    STRIPE_ENTERPRISE_MONTHLY_PRICE_ID: raw.STRIPE_ENTERPRISE_MONTHLY_PRICE_ID,
    STRIPE_ENTERPRISE_YEARLY_PRICE_ID: raw.STRIPE_ENTERPRISE_YEARLY_PRICE_ID,
    RESEND_API_KEY: raw.RESEND_API_KEY,
    META_APP_ID: raw.META_APP_ID,
    META_APP_SECRET: raw.META_APP_SECRET,
  };
}

export function formatEnvValidationErrors(error: ZodError, environment: string): string {
  const lines = error.issues.map((issue) => {
    const field = issue.path.join('.') || 'environment';
    return `  - ${field}: ${issue.message}`;
  });

  return ['Environment validation failed (' + environment + '):', ...lines].join('\n');
}

function warnMissingOptionalVars(raw: z.infer<typeof envRecordSchema>): void {
  for (const key of OPTIONAL_WARN_VARS) {
    if (!raw[key]?.trim()) {
      console.warn(`[env] Optional variable ${key} is not set — related features may be degraded`);
    }
  }
}

function warnDevelopmentFallbacks(raw: z.infer<typeof envRecordSchema>): void {
  for (const [key, defaultValue] of Object.entries(DEV_DEFAULTS)) {
    const envKey = key as keyof typeof DEV_DEFAULTS;
    if (!raw[envKey]?.trim()) {
      console.warn(`[env] ${envKey} not set — using development default`);
    }
  }
}

function mergeWithDevDefaults(raw: z.infer<typeof envRecordSchema>): z.infer<typeof envRecordSchema> {
  return {
    ...raw,
    NODE_ENV: raw.NODE_ENV ?? 'development',
    DATABASE_URL: raw.DATABASE_URL?.trim() || DEV_DEFAULTS.DATABASE_URL,
    JWT_SECRET: raw.JWT_SECRET?.trim() || DEV_DEFAULTS.JWT_SECRET,
    REDIS_URL: raw.REDIS_URL?.trim() || DEV_DEFAULTS.REDIS_URL,
    FEED_TOKEN_SECRET: raw.FEED_TOKEN_SECRET?.trim() || DEV_DEFAULTS.FEED_TOKEN_SECRET,
    FRONTEND_URL: raw.FRONTEND_URL?.trim() || DEV_DEFAULTS.FRONTEND_URL,
  };
}

function mergeWithTestDefaults(raw: z.infer<typeof envRecordSchema>): z.infer<typeof envRecordSchema> {
  return {
    ...mergeWithDevDefaults(raw),
    NODE_ENV: 'test',
  };
}

export function parseEnv(options: { exitOnProductionFailure?: boolean } = {}): Env {
  const raw = readRawEnv();
  const nodeEnv = raw.NODE_ENV ?? 'development';

  if (nodeEnv === 'production') {
    const productionInput = { ...raw, NODE_ENV: 'production' as const };
    const result = productionSchema.safeParse(productionInput);

    if (!result.success) {
      const message = formatEnvValidationErrors(result.error, 'production');
      warnMissingOptionalVars(raw);

      if (options.exitOnProductionFailure) {
        console.error(message);
        process.exit(1);
      }

      throw new Error(message);
    }

    warnMissingOptionalVars(raw);
    return normalizeEnv(result.data);
  }

  if (nodeEnv === 'test') {
    const merged = mergeWithTestDefaults(raw);
    const result = relaxedSchema.safeParse(merged);

    if (!result.success) {
      throw new Error(formatEnvValidationErrors(result.error, 'test'));
    }

    return normalizeEnv(result.data);
  }

  const merged = mergeWithDevDefaults({ ...raw, NODE_ENV: 'development' });
  warnDevelopmentFallbacks(raw);
  warnMissingOptionalVars(raw);

  const result = relaxedSchema.safeParse(merged);
  if (!result.success) {
    throw new Error(formatEnvValidationErrors(result.error, 'development'));
  }

  return normalizeEnv(result.data);
}

export function validateEnv(): Env {
  cachedEnv = parseEnv({ exitOnProductionFailure: true });
  return cachedEnv;
}

export function getEnv(): Env {
  if (!cachedEnv) {
    cachedEnv = parseEnv({ exitOnProductionFailure: false });
  }
  return cachedEnv;
}

export function resetEnvCache(): void {
  cachedEnv = null;
}

/** @internal Exported for unit tests */
export const envTestUtils = {
  DEV_DEFAULTS,
  STRIPE_PRICE_ENV_KEYS,
  productionSchema,
  relaxedSchema,
  mergeWithDevDefaults,
  mergeWithTestDefaults,
};
