import { buildServer } from '../server.js';
import {
  PLAN_LIMITS,
  hasPlanFeature,
  isResourceLimitReached,
  calculateTrialEndDate,
} from '../modules/billing/plan-limits.js';
import { stripePaymentService } from '../services/payments/stripePaymentService.js';
import { AuthUser } from '../modules/auth/auth.middleware.js';

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

async function runStripeLifecycleTestSuite() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   💳 QA — Ciclo Completo de Subscription Stripe e Gates      ║');
  console.log('║   SaaS Auto Catálogo Backend API                            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  const app = await buildServer();
  const startTime = Date.now();

  try {
    // ─────────────────────────────────────────────────────────────────────────
    // 1. MATRIZ DE LIMITES POR PLANO
    // ─────────────────────────────────────────────────────────────────────────
    section('1. Matriz de Limites e Configurações por Plano');

    // Starter
    assert(PLAN_LIMITS.STARTER.maxVehicles === 100, 'Starter: limite de 100 veículos');
    assert(PLAN_LIMITS.STARTER.maxFeeds === 1, 'Starter: limite de 1 feed');
    assert(PLAN_LIMITS.STARTER.maxMembers === 2, 'Starter: limite de 2 membros');
    assert(!PLAN_LIMITS.STARTER.hasAiBlogWorker, 'Starter: sem acesso ao Worker IA');

    // Pro
    assert(PLAN_LIMITS.PRO.maxVehicles === 500, 'Pro: limite de 500 veículos');
    assert(PLAN_LIMITS.PRO.maxFeeds === 5, 'Pro: limite de 5 feeds');
    assert(PLAN_LIMITS.PRO.maxMembers === 10, 'Pro: limite de 10 membros');
    assert(PLAN_LIMITS.PRO.hasAiBlogWorker, 'Pro: com acesso ao Worker IA');

    // Enterprise
    assert(PLAN_LIMITS.ENTERPRISE.maxVehicles === Infinity, 'Enterprise: veículos ilimitados');
    assert(PLAN_LIMITS.ENTERPRISE.maxFeeds === Infinity, 'Enterprise: feeds ilimitados');
    assert(PLAN_LIMITS.ENTERPRISE.hasPrioritySupport, 'Enterprise: suporte prioritário');

    // ─────────────────────────────────────────────────────────────────────────
    // 2. FEATURE GATES E VALIDADOR DE RECURSOS
    // ─────────────────────────────────────────────────────────────────────────
    section('2. Feature Gates e Checagem de Limites de Recursos');

    // Checagem de Features
    assert(!hasPlanFeature('STARTER', 'aiBlogWorker'), 'Feature Gate: Starter sem Worker IA');
    assert(hasPlanFeature('PRO', 'aiBlogWorker'), 'Feature Gate: Pro com Worker IA');
    assert(hasPlanFeature('ENTERPRISE', 'prioritySupport'), 'Feature Gate: Enterprise com Suporte Prioritário');
    assert(!hasPlanFeature('PRO', 'prioritySupport'), 'Feature Gate: Pro sem Suporte Prioritário');

    // Limites de Veículos no Starter
    const limitStarterOk = isResourceLimitReached('STARTER', 'vehicles', 99);
    assert(!limitStarterOk.reached, 'Starter: 99 veículos não atinge o limite');

    const limitStarterFull = isResourceLimitReached('STARTER', 'vehicles', 100);
    assert(limitStarterFull.reached, 'Starter: 100 veículos atinge o limite');

    // Limites de Veículos no Pro
    const limitProOk = isResourceLimitReached('PRO', 'vehicles', 499);
    assert(!limitProOk.reached, 'Pro: 499 veículos não atinge o limite');

    const limitProFull = isResourceLimitReached('PRO', 'vehicles', 500);
    assert(limitProFull.reached, 'Pro: 500 veículos atinge o limite');

    // Limites no Enterprise (Ilimitado)
    const limitEnterprise = isResourceLimitReached('ENTERPRISE', 'vehicles', 15000);
    assert(!limitEnterprise.reached, 'Enterprise: 15.000 veículos nunca atinge o limite');

    // ─────────────────────────────────────────────────────────────────────────
    // 3. TRIAL DE 14 DIAS
    // ─────────────────────────────────────────────────────────────────────────
    section('3. Cálculo de Período de Trial (14 dias)');

    const now = new Date();
    const trialEnd = calculateTrialEndDate(now);
    const diffDays = Math.round((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    assert(diffDays === 14, `Trial de 14 dias calculado com precisão (${diffDays} dias)`);

    // ─────────────────────────────────────────────────────────────────────────
    // 4. WEBHOOKS DO STRIPE (CICLO DE VIDA DA ASSINATURA)
    // ─────────────────────────────────────────────────────────────────────────
    section('4. Webhooks do Stripe — Ciclo de Vida Completo');

    // 4.1 checkout.session.completed -> Ativação e Provisionamento
    const hookCheckout = await stripePaymentService.handleWebhook({
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_123',
          customer_email: 'novo.cliente@autoelite.com.br',
          metadata: { plan: 'PRO' },
        },
      },
    });
    assert(hookCheckout.received, 'Webhook checkout.session.completed recebido');
    assert(hookCheckout.action === 'PROVISION_TENANT', 'Ação: PROVISION_TENANT');
    assert(hookCheckout.status === 'ACTIVE', 'Status: ACTIVE');

    // 4.2 invoice.payment_succeeded -> Renovação da Assinatura
    const hookRenew = await stripePaymentService.handleWebhook({
      type: 'invoice.payment_succeeded',
      data: {
        object: {
          id: 'in_test_456',
          customer_email: 'novo.cliente@autoelite.com.br',
        },
      },
    });
    assert(hookRenew.received, 'Webhook invoice.payment_succeeded recebido');
    assert(hookRenew.action === 'RENEW_SUBSCRIPTION', 'Ação: RENEW_SUBSCRIPTION');
    assert(hookRenew.status === 'ACTIVE', 'Status: ACTIVE');

    // 4.3 invoice.payment_failed (Tentativa 1 - Alerta)
    const hookFailAlert = await stripePaymentService.handleWebhook({
      type: 'invoice.payment_failed',
      data: {
        object: {
          id: 'in_test_fail_1',
          attempt_count: 1,
          customer_email: 'novo.cliente@autoelite.com.br',
        },
      },
    });
    assert(hookFailAlert.received, 'Webhook invoice.payment_failed recebido');
    assert(hookFailAlert.action === 'PAYMENT_FAILED_ALERT', 'Ação tentativa 1: PAYMENT_FAILED_ALERT');
    assert(hookFailAlert.status === 'PAST_DUE', 'Status tentativa 1: PAST_DUE');

    // 4.4 invoice.payment_failed (Tentativa 3 - Suspensão do Workspace)
    const hookFailSuspend = await stripePaymentService.handleWebhook({
      type: 'invoice.payment_failed',
      data: {
        object: {
          id: 'in_test_fail_3',
          attempt_count: 3,
          customer_email: 'novo.cliente@autoelite.com.br',
        },
      },
    });
    assert(hookFailSuspend.action === 'SUSPEND_WORKSPACE', 'Ação tentativa 3: SUSPEND_WORKSPACE');
    assert(hookFailSuspend.status === 'SUSPENDED', 'Status tentativa 3: SUSPENDED');

    // 4.5 customer.subscription.deleted -> Cancelamento
    const hookCancel = await stripePaymentService.handleWebhook({
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_test_canceled_789',
          customer_email: 'novo.cliente@autoelite.com.br',
        },
      },
    });
    assert(hookCancel.received, 'Webhook customer.subscription.deleted recebido');
    assert(hookCancel.action === 'CANCEL_SUBSCRIPTION', 'Ação: CANCEL_SUBSCRIPTION');
    assert(hookCancel.status === 'CANCELED', 'Status: CANCELED');

    // 4.6 customer.subscription.updated -> Upgrade/Downgrade de Plano
    const hookUpdate = await stripePaymentService.handleWebhook({
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_test_updated_101',
          metadata: { plan: 'ENTERPRISE' },
        },
      },
    });
    assert(hookUpdate.received, 'Webhook customer.subscription.updated recebido');
    assert(hookUpdate.action === 'UPDATE_PLAN_LIMITS', 'Ação: UPDATE_PLAN_LIMITS');
    assert(hookUpdate.status === 'UPDATED', 'Status: UPDATED');

    // ─────────────────────────────────────────────────────────────────────────
    // 5. STRIPE CUSTOMER PORTAL & ENDPOINTS HTTP DE BILLING
    // ─────────────────────────────────────────────────────────────────────────
    section('5. Endpoints HTTP de Billing e Stripe Customer Portal');

    const authOwnerA: AuthUser = {
      id: 'usr-owner-a',
      email: 'owner@autoelite.com.br',
      name: 'Owner A',
      isSuperAdmin: false,
      workspaceId: 'workspace-auto-elite',
      role: 'OWNER',
    };

    const authOwnerB: AuthUser = {
      id: 'usr-owner-b',
      email: 'owner@jrcasa.com.br',
      name: 'Owner B',
      isSuperAdmin: false,
      workspaceId: 'workspace-jrcasa',
      role: 'OWNER',
    };

    const tokenOwnerA = app.jwt.sign(authOwnerA);
    const tokenOwnerB = app.jwt.sign(authOwnerB);

    // 5.1 POST /api/v1/billing/portal sem autenticação -> 401
    const resPortalNoAuth = await app.inject({
      method: 'POST',
      url: '/api/v1/billing/portal',
    });
    assert(resPortalNoAuth.statusCode === 401, 'POST /api/v1/billing/portal sem token retorna 401');

    // 5.2 POST /api/v1/billing/portal autenticado -> 200
    const resPortalAuth = await app.inject({
      method: 'POST',
      url: '/api/v1/billing/portal',
      headers: { authorization: `Bearer ${tokenOwnerA}` },
      payload: { returnUrl: 'https://app.autocatalogo.com.br/settings/billing' },
    });
    assert(resPortalAuth.statusCode === 200, 'POST /api/v1/billing/portal autenticado retorna 200 OK');
    const portalData = JSON.parse(resPortalAuth.payload);
    assert(portalData.url.includes('billing.stripe.com'), 'URL do Stripe Customer Portal gerada');

    // 5.3 GET /api/v1/workspaces/:workspaceId/billing no próprio workspace -> 200
    const resBillingOwn = await app.inject({
      method: 'GET',
      url: '/api/v1/workspaces/workspace-auto-elite/billing',
      headers: { authorization: `Bearer ${tokenOwnerA}` },
    });
    assert(resBillingOwn.statusCode === 200, 'Consulta de billing no próprio workspace retorna 200 OK');
    const billingData = JSON.parse(resBillingOwn.payload);
    assert(billingData.workspaceId === 'workspace-auto-elite', 'WorkspaceId correto retornado');
    assert(billingData.limits.maxVehicles > 0, 'Limites do plano incluídos na resposta');

    // 5.4 GET /api/v1/workspaces/:workspaceId/billing em outro workspace -> 403 (Isolamento)
    const resBillingOther = await app.inject({
      method: 'GET',
      url: '/api/v1/workspaces/workspace-auto-elite/billing',
      headers: { authorization: `Bearer ${tokenOwnerB}` },
    });
    assert(resBillingOther.statusCode === 403, 'Tentativa de consultar billing de outro workspace bloqueada (403)');

    const elapsed = Date.now() - startTime;

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`📊 RESULTADO FINAL DOS TESTES DE SUBSCRIPTION STRIPE`);
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
      console.log('\n🎉 Todos os testes do ciclo de subscription Stripe e feature gates passaram com 100% de sucesso!');
    }
  } finally {
    await app.close();
  }
}

runStripeLifecycleTestSuite().catch((err) => {
  console.error('\n💥 Erro crítico no teste de subscription:', err);
  process.exit(1);
});
