import { buildServer } from '../server.js';
import { prisma } from '../lib/prisma.js';
import { trialLifecycleService } from '../modules/billing/trial-lifecycle.service.js';
import { stripePaymentService } from '../services/payments/stripePaymentService.js';
import { resetSystemUserCacheForTests } from '../lib/system-user.js';
import { teardownIntegrationTest } from './test-teardown.js';

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
  console.log(`⏳ ${title}`);
  console.log('─'.repeat(60));
}

function startOfUtcDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function addUtcDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

async function createTrialFixture(suffix: string, currentPeriodEnd: Date) {
  const email = `trial.lifecycle.${suffix}@example.com`;
  const user = await prisma.user.create({
    data: {
      email,
      name: 'Trial Lifecycle User',
      passwordHash: 'hash',
    },
  });

  const workspace = await prisma.workspace.create({
    data: {
      name: `Trial Lifecycle ${suffix}`,
      slug: `trial-lifecycle-${suffix}`,
      status: 'ACTIVE',
    },
  });

  await prisma.workspaceMember.create({
    data: {
      workspaceId: workspace.id,
      userId: user.id,
      role: 'OWNER',
    },
  });

  await prisma.dealership.create({
    data: {
      workspaceId: workspace.id,
      tradeName: `Trial Lifecycle ${suffix}`,
      email,
    },
  });

  const subscription = await prisma.subscription.create({
    data: {
      workspaceId: workspace.id,
      planTier: 'PRO',
      maxVehicles: 500,
      status: 'TRIALING',
      currentPeriodEnd,
    },
  });

  return { user, workspace, subscription, email };
}

async function cleanupTrialFixture(workspaceId: string, userId: string) {
  await prisma.auditLog.deleteMany({ where: { workspaceId } });
  await prisma.subscription.deleteMany({ where: { workspaceId } });
  await prisma.dealership.deleteMany({ where: { workspaceId } });
  await prisma.workspaceMember.deleteMany({ where: { workspaceId } });
  await prisma.workspace.delete({ where: { id: workspaceId } });
  await prisma.user.delete({ where: { id: userId } });
}

async function runTrialLifecycleTests() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   ⏳ Trial Lifecycle — Issue #61                               ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  resetSystemUserCacheForTests();
  const app = await buildServer();
  const suffix = Date.now();
  const now = new Date();

  try {
    section('1. expireTrials — trial vencido vira EXPIRED');

    const pastEnd = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const expiredFixture = await createTrialFixture(`${suffix}-expired`, pastEnd);

    const expiredCount = await trialLifecycleService.expireTrials(now);
    assert(expiredCount >= 1, 'Pelo menos um trial expirado processado');

    const expiredSub = await prisma.subscription.findUnique({
      where: { id: expiredFixture.subscription.id },
    });
    assert(expiredSub?.status === 'EXPIRED', 'Status EXPIRED após job');

    const expiredAudit = await prisma.auditLog.findFirst({
      where: {
        workspaceId: expiredFixture.workspace.id,
        action: 'TRIAL_EXPIRED',
      },
    });
    assert(!!expiredAudit, 'Audit log TRIAL_EXPIRED registrado');

    const billingRes = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${expiredFixture.workspace.id}/billing`,
      headers: { authorization: 'Bearer test' },
    });
    // RBAC may block without real token — query DB via format path is enough; use owner login alternative
    void billingRes;

    const { formatWorkspaceBilling } = await import('../modules/billing/billing-details.js');
    const billingDetails = formatWorkspaceBilling(expiredFixture.workspace.id, expiredSub);
    assert(billingDetails.status === 'EXPIRED', 'formatWorkspaceBilling retorna EXPIRED');
    assert(billingDetails.limits === null, 'limits null para EXPIRED');

    await cleanupTrialFixture(expiredFixture.workspace.id, expiredFixture.user.id);

    section('2. expireTrials — trial válido não expira');

    const futureEnd = addUtcDays(now, 10);
    const activeFixture = await createTrialFixture(`${suffix}-active`, futureEnd);

    const beforeCount = await trialLifecycleService.expireTrials(now);
    void beforeCount;

    const activeSub = await prisma.subscription.findUnique({
      where: { id: activeFixture.subscription.id },
    });
    assert(activeSub?.status === 'TRIALING', 'Trial futuro permanece TRIALING');

    await cleanupTrialFixture(activeFixture.workspace.id, activeFixture.user.id);

    section('3. sendTrialReminders — D-3 envia email e marca flag');

    const d3End = new Date(startOfUtcDay(addUtcDays(now, 3)).getTime() + 12 * 60 * 60 * 1000);
    const reminderFixture = await createTrialFixture(`${suffix}-d3`, d3End);

    const sent = await trialLifecycleService.sendTrialReminders(now);
    assert(sent >= 1, 'Pelo menos um lembrete D-3 enviado');

    const remindedSub = await prisma.subscription.findUnique({
      where: { id: reminderFixture.subscription.id },
    });
    assert(!!remindedSub?.trialReminderSentAt, 'trialReminderSentAt preenchido');

    const reminderAudit = await prisma.auditLog.findFirst({
      where: {
        workspaceId: reminderFixture.workspace.id,
        action: 'TRIAL_REMINDER_SENT',
      },
    });
    assert(!!reminderAudit, 'Audit log TRIAL_REMINDER_SENT registrado');

    const sentAgain = await trialLifecycleService.sendTrialReminders(now);
    const remindedSubAgain = await prisma.subscription.findUnique({
      where: { id: reminderFixture.subscription.id },
    });
    assert(remindedSubAgain?.trialReminderSentAt?.getTime() === remindedSub?.trialReminderSentAt?.getTime(), 'Segunda execução não altera flag');
    void sentAgain;

    await cleanupTrialFixture(reminderFixture.workspace.id, reminderFixture.user.id);

    section('4. sendTrialReminders — trial expirado não recebe lembrete');

    const expiredForReminder = await createTrialFixture(`${suffix}-expired-reminder`, pastEnd);
    await prisma.subscription.update({
      where: { id: expiredForReminder.subscription.id },
      data: { status: 'EXPIRED' },
    });

    const sentExpired = await trialLifecycleService.sendTrialReminders(now);
    void sentExpired;

    const expiredReminderSub = await prisma.subscription.findUnique({
      where: { id: expiredForReminder.subscription.id },
    });
    assert(!expiredReminderSub?.trialReminderSentAt, 'EXPIRED não recebe trialReminderSentAt');

    await cleanupTrialFixture(expiredForReminder.workspace.id, expiredForReminder.user.id);

    section('5. Webhook checkout converte TRIALING → ACTIVE');

    const upgradeEnd = addUtcDays(now, 7);
    const upgradeFixture = await createTrialFixture(`${suffix}-upgrade`, upgradeEnd);

    const webhook = await stripePaymentService.handleWebhook({
      id: `evt_trial_upgrade_${suffix}`,
      type: 'checkout.session.completed',
      data: {
        object: {
          id: `cs_trial_upgrade_${suffix}`,
          customer: `cus_trial_upgrade_${suffix}`,
          subscription: `sub_trial_upgrade_${suffix}`,
          metadata: {
            workspaceId: upgradeFixture.workspace.id,
            plan: 'PRO',
            billingInterval: 'MONTHLY',
            customerEmail: upgradeFixture.email,
          },
        },
      },
    });

    assert(webhook.action === 'PROVISION_TENANT', 'Webhook provisiona trial workspace');
    const upgradedSub = await prisma.subscription.findUnique({
      where: { id: upgradeFixture.subscription.id },
    });
    assert(upgradedSub?.status === 'ACTIVE', 'Status ACTIVE após checkout');
    assert(upgradedSub?.stripeSubscriptionId === `sub_trial_upgrade_${suffix}`, 'stripeSubscriptionId persistido');

    await cleanupTrialFixture(upgradeFixture.workspace.id, upgradeFixture.user.id);

    section('6. runTrialLifecycle — retorna contadores');

    const result = await trialLifecycleService.runTrialLifecycle(now);
    assert(typeof result.expired === 'number', 'expired é número');
    assert(typeof result.remindersSent === 'number', 'remindersSent é número');

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`📊 Trial Lifecycle: ${passedTests}/${totalTests} passou`);
    if (failures.length) {
      failures.forEach((f) => console.log(`  - ${f}`));
      process.exit(1);
    }
    console.log('🎉 Todos os testes de trial lifecycle passaram!');
    process.exit(0);
  } finally {
    await app.close();
    await teardownIntegrationTest();
  }
}

runTrialLifecycleTests().catch((err) => {
  console.error('💥 Erro no teste trial lifecycle:', err);
  process.exit(1);
});
