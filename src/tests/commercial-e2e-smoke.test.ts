/**
 * Smoke test E2E comercial register-first (Épicos .github#16 / .github#17)
 *
 * Fluxo: register → checkout autenticado → webhook → billing ACTIVE → onboarding liberado
 * Guardrails: JWT obrigatório, isolamento de workspace, webhook sem workspaceId ignorado,
 * register pay-first descontinuado.
 */
import { buildServer } from '../server.js';
import { prisma } from '../lib/prisma.js';
import { stripePaymentService } from '../services/payments/stripePaymentService.js';
import { resetSystemUserCacheForTests } from '../lib/system-user.js';
import { teardownIntegrationTest } from './test-teardown.js';
import { loadIntegrationSeedContext } from './seed-test-context.js';
import { checkoutLegalAcceptances, withRegisterConsent } from './legal-test-helpers.js';

let total = 0;
let passed = 0;
const failures: string[] = [];

function assert(ok: boolean, name: string, detail?: string) {
  total++;
  if (ok) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failures.push(detail ? `${name}: ${detail}` : name);
    console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const checkoutPayload = {
  plan: 'STARTER' as const,
  billingInterval: 'MONTHLY' as const,
  successUrl: 'http://localhost:3000/dashboard?checkout=success',
  cancelUrl: 'http://localhost:5175/checkout/cancel',
};

async function runCommercialE2ESmoke() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   🛒 Smoke E2E Comercial — register-first (#16 / #17)        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  resetSystemUserCacheForTests();
  const app = await buildServer();
  const seed = await loadIntegrationSeedContext();
  const suffix = Date.now();
  const email = `smoke.e2e.${suffix}@example.com`;
  const password = 'SenhaSegura123!';
  let sessionId = '';
  let accessToken = '';
  let workspaceId = '';

  try {
    console.log('\n── Happy path: register → pay → billing ACTIVE ──');

    const registerRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: await withRegisterConsent({
        name: 'Smoke Owner',
        email,
        password,
        workspaceName: 'Smoke Test Revenda',
      }),
    });
    assert(registerRes.statusCode === 201, 'Register 201', `got ${registerRes.statusCode}`);
    const register = JSON.parse(registerRes.payload);
    accessToken = register.accessToken;
    workspaceId = register.user?.workspaceId;
    assert(!!accessToken, 'accessToken retornado');
    assert(register.user?.role === 'OWNER', 'User é OWNER');

    const billingBefore = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${workspaceId}/billing`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    assert(billingBefore.statusCode === 200, 'GET billing pós-register 200');
    assert(JSON.parse(billingBefore.payload).status === 'NONE', 'Billing NONE antes do pagamento');

    const checkoutRes = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${workspaceId}/checkout/stripe/session`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        ...checkoutPayload,
        legalAcceptances: await checkoutLegalAcceptances(),
      },
    });
    assert(checkoutRes.statusCode === 201, 'Checkout autenticado 201', `got ${checkoutRes.statusCode}`);
    const checkout = JSON.parse(checkoutRes.payload);
    sessionId = checkout.sessionId;
    assert(!!sessionId, 'sessionId retornado');
    assert(checkout.url?.includes('checkout.stripe.com'), 'URL Stripe Checkout retornada');

    const webhook = await stripePaymentService.handleWebhook({
      id: `evt_smoke_${suffix}`,
      type: 'checkout.session.completed',
      data: {
        object: {
          id: sessionId,
          customer: `cus_smoke_${suffix}`,
          subscription: `sub_smoke_${suffix}`,
          customer_email: email,
          metadata: {
            workspaceId,
            plan: 'STARTER',
            billingInterval: 'MONTHLY',
            customerEmail: email,
          },
        },
      },
    });
    assert(webhook.action === 'PROVISION_TENANT', 'Webhook ativa subscription');
    assert(webhook.workspaceId === workspaceId, 'workspaceId correto no webhook');

    const billingRes = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${workspaceId}/billing`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    assert(billingRes.statusCode === 200, 'GET billing pós-webhook 200');
    const billing = JSON.parse(billingRes.payload);
    assert(billing.status === 'ACTIVE', 'Subscription ACTIVE', `got ${billing.status}`);
    assert(billing.planTier === 'STARTER', 'Plano STARTER refletido');
    assert(billing.limits?.maxVehicles === 100, 'Limites reais do STARTER');

    console.log('\n── Guardrails ──');

    const noJwt = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${workspaceId}/checkout/stripe/session`,
      payload: checkoutPayload,
    });
    assert(noJwt.statusCode === 401, 'Checkout sem JWT → 401', `got ${noJwt.statusCode}`);

    const tokenOwnerB = app.jwt.sign(seed.ownerB);
    const crossTenant = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${workspaceId}/checkout/stripe/session`,
      headers: { authorization: `Bearer ${tokenOwnerB}` },
      payload: checkoutPayload,
    });
    assert(crossTenant.statusCode === 403, 'Checkout workspace alheio → 403', `got ${crossTenant.statusCode}`);

    const wsBefore = await prisma.workspace.count();
    const hookOrphan = await stripePaymentService.handleWebhook({
      id: `evt_orphan_${suffix}`,
      type: 'checkout.session.completed',
      data: {
        object: {
          id: `cs_orphan_${suffix}`,
          customer: `cus_orphan_${suffix}`,
          subscription: `sub_orphan_${suffix}`,
          customer_email: `orphan.${suffix}@example.com`,
          metadata: { plan: 'PRO', customerEmail: `orphan.${suffix}@example.com` },
        },
      },
    });
    const wsAfter = await prisma.workspace.count();
    assert(hookOrphan.action === 'IGNORED', 'Webhook sem workspaceId → IGNORED');
    assert(wsBefore === wsAfter, 'Webhook sem workspaceId não cria workspace órfão');

    const payFirstRegister = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        name: 'Pay First Legacy',
        email: `legacy.${suffix}@example.com`,
        password,
        checkoutSessionId: sessionId,
      },
    });
    assert(
      payFirstRegister.statusCode === 422,
      'Register pay-first (sem workspaceName) → 422',
      `got ${payFirstRegister.statusCode}`,
    );

    const statusRes = await app.inject({
      method: 'GET',
      url: `/api/v1/checkout/stripe/session/${sessionId}/status`,
    });
    assert(statusRes.statusCode === 410, 'GET session status público → 410 Gone');

    console.log('\n── Paywall: register sem pagamento ──');

    const freeEmail = `smoke.free.${suffix}@example.com`;
    const freeRegister = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: await withRegisterConsent({
        name: 'Free User',
        email: freeEmail,
        password,
        workspaceName: 'Revenda Sem Plano',
      }),
    });
    assert(freeRegister.statusCode === 201, 'Register sem pagamento 201');
    const freeToken = JSON.parse(freeRegister.payload).accessToken;
    const freeWs = JSON.parse(freeRegister.payload).user?.workspaceId;

    const freeBilling = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${freeWs}/billing`,
      headers: { authorization: `Bearer ${freeToken}` },
    });
    assert(freeBilling.statusCode === 200, 'GET billing sem subscription 200');
    const freeBillingBody = JSON.parse(freeBilling.payload);
    assert(freeBillingBody.status === 'NONE', 'Billing status NONE (paywall)', `got ${freeBillingBody.status}`);
    assert(freeBillingBody.planTier === null, 'planTier null sem subscription');

    console.log('\n════════════════════════════════════════════════════════════');
    console.log(`📊 Smoke E2E register-first: ${passed}/${total} passou`);
    if (failures.length) {
      failures.forEach((f) => console.log(`  - ${f}`));
      process.exit(1);
    }
    console.log('🎉 Smoke test E2E comercial register-first PASSOU');
    process.exit(0);
  } finally {
    await app.close();
    await teardownIntegrationTest();
  }
}

runCommercialE2ESmoke().catch((err) => {
  console.error('💥 Smoke test falhou:', err);
  process.exit(1);
});
