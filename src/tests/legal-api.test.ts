import { buildServer } from '../server.js';
import { prisma } from '../lib/prisma.js';
import { teardownIntegrationTest, resetAuthRateLimits } from './test-teardown.js';
import { applyManifest } from '../modules/legal/legal-sync.service.js';
import { withRegisterConsent } from './legal-test-helpers.js';

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
  console.log(`⚖️ ${title}`);
  console.log('─'.repeat(60));
}

function sha256(hexChar: string): string {
  return `sha256:${hexChar.repeat(64)}`;
}

async function runLegalApiTests() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   ⚖️  Legal Documents / Acceptances — Issue #70              ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  const app = await buildServer();
  await resetAuthRateLimits();
  const startTime = Date.now();
  const suffix = Date.now();
  const termosSlug = `qa-legal-termos-${suffix}`;
  const privacidadeSlug = `qa-legal-privacidade-${suffix}`;
  const hashV1 = sha256('a');
  const hashV2 = sha256('b');
  const password = 'SenhaSegura123!';
  const uniqueEmail = `legal-api-${suffix}@test.local`;

  const v1Manifest = {
    generatedAt: '2026-09-03T01:40:23.129Z',
    documents: [
      {
        slug: termosSlug,
        title: 'Termos de Uso',
        version: '2026-09-02',
        frbrWork: `/akn/br/doc/autocatalogo/${termosSlug}`,
        frbrExpression: `/akn/br/doc/autocatalogo/${termosSlug}/2026-09-02`,
        path: `akn/${termosSlug}/2026-09-02.xml`,
        contentHash: hashV1,
        publishedAt: '2026-09-02',
      },
      {
        slug: privacidadeSlug,
        title: 'Política de Privacidade',
        version: '2026-09-02',
        frbrWork: `/akn/br/doc/autocatalogo/${privacidadeSlug}`,
        frbrExpression: `/akn/br/doc/autocatalogo/${privacidadeSlug}/2026-09-02`,
        path: `akn/${privacidadeSlug}/2026-09-02.xml`,
        contentHash: sha256('c'),
        publishedAt: '2026-09-02',
      },
    ],
  };

  try {
    section('1. applyManifest — upsert e vigente');

    const syncV1 = await applyManifest(v1Manifest);
    assert(syncV1.upserted === 2, 'applyManifest upserta 2 documentos');
    assert(syncV1.currentSlugs.includes(termosSlug), 'slug termos no resultado');

    const currentV1 = await prisma.legalDocument.findFirst({
      where: { slug: termosSlug, isCurrent: true },
    });
    assert(currentV1?.version === '2026-09-02', 'versão v1 é vigente');
    assert(currentV1?.contentHash === hashV1, 'hash v1 persistido');

    const syncV2 = await applyManifest({
      generatedAt: '2026-09-04T00:00:00.000Z',
      documents: [
        {
          ...v1Manifest.documents[0],
          version: '2026-09-04',
          frbrExpression: `/akn/br/doc/autocatalogo/${termosSlug}/2026-09-04`,
          path: `akn/${termosSlug}/2026-09-04.xml`,
          contentHash: hashV2,
          publishedAt: '2026-09-04',
        },
      ],
    });
    assert(syncV2.upserted === 1, 'segunda versão upsertada');

    const afterV2 = await prisma.legalDocument.findMany({
      where: { slug: termosSlug },
      orderBy: { version: 'asc' },
    });
    const v1Row = afterV2.find((d) => d.version === '2026-09-02');
    const v2Row = afterV2.find((d) => d.version === '2026-09-04');
    assert(v1Row?.isCurrent === false, 'versão anterior deixa de ser vigente');
    assert(v2Row?.isCurrent === true, 'versão nova é vigente');

    await applyManifest(v1Manifest);

    section('2. GET /legal/documents — só vigentes');

    const resList = await app.inject({ method: 'GET', url: '/api/v1/legal/documents' });
    assert(resList.statusCode === 200, `lista retorna 200 (got ${resList.statusCode})`);
    const listBody = JSON.parse(resList.payload);
    assert(Array.isArray(listBody.documents), 'resposta contém documents[]');
    const listedTermos = listBody.documents.find((d: { slug: string }) => d.slug === termosSlug);
    const listedPriv = listBody.documents.find((d: { slug: string }) => d.slug === privacidadeSlug);
    assert(!!listedTermos, 'lista inclui termos vigente');
    assert(listedTermos.contentHash === hashV1, 'lista retorna hash vigente');
    assert(listedTermos.version === '2026-09-02', 'lista retorna versão vigente');
    assert(!!listedPriv, 'lista inclui privacidade vigente');

    section('3. GET /legal/documents/:slug');

    const resSlug = await app.inject({
      method: 'GET',
      url: `/api/v1/legal/documents/${termosSlug}`,
    });
    assert(resSlug.statusCode === 200, `detalhe retorna 200 (got ${resSlug.statusCode})`);
    const slugBody = JSON.parse(resSlug.payload);
    assert(slugBody.document?.contentHash === hashV1, 'detalhe retorna hash');
    assert(slugBody.document?.slug === termosSlug, 'detalhe retorna slug');

    const resMissing = await app.inject({
      method: 'GET',
      url: '/api/v1/legal/documents/slug-inexistente-xyz',
    });
    assert(resMissing.statusCode === 404, `slug desconhecido retorna 404 (got ${resMissing.statusCode})`);

    section('4. POST /legal/acceptances — auth e validação');

    const resNoAuth = await app.inject({
      method: 'POST',
      url: '/api/v1/legal/acceptances',
      payload: {
        slug: termosSlug,
        version: '2026-09-02',
        contentHash: hashV1,
        acceptedAt: new Date(Date.now() - 60_000).toISOString(),
      },
    });
    assert(resNoAuth.statusCode === 401, `sem JWT retorna 401 (got ${resNoAuth.statusCode})`);

    const resRegister = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: await withRegisterConsent({
        name: 'Legal Tester',
        email: uniqueEmail,
        password,
        workspaceName: `Revenda Legal ${suffix}`,
      }),
    });
    assert(resRegister.statusCode === 201, `register para JWT retorna 201 (got ${resRegister.statusCode})`);
    const registerData = JSON.parse(resRegister.payload);
    const token = registerData.accessToken as string;
    const workspaceId = registerData.user?.workspaceId as string;
    const userId = registerData.user?.id as string;

    const resBadHash = await app.inject({
      method: 'POST',
      url: '/api/v1/legal/acceptances',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        slug: termosSlug,
        version: '2026-09-02',
        contentHash: hashV2,
        acceptedAt: new Date(Date.now() - 60_000).toISOString(),
      },
    });
    assert(resBadHash.statusCode === 422, `hash divergente retorna 422 (got ${resBadHash.statusCode})`);

    const resBadVersion = await app.inject({
      method: 'POST',
      url: '/api/v1/legal/acceptances',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        slug: termosSlug,
        version: '2026-09-04',
        contentHash: hashV1,
        acceptedAt: new Date(Date.now() - 60_000).toISOString(),
      },
    });
    assert(resBadVersion.statusCode === 422, `versão divergente retorna 422 (got ${resBadVersion.statusCode})`);

    section('5. POST /legal/acceptances — cria e é idempotente');

    const acceptedAt = new Date(Date.now() - 60_000).toISOString();
    const resCreate = await app.inject({
      method: 'POST',
      url: '/api/v1/legal/acceptances',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        slug: termosSlug,
        version: '2026-09-02',
        contentHash: hashV1,
        acceptedAt,
        workspaceId,
      },
    });
    assert(resCreate.statusCode === 201, `aceite válido retorna 201 (got ${resCreate.statusCode})`);
    const createdBody = JSON.parse(resCreate.payload);
    assert(createdBody.acceptance?.slug === termosSlug, 'aceite retorna slug');
    assert(createdBody.acceptance?.contentHash === hashV1, 'aceite retorna hash');
    assert(createdBody.acceptance?.workspaceId === workspaceId, 'aceite persiste workspaceId');

    const rowsAfterCreate = await prisma.legalAcceptance.count({
      where: { userId, slug: termosSlug, version: '2026-09-02' },
    });
    assert(rowsAfterCreate === 1, 'uma row de aceite persistida');

    const resIdempotent = await app.inject({
      method: 'POST',
      url: '/api/v1/legal/acceptances',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        slug: termosSlug,
        version: '2026-09-02',
        contentHash: hashV1,
        acceptedAt,
        workspaceId,
      },
    });
    assert(resIdempotent.statusCode === 200, `segunda chamada retorna 200 (got ${resIdempotent.statusCode})`);
    const rowsAfterSecond = await prisma.legalAcceptance.count({
      where: { userId, slug: termosSlug, version: '2026-09-02' },
    });
    assert(rowsAfterSecond === 1, 'segunda chamada não duplica aceite');
  } finally {
    await prisma.legalAcceptance.deleteMany({
      where: { slug: { in: [termosSlug, privacidadeSlug] } },
    });
    await prisma.legalDocument.deleteMany({
      where: { slug: { in: [termosSlug, privacidadeSlug] } },
    });
    await app.close();
    await teardownIntegrationTest();
  }

  const elapsed = Date.now() - startTime;
  console.log('\n════════════════════════════════════════════════════════════');
  console.log('📊 RESULTADO — Legal API');
  console.log('════════════════════════════════════════════════════════════');
  console.log(`  Total de testes: ${totalTests}`);
  console.log(`  ✅ Passou:        ${passedTests}`);
  console.log(`  ❌ Falhou:        ${failures.length}`);
  console.log(`  ⏱️  Tempo total:   ${elapsed}ms`);

  if (failures.length > 0) {
    console.log('\nFalhas:');
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  }

  console.log('\n🎉 Todos os testes de documentos jurídicos passaram!');
  process.exit(0);
}

runLegalApiTests().catch((err) => {
  console.error('Erro na execução dos testes de legal API:', err);
  process.exit(1);
});
