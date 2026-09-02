import { buildServer } from '../server.js';
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
  console.log(`🔐 ${title}`);
  console.log('─'.repeat(60));
}

async function runAuthRegisterTestSuite() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   🔐 QA — Cadastro de Usuário (POST /auth/register)          ║');
  console.log('║   SaaS Auto Catálogo Backend API                            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  const app = await buildServer();
  await resetAuthRateLimits();
  const startTime = Date.now();
  const uniqueEmail = `register-test-${Date.now()}@test.local`;
  const password = 'SenhaSegura123!';

  try {
    section('1. Validação de payload (422)');

    const resShortPassword = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        name: 'João Silva',
        email: uniqueEmail,
        password: 'curta',
        workspaceName: 'Revenda ABC',
      },
    });
    assert(resShortPassword.statusCode === 422, 'Senha curta retorna 422');

    const resInvalidEmail = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        name: 'João Silva',
        email: 'email-invalido',
        password,
        workspaceName: 'Revenda ABC',
      },
    });
    assert(resInvalidEmail.statusCode === 422, 'Email inválido retorna 422');

    const resMissingWorkspace = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        name: 'João Silva',
        email: uniqueEmail,
        password,
      },
    });
    assert(resMissingWorkspace.statusCode === 422, 'workspaceName ausente retorna 422');

    section('2. Cadastro com sucesso (201)');

    const resRegister = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        name: 'João Silva',
        email: uniqueEmail,
        password,
        workspaceName: 'Revenda ABC',
      },
    });
    assert(resRegister.statusCode === 201, `Cadastro válido retorna 201 (got ${resRegister.statusCode})`);

    const registerData = JSON.parse(resRegister.payload);
    const setCookieHeader = String(
      Array.isArray(resRegister.headers['set-cookie'])
        ? resRegister.headers['set-cookie'].join('; ')
        : (resRegister.headers['set-cookie'] || '')
    );
    assert(!!registerData.accessToken, 'Resposta contém accessToken');
    assert(!registerData.refreshToken, 'Resposta NÃO contém refreshToken no JSON');
    assert(setCookieHeader.includes('refreshToken'), 'Set-Cookie contém refreshToken');
    assert(setCookieHeader.toLowerCase().includes('httponly'), 'Cookie é HttpOnly');
    assert(setCookieHeader.includes('Path=/api/v1/auth'), 'Cookie com Path=/api/v1/auth');
    assert(registerData.tokenType === 'Bearer', 'tokenType é Bearer');
    assert(!!registerData.user?.workspaceId, 'user.workspaceId preenchido');
    assert(registerData.user?.role === 'OWNER', 'user.role é OWNER');
    assert(!!registerData.user?.dealershipId, 'user.dealershipId preenchido');

    section('3. Email duplicado (409)');

    const resDuplicate = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        name: 'Outro Usuário',
        email: uniqueEmail,
        password,
        workspaceName: 'Outra Revenda',
      },
    });
    assert(resDuplicate.statusCode === 409, `Email duplicado retorna 409 (got ${resDuplicate.statusCode})`);

    section('4. Login após cadastro (200)');

    const resLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: uniqueEmail,
        password,
      },
    });
    assert(resLogin.statusCode === 200, `Login após cadastro retorna 200 (got ${resLogin.statusCode})`);

    const loginData = JSON.parse(resLogin.payload);
    const loginSetCookie = String(
      Array.isArray(resLogin.headers['set-cookie'])
        ? resLogin.headers['set-cookie'].join('; ')
        : (resLogin.headers['set-cookie'] || '')
    );
    assert(!!loginData.accessToken, 'Login retorna accessToken');
    assert(!loginData.refreshToken, 'Login NÃO retorna refreshToken no JSON');
    assert(loginSetCookie.includes('refreshToken'), 'Login seta cookie refreshToken');
    assert(loginData.user?.workspaceId === registerData.user?.workspaceId, 'workspaceId coincide após login');
  } finally {
    await app.close();
    await teardownIntegrationTest();
  }

  const elapsed = Date.now() - startTime;
  console.log('\n════════════════════════════════════════════════════════════');
  console.log('📊 RESULTADO FINAL DOS TESTES DE CADASTRO');
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

  console.log('\n🎉 Todos os testes de cadastro passaram com 100% de sucesso!');
  process.exit(0);
}

runAuthRegisterTestSuite().catch((err) => {
  console.error('Erro fatal na suíte de testes:', err);
  process.exit(1);
});
