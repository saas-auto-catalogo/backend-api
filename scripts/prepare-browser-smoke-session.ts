/**
 * Prepara fluxo register-first para smoke browser local.
 * Uso: npx tsx scripts/prepare-browser-smoke-session.ts
 */
import 'dotenv/config';
import { stripePaymentService } from '../src/services/payments/stripePaymentService.js';

const API = `http://127.0.0.1:${process.env.PORT ?? '3333'}`;
const APP = process.env.SMOKE_APP_URL ?? 'http://127.0.0.1:3000';
const suffix = Date.now();
const email = `browser.smoke.${suffix}@example.com`;
const password = 'SenhaSegura123!';

async function main() {
  const registerRes = await fetch(`${API}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Browser Smoke Owner',
      email,
      password,
      workspaceName: 'Browser Smoke Revenda',
    }),
  });

  if (!registerRes.ok) {
    console.error('Register failed:', registerRes.status, await registerRes.text());
    process.exit(1);
  }

  const register = (await registerRes.json()) as {
    accessToken: string;
    user: { workspaceId: string };
  };

  const checkoutRes = await fetch(
    `${API}/api/v1/workspaces/${register.user.workspaceId}/checkout/stripe/session`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${register.accessToken}`,
      },
      body: JSON.stringify({
        plan: 'STARTER',
        billingInterval: 'MONTHLY',
        successUrl: `${APP}/dashboard?checkout=success`,
        cancelUrl: 'http://127.0.0.1:5175/checkout/cancel',
      }),
    },
  );

  if (!checkoutRes.ok) {
    console.error('Checkout failed:', checkoutRes.status, await checkoutRes.text());
    process.exit(1);
  }

  const { sessionId } = (await checkoutRes.json()) as { sessionId: string };

  await stripePaymentService.handleWebhook({
    id: `evt_browser_${suffix}`,
    type: 'checkout.session.completed',
    data: {
      object: {
        id: sessionId,
        customer: `cus_browser_${suffix}`,
        subscription: `sub_browser_${suffix}`,
        customer_email: email,
        metadata: {
          workspaceId: register.user.workspaceId,
          plan: 'STARTER',
          billingInterval: 'MONTHLY',
          customerEmail: email,
        },
      },
    },
  });

  console.log(
    JSON.stringify(
      {
        sessionId,
        email,
        password,
        subscribeUrl: `${APP}/subscribe?plan=STARTER`,
        dashboardUrl: `${APP}/dashboard`,
        onboardingUrl: `${APP}/onboarding`,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
