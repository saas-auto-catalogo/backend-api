import { buildServer } from '../server.js';
import { prisma } from '../lib/prisma.js';
import { stripePaymentService } from '../services/payments/stripePaymentService.js';
import { resetSystemUserCacheForTests } from '../lib/system-user.js';

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
  console.log(`💳 ${title}`);
  console.log('─'.repeat(60));
}

async function runStripeWebhookPersistenceTests() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   💳 Stripe Webhook Persistence — Issue #50 / #64            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  resetSystemUserCacheForTests();
  const app = await buildServer();
  const startTime = Date.now();
  const uniqueSuffix = Date.now();

  try {
    section('1. checkout.session.completed — sem workspaceId é ignorado');

    const newEmail = `checkout.new.${uniqueSuffix}@example.com`;
    const sessionId = `cs_test_new_${uniqueSuffix}`;

    const hookNew = await stripePaymentService.handleWebhook({
      id: `evt_checkout_new_${uniqueSuffix}`,
      type: 'checkout.session.completed',
      data: {
        object: {
          id: sessionId,
          customer: `cus_new_${uniqueSuffix}`,
          subscription: `sub_new_${uniqueSuffix}`,
          customer_email: newEmail,
          metadata: {
            plan: 'PRO',
            billingInterval: 'MONTHLY',
            dealershipName: 'Nova Revenda Test',
            customerEmail: newEmail,
            customerDocument: '12.345.678/0001-90',
          },
        },
      },
    });

    assert(hookNew.action === 'IGNORED', 'Webhook sem workspaceId é ignorado');
    assert(
      (hookNew.details as { reason?: string })?.reason === 'missing_workspace_id',
      'reason missing_workspace_id'
    );

    const provision = await prisma.checkoutProvision.findUnique({ where: { stripeSessionId: sessionId } });
    assert(!provision, 'CheckoutProvision não criada');

    const hookDup = await stripePaymentService.handleWebhook({
      id: `evt_checkout_new_${uniqueSuffix}`,
      type: 'checkout.session.completed',
      data: {
        object: {
          id: sessionId,
          customer_email: newEmail,
          metadata: { plan: 'PRO', customerEmail: newEmail },
        },
      },
    });
    assert(hookDup.action === 'IGNORED', 'Evento duplicado é ignorado (idempotência)');

    section('2. checkout.session.completed — email existente sem workspaceId é ignorado');

    const owner1 = await prisma.user.findUnique({
      where: { email: 'carlos.silva@autoelitemotors.com.br' },
      include: { memberships: { where: { role: 'OWNER' }, take: 1 } },
    });
    assert(!!owner1?.memberships[0], 'Seed owner1 disponível');

    const beforeSub = await prisma.subscription.findUnique({
      where: { workspaceId: owner1!.memberships[0].workspaceId },
    });
    const beforeCustomerId = beforeSub?.stripeCustomerId ?? null;

    const hookExisting = await stripePaymentService.handleWebhook({
      id: `evt_checkout_existing_${uniqueSuffix}`,
      type: 'checkout.session.completed',
      data: {
        object: {
          id: `cs_test_existing_${uniqueSuffix}`,
          customer: 'cus_seed_auto_elite',
          subscription: 'sub_seed_auto_elite',
          metadata: {
            plan: 'PRO',
            billingInterval: 'MONTHLY',
            customerEmail: 'carlos.silva@autoelitemotors.com.br',
            dealershipName: 'Auto Elite Motors',
            customerDocument: '12.345.678/0001-90',
          },
        },
      },
    });

    assert(hookExisting.action === 'IGNORED', 'Email existente sem workspaceId é ignorado');
    const afterSub = await prisma.subscription.findUnique({
      where: { workspaceId: owner1!.memberships[0].workspaceId },
    });
    assert(afterSub?.stripeCustomerId === beforeCustomerId, 'Subscription não alterada sem workspaceId');

    section('2b. checkout.session.completed — metadata.workspaceId vincula workspace existente');

    const workspaceBoundSuffix = `${uniqueSuffix}_ws`;
    const workspaceBound = await prisma.workspace.create({
      data: {
        name: 'Workspace Bound Checkout',
        slug: `ws-bound-${workspaceBoundSuffix}`,
        status: 'ACTIVE',
      },
    });
    const workspaceBoundSessionId = `cs_test_workspace_bound_${workspaceBoundSuffix}`;

    const hookWorkspaceBound = await stripePaymentService.handleWebhook({
      id: `evt_checkout_workspace_bound_${workspaceBoundSuffix}`,
      type: 'checkout.session.completed',
      data: {
        object: {
          id: workspaceBoundSessionId,
          customer: `cus_ws_bound_${workspaceBoundSuffix}`,
          subscription: `sub_ws_bound_${workspaceBoundSuffix}`,
          metadata: {
            workspaceId: workspaceBound.id,
            plan: 'STARTER',
            billingInterval: 'MONTHLY',
            customerEmail: 'workspace.bound@example.com',
          },
        },
      },
    });

    assert(hookWorkspaceBound.action === 'PROVISION_TENANT', 'Webhook workspace-bound provisiona subscription');
    assert(hookWorkspaceBound.workspaceId === workspaceBound.id, 'workspaceId retornado no webhook');
    assert(
      (hookWorkspaceBound.details as { mode?: string })?.mode === 'workspace_checkout',
      'mode workspace_checkout'
    );

    const boundProvision = await prisma.checkoutProvision.findUnique({
      where: { stripeSessionId: workspaceBoundSessionId },
    });
    assert(!boundProvision, 'CheckoutProvision não criada no fluxo workspace-bound');

    const boundSubscription = await prisma.subscription.findUnique({
      where: { workspaceId: workspaceBound.id },
    });
    assert(boundSubscription?.status === 'ACTIVE', 'Subscription ACTIVE no workspace existente');
    assert(boundSubscription?.planTier === 'STARTER', 'Plano STARTER aplicado via metadata');

    await prisma.subscription.deleteMany({ where: { workspaceId: workspaceBound.id } });
    await prisma.workspace.delete({ where: { id: workspaceBound.id } });

    section('2c. checkout.session.completed — workspaceId ativa subscription do owner seed');

    const hookOwnerBound = await stripePaymentService.handleWebhook({
      id: `evt_checkout_owner_bound_${uniqueSuffix}`,
      type: 'checkout.session.completed',
      data: {
        object: {
          id: `cs_test_owner_bound_${uniqueSuffix}`,
          customer: 'cus_seed_auto_elite',
          subscription: 'sub_seed_auto_elite',
          metadata: {
            workspaceId: owner1!.memberships[0].workspaceId,
            plan: 'PRO',
            billingInterval: 'MONTHLY',
            customerEmail: 'carlos.silva@autoelitemotors.com.br',
          },
        },
      },
    });

    assert(hookOwnerBound.action === 'PROVISION_TENANT', 'Webhook workspace-bound ativa owner seed');
    const existingSub = await prisma.subscription.findUnique({
      where: { workspaceId: owner1!.memberships[0].workspaceId },
    });
    assert(existingSub?.stripeCustomerId === 'cus_seed_auto_elite', 'stripeCustomerId atualizado no workspace existente');

    section('3. invoice.payment_succeeded — renova período');

    const renewEnd = Math.floor(Date.now() / 1000) + 86400 * 45;
    const hookRenew = await stripePaymentService.handleWebhook({
      id: `evt_renew_${uniqueSuffix}`,
      type: 'invoice.payment_succeeded',
      data: {
        object: {
          id: `in_renew_${uniqueSuffix}`,
          subscription: 'sub_seed_auto_elite',
          period_end: renewEnd,
        },
      },
    });
    assert(hookRenew.action === 'RENEW_SUBSCRIPTION', 'Renova subscription');
    const renewedSub = await prisma.subscription.findUnique({ where: { stripeSubscriptionId: 'sub_seed_auto_elite' } });
    assert(renewedSub?.status === 'ACTIVE', 'Status ACTIVE após renovação');

    section('4. invoice.payment_failed — PAST_DUE e SUSPENDED');

    await prisma.subscription.update({
      where: { stripeSubscriptionId: 'sub_seed_auto_elite' },
      data: { status: 'ACTIVE' },
    });
    await prisma.workspace.updateMany({
      where: { id: owner1!.memberships[0].workspaceId },
      data: { status: 'ACTIVE' },
    });

    const hookFail1 = await stripePaymentService.handleWebhook({
      id: `evt_fail1_${uniqueSuffix}`,
      type: 'invoice.payment_failed',
      data: {
        object: {
          id: `in_fail1_${uniqueSuffix}`,
          subscription: 'sub_seed_auto_elite',
          attempt_count: 1,
        },
      },
    });
    assert(hookFail1.action === 'PAYMENT_FAILED_ALERT', 'Primeira falha gera alerta');

    const hookFail3 = await stripePaymentService.handleWebhook({
      id: `evt_fail3_${uniqueSuffix}`,
      type: 'invoice.payment_failed',
      data: {
        object: {
          id: `in_fail3_${uniqueSuffix}`,
          subscription: 'sub_seed_auto_elite',
          attempt_count: 3,
        },
      },
    });
    assert(hookFail3.action === 'SUSPEND_WORKSPACE', 'Terceira falha suspende workspace');
    const suspendedWs = await prisma.workspace.findUnique({ where: { id: owner1!.memberships[0].workspaceId } });
    assert(suspendedWs?.status === 'SUSPENDED', 'Workspace SUSPENDED');

    section('5. customer.subscription.deleted — cancela');

    const hookCancel = await stripePaymentService.handleWebhook({
      id: `evt_cancel_${uniqueSuffix}`,
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_seed_auto_elite',
          metadata: { customerEmail: 'carlos.silva@autoelitemotors.com.br' },
        },
      },
    });
    assert(hookCancel.action === 'CANCEL_SUBSCRIPTION', 'Cancela subscription');
    const canceledSub = await prisma.subscription.findUnique({ where: { stripeSubscriptionId: 'sub_seed_auto_elite' } });
    assert(canceledSub?.status === 'CANCELED', 'Status CANCELED');

    section('6. GET /checkout/stripe/session/:sessionId/status — descontinuado (410)');

    const resStatusDeprecated = await app.inject({
      method: 'GET',
      url: `/api/v1/checkout/stripe/session/${sessionId}/status`,
    });
    assert(resStatusDeprecated.statusCode === 410, 'Session status retorna 410 Gone');

    const resStatusMissing = await app.inject({
      method: 'GET',
      url: '/api/v1/checkout/stripe/session/cs_missing/status',
    });
    assert(resStatusMissing.statusCode === 410, 'Session inexistente também retorna 410');

    section('7. Register exige workspaceName');

    const registerRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        name: 'Sem Workspace',
        email: `no.ws.${uniqueSuffix}@example.com`,
        password: 'password123',
      },
    });
    assert(registerRes.statusCode === 422, 'Register sem workspaceName retorna 422');

    section('8. Billing GET sem subscription retorna NONE');

    const tempWorkspace = await prisma.workspace.create({
      data: { name: 'Sem Plano', slug: `sem-plano-${uniqueSuffix}`, status: 'ACTIVE' },
    });

    const subCount = await prisma.subscription.count({ where: { workspaceId: tempWorkspace.id } });
    assert(subCount === 0, 'Workspace temporário sem subscription');

    await prisma.workspace.delete({ where: { id: tempWorkspace.id } });

    const elapsed = Date.now() - startTime;
    console.log(`\n${'═'.repeat(60)}`);
    console.log('📊 RESULTADO — Stripe Webhook Persistence');
    console.log('═'.repeat(60));
    console.log(`  Total de testes: ${totalTests}`);
    console.log(`  ✅ Passou:        ${passedTests}`);
    console.log(`  ❌ Falhou:        ${failures.length}`);
    console.log(`  ⏱️  Tempo total:   ${elapsed}ms`);

    if (failures.length > 0) {
      console.log('\n🔴 Falhas encontradas:');
      failures.forEach((f) => console.log(`  - ${f}`));
      process.exit(1);
    } else {
      console.log('\n🎉 Todos os testes de persistência de webhooks Stripe passaram!');
      process.exit(0);
    }
  } finally {
    await app.close();
  }
}

runStripeWebhookPersistenceTests().catch((err) => {
  console.error('\n💥 Erro crítico no teste de webhook persistence:', err);
  process.exit(1);
});
