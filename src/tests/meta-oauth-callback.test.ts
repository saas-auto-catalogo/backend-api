import { buildServer } from '../server.js';
import { prisma } from '../lib/prisma.js';
import { teardownIntegrationTest, resetAuthRateLimits } from './test-teardown.js';
import { loadIntegrationSeedContext } from './seed-test-context.js';
import { withRegisterConsent } from './legal-test-helpers.js';
import {
  metaConnectorService,
  DealershipNotFoundError,
} from '../modules/meta-connector/meta-connector.service.js';
import { MetaOAuthService } from '../modules/meta-connector/meta-oauth.service.js';

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
  console.log('║   DriveSync Backend API                            ║');
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

    section('2.5 Auto-provisionamento OAuth — preenche metaCatalogId no catálogo provisionado');

    const autoWs = await prisma.workspace.create({
      data: {
        name: 'Revenda Provisionada',
        slug: `ws-provisioned-${Date.now()}`,
        status: 'ACTIVE',
      },
    });

    const provisioned = await prisma.metaCatalog.create({
      data: {
        workspaceId: autoWs.id,
        catalogName: 'Revenda Provisionada - Catálogo Meta Automotive Ads',
        metaCatalogId: null,
        feedFormat: 'XML_DAA',
        publicFeedUrl: 'https://api.test.local/api/v1/feeds/x/meta-vehicles.xml',
        totalVehiclesCount: 12,
        eligibleVehiclesCount: 9,
      },
    });
    assert(provisioned.metaCatalogId === null, 'Catálogo provisionado inicia sem metaCatalogId');

    const createdCatalog = {
      id: 'meta-auto-cat-created-001',
      name: 'Revenda Provisionada - Catálogo Meta Automotive Ads',
      vertical: 'vehicles',
    };

    await metaConnectorService.upsertMetaCatalogFromOAuth({
      workspaceId: autoWs.id,
      catalogs: [createdCatalog],
    });

    const afterOAuth = await prisma.metaCatalog.findUnique({ where: { id: provisioned.id } });
    assert(
      afterOAuth?.metaCatalogId === 'meta-auto-cat-created-001',
      'OAuth persiste metaCatalogId no registro provisionado',
    );
    assert(
      afterOAuth?.catalogName === 'Revenda Provisionada - Catálogo Meta Automotive Ads',
      'catalogName sincronizado com o catálogo criado na Meta',
    );
    assert(
      afterOAuth?.totalVehiclesCount === 12,
      'Contagens provisionadas preservadas após OAuth',
    );

    await prisma.metaCatalog.deleteMany({ where: { workspaceId: autoWs.id } });
    await prisma.workspace.deleteMany({ where: { id: autoWs.id } });

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

    section('4. Token de sessão Meta — geração e verificação HMAC');

    const testOAuthService = new MetaOAuthService();
    const sessionToken = testOAuthService.generateMetaSessionToken(workspaceId, 'meta-long-token-abc');

    const verified = testOAuthService.verifyMetaSessionToken(sessionToken);
    assert(verified.isValid === true, 'Token de sessão válido verificado');
    assert(verified.workspaceId === workspaceId, 'Token de sessão preserva workspaceId');
    assert(verified.accessToken === 'meta-long-token-abc', 'Token de sessão preserva access token');

    const tamperedVerification = testOAuthService.verifyMetaSessionToken('tok.tampered.invalid');
    assert(tamperedVerification.isValid === false, 'Token adulterado é rejeitado');

    const otherWsToken = testOAuthService.generateMetaSessionToken('foreign-ws-uuid', 'x');
    const otherWsVerification = testOAuthService.verifyMetaSessionToken(otherWsToken);
    assert(otherWsVerification.isValid === true, 'Token de outro workspace ainda é válido (HMAC ok)');
    assert(otherWsVerification.workspaceId === 'foreign-ws-uuid', 'Token preserva workspaceId de origem');

    section('5. Selecionar catálogo existente — vincula metaCatalogId via select-catalog');

    const selectToken = testOAuthService.generateMetaSessionToken(workspaceId, 'meta-long-token-abc');

    const resSelect = await app.inject({
      method: 'POST',
      url: '/api/v1/integrations/meta/select-catalog',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        workspaceId,
        metaSessionToken: selectToken,
        catalogId: 'meta-listed-cat-777',
        catalogName: 'Catálogo Selecionado pelo Lojista',
      },
    });
    assert(
      resSelect.statusCode === 200,
      `Select catálogo existente retorna 200 (got ${resSelect.statusCode})`,
    );

    const selectData = JSON.parse(resSelect.payload);
    assert(selectData.catalogId === 'meta-listed-cat-777', 'Select retorna catalogId vinculado');
    assert(selectData.created === false, 'Select não marca created para catálogo existente');

    const selectLinkedMeta = await prisma.metaCatalog.findFirst({
      where: { workspaceId },
      orderBy: { updatedAt: 'desc' },
    });
    assert(
      selectLinkedMeta?.metaCatalogId === 'meta-listed-cat-777',
      'metaCatalogId persistido no meta_catalogs após select',
    );

    const selectLinkedDealership = await prisma.dealership.findFirst({
      where: { workspaceId },
      orderBy: { createdAt: 'asc' },
    });
    assert(
      selectLinkedDealership?.metaCatalogId === 'meta-listed-cat-777',
      'Dealership.metaCatalogId atualizado após select',
    );

    section('6. Token de sessão inválido — 401');

    const resBadToken = await app.inject({
      method: 'POST',
      url: '/api/v1/integrations/meta/select-catalog',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        workspaceId,
        metaSessionToken: 'tampered.invalid',
        catalogId: 'x-y-z',
      },
    });
    assert(
      resBadToken.statusCode === 401,
      `Select com token inválido retorna 401 (got ${resBadToken.statusCode})`,
    );

    section('7. Criar catálogo sem businessId — erro 400');

    const resCreateNoBiz = await app.inject({
      method: 'POST',
      url: '/api/v1/integrations/meta/select-catalog',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        workspaceId,
        metaSessionToken: selectToken,
        createNew: true,
        catalogName: 'Novo Catálogo de Veículos',
      },
    });
    assert(
      resCreateNoBiz.statusCode === 400,
      `Create sem businessId retorna 400 (got ${resCreateNoBiz.statusCode})`,
    );
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
