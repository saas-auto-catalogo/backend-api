/**
 * Smoke live cross-repo: register-first → checkout autenticado → webhook
 * Épico .github#16 / issue .github#17
 * Requer backend rodando em PORT (default 3333) com .env carregado.
 */
import 'dotenv/config';
import { stripePaymentService } from '../services/payments/stripePaymentService.js';

const API = `http://127.0.0.1:${process.env.PORT ?? '3333'}`;
const APP = process.env.SMOKE_APP_URL ?? 'http://127.0.0.1:3000';

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

async function runLiveSmoke() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   🌐 Smoke Live — register-first → checkout → webhook        ║');
  console.log(`║   API: ${API.padEnd(52)}║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');

  const suffix = Date.now();
  const email = `smoke.live.${suffix}@example.com`;
  const password = 'SenhaSegura123!';

  const health = await fetch(`${API}/health`);
  assert(health.ok, 'Backend /health responde');

  const docsRes = await fetch(`${API}/api/v1/legal/documents`);
  const docsBody = (await docsRes.json()) as {
    documents: Array<{ slug: string; version: string; contentHash: string }>;
  };
  const acceptedAt = new Date(Date.now() - 60_000).toISOString();
  const legalAcceptancesFor = (slugs: string[]) =>
    (docsBody.documents || [])
      .filter((doc) => slugs.includes(doc.slug))
      .map((doc) => ({
        slug: doc.slug,
        version: doc.version,
        contentHash: doc.contentHash,
        acceptedAt,
      }));

  const registerRes = await fetch(`${API}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Live Smoke Owner',
      email,
      password,
      workspaceName: 'Live Smoke Revenda',
      legalAcceptances: legalAcceptancesFor(['termos-de-uso', 'politica-de-privacidade']),
    }),
  });
  assert(registerRes.status === 201, 'Register 201', `got ${registerRes.status}`);
  const register = (await registerRes.json()) as {
    accessToken: string;
    user: { workspaceId: string };
  };
  const { accessToken } = register;
  const { workspaceId } = register.user;

  const checkoutRes = await fetch(`${API}/api/v1/workspaces/${workspaceId}/checkout/stripe/session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      plan: 'PRO',
      billingInterval: 'MONTHLY',
      successUrl: `${APP}/dashboard?checkout=success`,
      cancelUrl: 'http://127.0.0.1:5175/checkout/cancel',
      legalAcceptances: legalAcceptancesFor(['contrato-saas']),
    }),
  });
  assert(checkoutRes.status === 201, 'Checkout autenticado 201', `got ${checkoutRes.status}`);
  const checkout = (await checkoutRes.json()) as { sessionId: string; url: string };
  const { sessionId } = checkout;
  assert(!!sessionId, 'sessionId da API real');

  const webhook = await stripePaymentService.handleWebhook({
    id: `evt_live_${suffix}`,
    type: 'checkout.session.completed',
    data: {
      object: {
        id: sessionId,
        customer: `cus_live_${suffix}`,
        subscription: `sub_live_${suffix}`,
        customer_email: email,
        metadata: {
          workspaceId,
          plan: 'PRO',
          billingInterval: 'MONTHLY',
          customerEmail: email,
        },
      },
    },
  });
  assert(webhook.action === 'PROVISION_TENANT', 'Webhook ativa subscription via DB real');
  assert(webhook.workspaceId === workspaceId, 'workspaceId correto no webhook');

  const statusRes = await fetch(`${API}/api/v1/checkout/stripe/session/${sessionId}/status`);
  assert(statusRes.status === 410, 'GET session status retorna 410 Gone');

  const billingRes = await fetch(`${API}/api/v1/workspaces/${workspaceId}/billing`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  assert(billingRes.status === 200, 'GET billing 200');
  const billing = (await billingRes.json()) as { status: string; planTier: string };
  assert(billing.status === 'ACTIVE', 'Billing ACTIVE');
  assert(billing.planTier === 'PRO', 'Plano PRO');

  console.log(`\n📊 Smoke live: ${passed}/${total} passou`);
  if (failures.length) {
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  }
  console.log('🎉 Smoke live cross-repo PASSOU');
  process.exit(0);
}

runLiveSmoke().catch((err) => {
  console.error('💥 Smoke live falhou:', err);
  process.exit(1);
});
