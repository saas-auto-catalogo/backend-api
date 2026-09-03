import { buildServer } from '../server.js';
import { REFRESH_TOKEN_COOKIE } from '../modules/auth/auth.cookie.js';
import { teardownIntegrationTest, resetAuthRateLimits } from './test-teardown.js';
import { withRegisterConsent } from './legal-test-helpers.js';

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
  console.log(`🍪 ${title}`);
  console.log('─'.repeat(60));
}

function extractCookieValue(setCookieHeader: string | string[] | undefined, name: string): string | undefined {
  const header = Array.isArray(setCookieHeader) ? setCookieHeader.join('; ') : (setCookieHeader || '');
  const match = header.match(new RegExp(`${name}=([^;]+)`));
  return match?.[1];
}

async function runAuthCookieTestSuite() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   🍪 QA — Refresh Token httpOnly Cookie & CORS               ║');
  console.log('║   SaaS Auto Catálogo Backend API                            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  const app = await buildServer();
  await resetAuthRateLimits();
  const startTime = Date.now();
  const uniqueEmail = `cookie-test-${Date.now()}@test.local`;
  const password = 'SenhaSegura123!';

  try {
    section('1. Refresh sem token retorna 401');

    const resRefreshNoToken = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
    });
    assert(resRefreshNoToken.statusCode === 401, `Refresh sem token retorna 401 (got ${resRefreshNoToken.statusCode})`);

    section('2. Register seta cookie httpOnly');

    const resRegister = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: await withRegisterConsent({
        name: 'Cookie Tester',
        email: uniqueEmail,
        password,
        workspaceName: 'Revenda Cookie',
      }),
    });

    if (resRegister.statusCode !== 201) {
      assert(false, 'Register para testes de cookie retorna 201', `got ${resRegister.statusCode}`);
    } else {
      const setCookie = resRegister.headers['set-cookie'];
      const refreshToken = extractCookieValue(setCookie, REFRESH_TOKEN_COOKIE);
      const registerData = JSON.parse(resRegister.payload);

      assert(!!refreshToken, 'Cookie refreshToken extraído do Set-Cookie');
      assert(!registerData.refreshToken, 'JSON não expõe refreshToken');

      section('3. Refresh via cookie');

      const resRefreshCookie = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        cookies: { [REFRESH_TOKEN_COOKIE]: refreshToken! },
      });
      assert(resRefreshCookie.statusCode === 200, `Refresh via cookie retorna 200 (got ${resRefreshCookie.statusCode})`);

      const refreshCookieData = JSON.parse(resRefreshCookie.payload);
      assert(!!refreshCookieData.accessToken, 'Refresh via cookie retorna accessToken');

      section('4. Refresh via body (fallback)');

      const resRefreshBody = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: { refreshToken },
      });
      assert(resRefreshBody.statusCode === 200, `Refresh via body retorna 200 (got ${resRefreshBody.statusCode})`);

      section('5. Logout limpa cookie e revoga token');

      const resLogout = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
        headers: { authorization: `Bearer ${registerData.accessToken}` },
        cookies: { [REFRESH_TOKEN_COOKIE]: refreshToken! },
      });
      assert(resLogout.statusCode === 200, `Logout retorna 200 (got ${resLogout.statusCode})`);

      const logoutSetCookie = resLogout.headers['set-cookie'] || '';
      const clearedCookie = Array.isArray(logoutSetCookie) ? logoutSetCookie.join('; ') : logoutSetCookie;
      assert(
        clearedCookie.toLowerCase().includes('refreshtoken=') || clearedCookie.toLowerCase().includes('max-age=0'),
        'Logout emite clear-cookie para refreshToken',
      );

      const resRefreshAfterLogout = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: { refreshToken },
      });
      assert(
        resRefreshAfterLogout.statusCode === 401,
        `Refresh após logout retorna 401 (got ${resRefreshAfterLogout.statusCode})`,
      );
    }
  } finally {
    await app.close();
    await teardownIntegrationTest();
  }

  const elapsed = Date.now() - startTime;
  console.log('\n════════════════════════════════════════════════════════════');
  console.log('📊 RESULTADO FINAL DOS TESTES DE COOKIE');
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

  console.log('\n🎉 Todos os testes de cookie passaram com 100% de sucesso!');
  process.exit(0);
}

runAuthCookieTestSuite().catch((err) => {
  console.error('Erro fatal na suíte de testes:', err);
  process.exit(1);
});
