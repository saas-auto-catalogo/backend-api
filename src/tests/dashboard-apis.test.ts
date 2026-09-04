import { buildServer } from '../server.js';
import { AuthUser } from '../modules/auth/auth.middleware.js';
import { prisma } from '../lib/prisma.js';
import { dashboardService } from '../modules/dashboard/dashboard.service.js';
import { closeAllQueues } from '../infra/queues/queue-manager.js';
import { redisClient } from '../infra/redis/redis-client.js';

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
  console.log(`📊 ${title}`);
  console.log('─'.repeat(60));
}

async function runDashboardApiTests() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   📊 QA — Dashboard APIs (Stats, Vehicles, Meta, Audit)      ║');
  console.log('║   SaaS Auto Catálogo Backend API                            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  const app = await buildServer();
  const workspaceA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const workspaceB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const missingVehicleId = '00000000-0000-0000-0000-000000000001';

  const ownerTenantA: AuthUser = {
    id: 'usr-owner-a',
    email: 'owner@autoelite.com.br',
    name: 'Carlos Owner',
    isSuperAdmin: false,
    workspaceId: workspaceA,
    role: 'OWNER',
  };

  const managerTenantA: AuthUser = {
    id: 'usr-manager-a',
    email: 'manager@autoelite.com.br',
    name: 'Marcos Manager',
    isSuperAdmin: false,
    workspaceId: workspaceA,
    role: 'MANAGER',
  };

  const viewerTenantA: AuthUser = {
    id: 'usr-viewer-a',
    email: 'viewer@autoelite.com.br',
    name: 'Ana Viewer',
    isSuperAdmin: false,
    workspaceId: workspaceA,
    role: 'VIEWER',
  };

  const ownerTenantB: AuthUser = {
    id: 'usr-owner-b',
    email: 'owner@jrcasa.com.br',
    name: 'Roberto Owner B',
    isSuperAdmin: false,
    workspaceId: workspaceB,
    role: 'OWNER',
  };

  const tokenOwnerA = app.jwt.sign(ownerTenantA);
  const tokenManagerA = app.jwt.sign(managerTenantA);
  const tokenViewerA = app.jwt.sign(viewerTenantA);
  const tokenOwnerB = app.jwt.sign(ownerTenantB);

  try {
    section('1. Dashboard Stats');

    const resStatsNoAuth = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${workspaceA}/dashboard/stats`,
    });
    assert(resStatsNoAuth.statusCode === 401, 'Stats sem token retorna 401');

    const resStatsTenantB = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${workspaceA}/dashboard/stats`,
      headers: { authorization: `Bearer ${tokenOwnerB}` },
    });
    assert(resStatsTenantB.statusCode === 403, 'Tenant B bloqueado ao acessar stats do Tenant A');

    const resStatsViewer = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${workspaceA}/dashboard/stats`,
      headers: { authorization: `Bearer ${tokenViewerA}` },
    });
    assert(resStatsViewer.statusCode === 200, 'Viewer acessa stats do próprio workspace');
    const stats = JSON.parse(resStatsViewer.payload);
    assert(typeof stats.totalVehicles === 'number', 'Stats retorna totalVehicles numérico');
    assert(['HEALTHY', 'WARNING', 'CRITICAL'].includes(stats.catalogStatus), 'Stats retorna catalogStatus válido');

    section('2. Vehicles');

    const resVehicles = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${workspaceA}/vehicles?page=1&limit=5`,
      headers: { authorization: `Bearer ${tokenOwnerA}` },
    });
    assert(resVehicles.statusCode === 200, 'Owner lista veículos com paginação');
    const vehiclesPayload = JSON.parse(resVehicles.payload);
    assert(Array.isArray(vehiclesPayload.items), 'Resposta de veículos contém items');
    assert(vehiclesPayload.pagination?.page === 1, 'Paginação retorna page=1');

    const resVehicle404 = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${workspaceA}/vehicles/${missingVehicleId}`,
      headers: { authorization: `Bearer ${tokenOwnerA}` },
    });
    assert(resVehicle404.statusCode === 404, 'Veículo inexistente retorna 404');

    const resMakes = await app.inject({

      method: 'GET',

      url: `/api/v1/workspaces/${workspaceA}/vehicles/makes`,

      headers: { authorization: `Bearer ${tokenOwnerA}` },

    });

    assert(resMakes.statusCode === 200, 'Lista marcas do workspace (200)');

    const makesPayload = JSON.parse(resMakes.payload);

    assert(Array.isArray(makesPayload.makes), 'Resposta de marcas contem array makes');

    assert(makesPayload.makes.every((m: unknown) => typeof m === 'string'), 'Marcas sao strings');

    const resHybrid = await app.inject({

      method: 'GET',

      url: `/api/v1/workspaces/${workspaceA}/vehicles?fuelType=HYBRID_EV&limit=5`,

      headers: { authorization: `Bearer ${tokenOwnerA}` },

    });

    assert(resHybrid.statusCode === 200, 'Filtro HYBRID_EV retorna 200');

    const hybridPayload = JSON.parse(resHybrid.payload);

    assert(Array.isArray(hybridPayload.items), 'Filtro HYBRID_EV retorna items');


    section('3. Meta Catalogs');

    const resCatalogs = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${workspaceA}/meta-catalogs`,
      headers: { authorization: `Bearer ${tokenViewerA}` },
    });
    assert(resCatalogs.statusCode === 200, 'Viewer lista meta-catalogs');
    const catalogsPayload = JSON.parse(resCatalogs.payload);
    assert(Array.isArray(catalogsPayload.catalogs), 'Resposta contém array catalogs');

    // Auto-provisionamento: workspace com feed ativo e sem catálogo ganha catálogo com publicFeedUrl
    const createdWs = await prisma.workspace.create({
      data: {
        name: 'Provision Test Revenda',
        slug: `provision-ws-${Date.now()}`,
      },
    });
    const provisionWsId = createdWs.id;
    const provisionToken = `prov-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    await prisma.feedConfig.create({
      data: {
        workspaceId: provisionWsId,
        sourceType: 'AUTOCERTO',
        feedUrl: 'https://dms.example.com/feed.xml',
        activeTokenHash: provisionToken,
        tokenSalt: 'salt',
      },
    });

    const provisioned = await dashboardService.listMetaCatalogs(provisionWsId, 'https://api.test.local');
    assert(provisioned.length >= 1, 'Workspace com feed ativo provisão catálogo Meta automaticamente');
    const provisionedFirst = provisioned[0];
    assert(
      provisionedFirst.publicFeedUrl === `https://api.test.local/api/v1/feeds/${provisionToken}/meta-vehicles.xml`,
      'Catálogo provisionado possui publicFeedUrl do feed XML Atom DAA',
    );
    assert(provisionedFirst.feedFormat === 'XML_DAA', 'Catálogo provisionado usa feedFormat XML_DAA');
    assert(typeof provisionedFirst.totalVehiclesCount === 'number', 'Catálogo provisionado expõe totalVehiclesCount');

    // Persistência: chamada subsequente reutiliza o catálogo provisionado
    const secondCall = await dashboardService.listMetaCatalogs(provisionWsId, 'https://api.test.local');
    assert(secondCall.length === 1, 'Catálogo provisionado é persistido entre consultas');
    assert(
      secondCall[0].publicFeedUrl === provisionedFirst.publicFeedUrl,
      'publicFeedUrl estável entre consultas subsequentes',
    );

    await prisma.metaCatalog.deleteMany({ where: { workspaceId: provisionWsId } });
    await prisma.feedConfig.deleteMany({ where: { workspaceId: provisionWsId } });
    await prisma.workspace.deleteMany({ where: { id: provisionWsId } });


    section('4. Audit Logs (RBAC)');

    const resAuditViewer = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${workspaceA}/audit-logs`,
      headers: { authorization: `Bearer ${tokenViewerA}` },
    });
    assert(resAuditViewer.statusCode === 403, 'Viewer bloqueado em audit-logs (403)');

    const resAuditManager = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${workspaceA}/audit-logs`,
      headers: { authorization: `Bearer ${tokenManagerA}` },
    });
    assert(resAuditManager.statusCode === 200, 'Manager acessa audit-logs (200)');
    const auditPayload = JSON.parse(resAuditManager.payload);
    assert(Array.isArray(auditPayload.items), 'Audit logs retorna items');

    section('5. Dashboard Issues');

    const resIssuesNoAuth = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${workspaceA}/dashboard/issues`,
    });
    assert(resIssuesNoAuth.statusCode === 401, 'Issues sem token retorna 401');

    const resIssuesTenantB = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${workspaceA}/dashboard/issues`,
      headers: { authorization: `Bearer ${tokenOwnerB}` },
    });
    assert(resIssuesTenantB.statusCode === 403, 'Tenant B bloqueado ao acessar issues do Tenant A');

    const resIssuesViewer = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${workspaceA}/dashboard/issues`,
      headers: { authorization: `Bearer ${tokenViewerA}` },
    });
    assert(resIssuesViewer.statusCode === 200, 'Viewer acessa dashboard issues (200)');
    const issuesPayload = JSON.parse(resIssuesViewer.payload);
    assert(Array.isArray(issuesPayload.items), 'Issues retorna array items');

    const validIssueTypes = ['MISSING_IMAGES', 'PRICE_ZERO', 'INVALID_VIN', 'YEAR_INVALID'];
    const validSeverities = ['BLOCKING', 'WARNING'];

    for (const item of issuesPayload.items) {
      assert(typeof item.id === 'string', 'Issue item contém id');
      assert(typeof item.vehicleId === 'string', 'Issue item contém vehicleId');
      assert(typeof item.make === 'string', 'Issue item contém make');
      assert(typeof item.model === 'string', 'Issue item contém model');
      assert(typeof item.description === 'string', 'Issue item contém description');
      assert(typeof item.detectedAt === 'string', 'Issue item contém detectedAt');
      assert(validIssueTypes.includes(item.issueType), `Issue item issueType válido: ${item.issueType}`);
      assert(validSeverities.includes(item.severity), `Issue item severity válido: ${item.severity}`);
    }

    section('6. Dashboard Activity');

    const resActivityNoAuth = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${workspaceA}/dashboard/activity`,
    });
    assert(resActivityNoAuth.statusCode === 401, 'Activity sem token retorna 401');

    const resActivityTenantB = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${workspaceA}/dashboard/activity`,
      headers: { authorization: `Bearer ${tokenOwnerB}` },
    });
    assert(resActivityTenantB.statusCode === 403, 'Tenant B bloqueado ao acessar activity do Tenant A');

    const resActivityViewer = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${workspaceA}/dashboard/activity`,
      headers: { authorization: `Bearer ${tokenViewerA}` },
    });
    assert(resActivityViewer.statusCode === 200, 'Viewer acessa dashboard activity (200)');
    const activityPayload = JSON.parse(resActivityViewer.payload);
    assert(Array.isArray(activityPayload.events), 'Activity retorna array events');
    assert(
      !('ipAddress' in activityPayload) && !('actorEmail' in activityPayload),
      'Activity response não expõe campos sensíveis no root',
    );

    for (const event of activityPayload.events) {
      assert(typeof event.id === 'string', 'Activity event contém id');
      assert(typeof event.type === 'string', 'Activity event contém type');
      assert(typeof event.title === 'string', 'Activity event contém title');
      assert(typeof event.description === 'string', 'Activity event contém description');
      assert(typeof event.occurredAt === 'string', 'Activity event contém occurredAt');
      assert(!('ipAddress' in event), 'Activity event não expõe ipAddress');
      assert(!('actorEmail' in event), 'Activity event não expõe actorEmail');
    }

  } finally {
    await app.close();
    await closeAllQueues().catch(() => undefined);
    redisClient.disconnect();
    await prisma.$disconnect();
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Resultado: ${passedTests}/${totalTests} testes passaram`);
  if (failures.length > 0) {
    console.log('Falhas:');
    failures.forEach((failure) => console.log(` - ${failure}`));
    process.exit(1);
  }

  process.exit(0);
}

runDashboardApiTests().catch((error) => {
  console.error('Erro fatal nos testes de dashboard:', error);
  process.exit(1);
});
