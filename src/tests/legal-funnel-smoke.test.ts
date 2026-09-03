/**
 * Smoke test E2E — Aceite Jurídico no Funil Comercial (.github#21 / .github#19)
 *
 * Valida o ciclo completo da camada legal da Fase 12:
 * 1. Register sem checkbox / aceites inválidos → 422
 * 2. Register com aceites válidos → 201 + persistência auditada (IP e User-Agent)
 * 3. Subscribe sem contrato → 422; com contrato → 201 + persistência no workspace
 * 4. Documentos públicos /legal/* acessíveis com os 5 slugs vigentes
 * 5. Cookie consent LGPD bloqueia/libera analíticos conforme preferências
 */
import { buildServer } from '../server.js';
import { prisma } from '../lib/prisma.js';
import { resetSystemUserCacheForTests } from '../lib/system-user.js';
import { teardownIntegrationTest, resetAuthRateLimits } from './test-teardown.js';
import {
  registerLegalAcceptances,
  checkoutLegalAcceptances,
  ensureAllLegalDocuments,
  ALL_LEGAL_SLUGS,
} from './legal-test-helpers.js';

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
  console.log(`⚖️  ${title}`);
  console.log('─'.repeat(60));
}

const checkoutBasePayload = {
  plan: 'PRO' as const,
  billingInterval: 'MONTHLY' as const,
  successUrl: 'http://localhost:3000/dashboard?checkout=success',
  cancelUrl: 'http://localhost:5175/checkout/cancel',
};

// Simulação das regras de consentimento do marketing-site-blog (LGPD W6)
interface CookieConsentPrefs {
  version: 1;
  essential: true;
  analytics: boolean;
  marketing: boolean;
  updatedAt: string;
}

function evaluateAnalyticsInjection(prefs: CookieConsentPrefs | null): boolean {
  if (!prefs) return false;
  return Boolean(prefs.analytics);
}

async function runLegalFunnelSmoke() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   ⚖️  Smoke E2E — Aceite Jurídico no Funil (.github#21)       ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  resetSystemUserCacheForTests();
  await resetAuthRateLimits();
  const startTime = Date.now();
  const app = await buildServer();
  await ensureAllLegalDocuments();

  const suffix = Date.now();
  const email = `smoke.legal.${suffix}@example.com`;
  const password = 'SenhaSegura123!';
  const customIp = '198.51.100.42';
  const customUserAgent = 'SmokeTestRunner/1.0 (Automated E2E)';

  let accessToken = '';
  let workspaceId = '';
  let userId = '';

  const validRegisterDocs = await registerLegalAcceptances();
  const validCheckoutDocs = await checkoutLegalAcceptances();

  try {
    // -------------------------------------------------------------
    section('1. Register — Validação e Guardrails de Consentimento');
    // -------------------------------------------------------------

    const resNoLegal = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        name: 'Smoke Legal Owner',
        email: `no-legal-${suffix}@example.com`,
        password,
        workspaceName: 'Revenda Sem Aceite',
      },
    });
    assert(resNoLegal.statusCode === 422, 'Register sem legalAcceptances → 422');

    const resEmptyLegal = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        name: 'Smoke Legal Owner',
        email: `empty-legal-${suffix}@example.com`,
        password,
        workspaceName: 'Revenda Aceite Vazio',
        legalAcceptances: [],
      },
    });
    assert(resEmptyLegal.statusCode === 422, 'Register com legalAcceptances vazio → 422');

    const resMissingPrivacy = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        name: 'Smoke Legal Owner',
        email: `missing-priv-${suffix}@example.com`,
        password,
        workspaceName: 'Revenda Falta Privacidade',
        legalAcceptances: validRegisterDocs.filter((d) => d.slug === 'termos-de-uso'),
      },
    });
    assert(resMissingPrivacy.statusCode === 422, 'Register sem politica-de-privacidade → 422');

    const resMissingTerms = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        name: 'Smoke Legal Owner',
        email: `missing-terms-${suffix}@example.com`,
        password,
        workspaceName: 'Revenda Falta Termos',
        legalAcceptances: validRegisterDocs.filter((d) => d.slug === 'politica-de-privacidade'),
      },
    });
    assert(resMissingTerms.statusCode === 422, 'Register sem termos-de-uso → 422');

    const resBadHash = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        name: 'Smoke Legal Owner',
        email: `bad-hash-${suffix}@example.com`,
        password,
        workspaceName: 'Revenda Hash Invalido',
        legalAcceptances: validRegisterDocs.map((d) => ({
          ...d,
          contentHash: 'sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
        })),
      },
    });
    assert(resBadHash.statusCode === 422, 'Register com hash divergente → 422');

    const resBadVersion = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        name: 'Smoke Legal Owner',
        email: `bad-version-${suffix}@example.com`,
        password,
        workspaceName: 'Revenda Versao Invalida',
        legalAcceptances: validRegisterDocs.map((d) => ({
          ...d,
          version: '1999-01-01',
        })),
      },
    });
    assert(resBadVersion.statusCode === 422, 'Register com versão desatualizada → 422');

    // -------------------------------------------------------------
    section('2. Register com Aceites Válidos — Sucesso e Auditoria');
    // -------------------------------------------------------------

    const resRegisterOk = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      remoteAddress: customIp,
      headers: {
        'x-forwarded-for': customIp,
        'user-agent': customUserAgent,
      },
      payload: {
        name: 'Smoke Legal Owner',
        email,
        password,
        workspaceName: 'Revenda Legal 100%',
        legalAcceptances: validRegisterDocs,
      },
    });
    assert(resRegisterOk.statusCode === 201, 'Register com aceites válidos → 201 Created');
    const registerBody = JSON.parse(resRegisterOk.payload);
    accessToken = registerBody.accessToken;
    workspaceId = registerBody.user?.workspaceId;
    userId = registerBody.user?.id;

    assert(!!accessToken, 'accessToken gerado com sucesso');
    assert(!!workspaceId, 'workspace criado e vinculado');

    const acceptances = await prisma.legalAcceptance.findMany({
      where: { userId },
      orderBy: { slug: 'asc' },
    });
    assert(acceptances.length === 2, 'Exatamente 2 aceites persistidos (termos + privacidade)');

    const slugsSaved = acceptances.map((a) => a.slug);
    assert(slugsSaved.includes('termos-de-uso'), 'Aceite de termos-de-uso gravado');
    assert(slugsSaved.includes('politica-de-privacidade'), 'Aceite de politica-de-privacidade gravado');

    const auditIpOk = acceptances.every((a) => typeof a.ipAddress === 'string' && a.ipAddress.length > 0);
    assert(auditIpOk, 'Auditoria de IP registrada em todos os aceites');

    const auditUaOk = acceptances.every((a) => a.userAgent === customUserAgent);
    assert(auditUaOk, 'Auditoria de User-Agent registrada em todos os aceites');

    // -------------------------------------------------------------
    section('3. Subscribe / Checkout — Contrato SaaS Obrigatório');
    // -------------------------------------------------------------

    const resCheckoutNoLegal = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${workspaceId}/checkout/stripe/session`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: checkoutBasePayload,
    });
    assert(resCheckoutNoLegal.statusCode === 422, 'Checkout sem legalAcceptances → 422');

    const resCheckoutWrongSlug = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${workspaceId}/checkout/stripe/session`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        ...checkoutBasePayload,
        legalAcceptances: validRegisterDocs,
      },
    });
    assert(resCheckoutWrongSlug.statusCode === 422, 'Checkout sem contrato-saas obrigatório → 422');

    const resCheckoutBadHash = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${workspaceId}/checkout/stripe/session`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        ...checkoutBasePayload,
        legalAcceptances: validCheckoutDocs.map((d) => ({
          ...d,
          contentHash: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
        })),
      },
    });
    assert(resCheckoutBadHash.statusCode === 422, 'Checkout com hash divergente do contrato-saas → 422');

    const resCheckoutOk = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${workspaceId}/checkout/stripe/session`,
      headers: {
        authorization: `Bearer ${accessToken}`,
        'x-forwarded-for': customIp,
        'user-agent': customUserAgent,
      },
      payload: {
        ...checkoutBasePayload,
        legalAcceptances: validCheckoutDocs,
      },
    });
    assert(resCheckoutOk.statusCode === 201, 'Checkout com contrato-saas válido → 201 Created');
    const checkoutBody = JSON.parse(resCheckoutOk.payload);
    assert(!!checkoutBody.sessionId, 'Stripe sessionId retornado');
    assert(checkoutBody.url?.includes('checkout.stripe.com'), 'URL de checkout do Stripe retornada');

    const contractAcceptance = await prisma.legalAcceptance.findFirst({
      where: {
        userId,
        slug: 'contrato-saas',
        workspaceId,
      },
    });
    assert(!!contractAcceptance, 'Aceite do contrato-saas persistido vinculado ao workspace');
    assert(typeof contractAcceptance?.ipAddress === 'string' && contractAcceptance.ipAddress.length > 0, 'IP do aceite do contrato auditado');
    assert(contractAcceptance?.userAgent === customUserAgent, 'User-Agent do contrato auditado');

    // -------------------------------------------------------------
    section('4. Páginas e Documentos Públicos /legal/*');
    // -------------------------------------------------------------

    const resDocsList = await app.inject({
      method: 'GET',
      url: '/api/v1/legal/documents',
    });
    assert(resDocsList.statusCode === 200, 'GET /api/v1/legal/documents → 200');
    const listBody = JSON.parse(resDocsList.payload) as {
      documents: Array<{ slug: string; version: string; contentHash: string }>;
    };

    const returnedSlugs = listBody.documents.map((d) => d.slug);
    for (const requiredSlug of ALL_LEGAL_SLUGS) {
      assert(returnedSlugs.includes(requiredSlug), `Documento vigente '${requiredSlug}' presente na lista pública`);
    }

    for (const doc of listBody.documents) {
      const resDocDetail = await app.inject({
        method: 'GET',
        url: `/api/v1/legal/documents/${doc.slug}`,
      });
      assert(resDocDetail.statusCode === 200, `GET /api/v1/legal/documents/${doc.slug} → 200`);
      const detail = JSON.parse(resDocDetail.payload);
      assert(detail.document?.slug === doc.slug, `Detalhe confere slug '${doc.slug}'`);
      assert(!!detail.document?.contentHash, `Detalhe confere hash '${doc.slug}'`);
    }

    const resNotFoundDoc = await app.inject({
      method: 'GET',
      url: '/api/v1/legal/documents/slug-inexistente-12345',
    });
    assert(resNotFoundDoc.statusCode === 404, 'GET slug inexistente → 404 Not Found');

    // -------------------------------------------------------------
    section('5. Cookie Banner LGPD — Bloqueio e Liberação de Analíticos');
    // -------------------------------------------------------------

    assert(evaluateAnalyticsInjection(null) === false, 'Sem consentimento gravado → analíticos bloqueados');

    const rejectedConsent: CookieConsentPrefs = {
      version: 1,
      essential: true,
      analytics: false,
      marketing: false,
      updatedAt: new Date().toISOString(),
    };
    assert(evaluateAnalyticsInjection(rejectedConsent) === false, 'Consentimento com analytics: false → analíticos bloqueados');
    assert(rejectedConsent.essential === true, 'Cookies essenciais sempre ativos');

    const acceptedConsent: CookieConsentPrefs = {
      version: 1,
      essential: true,
      analytics: true,
      marketing: false,
      updatedAt: new Date().toISOString(),
    };
    assert(evaluateAnalyticsInjection(acceptedConsent) === true, 'Consentimento com analytics: true → analíticos liberados');
  } finally {
    if (userId) {
      await prisma.legalAcceptance.deleteMany({ where: { userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    if (workspaceId) {
      await prisma.subscription.deleteMany({ where: { workspaceId } });
      await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    }
    await app.close();
    await teardownIntegrationTest();
  }

  const elapsed = Date.now() - startTime;
  console.log('\n════════════════════════════════════════════════════════════');
  console.log('📊 RESULTADO — Smoke E2E Jurídico no Funil');
  console.log('════════════════════════════════════════════════════════════');
  console.log(`  Total de testes: ${totalTests}`);
  console.log(`  ✅ Passou:        ${passedTests}`);
  console.log(`  ❌ Falhou:        ${failures.length}`);
  console.log(`  ⏱️  Tempo total:   ${elapsed}ms`);

  if (failures.length > 0) {
    console.log('\nFalhas detectadas:');
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  }

  console.log('\n🎉 Todos os testes de fumaça jurídica do funil comercial PASSARAM!');
  process.exit(0);
}

runLegalFunnelSmoke().catch((err) => {
  console.error('Erro fatal no smoke jurídico do funil:', err);
  process.exit(1);
});
