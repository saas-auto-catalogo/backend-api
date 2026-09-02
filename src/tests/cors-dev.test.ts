import { buildServer } from '../server.js';
import { resetEnvCache } from '../config/env.js';
import { teardownIntegrationTest, resetAuthRateLimits } from './test-teardown.js';

let totalTests = 0;
let passedTests = 0;
const failures: string[] = [];

function assert(condition: boolean, testName: string, detail?: string): void {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ ${testName}`);
  } else {
    failures.push(detail ? `${testName}: ${detail}` : testName);
    console.error(`  ❌ ${testName}${detail ? ` — ${detail}` : ''}`);
  }
}

function section(title: string): void {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`🌐 ${title}`);
  console.log('─'.repeat(60));
}

function getAllowOrigin(headers: Record<string, unknown>): string | undefined {
  const value = headers['access-control-allow-origin'];
  return value === undefined ? undefined : String(value);
}

async function runCorsDevTestSuite() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   🌐 QA — CORS em development/test                           ║');
  console.log('║   SaaS Auto Catálogo Backend API                            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  const app = await buildServer();
  await resetAuthRateLimits();
  const startTime = Date.now();

  try {
    section('1. Preflight OPTIONS (dev/test)');

    const preflightLocalhost = await app.inject({
      method: 'OPTIONS',
      url: '/api/v1/auth/register',
      headers: {
        origin: 'http://localhost:3000',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    });
    assert(
      preflightLocalhost.statusCode === 204 || preflightLocalhost.statusCode === 200,
      'OPTIONS localhost:3000 retorna 204/200',
      `got ${preflightLocalhost.statusCode}`
    );
    assert(
      getAllowOrigin(preflightLocalhost.headers) === 'http://localhost:3000',
      'OPTIONS localhost:3000 reflete Access-Control-Allow-Origin',
      `got ${getAllowOrigin(preflightLocalhost.headers)}`
    );

    const preflight127 = await app.inject({
      method: 'OPTIONS',
      url: '/api/v1/auth/register',
      headers: {
        origin: 'http://127.0.0.1:3000',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    });
    assert(
      preflight127.statusCode === 204 || preflight127.statusCode === 200,
      'OPTIONS 127.0.0.1:3000 retorna 204/200',
      `got ${preflight127.statusCode}`
    );
    assert(
      getAllowOrigin(preflight127.headers) === 'http://127.0.0.1:3000',
      'OPTIONS 127.0.0.1:3000 reflete Access-Control-Allow-Origin',
      `got ${getAllowOrigin(preflight127.headers)}`
    );

    const preflightEvil = await app.inject({
      method: 'OPTIONS',
      url: '/api/v1/auth/register',
      headers: {
        origin: 'http://evil.example.com',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    });
    assert(
      getAllowOrigin(preflightEvil.headers) === undefined,
      'OPTIONS origem não permitida não retorna Access-Control-Allow-Origin',
      `got ${getAllowOrigin(preflightEvil.headers)}`
    );

    section('2. POST com Origin (dev/test)');

    const uniqueEmail = `cors-test-${Date.now()}@test.local`;
    const postRegister = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: {
        origin: 'http://localhost:3000',
      },
      payload: {
        name: 'CORS Test User',
        email: uniqueEmail,
        password: 'SenhaSegura123!',
        workspaceName: 'CORS Test Workspace',
      },
    });
    assert(
      postRegister.statusCode === 201,
      'POST register com Origin localhost:3000 retorna 201',
      `got ${postRegister.statusCode}`
    );
    assert(
      getAllowOrigin(postRegister.headers) === 'http://localhost:3000',
      'POST register reflete Access-Control-Allow-Origin',
      `got ${getAllowOrigin(postRegister.headers)}`
    );
  } finally {
    await app.close();
    await teardownIntegrationTest();
  }

  section('3. Preflight OPTIONS (production)');

  const savedNodeEnv = process.env.NODE_ENV;
  const savedFrontendUrl = process.env.FRONTEND_URL;
  const savedDatabaseUrl = process.env.DATABASE_URL;
  const savedJwtSecret = process.env.JWT_SECRET;
  const savedRedisUrl = process.env.REDIS_URL;
  const savedFeedTokenSecret = process.env.FEED_TOKEN_SECRET;
  const savedStripeMock = process.env.STRIPE_MOCK;

  process.env.NODE_ENV = 'production';
  process.env.FRONTEND_URL = 'http://app.example.com';
  process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/auto_catalogo_db?schema=public';
  process.env.JWT_SECRET = 'production-jwt-secret-minimum-32-characters';
  process.env.REDIS_URL = 'redis://localhost:6379';
  process.env.FEED_TOKEN_SECRET = 'production-feed-token-secret-minimum-32-chars';
  process.env.STRIPE_MOCK = 'true';
  resetEnvCache();

  const prodApp = await buildServer();

  try {
    const prodAllowed = await prodApp.inject({
      method: 'OPTIONS',
      url: '/api/v1/auth/register',
      headers: {
        origin: 'http://app.example.com',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    });
    assert(
      prodAllowed.statusCode === 204 || prodAllowed.statusCode === 200,
      'Production OPTIONS origem configurada retorna 204/200',
      `got ${prodAllowed.statusCode}`
    );
    assert(
      getAllowOrigin(prodAllowed.headers) === 'http://app.example.com',
      'Production OPTIONS origem configurada reflete Allow-Origin',
      `got ${getAllowOrigin(prodAllowed.headers)}`
    );

    const prodBlocked = await prodApp.inject({
      method: 'OPTIONS',
      url: '/api/v1/auth/register',
      headers: {
        origin: 'http://localhost:3000',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    });
    assert(
      getAllowOrigin(prodBlocked.headers) === undefined,
      'Production OPTIONS origem diferente não retorna Allow-Origin',
      `got ${getAllowOrigin(prodBlocked.headers)}`
    );
  } finally {
    await prodApp.close();
    if (savedNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = savedNodeEnv;
    }
    if (savedFrontendUrl === undefined) {
      delete process.env.FRONTEND_URL;
    } else {
      process.env.FRONTEND_URL = savedFrontendUrl;
    }
    if (savedDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = savedDatabaseUrl;
    }
    if (savedJwtSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = savedJwtSecret;
    }
    if (savedRedisUrl === undefined) {
      delete process.env.REDIS_URL;
    } else {
      process.env.REDIS_URL = savedRedisUrl;
    }
    if (savedFeedTokenSecret === undefined) {
      delete process.env.FEED_TOKEN_SECRET;
    } else {
      process.env.FEED_TOKEN_SECRET = savedFeedTokenSecret;
    }
    if (savedStripeMock === undefined) {
      delete process.env.STRIPE_MOCK;
    } else {
      process.env.STRIPE_MOCK = savedStripeMock;
    }
    resetEnvCache();
  }

  const elapsed = Date.now() - startTime;
  console.log('\n════════════════════════════════════════════════════════════');
  console.log('📊 RESULTADO FINAL DOS TESTES DE CORS');
  console.log('════════════════════════════════════════════════════════════');
  console.log(`  Total de testes: ${totalTests}`);
  console.log(`  ✅ Passou:        ${passedTests}`);
  console.log(`  ❌ Falhou:        ${failures.length}`);
  console.log(`  ⏱️  Tempo total:   ${elapsed}ms`);

  if (failures.length > 0) {
    console.log('\nFalhas:');
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  }

  console.log('\n🎉 Todos os testes de CORS passaram com 100% de sucesso!');
  process.exit(0);
}

runCorsDevTestSuite().catch((err) => {
  console.error('Erro fatal na suíte de testes:', err);
  process.exit(1);
});
