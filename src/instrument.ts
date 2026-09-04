import * as Sentry from '@sentry/node';

const dsn = process.env.SENTRY_DSN?.trim();

Sentry.init({
  dsn: dsn || undefined,
  enabled: Boolean(dsn),
  environment:
    process.env.SENTRY_ENVIRONMENT?.trim() ||
    process.env.NODE_ENV ||
    'development',
  release: process.env.SENTRY_RELEASE?.trim() || undefined,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
});

export { Sentry };
