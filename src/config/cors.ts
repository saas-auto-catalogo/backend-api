const DEV_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

type CorsOriginCallback = (
  origin: string | undefined,
  callback: (err: Error | null, origin?: boolean | string) => void
) => void;

export function getCorsOrigin(): string | string[] | CorsOriginCallback {
  const configured = process.env.FRONTEND_URL?.trim();
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction) {
    const allowed = configured || 'https://app.autocatalogo.com.br';
    return (origin, callback) => {
      if (origin === allowed) {
        callback(null, origin);
        return;
      }
      callback(null, false);
    };
  }

  const origins = new Set(DEV_ORIGINS);
  if (configured) {
    origins.add(configured);
  }
  return [...origins];
}
