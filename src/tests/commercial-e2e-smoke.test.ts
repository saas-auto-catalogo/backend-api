/**
 * Smoke test E2E comercial (Épico .github#13)
 * Simula: register → checkout autenticado → webhook → billing ACTIVE
 *         register sem pagamento → billing NONE (gate)
 */
import { buildServer } from '../server.js';
import { stripePaymentService } from '../services/payments/stripePaymentService.js';
import { resetSystemUserCacheForTests } from '../lib/system-user.js';
import { teardownIntegrationTest } from './test-teardown.js';

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

async function runCommercialE2ESmoke() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   🛒 Smoke Test E2E Comercial — Épico #13                    ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  resetSystemUserCacheForTests();
  const app = await buildServer();
  const suffix = Date.now();
  const email = `smoke.e2e.${suffix}@example.com`;
  const password = 'SenhaSegura123!';
  let sessionId = '';
  let accessToken = '';
  let workspaceId = '';

  try {
    console.log('\n── 1. App → register com workspaceName ──');
    const registerRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        name: 'Smoke Owner',
        email,
        password,
        workspaceName: 'Smoke Test Revenda',
      },
    });
    assert(registerRes.statusCode === 201, 'Register 201', `got ${registerRes.statusCode}`);
    const register = JSON.parse(registerRes.payload);
    accessToken = register.accessToken;
    workspaceId = register.user?.workspaceId;
    assert(!!accessToken, 'accessToken retornado');
    assert(register.user?.role === 'OWNER', 'User é OWNER');

    console.log('\n── 2. App → checkout autenticado ──');
    const checkoutRes = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${workspaceId}/checkout/stripe/session`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        plan: 'STARTER',
        billingInterval: 'MONTHLY',
        successUrl: 'http://localhost:3000/dashboard?checkout=success',
        cancelUrl: 'http://localhost:5175/checkout/cancel',
      },
    });
    assert(checkoutRes.statusCode === 201, 'Checkout session criada (201)', `got ${checkoutRes.statusCode}`);
    const checkout = JSON.parse(checkoutRes.payload);
    sessionId = checkout.sessionId;
    assert(!!sessionId, 'sessionId retornado');
    assert(checkout.url?.includes('checkout.stripe.com'), 'URL Stripe Checkout retornada');

    console.log('\n── 3. Stripe webhook → ativa subscription no workspace ──');
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
    assert(webhook.workspaceId === workspaceId, 'workspaceId correto');

    console.log('\n── 4. Gate → billing ACTIVE (onboarding liberado) ──');
    const billingRes = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${workspaceId}/billing`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    assert(billingRes.statusCode === 200, 'GET billing 200');
    const billing = JSON.parse(billingRes.payload);
    assert(billing.status === 'ACTIVE', 'Subscription ACTIVE', `got ${billing.status}`);
    assert(billing.planTier === 'STARTER', 'Plano STARTER refletido');
    assert(billing.limits?.maxVehicles === 100, 'Limites reais do STARTER');

    console.log('\n── 5. Register sem pagamento → billing NONE (paywall) ──');
    const freeEmail = `smoke.free.${suffix}@example.com`;
    const freeRegister = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        name: 'Free User',
        email: freeEmail,
        password,
        workspaceName: 'Revenda Sem Plano',
      },
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
    assert(freeBillingBody.status === 'NONE', 'Billing status NONE (não mock PRO)', `got ${freeBillingBody.status}`);
    assert(freeBillingBody.planTier === null, 'planTier null sem subscription');

    console.log('\n── 6. Session status público → 410 Gone ──');
    const statusRes = await app.inject({
      method: 'GET',
      url: `/api/v1/checkout/stripe/session/${sessionId}/status`,
    });
    assert(statusRes.statusCode === 410, 'GET session status retorna 410');

    console.log('\n════════════════════════════════════════════════════════════');
    console.log(`📊 Smoke E2E: ${passed}/${total} passou`);
    if (failures.length) {
      failures.forEach((f) => console.log(`  - ${f}`));
      process.exit(1);
    }
    console.log('🎉 Smoke test E2E comercial PASSOU — critérios do épico #13 validados');
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
