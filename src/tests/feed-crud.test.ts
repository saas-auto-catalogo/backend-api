import { buildServer } from '../server.js';
import { teardownIntegrationTest } from './test-teardown.js';
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
  console.log(`📡 ${title}`);
  console.log('─'.repeat(60));
}

async function runFeedCrudTestSuite() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   📡 QA — CRUD de Feeds, Sync BullMQ e Histórico             ║');
  console.log('║   DriveSync Backend API                            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  const app = await buildServer();
  const startTime = Date.now();

  try {
    // Tokens de autenticação para os testes
    const ownerTenantA: AuthUser = {
      id: 'usr-owner-a',
      email: 'owner@autoelite.com.br',
      name: 'Carlos Owner',
      isSuperAdmin: false,
      workspaceId: 'workspace-tenant-a',
      dealershipId: 'dealership-a-01',
      role: 'OWNER',
    };

    const managerTenantA: AuthUser = {
      id: 'usr-manager-a',
      email: 'manager@autoelite.com.br',
      name: 'Marcos Manager',
      isSuperAdmin: false,
      workspaceId: 'workspace-tenant-a',
      role: 'MANAGER',
    };

    const viewerTenantA: AuthUser = {
      id: 'usr-viewer-a',
      email: 'viewer@autoelite.com.br',
      name: 'Ana Viewer',
      isSuperAdmin: false,
      workspaceId: 'workspace-tenant-a',
      role: 'VIEWER',
    };

    const ownerTenantB: AuthUser = {
      id: 'usr-owner-b',
      email: 'owner@jrcasa.com.br',
      name: 'Roberto Owner B',
      isSuperAdmin: false,
      workspaceId: 'workspace-tenant-b',
      role: 'OWNER',
    };

    const tokenOwnerA = app.jwt.sign(ownerTenantA);
    const tokenManagerA = app.jwt.sign(managerTenantA);
    const tokenViewerA = app.jwt.sign(viewerTenantA);
    const tokenOwnerB = app.jwt.sign(ownerTenantB);

    // ─────────────────────────────────────────────────────────────────────────
    // 1. LISTAGEM DE FEEDS (GET)
    // ─────────────────────────────────────────────────────────────────────────
    section('1. Listagem de Feeds (GET /api/v1/workspaces/:id/feeds)');

    // Sem autenticação -> 401
    const resListNoAuth = await app.inject({
      method: 'GET',
      url: '/api/v1/workspaces/workspace-tenant-a/feeds',
    });
    assert(resListNoAuth.statusCode === 401, 'Listagem sem token retorna 401');

    // Tenant B tentando listar Tenant A -> 403 (Isolamento)
    const resListTenantB = await app.inject({
      method: 'GET',
      url: '/api/v1/workspaces/workspace-tenant-a/feeds',
      headers: { authorization: `Bearer ${tokenOwnerB}` },
    });
    assert(resListTenantB.statusCode === 403, 'Tenant B bloqueado ao tentar listar feeds do Tenant A (403)');

    // Viewer do Tenant A listando -> 200 OK (VIEWER tem acesso de leitura)
    const resListViewer = await app.inject({
      method: 'GET',
      url: '/api/v1/workspaces/workspace-tenant-a/feeds',
      headers: { authorization: `Bearer ${tokenViewerA}` },
    });
    assert(resListViewer.statusCode === 200, 'Viewer lista feeds do próprio workspace (200 OK)');
    const feedsData = JSON.parse(resListViewer.payload);
    assert(Array.isArray(feedsData.feeds), 'Resposta contém array de feeds');

    // ─────────────────────────────────────────────────────────────────────────
    // 2. CRIAÇÃO DE FEED (POST)
    // ─────────────────────────────────────────────────────────────────────────
    section('2. Criação de Feed (POST /api/v1/workspaces/:id/feeds)');

    // Viewer tentando criar feed -> 403 (RBAC: só MANAGER e acima)
    const resCreateViewer = await app.inject({
      method: 'POST',
      url: '/api/v1/workspaces/workspace-tenant-a/feeds',
      headers: { authorization: `Bearer ${tokenViewerA}` },
      payload: {
        sourceType: 'AUTOCERTO',
        feedUrl: 'https://integracao.autocerto.com/feed.xml',
      },
    });
    assert(resCreateViewer.statusCode === 403, 'Viewer bloqueado ao tentar criar feed (403)');

    // Manager criando sem feedUrl -> 400 Bad Request
    const resCreateMissing = await app.inject({
      method: 'POST',
      url: '/api/v1/workspaces/workspace-tenant-a/feeds',
      headers: { authorization: `Bearer ${tokenManagerA}` },
      payload: {
        sourceType: 'AUTOCERTO',
      },
    });
    assert(resCreateMissing.statusCode === 400, 'Criação sem feedUrl retorna 400 Bad Request');

    // Manager criando com sucesso -> 201 Created
    const resCreateOk = await app.inject({
      method: 'POST',
      url: '/api/v1/workspaces/workspace-tenant-a/feeds',
      headers: { authorization: `Bearer ${tokenManagerA}` },
      payload: {
        sourceType: 'AUTOCERTO',
        feedUrl: 'https://integracao.autocerto.com/novo-feed.xml',
        syncIntervalMinutes: 45,
        isActive: true,
      },
    });
    assert(resCreateOk.statusCode === 201, 'Manager cria novo feed com sucesso (201 Created)');
    const createdFeed = JSON.parse(resCreateOk.payload).feed;
    assert(createdFeed.sourceType === 'AUTOCERTO', 'SourceType correto registrado');
    assert(createdFeed.syncIntervalMinutes === 45, 'Intervalo de sync registrado');
    const newFeedId = createdFeed.id;

    // ─────────────────────────────────────────────────────────────────────────
    // 3. DETALHES DO FEED (GET BY ID)
    // ─────────────────────────────────────────────────────────────────────────
    section('3. Consulta de Detalhes do Feed');

    const resGetFeed = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/workspace-tenant-a/feeds/${newFeedId}`,
      headers: { authorization: `Bearer ${tokenViewerA}` },
    });
    assert(resGetFeed.statusCode === 200, 'Consulta de detalhes do feed retorna 200 OK');
    const feedDetail = JSON.parse(resGetFeed.payload).feed;
    assert(feedDetail.id === newFeedId, 'ID do feed coincide');

    // ─────────────────────────────────────────────────────────────────────────
    // 4. ATUALIZAÇÃO DO FEED (PUT)
    // ─────────────────────────────────────────────────────────────────────────
    section('4. Atualização de Feed (PUT)');

    const resUpdate = await app.inject({
      method: 'PUT',
      url: `/api/v1/workspaces/workspace-tenant-a/feeds/${newFeedId}`,
      headers: { authorization: `Bearer ${tokenManagerA}` },
      payload: {
        syncIntervalMinutes: 15,
        isActive: false,
      },
    });
    assert(resUpdate.statusCode === 200, 'Manager atualiza feed com sucesso (200 OK)');
    const updatedFeed = JSON.parse(resUpdate.payload).feed;
    assert(updatedFeed.syncIntervalMinutes === 15, 'Intervalo atualizado para 15min');

    // ─────────────────────────────────────────────────────────────────────────
    // 5. DISPARO DE SINCRONIZAÇÃO MANUAL VIA BULLMQ (POST /sync)
    // ─────────────────────────────────────────────────────────────────────────
    section('5. Disparo de Sincronização Manual via BullMQ');

    // Viewer tentando disparar -> 403
    const resSyncViewer = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/workspace-tenant-a/feeds/${newFeedId}/sync`,
      headers: { authorization: `Bearer ${tokenViewerA}` },
    });
    assert(resSyncViewer.statusCode === 403, 'Viewer bloqueado ao tentar disparar sync (403)');

    // Manager tentando disparar -> 403 (RBAC: só OWNER e SUPER_ADMIN)
    const resSyncManager = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/workspace-tenant-a/feeds/${newFeedId}/sync`,
      headers: { authorization: `Bearer ${tokenManagerA}` },
    });
    assert(resSyncManager.statusCode === 403, 'Manager bloqueado ao tentar disparar sync (403)');

    // Owner disparando sync -> 202 Accepted
    const resSyncOk = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/workspace-tenant-a/feeds/${newFeedId}/sync`,
      headers: { authorization: `Bearer ${tokenOwnerA}` },
    });
    assert(resSyncOk.statusCode === 202, 'Owner dispara sync manual com sucesso (202 Accepted)');
    const syncData = JSON.parse(resSyncOk.payload);
    assert(typeof syncData.jobId === 'string' && syncData.jobId.length > 0, `Job ID retornado pelo BullMQ: ${syncData.jobId}`);
    assert(syncData.status === 'queued', 'Status do job é "queued"');
    assert(syncData.priority === 'HIGH', 'Prioridade configurada como HIGH');

    // ─────────────────────────────────────────────────────────────────────────
    // 6. CONSULTA DE STATUS DO JOB DE SYNC
    // ─────────────────────────────────────────────────────────────────────────
    section('6. Status do Job de Sincronização');

    const resJobStatus = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/workspace-tenant-a/feeds/${newFeedId}/sync/${syncData.jobId}`,
      headers: { authorization: `Bearer ${tokenViewerA}` },
    });
    assert(resJobStatus.statusCode === 200, 'Consulta de status do job retorna 200 OK');
    const jobStatusData = JSON.parse(resJobStatus.payload);
    assert(jobStatusData.jobId === syncData.jobId, 'Job ID coincide');

    // ─────────────────────────────────────────────────────────────────────────
    // 7. HISTÓRICO DE SINCRONIZAÇÕES (GET /history)
    // ─────────────────────────────────────────────────────────────────────────
    section('7. Histórico de Sincronizações (GET /history)');

    const resHistory = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/workspace-tenant-a/feeds/${newFeedId}/history?limit=10`,
      headers: { authorization: `Bearer ${tokenViewerA}` },
    });
    assert(resHistory.statusCode === 200, 'Consulta de histórico retorna 200 OK');
    const historyData = JSON.parse(resHistory.payload);
    assert(Array.isArray(historyData.history), 'Histórico retornado como array');

    // ─────────────────────────────────────────────────────────────────────────
    // 8. DELEÇÃO DO FEED (DELETE)
    // ─────────────────────────────────────────────────────────────────────────
    section('8. Deleção de Feed (DELETE)');

    // Manager tentando deletar -> 403 (RBAC: só OWNER e SUPER_ADMIN podem deletar)
    const resDeleteManager = await app.inject({
      method: 'DELETE',
      url: `/api/v1/workspaces/workspace-tenant-a/feeds/${newFeedId}`,
      headers: { authorization: `Bearer ${tokenManagerA}` },
    });
    assert(resDeleteManager.statusCode === 403, 'Manager bloqueado ao tentar deletar feed (403)');

    // Owner deletando com sucesso -> 200 OK
    const resDeleteOwner = await app.inject({
      method: 'DELETE',
      url: `/api/v1/workspaces/workspace-tenant-a/feeds/${newFeedId}`,
      headers: { authorization: `Bearer ${tokenOwnerA}` },
    });
    assert(resDeleteOwner.statusCode === 200, 'Owner deleta feed com sucesso (200 OK)');
  } finally {
    await app.close();
    await teardownIntegrationTest();
  }

  const elapsed = Date.now() - startTime;

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`📊 RESULTADO FINAL DOS TESTES DE FEEDS CRUD & SYNC`);
  console.log('═'.repeat(60));
  console.log(`  Total de testes: ${totalTests}`);
  console.log(`  ✅ Passou:        ${passedTests}`);
  console.log(`  ❌ Falhou:        ${failures.length}`);
  console.log(`  ⏱️  Tempo total:   ${elapsed}ms`);

  if (failures.length > 0) {
    console.log('\n🔴 Falhas encontradas:');
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  }

  console.log('\n🎉 Todos os testes de CRUD de Feeds, Sync BullMQ e Histórico passaram com 100% de sucesso!');
  process.exit(0);
}

runFeedCrudTestSuite().catch((err) => {
  console.error('\n💥 Erro crítico no teste de feeds:', err);
  process.exit(1);
});
