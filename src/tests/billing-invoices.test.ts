import { buildServer } from '../server.js';
import { prisma } from '../lib/prisma.js';
import { teardownIntegrationTest } from './test-teardown.js';
import { loadIntegrationSeedContext } from './seed-test-context.js';

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
  console.log(`🧾 ${title}`);
  console.log('─'.repeat(60));
}

async function runBillingInvoicesTestSuite() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   🧾 QA — Histórico de Faturas Stripe (billing/invoices)     ║');
  console.log('║   DriveSync Backend API                            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  const app = await buildServer();
  const seed = await loadIntegrationSeedContext();
  const startTime = Date.now();

  try {
    if (!seed.fromDatabase) {
      console.log('    ℹ️ Seed indisponível — rodando com contexto fallback.');
    }

    const tokenOwnerA = app.jwt.sign(seed.ownerA);
    const tokenOwnerB = app.jwt.sign(seed.ownerB);
    const tokenManagerA = app.jwt.sign(seed.managerA);
    const tokenViewerA = app.jwt.sign(seed.viewerA);
    const tokenSuperAdmin = app.jwt.sign(seed.superAdmin);

    // ─────────────────────────────────────────────────────────────
    // 1. 401 Unauthorized
    // ─────────────────────────────────────────────────────────────
    section('1. Autenticação');
    const resNoAuth = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${seed.workspaceAId}/billing/invoices`,
    });
    assert(resNoAuth.statusCode === 401, 'Sem token retorna 401 Unauthorized');

    // ─────────────────────────────────────────────────────────────
    // 2. 403 Forbidden para papéis não autorizados
    // ─────────────────────────────────────────────────────────────
    section('2. RBAC (OWNER+)');

    const resManager = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${seed.workspaceAId}/billing/invoices`,
      headers: { authorization: `Bearer ${tokenManagerA}` },
    });
    assert(resManager.statusCode === 403, 'MANAGER bloqueado (403)');

    const resViewer = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${seed.workspaceAId}/billing/invoices`,
      headers: { authorization: `Bearer ${tokenViewerA}` },
    });
    assert(resViewer.statusCode === 403, 'VIEWER bloqueado (403)');

    // ─────────────────────────────────────────────────────────────
    // 3. Isolamento multi-tenant (403)
    // ─────────────────────────────────────────────────────────────
    section('3. Isolamento Multi-Tenant');

    const resCrossTenant = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${seed.workspaceAId}/billing/invoices`,
      headers: { authorization: `Bearer ${tokenOwnerB}` },
    });
    assert(resCrossTenant.statusCode === 403, 'Owner do tenant B bloqueado no tenant A (403)');

    // ─────────────────────────────────────────────────────────────
    // 4. Workspace sem stripeCustomerId retorna lista vazia
    // ─────────────────────────────────────────────────────────────
    section('4. Workspace sem cliente Stripe');

    const workspaceBSub = await prisma.subscription.findUnique({
      where: { workspaceId: seed.workspaceBId },
    });

    const targetWithoutCustomer =
      workspaceBSub && !workspaceBSub.stripeCustomerId
        ? seed.workspaceBId
        : null;

    if (targetWithoutCustomer) {
      const resEmpty = await app.inject({
        method: 'GET',
        url: `/api/v1/workspaces/${targetWithoutCustomer}/billing/invoices`,
        headers: { authorization: `Bearer ${app.jwt.sign(seed.ownerB)}` },
      });
      assert(resEmpty.statusCode === 200, 'Workspace sem customer retorna 200 OK');
      const body = JSON.parse(resEmpty.payload);
      assert(Array.isArray(body.items) && body.items.length === 0, 'items vazio');
      assert(body.pagination?.total === 0, 'total = 0');
    } else {
      console.log('    ℹ️ Todos os workspaces seed possuem stripeCustomerId — pulando cenário de lista vazia.');
    }

    // ─────────────────────────────────────────────────────────────
    // 5. OWNER com stripeCustomerId retorna lista + paginação
    // ─────────────────────────────────────────────────────────────
    section('5. OWNER com cliente Stripe');

    const workspaceASub = await prisma.subscription.findUnique({
      where: { workspaceId: seed.workspaceAId },
    });

    if (workspaceASub?.stripeCustomerId) {
      const resInvoices = await app.inject({
        method: 'GET',
        url: `/api/v1/workspaces/${seed.workspaceAId}/billing/invoices?page=1&limit=10`,
        headers: { authorization: `Bearer ${tokenOwnerA}` },
      });
      assert(resInvoices.statusCode === 200, 'OWNER obtém faturas (200 OK)');
      const body = JSON.parse(resInvoices.payload);
      assert(Array.isArray(body.items), 'items é um array');
      assert(typeof body.pagination?.total === 'number', 'pagination.total presente');
      assert(body.pagination?.page === 1, 'pagination.page correto');
      assert(body.pagination?.limit === 10, 'pagination.limit padrão aplicado');
      if (body.items.length > 0) {
        const first = body.items[0];
        assert(typeof first?.id === 'string' && first.id.length > 0, 'item contém id');
        assert(typeof first?.createdAt === 'string', 'item contém createdAt');
        assert(typeof first?.amount === 'number', 'item contém amount (número, centavos)');
        assert(typeof first?.currency === 'string' && first.currency === 'brl', 'item contém currency brl');
        assert(typeof first?.status === 'string', 'item contém status');
      } else {
        console.log('    ℹ️ Nenhuma fatura retornada — porém endpoint respondeu de forma válida.');
      }

      // Validação de query inválida (limit acima do máximo) -> 422
      const resBadLimit = await app.inject({
        method: 'GET',
        url: `/api/v1/workspaces/${seed.workspaceAId}/billing/invoices?limit=999`,
        headers: { authorization: `Bearer ${tokenOwnerA}` },
      });
      assert(resBadLimit.statusCode === 422, 'limit acima de 100 retorna 422 (validação)');
    } else {
      console.log('    ℹ️ Workspace A sem stripeCustomerId — pulando cenário de lista com faturas.');
    }

    // SUPER_ADMIN também pode consultar faturas
    const resSuperAdmin = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${seed.workspaceAId}/billing/invoices`,
      headers: { authorization: `Bearer ${tokenSuperAdmin}` },
    });
    assert(resSuperAdmin.statusCode === 200, 'SUPER_ADMIN obtém faturas (200 OK)');
  } finally {
    await app.close();
    await teardownIntegrationTest();
  }

  const elapsed = Date.now() - startTime;
  console.log('\n════════════════════════════════════════════════════════════');
  console.log('📊 RESULTADO FINAL DOS TESTES DE HISTÓRICO DE FATURAS');
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

  console.log('\n🎉 Todos os testes de histórico de faturas passaram com 100% de sucesso!');
  process.exit(0);
}

runBillingInvoicesTestSuite().catch((err) => {
  console.error('Erro fatal na suíte de histórico de faturas:', err);
  process.exit(1);
});
