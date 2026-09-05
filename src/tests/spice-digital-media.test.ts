import assert from 'node:assert/strict';
import { AutoMatchingEngine } from '../modules/normalization/auto-matching.engine.js';
import { StockDiffEngine } from '../modules/stock-diff/stock-diff.engine.js';
import { VehicleStatus } from '@prisma/client';

console.log('🧪 Iniciando Testes Automatizados de Mídia para Spice Digital (Issue #92)...\n');

const SPICE_WARNING = 'Veículo sem imagens válidas em HTTPS (inelegível para o catálogo do Meta Ads).';

// 1. Teste com galleryMedium [{ url, full, alt }]
console.log('📸 1. Teste de extração via galleryMedium:');
const vehicleGalleryMedium = {
  id: '107379',
  title: 'BYD Song Pro GL 1.5 16V Aut. Híbrido',
  brand: 'BYD',
  model: 'Song Pro',
  version: 'GL 1.5 16V Aut. Híbrido',
  price: '169990',
  year: { one: 2026, two: 2027 },
  slug: 'byd-song-pro-gl-1-5-16v-aut-hibrido/107379',
  galleryMedium: [
    {
      id: false,
      url: 'https://cdn.spicedigital.com.br/vehicles/36/images/107379/spice-jrca-veiculos-a0767f0b-91b721.png',
      full: 'https://cdn.spicedigital.com.br/vehicles/36/images/107379/spice-jrca-veiculos-a0767f0b-91b721.png',
      alt: 'BYD Song Pro'
    }
  ]
};

const norm1 = AutoMatchingEngine.normalize(vehicleGalleryMedium, {
  workspaceId: 'ws-spice-test',
  fallbackBaseUrl: 'https://www.jrcaseminovos.com.br'
});

assert.equal(norm1.eligibleForMetaAds, true, 'Deve ser elegível para Meta Ads');
assert.ok(norm1.heroImageUrl.startsWith('https://cdn.spicedigital.com.br/'), 'heroImageUrl deve apontar para o CDN');
assert.equal(norm1.images.length, 1, 'Deve conter 1 imagem');
assert.ok(!norm1.validationWarnings.includes(SPICE_WARNING), 'Não deve gerar aviso de falta de imagens');
assert.equal(
  norm1.canonicalUrl,
  'https://www.jrcaseminovos.com.br/veiculo/byd-song-pro-gl-1-5-16v-aut-hibrido/107379',
  'URL canônica Spice Digital deve usar o formato oficial /veiculo/:slug'
);
console.log('  ✅ galleryMedium extraído com sucesso, heroImageUrl válida e veículo elegível.');
console.log(`  ✅ URL canônica: ${norm1.canonicalUrl}`);

// 2. Teste com gallerySmall como fallback
console.log('\n📸 2. Teste de extração via gallerySmall (quando galleryMedium ausente):');
const vehicleGallerySmall = {
  id: '107380',
  title: 'Toyota Corolla Cross XRE',
  brand: 'Toyota',
  model: 'Corolla Cross',
  version: 'XRE 2.0',
  price: '149900',
  year: { one: 2024, two: 2025 },
  gallerySmall: [
    {
      url: 'https://cdn.spicedigital.com.br/vehicles/36/images/107380/thumb.jpg',
      full: 'https://cdn.spicedigital.com.br/vehicles/36/images/107380/full.jpg'
    }
  ]
};

const norm2 = AutoMatchingEngine.normalize(vehicleGallerySmall);
assert.equal(norm2.eligibleForMetaAds, true, 'Deve ser elegível via gallerySmall');
assert.equal(norm2.heroImageUrl, 'https://cdn.spicedigital.com.br/vehicles/36/images/107380/full.jpg');
assert.ok(!norm2.validationWarnings.includes(SPICE_WARNING), 'Não deve gerar aviso de falta de imagens');
console.log('  ✅ gallerySmall extraído com sucesso com priorização de URL full.');

// 3. Teste com galleryLarge / galeria
console.log('\n📸 3. Teste de extração via galeria / galleryLarge:');
const vehicleGaleria = {
  id: '107381',
  title: 'Honda HR-V EXL',
  brand: 'Honda',
  model: 'HR-V',
  version: 'EXL 1.5',
  price: '139900',
  galeria: [
    'https://cdn.spicedigital.com.br/vehicles/36/images/107381/foto1.jpg',
    'https://cdn.spicedigital.com.br/vehicles/36/images/107381/foto2.jpg'
  ]
};

const norm3 = AutoMatchingEngine.normalize(vehicleGaleria);
assert.equal(norm3.eligibleForMetaAds, true, 'Deve ser elegível via galeria');
assert.equal(norm3.images.length, 2, 'Deve conter 2 fotos');
assert.equal(norm3.heroImageUrl, 'https://cdn.spicedigital.com.br/vehicles/36/images/107381/foto1.jpg');
console.log('  ✅ galeria de strings extraída com sucesso.');

// 4. Teste de veículo sem nenhuma foto (deve manter aviso e bloquear elegibilidade)
console.log('\n⚠️ 4. Teste de veículo sem fotos (validação de segurança):');
const vehicleNoPhotos = {
  id: '107382',
  title: 'Veículo Sem Foto',
  brand: 'Fiat',
  model: 'Pulse',
  version: 'Drive',
  price: '89900'
};

const normNoPhotos = AutoMatchingEngine.normalize(vehicleNoPhotos);
assert.equal(normNoPhotos.eligibleForMetaAds, false, 'Veículo sem fotos não pode ser elegível para Meta DAA');
assert.ok(
  normNoPhotos.validationWarnings.includes(SPICE_WARNING),
  'Deve conter o aviso explícito de ausência de imagens válidas em HTTPS'
);
console.log('  ✅ Validação de segurança confirmada: veículo sem fotos bloqueado corretamente.');

// 5. Teste de detecção de diff (transição de sem imagem para com imagem)
console.log('\n🔄 5. Teste de diff: transição de heroImageUrl null -> URL válida:');
const existingVehicleInDb = {
  id: 'db-v-001',
  externalId: '107379',
  make: 'BYD',
  model: 'Song Pro',
  title: 'BYD Song Pro GL 1.5 16V Aut. Híbrido',
  price: 169990,
  promotionalPrice: null,
  mileage: 0,
  heroImageUrl: null,
  status: VehicleStatus.AVAILABLE,
  rawPayloadHash: 'hash-antigo',
  eligibleForMetaAds: false,
  canonicalUrl: 'https://www.jrcaseminovos.com.br/byd-song-pro-gl-1-5-16v-aut-hibrido/107379'
};

const diff = StockDiffEngine.computeDiff([existingVehicleInDb as any], [norm1]);
assert.equal(diff.toCreate.length, 0, 'Não deve criar novo');
assert.equal(diff.toUpdate.length, 1, 'Deve marcar para atualização');
assert.equal(diff.toUpdate[0].existingId, 'db-v-001', 'ID correto para update');
assert.ok(
  diff.toUpdate[0].changedFields.includes('heroImageUrl'),
  'Deve acusar mudança no campo heroImageUrl'
);
assert.ok(
  diff.toUpdate[0].changedFields.some((f) => f.includes('eligibleForMetaAds')),
  'Deve acusar mudança em eligibleForMetaAds'
);
assert.ok(
  diff.toUpdate[0].changedFields.some((f) => f.includes('canonicalUrl')),
  'Deve acusar mudança em canonicalUrl (formato /veiculo/:slug)'
);
console.log('  ✅ Motor de Diff detectou transição de foto, elegibilidade e canonicalUrl com sucesso.');

console.log('\n🎉 Todos os testes de mídia para Spice Digital passaram com 100% de sucesso!');
