import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Readable } from 'stream';
import { XmlStreamParser } from '../modules/xml-ingestion/stream-parser.js';
import {
  validateMetaDAABatch,
  validateMetaDAAVehicle,
  MetaDAAVehicle,
  formatMetaPrice,
  formatMetaMileage,
} from './validators/metaCatalogValidator.js';
import {
  generateXmlPayload,
  generateXmlStream,
  LOAD_BENCHMARKS,
} from './generators/xmlLoadGenerator.js';

// ─────────────────────────────────────────────────────────────────────────────
// Utilitários de teste
// ─────────────────────────────────────────────────────────────────────────────

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
  console.log(`🧪 ${title}`);
  console.log('─'.repeat(60));
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. VALIDADOR META DAA
// ─────────────────────────────────────────────────────────────────────────────

async function testMetaDAAValidator() {
  section('Validador Meta DAA — Schema e Formatos');

  // Veículo 100% válido
  const validVehicle: MetaDAAVehicle = {
    'g:vehicle_id': 'vc-001',
    'g:title': 'Toyota Corolla Cross XRE 2.0 Flex Aut. 2024',
    'g:price': '168900.00 BRL',
    'g:availability': 'in stock',
    'g:image_link': 'https://img.autocerto.com/veiculos/vc001/foto1.jpg',
    'g:year': '2024',
    'g:make': 'Toyota',
    'g:model': 'Corolla Cross',
    'g:mileage': '12500 km',
    'g:condition': 'used',
  };
  const r1 = validateMetaDAAVehicle(validVehicle);
  assert(r1.valid, 'Veículo válido passa na validação');
  assert(r1.errors.length === 0, 'Nenhum erro para veículo válido');

  // Preço zerado (inelegível)
  const zeroPriceVehicle = { ...validVehicle, 'g:vehicle_id': 'vc-002', 'g:price': '0.00 BRL' };
  const r2 = validateMetaDAAVehicle(zeroPriceVehicle);
  assert(!r2.valid, 'Preço zero é inválido');
  assert(r2.errors.some((e) => e.includes('zero')), 'Erro menciona preço zero');

  // Formato de preço inválido
  const invalidPriceVehicle = { ...validVehicle, 'g:vehicle_id': 'vc-003', 'g:price': 'R$ 168.900,00' };
  const r3 = validateMetaDAAVehicle(invalidPriceVehicle);
  assert(!r3.valid, 'Preço no formato BRL brasileiro é inválido para Meta DAA');

  // URL HTTP (não HTTPS)
  const httpImageVehicle = { ...validVehicle, 'g:vehicle_id': 'vc-004', 'g:image_link': 'http://img.autocerto.com/vc001/foto1.jpg' };
  const r4 = validateMetaDAAVehicle(httpImageVehicle);
  assert(!r4.valid, 'URL HTTP sem TLS é inválida');

  // Título acima de 150 chars
  const longTitleVehicle = { ...validVehicle, 'g:vehicle_id': 'vc-005', 'g:title': 'A'.repeat(151) };
  const r5 = validateMetaDAAVehicle(longTitleVehicle);
  assert(!r5.valid, 'Título acima de 150 chars é inválido');

  // Availability inválido
  const badAvailability = { ...validVehicle, 'g:vehicle_id': 'vc-006', 'g:availability': 'disponivel' };
  const r6 = validateMetaDAAVehicle(badAvailability);
  assert(!r6.valid, 'Availability "disponivel" (pt-BR) é inválido');

  // Ano inválido
  const badYear = { ...validVehicle, 'g:vehicle_id': 'vc-007', 'g:year': '24' };
  const r7 = validateMetaDAAVehicle(badYear);
  assert(!r7.valid, 'Ano com 2 dígitos é inválido');

  // Veículo sem imagem
  const noImage: MetaDAAVehicle = { ...validVehicle, 'g:vehicle_id': 'vc-008', 'g:image_link': '' };
  const r8 = validateMetaDAAVehicle(noImage);
  assert(!r8.valid, 'Veículo sem imagem é inválido');

  // IDs duplicados em batch
  const duplicate1 = { ...validVehicle, 'g:vehicle_id': 'same-id' };
  const duplicate2 = { ...validVehicle, 'g:vehicle_id': 'same-id', 'g:title': 'Outro Veículo' };
  const batchResult = validateMetaDAABatch([duplicate1, duplicate2]);
  assert(batchResult.invalid >= 1, 'Batch detecta IDs duplicados');
  assert(batchResult.conformanceRate < 100, 'Taxa de conformidade < 100% com duplicatas');

  // Formato de preço utilitário
  const priceStr = formatMetaPrice(16890000); // R$ 168.900,00
  assert(priceStr === '168900.00 BRL', `formatMetaPrice: ${priceStr} === "168900.00 BRL"`);

  // Formato de quilometragem utilitário
  const mileageStr = formatMetaMileage(12500);
  assert(mileageStr === '12500 km', `formatMetaMileage: ${mileageStr} === "12500 km"`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. PARSER SAX — FIXTURES DE DMSs REAIS
// ─────────────────────────────────────────────────────────────────────────────

async function testXmlParserWithRealFixtures() {
  section('Parser SAX — Fixtures XML de DMSs Reais');

  const fixturesDir = resolve(process.cwd(), 'src/tests/fixtures');

  // AutoCerto
  {
    const xml = readFileSync(resolve(fixturesDir, 'autocerto-sample.xml'));
    const stream = Readable.from(xml);
    const vehicles: Record<string, unknown>[] = [];
    const stats = await XmlStreamParser.parseStream(stream, async (v) => { vehicles.push(v); });
    assert(stats.totalProcessed === 2, `AutoCerto: parsed ${stats.totalProcessed} veículos (esperado: 2)`);
    assert(vehicles[0]?.codigo_veiculo === 'AC-84920', `AutoCerto: vehicle_id correto: ${vehicles[0]?.codigo_veiculo}`);
    assert(stats.durationMs < 200, `AutoCerto: parsing < 200ms (actual: ${stats.durationMs}ms)`);
  }

  // Altimus
  {
    const xml = readFileSync(resolve(fixturesDir, 'altimus-sample.xml'));
    const stream = Readable.from(xml);
    const vehicles: Record<string, unknown>[] = [];
    const stats = await XmlStreamParser.parseStream(stream, async (v) => { vehicles.push(v); }, { vehicleTagNames: ['veiculo'] });
    assert(stats.totalProcessed === 2, `Altimus: parsed ${stats.totalProcessed} veículos (esperado: 2)`);
    assert(stats.durationMs < 200, `Altimus: parsing < 200ms (actual: ${stats.durationMs}ms)`);
  }

  // Sisvag
  {
    const xml = readFileSync(resolve(fixturesDir, 'sisvag-sample.xml'));
    const stream = Readable.from(xml);
    const vehicles: Record<string, unknown>[] = [];
    const stats = await XmlStreamParser.parseStream(stream, async (v) => { vehicles.push(v); }, { vehicleTagNames: ['estoque_item'] });
    assert(stats.totalProcessed === 2, `Sisvag: parsed ${stats.totalProcessed} veículos (esperado: 2)`);
    assert(stats.durationMs < 200, `Sisvag: parsing < 200ms (actual: ${stats.durationMs}ms)`);
  }

  // BomControle
  {
    const xml = readFileSync(resolve(fixturesDir, 'bomcontrole-sample.xml'));
    const stream = Readable.from(xml);
    const vehicles: Record<string, unknown>[] = [];
    const stats = await XmlStreamParser.parseStream(stream, async (v) => { vehicles.push(v); }, { vehicleTagNames: ['anuncio'] });
    assert(stats.totalProcessed === 2, `BomControle: parsed ${stats.totalProcessed} veículos (esperado: 2)`);
    assert(stats.durationMs < 200, `BomControle: parsing < 200ms (actual: ${stats.durationMs}ms)`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. BENCHMARKS DE CARGA & STREAMING
// ─────────────────────────────────────────────────────────────────────────────

async function testLoadBenchmarks() {
  section('Benchmarks de Carga & Streaming Parser');

  // ─── 10 veículos (< 10ms) ────────────────────────────────────────────────
  {
    const xml = generateXmlPayload(LOAD_BENCHMARKS.SMALL);
    const stream = Readable.from(Buffer.from(xml));
    const start = Date.now();
    const stats = await XmlStreamParser.parseStream(stream, async () => {}, { vehicleTagNames: ['veiculo'] });
    const elapsed = Date.now() - start;
    assert(stats.totalProcessed === 10, `[10 veículos] Processados: ${stats.totalProcessed}`);
    assert(stats.durationMs < 50, `[10 veículos] Tempo parser interno < 50ms (actual: ${stats.durationMs}ms)`);
    console.log(`    ⏱️  Total wall-clock: ${elapsed}ms | Parser interno: ${stats.durationMs}ms`);
  }

  // ─── 500 veículos (< 200ms) ──────────────────────────────────────────────
  {
    const xml = generateXmlPayload(LOAD_BENCHMARKS.MEDIUM);
    const stream = Readable.from(Buffer.from(xml));
    const start = Date.now();
    const stats = await XmlStreamParser.parseStream(stream, async () => {}, { vehicleTagNames: ['veiculo'] });
    const elapsed = Date.now() - start;
    assert(stats.totalProcessed === 500, `[500 veículos] Processados: ${stats.totalProcessed}`);
    assert(stats.durationMs < 200, `[500 veículos] Tempo parser interno < 200ms (actual: ${stats.durationMs}ms)`);
    console.log(`    ⏱️  Total wall-clock: ${elapsed}ms | Parser interno: ${stats.durationMs}ms`);
  }

  // ─── 5.000 veículos via Streaming (< 1.000ms) ────────────────────────────
  {
    const stream = generateXmlStream(LOAD_BENCHMARKS.LARGE, { injectEdgeCases: true });
    const start = Date.now();
    let edgeCaseErrors = 0;
    const stats = await XmlStreamParser.parseStream(
      stream,
      async (v) => {
        // Verifica edge cases: preço "0.00" = inválido
        if (v.valor_venda === '0.00') edgeCaseErrors++;
      },
      { vehicleTagNames: ['veiculo'] }
    );
    const elapsed = Date.now() - start;
    assert(stats.totalProcessed === 5000, `[5.000 veículos] Processados: ${stats.totalProcessed}`);
    assert(stats.durationMs < 1000, `[5.000 veículos] Tempo parser interno < 1.000ms (actual: ${stats.durationMs}ms)`);
    assert(edgeCaseErrors >= 1, `[5.000 veículos] Edge cases detectados: ${edgeCaseErrors}`);
    console.log(`    ⏱️  Total wall-clock: ${elapsed}ms | Parser interno: ${stats.durationMs}ms`);
    console.log(`    ⚠️  Edge cases detectados: ${edgeCaseErrors}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. RESILIÊNCIA CONTRA DADOS MALFORMADOS
// ─────────────────────────────────────────────────────────────────────────────

async function testResilienceEdgeCases() {
  section('Resiliência — Dados Malformados e Caracteres Especiais');

  // Caractere & não escapado (deve ser sanitizado pelo stream sanitizer)
  const xmlWithAmpersand = `<?xml version="1.0" encoding="UTF-8"?>
<estoque>
  <veiculo>
    <codigo_veiculo>EDGE-001</codigo_veiculo>
    <marca>Toyota &amp; Honda</marca>
    <observacoes>Promoção Especial &amp; Frete Grátis</observacoes>
  </veiculo>
</estoque>`;
  const s1 = Readable.from(Buffer.from(xmlWithAmpersand));
  const v1: Record<string, unknown>[] = [];
  const r1 = await XmlStreamParser.parseStream(s1, async (v) => { v1.push(v); }, { vehicleTagNames: ['veiculo'] });
  assert(r1.totalProcessed === 1, 'Caractere &amp; escapado: 1 veículo parseado');
  assert(v1[0]?.codigo_veiculo === 'EDGE-001', 'Veículo com &amp; parseado corretamente');

  // XML com caracteres especiais UTF-8
  const xmlWithUnicode = `<?xml version="1.0" encoding="UTF-8"?>
<estoque>
  <veiculo>
    <codigo_veiculo>EDGE-002</codigo_veiculo>
    <marca>Citroën</marca>
    <modelo>Ë-C4</modelo>
    <observacoes>Título: "Veículo Élite" • Preço: R$ 89.900</observacoes>
  </veiculo>
</estoque>`;
  const s2 = Readable.from(Buffer.from(xmlWithUnicode, 'utf-8'));
  const v2: Record<string, unknown>[] = [];
  await XmlStreamParser.parseStream(s2, async (v) => { v2.push(v); }, { vehicleTagNames: ['veiculo'] });
  assert(v2[0]?.marca === 'Citroën', `UTF-8 preservado: marca = ${v2[0]?.marca}`);
  assert(v2[0]?.modelo === 'Ë-C4', `UTF-8 preservado: modelo = ${v2[0]?.modelo}`);

  // XML vazio (sem veículos)
  const emptyXml = `<?xml version="1.0" encoding="UTF-8"?><estoque></estoque>`;
  const s3 = Readable.from(Buffer.from(emptyXml));
  const r3 = await XmlStreamParser.parseStream(s3, async () => {}, { vehicleTagNames: ['veiculo'] });
  assert(r3.totalProcessed === 0, 'XML vazio: 0 veículos processados sem erro');

  // XML com tag aninhada de array de fotos
  const xmlWithArray = `<?xml version="1.0" encoding="UTF-8"?>
<estoque>
  <veiculo>
    <codigo_veiculo>EDGE-003</codigo_veiculo>
    <fotos>
      <foto>https://img.test.com/1.jpg</foto>
      <foto>https://img.test.com/2.jpg</foto>
      <foto>https://img.test.com/3.jpg</foto>
    </fotos>
  </veiculo>
</estoque>`;
  const s4 = Readable.from(Buffer.from(xmlWithArray));
  const v4: Record<string, unknown>[] = [];
  await XmlStreamParser.parseStream(s4, async (v) => { v4.push(v); }, { vehicleTagNames: ['veiculo'] });
  assert(v4.length === 1, 'Array de fotos: 1 veículo parseado');
  const fotos = (v4[0]?.fotos as Record<string, unknown>)?.foto;
  assert(Array.isArray(fotos), 'Fotos múltiplas convertidas para array');
  assert((fotos as unknown[]).length === 3, `Array de 3 fotos: ${(fotos as unknown[]).length}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. VALIDAÇÃO DE CONFORMIDADE COM FIXTURES JSON REAIS
// ─────────────────────────────────────────────────────────────────────────────

async function testRealApiFixtures() {
  section('Fixtures JSON de APIs Reais — 4boss & JR Casa Seminovos');

  const fixturesDir = resolve(process.cwd(), 'src/tests/fixtures');

  // ─── 4boss ───────────────────────────────────────────────────────────────
  const raw4boss = JSON.parse(readFileSync(resolve(fixturesDir, 'vehicles-4boss.json'), 'utf-8'));
  assert(Array.isArray(raw4boss.vehicles), '4boss: resposta contém array "vehicles"');
  assert(raw4boss.vehicles.length > 0, `4boss: ${raw4boss.vehicles.length} veículos na fixture`);

  const boss = raw4boss.vehicles[0];
  assert(typeof boss.id === 'string' && boss.id.length > 0, '4boss: campo "id" presente e não vazio');
  assert(typeof boss.brand === 'string', '4boss: campo "brand" presente');
  assert(typeof boss.model === 'string', '4boss: campo "model" presente');
  assert(typeof boss.priceRaw === 'number' && boss.priceRaw > 0, `4boss: priceRaw numérico > 0: ${boss.priceRaw}`);
  assert(typeof boss.kmRaw === 'number' && boss.kmRaw >= 0, `4boss: kmRaw numérico >= 0: ${boss.kmRaw}`);
  assert(typeof boss.image === 'string' && boss.image.startsWith('https://'), `4boss: image é URL HTTPS: ${boss.image.substring(0, 40)}...`);
  assert(Array.isArray(boss.photos) && boss.photos.length > 0, `4boss: ${boss.photos.length} fotos no array`);

  // Mapeamento para Meta DAA
  const yearPart = boss.year.split('/')[0];
  const mapped4BossVehicle: MetaDAAVehicle = {
    'g:vehicle_id': boss.id,
    'g:title': `${boss.brand} ${boss.model} ${boss.version || ''}`.substring(0, 150).trim(),
    'g:price': `${boss.priceRaw.toFixed(2)} BRL`,
    'g:availability': 'in stock',
    'g:image_link': boss.image,
    'g:year': yearPart,
    'g:make': boss.brand,
    'g:model': boss.short || boss.model,
    'g:mileage': `${boss.kmRaw} km`,
    'g:condition': 'used',
  };
  const v4boss = validateMetaDAAVehicle(mapped4BossVehicle);
  assert(v4boss.valid, `4boss → Meta DAA: veículo "${boss.short}" válido`);
  if (v4boss.warnings.length > 0) {
    console.log(`    ⚠️  Avisos: ${v4boss.warnings.join(', ')}`);
  }

  // ─── JR Casa Seminovos ────────────────────────────────────────────────────
  const rawJrca = JSON.parse(readFileSync(resolve(fixturesDir, 'vehicles-jrcaseminovos.json'), 'utf-8'));
  assert(Array.isArray(rawJrca.vehicles), 'JRCasa: resposta contém array "vehicles"');
  assert(rawJrca.vehicles.length > 0, `JRCasa: ${rawJrca.vehicles.length} veículos na fixture`);
  assert(typeof rawJrca.total === 'number', `JRCasa: campo "total" = ${rawJrca.total}`);
  assert(typeof rawJrca.pages === 'number', `JRCasa: campo "pages" = ${rawJrca.pages}`);

  const jrca = rawJrca.vehicles[0];
  assert(typeof jrca.id === 'number', `JRCasa: id numérico: ${jrca.id}`);
  assert(typeof jrca.brand === 'string', `JRCasa: brand presente: ${jrca.brand}`);
  assert(typeof jrca.model === 'string', `JRCasa: model presente: ${jrca.model}`);
  assert(typeof jrca.price === 'number' && jrca.price > 0, `JRCasa: price numérico > 0: ${jrca.price}`);
  assert(typeof jrca.km === 'number' && jrca.km >= 0, `JRCasa: km numérico >= 0: ${jrca.km}`);
  assert(
    typeof jrca.year === 'object' && typeof jrca.year.one === 'number',
    `JRCasa: year como objeto {one, two}: ${JSON.stringify(jrca.year)}`
  );
  assert(
    Array.isArray(jrca.galleryMedium) && jrca.galleryMedium.length > 0,
    `JRCasa: galleryMedium com ${jrca.galleryMedium.length} fotos`
  );

  // Mapeamento para Meta DAA
  const heroImage = jrca.galleryMedium[0]?.url;
  const mappedJrcaVehicle: MetaDAAVehicle = {
    'g:vehicle_id': String(jrca.id),
    'g:title': jrca.title.substring(0, 150),
    'g:price': `${jrca.price.toFixed(2)} BRL`,
    'g:availability': 'in stock',
    'g:image_link': heroImage || '',
    'g:year': String(jrca.year.one),
    'g:make': jrca.brand,
    'g:model': jrca.model,
    'g:mileage': `${jrca.km} km`,
    'g:condition': 'used',
  };
  const vJrca = validateMetaDAAVehicle(mappedJrcaVehicle);
  assert(vJrca.valid, `JRCasa → Meta DAA: veículo "${jrca.title}" válido`);
  if (vJrca.warnings.length > 0) {
    console.log(`    ⚠️  Avisos: ${vJrca.warnings.join(', ')}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// RUNNER PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

async function runQaSuite() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   🧪 QA Suite — DriveSync Backend API              ║');
  console.log('║   Bateria de Testes: Validador Meta DAA + Benchmarks XML     ║');
  console.log('║   + Fixtures Reais (4boss & JR Casa Seminovos)              ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  const suiteStart = Date.now();

  await testMetaDAAValidator();
  await testXmlParserWithRealFixtures();
  await testLoadBenchmarks();
  await testResilienceEdgeCases();
  await testRealApiFixtures();

  const elapsed = Date.now() - suiteStart;

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`📊 RESULTADO FINAL`);
  console.log('═'.repeat(60));
  console.log(`  Total de testes: ${totalTests}`);
  console.log(`  ✅ Passou:        ${passedTests}`);
  console.log(`  ❌ Falhou:        ${failures.length}`);
  console.log(`  ⏱️  Tempo total:   ${elapsed}ms`);

  if (failures.length > 0) {
    console.log('\n🔴 Falhas:');
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  } else {
    console.log('\n🎉 Todos os testes passaram com 100% de conformidade!');
  }
}

runQaSuite().catch((err) => {
  console.error('\n💥 Erro crítico na bateria de testes:', err);
  process.exit(1);
});
