import { buildServer } from '../server.js';
import { prisma } from '../lib/prisma.js';
import { teardownIntegrationTest, resetAuthRateLimits } from './test-teardown.js';
import { calculateTrialEndDate, isEntitledSubscriptionStatus } from '../modules/billing/plan-limits.js';

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

async function runAuthRegisterTrialTests() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   🔐 QA — Register Trial (POST /auth/register?plan=trial)    ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  const app = await buildServer();
  await resetAuthRateLimits();
  const suffix = Date.now();
  const password = 'SenhaSegura123!';

  try {
    section('1. Helpers de entitlement');

    assert(isEntitledSubscriptionStatus('ACTIVE'), 'ACTIVE é entitled');
    assert(isEntitledSubscriptionStatus('TRIALING'), 'TRIALING é entitled');
    assert(!isEntitledSubscriptionStatus('NONE'), 'NONE não é entitled');

    section('2. Register com trial cria subscription TRIALING');

    const trialEmail = `trial.${suffix}@example.com`;
    const resTrial = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register?plan=trial',
      payload: {
        name: 'Trial Owner',
        email: trialEmail,
        password,
        workspaceName: 'Revenda Trial',
      },
    });

    assert(resTrial.statusCode === 201, 'Register trial retorna 201', `got ${resTrial.statusCode}`);
    const trialBody = JSON.parse(resTrial.payload);
    const workspaceId = trialBody.user?.workspaceId;
    assert(!!workspaceId, 'workspaceId retornado');
    assert(trialBody.billing?.status === 'TRIALING', 'billing.status TRIALING', `got ${trialBody.billing?.status}`);
    assert(trialBody.billing?.planTier === 'PRO', 'billing.planTier PRO');
    assert(trialBody.billing?.limits?.maxVehicles === 500, 'limites Pro aplicados');

    const trialEnd = new Date(trialBody.billing.currentPeriodEnd);
    const expectedEnd = calculateTrialEndDate();
    const diffDays = Math.round((trialEnd.getTime() - expectedEnd.getTime()) / (1000 * 60 * 60 * 24));
    assert(Math.abs(diffDays) <= 1, 'currentPeriodEnd ~14 dias');

    const billingRes = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${workspaceId}/billing`,
      headers: { authorization: `Bearer ${trialBody.accessToken}` },
    });
    assert(billingRes.statusCode === 200, 'GET billing 200');
    const billing = JSON.parse(billingRes.payload);
    assert(billing.status === 'TRIALING', 'GET billing status TRIALING');
    assert(billing.planTier === 'PRO', 'GET billing planTier PRO');

    section('3. Register normal sem trial retorna billing NONE');

    const freeEmail = `free.${suffix}@example.com`;
    const resFree = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        name: 'Free Owner',
        email: freeEmail,
        password,
        workspaceName: 'Revenda Free',
      },
    });
    assert(resFree.statusCode === 201, 'Register normal 201');
    const freeBody = JSON.parse(resFree.payload);
    assert(freeBody.billing?.status === 'NONE', 'billing.status NONE sem trial');

    section('4. Email duplicado com trial retorna 409');

    const resDup = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register?plan=trial',
      payload: {
        name: 'Outro Nome',
        email: trialEmail,
        password,
        workspaceName: 'Outra Revenda',
      },
    });
    assert(resDup.statusCode === 409, 'Email duplicado retorna 409');

    section('5. Email que já consumiu trial retorna 409');

    const consumedEmail = `consumed.${suffix}@example.com`;
    const orphanWorkspace = await prisma.workspace.create({
      data: {
        name: 'Orphan Trial Workspace',
        slug: `orphan-trial-${suffix}`,
        status: 'ACTIVE',
        dealerships: {
          create: {
            tradeName: 'Orphan',
            email: consumedEmail,
          },
        },
        subscription: {
          create: {
            planTier: 'PRO',
            maxVehicles: 500,
            status: 'TRIALING',
            currentPeriodEnd: calculateTrialEndDate(),
          },
        },
      },
    });

    const resConsumed = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register?plan=trial',
      payload: {
        name: 'Abuse Attempt',
        email: consumedEmail,
        password,
        workspaceName: 'Nova Revenda Abuse',
      },
    });
    assert(resConsumed.statusCode === 409, 'Trial já consumido retorna 409');

    await prisma.subscription.deleteMany({ where: { workspaceId: orphanWorkspace.id } });
    await prisma.dealership.deleteMany({ where: { workspaceId: orphanWorkspace.id } });
    await prisma.workspace.delete({ where: { id: orphanWorkspace.id } });

    section('6. Login retorna billing para usuário trial');

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: trialEmail, password },
    });
    assert(loginRes.statusCode === 200, 'Login trial user 200');
    const loginBody = JSON.parse(loginRes.payload);
    assert(loginBody.billing?.status === 'TRIALING', 'Login inclui billing TRIALING');

    console.log(`\n${'═'.repeat(60)}`);
    console.log('📊 RESULTADO — Register Trial');
    console.log('═'.repeat(60));
    console.log(`  Total: ${totalTests} | ✅ ${passedTests} | ❌ ${failures.length}`);

    if (failures.length > 0) {
      failures.forEach((f) => console.log(`  - ${f}`));
      process.exit(1);
    }
    console.log('\n🎉 Todos os testes de register trial passaram!');
    process.exit(0);
  } finally {
    await app.close();
    await teardownIntegrationTest();
  }
}

runAuthRegisterTrialTests().catch((err) => {
  console.error('💥 Erro no teste de register trial:', err);
  process.exit(1);
});
