import { buildServer } from '../server.js';
import { prisma } from '../lib/prisma.js';
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
  console.log(`🧭 ${title}`);
  console.log('─'.repeat(60));
}

async function runAuthOnboardingTestSuite() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   🧭 QA — Estado de Onboarding (GET/PATCH /auth/me)           ║');
  console.log('║   SaaS Auto Catálogo Backend API                            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  const app = await buildServer();
  await resetAuthRateLimits();
  const startTime = Date.now();
  const uniqueEmail = `onboarding-test-${Date.now()}@test.local`;
  const password = 'SenhaSegura123!';

  try {
    section('1. Novo usuário inicia onboarding no passo 1');

    const resRegister = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        name: 'Maria Onboarding',
        email: uniqueEmail,
        password,
        workspaceName: 'Revenda Onboarding',
      },
    });
    assert(resRegister.statusCode === 201, `Register retorna 201 (got ${resRegister.statusCode})`);

    const registerData = JSON.parse(resRegister.payload);
    const accessToken = registerData.accessToken as string;
    const userId = registerData.user?.id as string;

    const resMeInitial = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    assert(resMeInitial.statusCode === 200, `GET /me retorna 200 (got ${resMeInitial.statusCode})`);

    const meInitial = JSON.parse(resMeInitial.payload).user;
    assert(meInitial?.onboardingCompleted === false, 'onboardingCompleted=false no cadastro');
    assert(meInitial?.onboardingStep === 1, 'onboardingStep=1 no cadastro');

    section('2. Atualização de passo (PATCH step 2)');

    const resPatchStep = await app.inject({
      method: 'PATCH',
      url: '/api/v1/auth/me/onboarding',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { onboardingStep: 2 },
    });
    assert(resPatchStep.statusCode === 200, `PATCH step 2 retorna 200 (got ${resPatchStep.statusCode})`);

    const patchStepBody = JSON.parse(resPatchStep.payload).user;
    assert(patchStepBody?.onboardingStep === 2, 'onboardingStep atualizado para 2');
    assert(patchStepBody?.onboardingCompleted === false, 'onboardingCompleted permanece false');

    section('3. Conclusão do onboarding');

    const resPatchComplete = await app.inject({
      method: 'PATCH',
      url: '/api/v1/auth/me/onboarding',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { onboardingCompleted: true },
    });
    assert(resPatchComplete.statusCode === 200, `PATCH complete retorna 200 (got ${resPatchComplete.statusCode})`);

    const patchCompleteBody = JSON.parse(resPatchComplete.payload).user;
    assert(patchCompleteBody?.onboardingCompleted === true, 'onboardingCompleted=true');
    assert(patchCompleteBody?.onboardingStep === 4, 'onboardingStep=4 ao concluir');

    const auditLog = await prisma.auditLog.findFirst({
      where: {
        actorUserId: userId,
        action: 'ONBOARDING_COMPLETED',
      },
      orderBy: { createdAt: 'desc' },
    });
    assert(auditLog !== null, 'Audit log ONBOARDING_COMPLETED registrado');
    assert(auditLog?.entityId === userId, 'Audit log referencia o usuário correto');

    section('4. Validações de segurança e payload');

    const resNoAuth = await app.inject({
      method: 'PATCH',
      url: '/api/v1/auth/me/onboarding',
      payload: { onboardingStep: 2 },
    });
    assert(resNoAuth.statusCode === 401, `PATCH sem token retorna 401 (got ${resNoAuth.statusCode})`);

    const resEmptyBody = await app.inject({
      method: 'PATCH',
      url: '/api/v1/auth/me/onboarding',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {},
    });
    assert(resEmptyBody.statusCode === 422, `PATCH body vazio retorna 422 (got ${resEmptyBody.statusCode})`);

    const resInvalidStep = await app.inject({
      method: 'PATCH',
      url: '/api/v1/auth/me/onboarding',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { onboardingStep: 5 },
    });
    assert(resInvalidStep.statusCode === 422, `PATCH step=5 retorna 422 (got ${resInvalidStep.statusCode})`);
  } finally {
    await app.close();
    await teardownIntegrationTest();
  }

  const elapsed = Date.now() - startTime;
  console.log('\n════════════════════════════════════════════════════════════');
  console.log('📊 RESULTADO FINAL DOS TESTES DE ONBOARDING');
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

  console.log('\n🎉 Todos os testes de onboarding passaram com 100% de sucesso!');
  process.exit(0);
}

runAuthOnboardingTestSuite().catch((err) => {
  console.error('Erro fatal na suíte de testes de onboarding:', err);
  process.exit(1);
});
