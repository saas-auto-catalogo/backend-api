import { Readable } from 'stream';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { SyncStatus, FeedSourceType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { ingestFeedStream } from '../modules/feeds/feed-format.parser.js';
import { AutoMatchingEngine } from '../modules/normalization/auto-matching.engine.js';
import { StockSyncService } from '../modules/stock-diff/stock-sync.service.js';

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
  console.log(`🛠️  ${title}`);
  console.log('─'.repeat(60));
}

function streamOf(buffer: Buffer): Readable {
  return Readable.from(buffer);
}

const fixturesDir = resolve(process.cwd(), 'src/tests/fixtures');
const jsonFixture = readFileSync(resolve(fixturesDir, 'vehicles-4boss.json'));
const xmlFixture = readFileSync(resolve(fixturesDir, 'autocerto-sample.xml'));

async function runFeedIngestionTestSuite() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   🛠️  QA — Ingestão de Feed (JSON 4boss / XML Autocerto)     ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  const startTime = Date.now();

  // ─────────────────────────────────────────────────────────────────────────
  // 1. Ramo de ingestão JSON (4boss / Base44) — sem BullMQ
  // ─────────────────────────────────────────────────────────────────────────
  section('1. Ingestão JSON 4boss via ingestFeedStream');

  const jsonRes = await ingestFeedStream(
    streamOf(jsonFixture),
    'application/json; charset=utf-8'
  );

  assert(jsonRes.format === 'json', 'Formato detectado como json', jsonRes.format);
  assert(
    jsonRes.rawVehicles.length === 3,
    `Raw vehicles = 3 (atual: ${jsonRes.rawVehicles.length})`,
    String(jsonRes.rawVehicles.length)
  );

  const normalizedJson = jsonRes.rawVehicles.map((raw) =>
    AutoMatchingEngine.normalize(raw, {
      workspaceId: 'ws-test',
      sourceType: 'BASE44',
      fallbackBaseUrl: 'https://www.4boss.com.br/api/vehicles',
    })
  );
  assert(
    normalizedJson.every((v) => v.externalId && v.make !== 'OUTRO' && v.price > 0),
    'Todos os veículos 4boss foram normalizados (id, marca, preço)'
  );
  assert(
    normalizedJson[0].externalId === '6a8f5a9e935cc12118419802',
    'externalId derivado do campo vid',
    normalizedJson[0].externalId
  );
  assert(
    normalizedJson[0].canonicalUrl === 'https://www.4boss.com.br/v/MERCEDES-BENZ-GLC-300-2025',
    'canonicalUrl normalizada para /v/:urlSlug (4boss)',
    normalizedJson[0].canonicalUrl
  );
  assert(
    normalizedJson.every(
      (v) => v.canonicalUrl && !v.canonicalUrl.includes('/api/vehicles/') && !v.canonicalUrl.includes('/veiculo/')
    ),
    'Nenhum canonicalUrl contém caminho legado /api/vehicles/ ou /veiculo/'
  );

  // ─────────────────────────────────────────────────────────────────────────
  // 2. Ramo de ingestão XML (Autocerto) — regressão
  // ─────────────────────────────────────────────────────────────────────────
  section('2. Ingestão XML Autocerto via ingestFeedStream (regressão)');

  const xmlRes = await ingestFeedStream(
    streamOf(xmlFixture),
    'application/xml; charset=utf-8'
  );

  assert(xmlRes.format === 'xml', 'Formato detectado como xml', xmlRes.format);
  assert(
    xmlRes.rawVehicles.length > 0,
    `XML produziu veículos (atual: ${xmlRes.rawVehicles.length})`,
    String(xmlRes.rawVehicles.length)
  );

  // ─────────────────────────────────────────────────────────────────────────
  // 3. JSON inválido (sem chave vehicles) rejeitado no ramo JSON
  // ─────────────────────────────────────────────────────────────────────────
  section('3. JSON sem chave vehicles é rejeitado');

  const invalidJson = Buffer.from(JSON.stringify({ hello: 'world' }));
  let jsonError = '';
  try {
    await ingestFeedStream(streamOf(invalidJson), 'application/json');
  } catch (err) {
    jsonError = (err as Error).message;
  }
  assert(
    jsonError.includes('Formato não suportado'),
    'JSON sem vehicles lança erro amigável',
    jsonError
  );

  // ─────────────────────────────────────────────────────────────────────────
  // 4. Sincronização de fato no banco (condicional) — 4boss cria veículos
  // ─────────────────────────────────────────────────────────────────────────
  section('4. Sincronização real no banco (JSON 4boss cria veículos)');

  let dbAvailable = false;
  try {
    await prisma.$connect();
    dbAvailable = true;
  } catch (err) {
    console.warn(`    ⚠️ PostgreSQL local indisponível — pulando: ${(err as Error).message}`);
  }

  if (dbAvailable) {
    const workspace = await prisma.workspace.create({
      data: { name: 'Feed Ingestion Test WS', slug: `feed-ingestion-${Date.now()}` },
    });
    const dealership = await prisma.dealership.create({
      data: { workspaceId: workspace.id, tradeName: 'Feed Ingestion Test Dealership' },
    });
    const feed = await prisma.feedConfig.create({
      data: {
        workspaceId: workspace.id,
        dealershipId: dealership.id,
        sourceType: FeedSourceType.BASE44,
        feedUrl: 'http://www.4boss.localhost/api/vehicles',
        activeTokenHash: 'test-token-hash',
        tokenSalt: 'test-salt',
      },
    });

    try {
      const normalized = jsonRes.rawVehicles.map((raw) =>
        AutoMatchingEngine.normalize(raw, {
          workspaceId: workspace.id,
          feedConfigId: feed.id,
          dealershipId: dealership.id,
          sourceType: 'BASE44',
          fallbackBaseUrl: feed.feedUrl,
        })
      );

      const syncService = new StockSyncService();
      const sync = await syncService.syncStock(workspace.id, feed.id, normalized, {
        dealershipId: dealership.id,
      });

      assert(
        sync.diff.totalCreated === 3,
        `totalCreated = 3 (atual: ${sync.diff.totalCreated})`,
        String(sync.diff.totalCreated)
      );
      assert(
        sync.status === SyncStatus.SUCCESS,
        'lastSyncStatus = SUCCESS após sync',
        String(sync.status)
      );

      const createdVehicles = await prisma.vehicle.count({
        where: { workspaceId: workspace.id, feedConfigId: feed.id },
      });
      assert(
        createdVehicles === 3,
        `3 veículos 4boss persistidos no DB (atual: ${createdVehicles})`,
        String(createdVehicles)
      );

      const feedAfter = await prisma.feedConfig.findUnique({ where: { id: feed.id } });
      assert(
        feedAfter?.lastSyncStatus === SyncStatus.SUCCESS,
        `FeedConfig.lastSyncStatus === SUCCESS (atual: ${feedAfter?.lastSyncStatus})`,
        String(feedAfter?.lastSyncStatus)
      );
    } finally {
      await prisma.vehicle.deleteMany({ where: { workspaceId: workspace.id } });
      await prisma.syncHistory.deleteMany({ where: { workspaceId: workspace.id } });
      await prisma.feedConfig.deleteMany({ where: { workspaceId: workspace.id } });
      await prisma.dealership.deleteMany({ where: { workspaceId: workspace.id } });
      await prisma.workspace.delete({ where: { id: workspace.id } });
    }
  } else {
    console.log('    ℹ️ Pulando assertions de banco — infra PostgreSQL não disponível.');
  }

  await prisma.$disconnect().catch(() => undefined);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`Resultado: ${passedTests}/${totalTests} testes passaram (${elapsed}s)`);

  if (failures.length > 0) {
    console.error('\nFalhas:');
    failures.forEach((f) => console.error(`  - ${f}`));
    process.exit(1);
  }

  console.log('\n✅ Todos os testes de ingestão de feed passaram!');
  process.exit(0);
}

runFeedIngestionTestSuite().catch((err) => {
  console.error('Erro fatal na suíte de testes:', err);
  process.exit(1);
});
