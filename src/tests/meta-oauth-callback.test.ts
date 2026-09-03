import { buildServer } from '../server.js';
import { prisma } from '../lib/prisma.js';
import { teardownIntegrationTest, resetAuthRateLimits } from './test-teardown.js';
import { loadIntegrationSeedContext } from './seed-test-context.js';
import { withRegisterConsent } from './legal-test-helpers.js';
import {
  metaConnectorService,
  DealershipNotFoundError,
} from '../modules/meta-connector/meta-connector.service.js';

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
  console.log(`🔗 ${title}`);
  console.log('─'.repeat(60));
}

async function runMetaOAuthCallbackTestSuite() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   🔗 QA — OAuth Meta Callback / MetaCatalog Upsert           ║');
  console.log('║   SaaS Auto Catálogo Backend API                            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  const app = await buildServer();
  await resetAuthRateLimits();
  const seed = await loadIntegrationSeedContext();
  const startTime = Date.now();
  const uniqueEmail = `meta-oauth-test-${Date.now()}@test.local`;
  const password = 'SenhaSegura123!';

  try {
    section('1. Workspace novo — cria MetaCatalog após OAuth');

    const resRegister = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: await withRegisterConsent({
        name: 'Owner Meta OAuth',
        email: uniqueEmail,
        password,
        workspaceName: 'Revenda Meta OAuth Test',
      }),
    });
    assert(resRegister.statusCode === 201, `Register retorna 201 (got ${resRegister.statusCode})`);

    const registerData = JSON.parse(resRegister.payload);
    const workspaceId = registerData.user.workspaceId as string;
    const accessToken = registerData.accessToken as string;

    const catalogsBefore = await prisma.metaCatalog.count({ where: { workspaceId } });
    assert(catalogsBefore === 0, 'Workspace novo não possui MetaCatalog');

    const created = await metaConnectorService.upsertMetaCatalogFromOAuth({
      workspaceId,
      catalogName: 'Catálogo Meta Onboarding',
      catalogs: [{ id: 'meta-cat-oauth-001', name: 'Catálogo Graph API' }],
    });

    assert(created.feedFormat === 'XML_DAA', 'MetaCatalog criado com feedFormat XML_DAA');
    assert(created.totalVehiclesCount === 0, 'MetaCatalog criado com totalVehiclesCount=0');
    assert(created.eligibleVehiclesCount === 0, 'MetaCatalog criado com eligibleVehiclesCount=0');
    assert(created.metaCatalogId === 'meta-cat-oauth-001', 'metaCatalogId vinculado da Graph API');
    assert(created.catalogName === 'Catálogo Meta Onboarding', 'catalogName do payload priorizado');

    const resCatalogs = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${workspaceId}/meta-catalogs`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    assert(resCatalogs.statusCode === 200, `GET meta-catalogs retorna 200 (got ${resCatalogs.statusCode})`);

    const catalogsPayload = JSON.parse(resCatalogs.payload);
    assert(catalogsPayload.catalogs?.length === 1, 'GET meta-catalogs retorna 1 catálogo');
    assert(
      catalogsPayload.catalogs[0]?.feedFormat === 'XML_DAA',
      'GET meta-catalogs reflete feedFormat XML_DAA',
    );

    if (seed.fromDatabase) {
      section('2. Workspace seed — atualiza MetaCatalog existente sem duplicar');

      const countBefore = await prisma.metaCatalog.count({ where: { workspaceId: seed.workspaceAId } });
      assert(countBefore >= 1, 'Seed possui MetaCatalog no workspace A');

      await metaConnectorService.upsertMetaCatalogFromOAuth({
        workspaceId: seed.workspaceAId,
        catalogName: 'Catálogo Meta Atualizado',
        catalogs: [{ id: 'updated-meta-cat-id', name: 'Nome Graph Atualizado' }],
      });

      const countAfter = await prisma.metaCatalog.count({ where: { workspaceId: seed.workspaceAId } });
      assert(countAfter === countBefore, 'Upsert não duplica MetaCatalog existente');

      const updated = await prisma.metaCatalog.findFirst({
        where: { workspaceId: seed.workspaceAId },
        orderBy: { updatedAt: 'desc' },
      });
      assert(updated?.metaCatalogId === 'updated-meta-cat-id', 'metaCatalogId atualizado no registro existente');
      assert(updated?.catalogName === 'Catálogo Meta Atualizado', 'catalogName atualizado no registro existente');
    } else {
      console.log('    ℹ️ Pulando teste de update no seed — banco não disponível');
    }

    section('3. Workspace sem dealership — erro 404');

    const orphanWorkspace = await prisma.workspace.create({
      data: {
        name: 'Workspace Sem Dealership',
        slug: `ws-sem-dealership-${Date.now()}`,
        status: 'ACTIVE',
      },
    });

    let dealershipError: unknown;
    try {
      await metaConnectorService.upsertMetaCatalogFromOAuth({
        workspaceId: orphanWorkspace.id,
        catalogs: [{ id: 'unused', name: 'Unused' }],
      });
    } catch (err) {
      dealershipError = err;
    }

    assert(dealershipError instanceof DealershipNotFoundError, 'Upsert sem dealership lança DealershipNotFoundError');

    await prisma.workspace.delete({ where: { id: orphanWorkspace.id } });
  } finally {
    await app.close();
    await teardownIntegrationTest();
  }

  const elapsed = Date.now() - startTime;
  console.log('\n════════════════════════════════════════════════════════════');
  console.log('📊 RESULTADO FINAL DOS TESTES META OAUTH CALLBACK');
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

  console.log('\n🎉 Todos os testes de Meta OAuth callback passaram com 100% de sucesso!');
  process.exit(0);
}

runMetaOAuthCallbackTestSuite().catch((err) => {
  console.error('Erro fatal na suíte de testes Meta OAuth callback:', err);
  process.exit(1);
});
