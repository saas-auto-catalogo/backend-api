const DEV_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

type CorsOriginCallback = (
  err: Error | null,
  origin: string | boolean | RegExp | (string | boolean | RegExp)[]
) => void;

type CorsOriginFunction = (origin: string | undefined, callback: CorsOriginCallback) => void;

function parseCorsOrigins(): string[] {
  const configured = process.env.FRONTEND_URL?.trim();
  const extras = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  const origins = new Set<string>();
  if (configured) {
    origins.add(configured);
  }
  for (const origin of extras) {
    origins.add(origin);
  }
  return [...origins];
}

export function getCorsOrigin(): string[] | CorsOriginFunction {
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction) {
    const allowed = parseCorsOrigins();
    if (allowed.length === 0) {
      allowed.push('https://app.drivesync.me');
    }
    return (origin, callback) => {
      if (origin && allowed.includes(origin)) {
        callback(null, origin);
        return;
      }
      callback(null, false);
    };
  }

  const origins = new Set(DEV_ORIGINS);
  for (const origin of parseCorsOrigins()) {
    origins.add(origin);
  }
  return [...origins];
}
