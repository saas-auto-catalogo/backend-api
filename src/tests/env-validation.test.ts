import {
  formatEnvValidationErrors,
  isStripeRealMode,
  parseEnv,
  resetEnvCache,
  envTestUtils,
} from '../config/env.js';

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
  console.log(`🔧 ${title}`);
  console.log('─'.repeat(60));
}

function withEnv(
  overrides: Record<string, string | undefined>,
  run: () => void
): void {
  const saved = new Map<string, string | undefined>();

  for (const [key, value] of Object.entries(overrides)) {
    saved.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  resetEnvCache();

  try {
    run();
  } finally {
    for (const [key, value] of saved.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    resetEnvCache();
  }
}

function baseProductionEnv(): Record<string, string> {
  return {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/auto_catalogo_db?schema=public',
    JWT_SECRET: 'production-jwt-secret-minimum-32-characters',
    REDIS_URL: 'redis://localhost:6379',
    FEED_TOKEN_SECRET: 'production-feed-token-secret-minimum-32-chars',
    FRONTEND_URL: 'https://app.example.com',
    STRIPE_MOCK: 'true',
  };
}

function stripeProductionEnv(): Record<string, string> {
  return {
    ...baseProductionEnv(),
    STRIPE_MOCK: 'false',
    STRIPE_SECRET_KEY: 'sk_test_production_example',
    STRIPE_WEBHOOK_SECRET: 'whsec_production_example',
    STRIPE_STARTER_MONTHLY_PRICE_ID: 'price_starter_monthly',
    STRIPE_STARTER_YEARLY_PRICE_ID: 'price_starter_yearly',
    STRIPE_PRO_MONTHLY_PRICE_ID: 'price_pro_monthly',
    STRIPE_PRO_YEARLY_PRICE_ID: 'price_pro_yearly',
    STRIPE_ENTERPRISE_MONTHLY_PRICE_ID: 'price_enterprise_monthly',
    STRIPE_ENTERPRISE_YEARLY_PRICE_ID: 'price_enterprise_yearly',
  };
}

async function runEnvValidationTestSuite() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   🔧 QA — Validação de Variáveis de Ambiente                 ║');
  console.log('║   SaaS Auto Catálogo Backend API                            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  const startTime = Date.now();

  section('1. Production — variáveis obrigatórias');

  withEnv(
    {
      ...baseProductionEnv(),
      JWT_SECRET: undefined,
    },
    () => {
      try {
        parseEnv({ exitOnProductionFailure: false });
        assert(false, 'Production sem JWT_SECRET deve falhar');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        assert(message.includes('JWT_SECRET'), 'Erro de production inclui JWT_SECRET', message);
      }
    }
  );

  withEnv(
    {
      ...baseProductionEnv(),
      JWT_SECRET: undefined,
      FEED_TOKEN_SECRET: 'short',
      FRONTEND_URL: 'not-a-url',
    },
    () => {
      try {
        parseEnv({ exitOnProductionFailure: false });
        assert(false, 'Production com múltiplas vars inválidas deve falhar');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        assert(message.includes('JWT_SECRET'), 'Erro lista JWT_SECRET', message);
        assert(message.includes('FEED_TOKEN_SECRET'), 'Erro lista FEED_TOKEN_SECRET', message);
        assert(message.includes('FRONTEND_URL'), 'Erro lista FRONTEND_URL', message);
      }
    }
  );

  section('2. Production — Stripe condicional');

  withEnv(baseProductionEnv(), () => {
    const env = parseEnv({ exitOnProductionFailure: false });
    assert(env.STRIPE_MOCK === true, 'STRIPE_MOCK=true é reconhecido');
    assert(!env.STRIPE_SECRET_KEY, 'Stripe keys não são exigidas com STRIPE_MOCK=true');
  });

  withEnv(
    {
      ...baseProductionEnv(),
      STRIPE_MOCK: 'false',
    },
    () => {
      try {
        parseEnv({ exitOnProductionFailure: false });
        assert(false, 'Production Stripe real sem keys deve falhar');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        assert(message.includes('STRIPE_SECRET_KEY'), 'Erro inclui STRIPE_SECRET_KEY', message);
        assert(message.includes('STRIPE_WEBHOOK_SECRET'), 'Erro inclui STRIPE_WEBHOOK_SECRET', message);
        assert(message.includes('STRIPE_PRO_MONTHLY_PRICE_ID'), 'Erro inclui price IDs', message);
      }
    }
  );

  withEnv(stripeProductionEnv(), () => {
    const env = parseEnv({ exitOnProductionFailure: false });
    assert(env.STRIPE_SECRET_KEY === 'sk_test_production_example', 'Stripe secret key parseada');
    assert(env.STRIPE_PRO_MONTHLY_PRICE_ID === 'price_pro_monthly', 'Stripe price ID parseado');
  });

  section('3. Test e development');

  withEnv(
    {
      NODE_ENV: 'test',
      DATABASE_URL: undefined,
      JWT_SECRET: undefined,
      REDIS_URL: undefined,
      FEED_TOKEN_SECRET: undefined,
      FRONTEND_URL: undefined,
    },
    () => {
      const env = parseEnv({ exitOnProductionFailure: false });
      assert(env.NODE_ENV === 'test', 'NODE_ENV=test');
      assert(env.JWT_SECRET.length >= 32, 'JWT_SECRET default em test');
      assert(env.DATABASE_URL.startsWith('postgresql://'), 'DATABASE_URL default em test');
    }
  );

  withEnv(
    {
      NODE_ENV: 'development',
      JWT_SECRET: undefined,
    },
    () => {
      const warnings: string[] = [];
      const originalWarn = console.warn;
      console.warn = (...args: unknown[]) => {
        warnings.push(args.map(String).join(' '));
      };

      try {
        const env = parseEnv({ exitOnProductionFailure: false });
        assert(env.JWT_SECRET === envTestUtils.DEV_DEFAULTS.JWT_SECRET, 'Development usa default de JWT_SECRET');
        assert(
          warnings.some((line) => line.includes('JWT_SECRET')),
          'Development emite warn para JWT_SECRET ausente',
          warnings.join(' | ')
        );
      } finally {
        console.warn = originalWarn;
      }
    }
  );

  section('4. Helpers');

  assert(
    isStripeRealMode('production', 'false') === true,
    'Stripe real mode em production sem mock'
  );
  assert(
    isStripeRealMode('production', 'true') === false,
    'Stripe mock mode em production com STRIPE_MOCK=true'
  );
  assert(
    isStripeRealMode('test', undefined) === false,
    'Stripe real mode desligado em test'
  );

  const formatted = formatEnvValidationErrors(
    envTestUtils.productionSchema.safeParse({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://localhost/db',
      JWT_SECRET: 'short',
    }).error!,
    'production'
  );
  assert(formatted.startsWith('Environment validation failed (production):'), 'Formatter de erro padronizado');

  const elapsed = Date.now() - startTime;
  console.log('\n════════════════════════════════════════════════════════════');
  console.log('📊 RESULTADO FINAL DOS TESTES DE ENV');
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

  console.log('\n🎉 Todos os testes de env passaram com 100% de sucesso!');
  process.exit(0);
}

runEnvValidationTestSuite().catch((err) => {
  console.error('Erro fatal na suíte de testes:', err);
  process.exit(1);
});
