import { readFileSync } from 'fs';
import { resolve } from 'path';
import { validateMetaDAAVehicle, MetaDAAVehicle } from '../validators/metaCatalogValidator.js';

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
  console.log(`🌐 ${title}`);
  console.log('─'.repeat(60));
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERFACE: Schema de Vehicle da API 4boss (Base44)
// ─────────────────────────────────────────────────────────────────────────────

interface FourBossVehicle {
  id: string;
  vid: string;
  urlSlug: string;
  brand: string;
  model: string;
  short?: string;
  display?: string;
  version?: string;
  year: string;  // ex: "2025/2026"
  km: string;    // ex: "4.686"
  kmRaw: number;
  price: string; // ex: "489.700"
  priceRaw: number;
  color: string;
  corExterna?: string;
  corInterna?: string;
  transmission: string;
  fuel: string;
  doors: string;
  image: string;
  heroImage?: string;
  photos: string[];
  options?: string[];
  armored?: boolean;
  plate?: string;
  tags?: string[];
}

interface FourBossResponse {
  source: string;
  url: string;
  vehicles: FourBossVehicle[];
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERFACE: Schema de Vehicle da API JR Casa Seminovos (Spice Digital)
// ─────────────────────────────────────────────────────────────────────────────

interface JrcaGalleryImage {
  id: false | number;
  url: string;
  full: string;
  alt: string;
  srcset: string;
}

interface JrcaVehicle {
  id: number;
  title: string;
  slug: string;
  brand: string;
  model: string;
  version: string;
  versionOriginal?: string;
  year: { one: number; two: number };
  km: number;
  fuel: string;
  exchange: string;
  price: number;
  priceOnRequest: boolean;
  armored: boolean;
  warranty: boolean;
  highlight: boolean;
  preparation?: boolean;
  galleryMedium: JrcaGalleryImage[];
  gallerySmall?: JrcaGalleryImage[];
}

interface JrcaResponse {
  source: string;
  url: string;
  total: number;
  pages: number;
  page: number;
  perPage: number;
  vehicles: JrcaVehicle[];
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILITÁRIOS DE MAPEAMENTO
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mapeia um veículo da API 4boss para o schema interno + Meta DAA.
 */
function map4BossToMetaDAA(v: FourBossVehicle): MetaDAAVehicle {
  const year = v.year.split('/')[0].trim();
  const title = `${v.brand} ${v.model} ${v.version || ''}`.trim().substring(0, 150);
  return {
    'g:vehicle_id': v.id,
    'g:title': title,
    'g:price': `${v.priceRaw.toFixed(2)} BRL`,
    'g:availability': 'in stock',
    'g:image_link': v.image,
    'g:year': year,
    'g:make': v.brand,
    'g:model': v.short || v.model,
    'g:mileage': `${v.kmRaw} km`,
    'g:condition': 'used',
    'g:color': v.color,
  };
}

/**
 * Mapeia um veículo da API JR Casa Seminovos para o schema interno + Meta DAA.
 */
function mapJrcaToMetaDAA(v: JrcaVehicle): MetaDAAVehicle {
  const heroImage = v.galleryMedium?.[0]?.url ?? '';
  return {
    'g:vehicle_id': String(v.id),
    'g:title': v.title.substring(0, 150),
    'g:price': v.priceOnRequest ? '0.00 BRL' : `${v.price.toFixed(2)} BRL`,
    'g:availability': 'in stock',
    'g:image_link': heroImage,
    'g:year': String(v.year.one),
    'g:make': v.brand,
    'g:model': v.model,
    'g:mileage': `${v.km} km`,
    'g:condition': 'used',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TESTES — 4boss
// ─────────────────────────────────────────────────────────────────────────────

async function test4BossEndpointFixture() {
  section('4boss API — Validação do Schema e Mapeamento Meta DAA');

  const fixturesDir = resolve(process.cwd(), 'src/tests/fixtures');
  const raw: FourBossResponse = JSON.parse(readFileSync(resolve(fixturesDir, 'vehicles-4boss.json'), 'utf-8'));

  // Metadados da resposta
  assert(raw.source === '4boss', `source = "${raw.source}"`);
  assert(typeof raw.url === 'string' && raw.url.startsWith('https://'), `url HTTPS válida: ${raw.url}`);
  assert(Array.isArray(raw.vehicles) && raw.vehicles.length > 0, `${raw.vehicles.length} veículos na fixture`);

  // Validação de cada veículo
  let validCount = 0;
  let totalPrice = 0;

  for (const v of raw.vehicles) {
    // Campos obrigatórios da API
    assert(typeof v.id === 'string' && v.id.length > 0, `Veículo ${v.id}: campo "id" presente`);
    assert(typeof v.brand === 'string' && v.brand.length > 0, `Veículo ${v.short || v.id}: brand presente`);
    assert(typeof v.priceRaw === 'number' && v.priceRaw > 0, `Veículo ${v.short || v.id}: priceRaw > 0 = ${v.priceRaw}`);
    assert(typeof v.kmRaw === 'number' && v.kmRaw >= 0, `Veículo ${v.short || v.id}: kmRaw >= 0 = ${v.kmRaw}`);
    assert(v.image.startsWith('https://'), `Veículo ${v.short || v.id}: image HTTPS`);
    assert(Array.isArray(v.photos) && v.photos.length > 0, `Veículo ${v.short || v.id}: ${v.photos.length} fotos`);

    // Mapeamento Meta DAA
    const mapped = map4BossToMetaDAA(v);
    const result = validateMetaDAAVehicle(mapped);
    if (result.valid) validCount++;
    assert(result.valid, `Veículo 4boss "${v.short}" mapeado → Meta DAA válido`);

    totalPrice += v.priceRaw;
  }

  const avgPrice = totalPrice / raw.vehicles.length;
  console.log(`    📊 Preço médio da fixture: R$ ${avgPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
  console.log(`    📊 Taxa de conformidade Meta DAA: ${(validCount / raw.vehicles.length * 100).toFixed(0)}%`);
}

// ─────────────────────────────────────────────────────────────────────────────
// TESTES — JR Casa Seminovos
// ─────────────────────────────────────────────────────────────────────────────

async function testJrcaEndpointFixture() {
  section('JR Casa Seminovos API (Spice Digital) — Validação de Schema e Paginação');

  const fixturesDir = resolve(process.cwd(), 'src/tests/fixtures');
  const raw: JrcaResponse = JSON.parse(readFileSync(resolve(fixturesDir, 'vehicles-jrcaseminovos.json'), 'utf-8'));

  // Metadados de paginação
  assert(raw.source === 'jrcaseminovos', `source = "${raw.source}"`);
  assert(typeof raw.total === 'number' && raw.total > 0, `total > 0: ${raw.total}`);
  assert(typeof raw.pages === 'number' && raw.pages > 0, `pages > 0: ${raw.pages}`);
  assert(raw.page === 1, `página atual = 1`);
  assert(raw.perPage === 12, `perPage = 12`);
  assert(Array.isArray(raw.vehicles) && raw.vehicles.length > 0 && raw.vehicles.length <= raw.perPage, `${raw.vehicles.length} veículos na fixture (≤ perPage)`);

  // Cálculo de páginas
  const expectedPages = Math.ceil(raw.total / raw.perPage);
  assert(raw.pages === expectedPages, `pages calculado corretamente: ceil(${raw.total}/${raw.perPage}) = ${expectedPages}`);

  let validCount = 0;

  for (const v of raw.vehicles) {
    // Schema obrigatório
    assert(typeof v.id === 'number', `Veículo ${v.id}: id numérico`);
    assert(typeof v.brand === 'string' && v.brand.length > 0, `Veículo ${v.id}: brand presente = ${v.brand}`);
    assert(typeof v.price === 'number' && v.price > 0, `Veículo ${v.id}: price > 0 = ${v.price}`);
    assert(typeof v.km === 'number' && v.km >= 0, `Veículo ${v.id}: km >= 0 = ${v.km}`);
    assert(
      typeof v.year === 'object' && typeof v.year.one === 'number' && typeof v.year.two === 'number',
      `Veículo ${v.id}: year {one: ${v.year.one}, two: ${v.year.two}}`
    );
    assert(v.year.two >= v.year.one, `Veículo ${v.id}: year.two (${v.year.two}) >= year.one (${v.year.one})`);
    assert(Array.isArray(v.galleryMedium) && v.galleryMedium.length > 0, `Veículo ${v.id}: ${v.galleryMedium.length} fotos`);

    const heroUrl = v.galleryMedium[0]?.url;
    assert(typeof heroUrl === 'string' && heroUrl.startsWith('https://'), `Veículo ${v.id}: heroImage HTTPS`);

    // Mapeamento Meta DAA
    const mapped = mapJrcaToMetaDAA(v);
    const result = validateMetaDAAVehicle(mapped);
    if (result.valid) validCount++;

    // Veículos com priceOnRequest têm preço 0 (esperado inválido)
    if (v.priceOnRequest) {
      assert(!result.valid, `Veículo ${v.id} (price-on-request): inelegível para Meta DAA (esperado)`);
    } else {
      assert(result.valid, `Veículo ${v.id} "${v.title.substring(0, 40)}..." → Meta DAA válido`);
    }
  }

  console.log(`    📊 Taxa de conformidade Meta DAA: ${(validCount / raw.vehicles.length * 100).toFixed(0)}%`);
}

// ─────────────────────────────────────────────────────────────────────────────
// RUNNER
// ─────────────────────────────────────────────────────────────────────────────

async function runVehicleEndpointTests() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   🌐 Testes de Integração — Endpoints de Veículos           ║');
  console.log('║   4boss (Base44) & JR Casa Seminovos (Spice Digital)        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  await test4BossEndpointFixture();
  await testJrcaEndpointFixture();

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`📊 RESULTADO`);
  console.log('═'.repeat(60));
  console.log(`  Total: ${totalTests} | ✅ ${passedTests} | ❌ ${failures.length}`);

  if (failures.length > 0) {
    console.log('\n🔴 Falhas:');
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  } else {
    console.log('\n🎉 Todos os testes de endpoints passaram!');
  }
}

runVehicleEndpointTests().catch((err) => {
  console.error('\n💥 Erro crítico:', err);
  process.exit(1);
});
