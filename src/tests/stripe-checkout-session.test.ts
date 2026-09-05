import { buildServer } from '../server.js';
import { prisma } from '../lib/prisma.js';
import { AuthUser } from '../modules/auth/auth.middleware.js';
import { stripePaymentService } from '../services/payments/stripePaymentService.js';
import {
  setStripeClientForTests,
  resetStripeClientForTests,
} from '../services/payments/stripe-client.js';
import { checkoutLegalAcceptances } from './legal-test-helpers.js';

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

const validSessionPayload = {
  plan: 'PRO' as const,
  billingInterval: 'MONTHLY' as const,
  customer: {
    dealershipName: 'Saga Prime Seminovos',
    document: '12.345.678/0001-90',
    email: 'financeiro@sagaprime.com.br',
    phone: '(11) 98765-4321',
  },
  successUrl: 'https://app.drivesync.me/checkout/success',
  cancelUrl: 'https://app.drivesync.me/checkout/cancel',
};

const workspaceCheckoutPayload = {
  plan: 'PRO' as const,
  billingInterval: 'MONTHLY' as const,
  successUrl: 'https://app.drivesync.me/subscribe/success',
  cancelUrl: 'https://app.drivesync.me/subscribe/cancel',
};

async function runStripeCheckoutSessionTests() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   💳 Stripe Checkout Session — Issue #49                     ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  const app = await buildServer();
  const startTime = Date.now();

  try {
    section('1. POST /api/v1/checkout/stripe/session — mock mode (201)');

    const resOk = await app.inject({
      method: 'POST',
      url: '/api/v1/checkout/stripe/session',
      payload: validSessionPayload,
    });

    assert(resOk.statusCode === 201, 'Status 201 for valid session payload', `got ${resOk.statusCode}`);
    assert(resOk.headers.deprecation === 'true', 'Public route returns Deprecation header');
    assert(
      String(resOk.headers.link || '').includes('/checkout/stripe/session'),
      'Public route returns Link successor-version header'
    );
    const sessionData = JSON.parse(resOk.payload);
    assert(typeof sessionData.sessionId === 'string' && sessionData.sessionId.length > 0, 'sessionId present');
    assert(typeof sessionData.url === 'string' && sessionData.url.includes('checkout.stripe.com'), 'url points to Stripe Checkout');

    section('2. POST /api/v1/checkout/stripe/session — invalid payload (422)');

    const resInvalid = await app.inject({
      method: 'POST',
      url: '/api/v1/checkout/stripe/session',
      payload: {
        plan: 'PRO',
        billingInterval: 'MONTHLY',
        customer: {
          dealershipName: 'X',
          document: '123456',
          email: 'not-an-email',
          phone: '1234567',
        },
      },
    });

    assert(resInvalid.statusCode === 422, 'Status 422 for invalid payload', `got ${resInvalid.statusCode}`);
    const invalidBody = JSON.parse(resInvalid.payload);
    assert(
      invalidBody.type?.includes('validation-error'),
      'Problem type indicates validation error'
    );

    section('3. createCheckoutSession — SDK mock with real-mode env');

    const savedNodeEnv = process.env.NODE_ENV;
    const savedStripeMock = process.env.STRIPE_MOCK;
    const savedSecretKey = process.env.STRIPE_SECRET_KEY;
    const savedProMonthlyPrice = process.env.STRIPE_PRO_MONTHLY_PRICE_ID;

    let sdkCreateCalled = false;
    let sdkCreateParams: Record<string, unknown> | undefined;

    const mockStripe = {
      checkout: {
        sessions: {
          create: async (params: Record<string, unknown>) => {
            sdkCreateCalled = true;
            sdkCreateParams = params;
            return { id: 'cs_test_sdk_mock_123', url: 'https://checkout.stripe.com/c/pay/cs_test_sdk_mock_123' };
          },
        },
      },
    };

    try {
      process.env.NODE_ENV = 'development';
      delete process.env.STRIPE_MOCK;
      process.env.STRIPE_SECRET_KEY = 'sk_test_fake_for_unit_test';
      process.env.STRIPE_PRO_MONTHLY_PRICE_ID = 'price_test_pro_monthly';
      setStripeClientForTests(mockStripe as any);

      const result = await stripePaymentService.createCheckoutSession(validSessionPayload);

      assert(sdkCreateCalled, 'Stripe SDK checkout.sessions.create was called');
      assert(sdkCreateParams?.mode === 'subscription', 'SDK called with mode subscription');
      assert(
        (sdkCreateParams?.line_items as Array<{ price: string }>)?.[0]?.price === 'price_test_pro_monthly',
        'SDK called with correct price ID'
      );
      const metadata = sdkCreateParams?.metadata as Record<string, string>;
      assert(metadata?.plan === 'PRO', 'metadata.plan is PRO');
      assert(metadata?.billingInterval === 'MONTHLY', 'metadata.billingInterval is MONTHLY');
      assert(metadata?.dealershipName === validSessionPayload.customer.dealershipName, 'metadata.dealershipName set');
      assert(metadata?.customerEmail === validSessionPayload.customer.email, 'metadata.customerEmail set');
      assert(metadata?.customerDocument === validSessionPayload.customer.document, 'metadata.customerDocument set');
      assert(result.sessionId === 'cs_test_sdk_mock_123', 'Returns SDK session id');
      assert(result.url.includes('checkout.stripe.com'), 'Returns SDK session url');
      assert((sdkCreateParams as any)?.branding_settings?.display_name === 'DriveSync', 'branding_settings.display_name is DriveSync');
      assert((sdkCreateParams as any)?.branding_settings?.button_color === '#0037B0', 'branding_settings.button_color is #0037B0');
      assert((sdkCreateParams as any)?.branding_settings?.font_family === 'inter', 'branding_settings.font_family is inter');
    } finally {
      resetStripeClientForTests();
      process.env.NODE_ENV = savedNodeEnv;
      if (savedStripeMock !== undefined) process.env.STRIPE_MOCK = savedStripeMock;
      else delete process.env.STRIPE_MOCK;
      if (savedSecretKey !== undefined) process.env.STRIPE_SECRET_KEY = savedSecretKey;
      else delete process.env.STRIPE_SECRET_KEY;
      if (savedProMonthlyPrice !== undefined) process.env.STRIPE_PRO_MONTHLY_PRICE_ID = savedProMonthlyPrice;
      else delete process.env.STRIPE_PRO_MONTHLY_PRICE_ID;
    }

    section('4. POST /api/v1/checkout/stripe/session — missing price ID (503)');

    const savedNodeEnv2 = process.env.NODE_ENV;
    const savedStripeMock2 = process.env.STRIPE_MOCK;
    const savedSecretKey2 = process.env.STRIPE_SECRET_KEY;
    const savedProMonthlyPrice2 = process.env.STRIPE_PRO_MONTHLY_PRICE_ID;

    try {
      process.env.NODE_ENV = 'development';
      delete process.env.STRIPE_MOCK;
      process.env.STRIPE_SECRET_KEY = 'sk_test_fake_for_unit_test';
      delete process.env.STRIPE_PRO_MONTHLY_PRICE_ID;
      resetStripeClientForTests();

      const resMissingPrice = await app.inject({
        method: 'POST',
        url: '/api/v1/checkout/stripe/session',
        payload: validSessionPayload,
      });

      assert(resMissingPrice.statusCode === 503, 'Status 503 when price ID missing', `got ${resMissingPrice.statusCode}`);
      const missingBody = JSON.parse(resMissingPrice.payload);
      assert(
        missingBody.detail?.includes('STRIPE_PRO_MONTHLY_PRICE_ID'),
        'Error detail mentions missing env var'
      );
    } finally {
      resetStripeClientForTests();
      process.env.NODE_ENV = savedNodeEnv2;
      if (savedStripeMock2 !== undefined) process.env.STRIPE_MOCK = savedStripeMock2;
      else delete process.env.STRIPE_MOCK;
      if (savedSecretKey2 !== undefined) process.env.STRIPE_SECRET_KEY = savedSecretKey2;
      else delete process.env.STRIPE_SECRET_KEY;
      if (savedProMonthlyPrice2 !== undefined) process.env.STRIPE_PRO_MONTHLY_PRICE_ID = savedProMonthlyPrice2;
      else delete process.env.STRIPE_PRO_MONTHLY_PRICE_ID;
    }

    section('5. POST /api/v1/workspaces/:workspaceId/checkout/stripe/session — authenticated');

    const owner1Db = await prisma.user.findUnique({
      where: { email: 'carlos.silva@autoelitemotors.com.br' },
      include: { memberships: { where: { role: 'OWNER' }, take: 1 } },
    });
    const manager1Db = await prisma.user.findUnique({
      where: { email: 'marcos.trafego@autoelitemotors.com.br' },
      include: { memberships: { where: { role: 'MANAGER' }, take: 1 } },
    });
    const owner2Db = await prisma.user.findUnique({
      where: { email: 'roberto.junior@jrcaseminovos.com.br' },
      include: { memberships: { where: { role: 'OWNER' }, take: 1 } },
    });

    assert(!!owner1Db?.memberships[0], 'Owner seed workspace 1 disponível');
    assert(!!manager1Db?.memberships[0], 'Manager seed workspace 1 disponível');
    assert(!!owner2Db?.memberships[0], 'Owner seed workspace 2 disponível');

    const workspaceId = owner1Db!.memberships[0].workspaceId;
    const authOwnerA: AuthUser = {
      id: owner1Db!.id,
      email: owner1Db!.email,
      name: owner1Db!.name,
      isSuperAdmin: false,
      workspaceId,
      role: 'OWNER',
    };
    const authManagerA: AuthUser = {
      id: manager1Db!.id,
      email: manager1Db!.email,
      name: manager1Db!.name,
      isSuperAdmin: false,
      workspaceId,
      role: 'MANAGER',
    };
    const authOwnerB: AuthUser = {
      id: owner2Db!.id,
      email: owner2Db!.email,
      name: owner2Db!.name,
      isSuperAdmin: false,
      workspaceId: owner2Db!.memberships[0].workspaceId,
      role: 'OWNER',
    };

    const tokenOwnerA = app.jwt.sign(authOwnerA);
    const tokenManagerA = app.jwt.sign(authManagerA);
    const tokenOwnerB = app.jwt.sign(authOwnerB);

    const existingSub = await prisma.subscription.findUnique({ where: { workspaceId } });
    const savedSubStatus = existingSub?.status ?? 'ACTIVE';
    if (existingSub) {
      await prisma.subscription.update({
        where: { workspaceId },
        data: { status: 'CANCELED' },
      });
    }

    try {
      const ownerCheckoutPayload = {
        ...workspaceCheckoutPayload,
        legalAcceptances: await checkoutLegalAcceptances(),
      };

      const resNoAuth = await app.inject({
        method: 'POST',
        url: `/api/v1/workspaces/${workspaceId}/checkout/stripe/session`,
        payload: workspaceCheckoutPayload,
      });
      assert(resNoAuth.statusCode === 401, 'Sem JWT retorna 401', `got ${resNoAuth.statusCode}`);

      const resMissingContract = await app.inject({
        method: 'POST',
        url: `/api/v1/workspaces/${workspaceId}/checkout/stripe/session`,
        headers: { authorization: `Bearer ${tokenOwnerA}` },
        payload: workspaceCheckoutPayload,
      });
      assert(resMissingContract.statusCode === 422, 'OWNER sem contrato-saas retorna 422', `got ${resMissingContract.statusCode}`);

      const resOwner = await app.inject({
        method: 'POST',
        url: `/api/v1/workspaces/${workspaceId}/checkout/stripe/session`,
        headers: { authorization: `Bearer ${tokenOwnerA}` },
        payload: ownerCheckoutPayload,
      });
      assert(resOwner.statusCode === 201, 'OWNER no próprio workspace retorna 201', `got ${resOwner.statusCode}`);

      const storedContract = await prisma.legalAcceptance.findFirst({
        where: { userId: authOwnerA.id, slug: 'contrato-saas' },
      });
      assert(!!storedContract, 'aceite contrato-saas persistido no checkout');

      const resManager = await app.inject({
        method: 'POST',
        url: `/api/v1/workspaces/${workspaceId}/checkout/stripe/session`,
        headers: { authorization: `Bearer ${tokenManagerA}` },
        payload: workspaceCheckoutPayload,
      });
      assert(resManager.statusCode === 403, 'MANAGER retorna 403', `got ${resManager.statusCode}`);

      const resCrossTenant = await app.inject({
        method: 'POST',
        url: `/api/v1/workspaces/${workspaceId}/checkout/stripe/session`,
        headers: { authorization: `Bearer ${tokenOwnerB}` },
        payload: workspaceCheckoutPayload,
      });
      assert(resCrossTenant.statusCode === 403, 'OWNER de outro workspace retorna 403', `got ${resCrossTenant.statusCode}`);

      if (existingSub) {
        await prisma.subscription.update({
          where: { workspaceId },
          data: { status: 'ACTIVE' },
        });

        const resActive = await app.inject({
          method: 'POST',
          url: `/api/v1/workspaces/${workspaceId}/checkout/stripe/session`,
          headers: { authorization: `Bearer ${tokenOwnerA}` },
          payload: ownerCheckoutPayload,
        });
        assert(resActive.statusCode === 409, 'Workspace ACTIVE retorna 409', `got ${resActive.statusCode}`);
      }
    } finally {
      if (existingSub) {
        await prisma.subscription.update({
          where: { workspaceId },
          data: { status: savedSubStatus },
        });
      }
    }

    section('6. createCheckoutSessionForWorkspace — SDK mock with workspace metadata');

    const savedNodeEnv3 = process.env.NODE_ENV;
    const savedStripeMock3 = process.env.STRIPE_MOCK;
    const savedSecretKey3 = process.env.STRIPE_SECRET_KEY;
    const savedProMonthlyPrice3 = process.env.STRIPE_PRO_MONTHLY_PRICE_ID;

    let workspaceSdkCreateCalled = false;
    let workspaceSdkCreateParams: Record<string, unknown> | undefined;

    const mockStripeWorkspace = {
      checkout: {
        sessions: {
          create: async (params: Record<string, unknown>) => {
            workspaceSdkCreateCalled = true;
            workspaceSdkCreateParams = params;
            return { id: 'cs_test_workspace_mock_123', url: 'https://checkout.stripe.com/c/pay/cs_test_workspace_mock_123' };
          },
        },
      },
    };

    try {
      process.env.NODE_ENV = 'development';
      delete process.env.STRIPE_MOCK;
      process.env.STRIPE_SECRET_KEY = 'sk_test_fake_for_unit_test';
      process.env.STRIPE_PRO_MONTHLY_PRICE_ID = 'price_test_pro_monthly';
      setStripeClientForTests(mockStripeWorkspace as any);

      const result = await stripePaymentService.createCheckoutSessionForWorkspace({
        workspaceId: 'ws_test_workspace_123',
        customerEmail: 'owner@example.com',
        data: {
          ...workspaceCheckoutPayload,
          legalAcceptances: [],
        },
      });

      assert(workspaceSdkCreateCalled, 'Workspace SDK checkout.sessions.create was called');
      assert(workspaceSdkCreateParams?.customer_email === 'owner@example.com', 'customer_email is owner email');
      const metadata = workspaceSdkCreateParams?.metadata as Record<string, string>;
      assert(metadata?.workspaceId === 'ws_test_workspace_123', 'metadata.workspaceId set');
      assert(metadata?.plan === 'PRO', 'metadata.plan is PRO');
      assert(metadata?.customerEmail === 'owner@example.com', 'metadata.customerEmail set');
      assert(result.sessionId === 'cs_test_workspace_mock_123', 'Returns workspace SDK session id');
      assert((workspaceSdkCreateParams as any)?.branding_settings?.display_name === 'DriveSync', 'workspace branding_settings.display_name is DriveSync');
      assert((workspaceSdkCreateParams as any)?.branding_settings?.button_color === '#0037B0', 'workspace branding_settings.button_color is #0037B0');
    } finally {
      resetStripeClientForTests();
      process.env.NODE_ENV = savedNodeEnv3;
      if (savedStripeMock3 !== undefined) process.env.STRIPE_MOCK = savedStripeMock3;
      else delete process.env.STRIPE_MOCK;
      if (savedSecretKey3 !== undefined) process.env.STRIPE_SECRET_KEY = savedSecretKey3;
      else delete process.env.STRIPE_SECRET_KEY;
      if (savedProMonthlyPrice3 !== undefined) process.env.STRIPE_PRO_MONTHLY_PRICE_ID = savedProMonthlyPrice3;
      else delete process.env.STRIPE_PRO_MONTHLY_PRICE_ID;
    }

    const elapsed = Date.now() - startTime;

    console.log(`\n${'═'.repeat(60)}`);
    console.log('📊 RESULTADO — Stripe Checkout Session');
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
      console.log('\n🎉 Todos os testes de Stripe Checkout Session passaram!');
      process.exit(0);
    }
  } finally {
    await app.close();
  }
}

runStripeCheckoutSessionTests().catch((err) => {
  console.error('\n💥 Erro crítico no teste de checkout session:', err);
  process.exit(1);
});
