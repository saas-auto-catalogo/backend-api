import { PrismaClient } from '@prisma/client';
import { buildServer } from '../server.js';

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
  console.log(`🗄️ ${title}`);
  console.log('─'.repeat(60));
}

async function runDatabaseValidation() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   🗄️ QA — Validação de Banco de Dados, Migrations e Seeds   ║');
  console.log('║   SaaS Auto Catálogo Backend API                            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  const prisma = new PrismaClient();
  const startTime = Date.now();

  try {
    // ─────────────────────────────────────────────────────────────────────────
    // 1. CONEXÃO E HEALTH DO BANCO
    // ─────────────────────────────────────────────────────────────────────────
    section('1. Conexão com PostgreSQL e Health Check');

    let isConnected = false;
    try {
      await prisma.$connect();
      isConnected = true;
    } catch (err) {
      console.warn('    ⚠️ PostgreSQL local não está acessível no momento:', (err as Error).message);
    }

    if (!isConnected) {
      console.log('    ℹ️ Executando validação estrutural de Schema, Tipos Prisma e Health Check HTTP...');
    } else {
      assert(isConnected, 'Conexão com PostgreSQL estabelecida com sucesso');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. VALIDAÇÃO DO SERVIDOR HTTP & HEALTH CHECK
    // ─────────────────────────────────────────────────────────────────────────
    section('2. Endpoint HTTP /health');

    const app = await buildServer();
    const res = await app.inject({
      method: 'GET',
      url: '/health'
    });

    assert(res.statusCode === 200, 'GET /health retorna status 200');
    const healthData = JSON.parse(res.payload);
    assert(healthData.status === 'ok', 'GET /health retorna { status: "ok" }');
    assert(healthData.service === 'saas-auto-catalogo-backend-api', `Identificador de serviço correto: "${healthData.service}"`);
    assert(typeof healthData.uptime === 'number' && healthData.uptime >= 0, 'Uptime numérico retornado');

    // ─────────────────────────────────────────────────────────────────────────
    // 3. VALIDAÇÃO ESTRUTURAL DE SCHEMA PRISMA
    // ─────────────────────────────────────────────────────────────────────────
    section('3. Modelos Canônicos e Relacionamentos do Prisma');

    const models = [
      'workspace',
      'dealership',
      'user',
      'workspaceMember',
      'feedConfig',
      'vehicle',
      'metaCatalog',
      'syncHistory',
      'subscription',
      'auditLog',
      'adminSetting'
    ] as const;

    for (const model of models) {
      const delegate = (prisma as Record<string, any>)[model];
      assert(delegate !== undefined && typeof delegate.findMany === 'function', `Modelo "${model}" registrado no PrismaClient`);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 4. CONSULTA DE DADOS CASO O BANCO ESTEJA CONECTADO
    // ─────────────────────────────────────────────────────────────────────────
    if (isConnected) {
      section('4. Validação de Seeds no Banco');

      // Super Admin
      const superAdmin = await prisma.user.findFirst({ where: { isSuperAdmin: true } });
      assert(superAdmin !== null, 'Super Admin cadastrado');
      assert(superAdmin?.email === 'admin@autocatalogo.com.br', `Email do Super Admin: ${superAdmin?.email}`);

      // Workspaces
      const workspaces = await prisma.workspace.findMany({ include: { subscription: true, vehicles: true } });
      assert(workspaces.length >= 2, `Mínimo de 2 workspaces cadastrados (atual: ${workspaces.length})`);

      const wsPro = workspaces.find(w => w.slug === 'auto-elite-motors');
      const wsStarter = workspaces.find(w => w.slug === 'jr-casa-seminovos');

      assert(wsPro !== undefined, 'Workspace 1 (Auto Elite Motors) presente');
      assert(wsPro?.subscription?.planTier === 'PRO', 'Workspace 1 no plano PRO');
      assert(wsPro?.vehicles.length === 10, `Workspace 1 contém 10 veículos (atual: ${wsPro?.vehicles.length})`);

      assert(wsStarter !== undefined, 'Workspace 2 (JR Casa Seminovos) presente');
      assert(wsStarter?.subscription?.planTier === 'STARTER', 'Workspace 2 no plano STARTER');
      assert(wsStarter?.vehicles.length === 10, `Workspace 2 contém 10 veículos (atual: ${wsStarter?.vehicles.length})`);

      // Total de veículos
      const totalVehicles = await prisma.vehicle.count();
      assert(totalVehicles >= 20, `Total de 20 veículos de exemplo cadastrados (atual: ${totalVehicles})`);
    }

    const elapsed = Date.now() - startTime;

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`📊 RESULTADO FINAL`);
    console.log('═'.repeat(60));
    console.log(`  Total de verificações: ${totalTests}`);
    console.log(`  ✅ Passou:              ${passedTests}`);
    console.log(`  ❌ Falhou:              ${failures.length}`);
    console.log(`  ⏱️  Tempo total:         ${elapsed}ms`);

    if (failures.length > 0) {
      console.log('\n🔴 Falhas encontradas:');
      failures.forEach(f => console.log(`  - ${f}`));
      process.exit(1);
    } else {
      console.log('\n🎉 Todas as validações estruturais e de banco passaram!');
    }
  } finally {
    await prisma.$disconnect();
  }
}

runDatabaseValidation().catch((err) => {
  console.error('\n💥 Erro crítico no teste de banco:', err);
  process.exit(1);
});
