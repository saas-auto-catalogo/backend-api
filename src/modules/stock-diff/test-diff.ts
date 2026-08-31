import { StockDiffEngine } from './stock-diff.engine.js';
import { AutoMatchingEngine } from '../normalization/index.js';
import { VehicleStatus } from '@prisma/client';

async function runDiffTests() {
  console.log('🧪 Iniciando Bateria de Testes do Motor de Diffs de Estoque...\n');

  // Payloads de amostra
  const payload1 = {
    id: 'vid-001',
    marca: 'Mercedes-Benz',
    modelo: 'GLC 300',
    versao: '2.0 MHEV AMG Line',
    ano: '2025/2026',
    preco: '489.700',
    km: '4.686',
    fotos: ['https://cdn.teste.com/foto1.jpg'],
    combustivel: 'Gasolina e elétrico',
    cambio: 'Automático'
  };

  const payload2 = {
    id: 'vid-002',
    marca: 'Porsche',
    modelo: '911',
    versao: 'Sport Classic',
    ano: '2022/2023',
    preco: '6.200.000',
    km: '333',
    fotos: ['https://cdn.teste.com/foto2.jpg'],
    combustivel: 'Gasolina',
    cambio: 'Manual'
  };

  const payload3 = {
    id: 'vid-003',
    marca: 'Toyota',
    modelo: 'Corolla Cross',
    versao: 'XRX Hybrid',
    ano: '2023/2024',
    preco: '178.900',
    km: '28.400',
    fotos: ['https://cdn.teste.com/foto3.jpg'],
    combustivel: 'Híbrido',
    cambio: 'CVT'
  };

  const v1 = AutoMatchingEngine.normalize(payload1);
  const v2 = AutoMatchingEngine.normalize(payload2);
  const v3 = AutoMatchingEngine.normalize(payload3);

  // ============================================================================
  // CENÁRIO 1: Ingestão Inicial (Banco Vazio)
  // ============================================================================
  console.log('📦 1. Teste: Ingestão Inicial (Banco Vazio):');
  const existingEmpty: any[] = [];
  const diff1 = StockDiffEngine.computeDiff(existingEmpty, [v1, v2, v3]);

  console.log(`  ✅ Criados (toCreate): ${diff1.toCreate.length} (Esperado: 3)`);
  console.log(`  ✅ Atualizados (toUpdate): ${diff1.toUpdate.length} (Esperado: 0)`);
  console.log(`  ✅ Vendidos (toRemove): ${diff1.toRemove.length} (Esperado: 0)`);
  console.log(`  ✅ Inalterados (unchanged): ${diff1.unchanged.length} (Esperado: 0)`);

  if (diff1.toCreate.length !== 3) throw new Error('Falha no Cenário 1: esperado 3 veículos criados.');

  // Simulando estado salvo no banco
  const dbState: any[] = [
    {
      id: 'db-id-001',
      externalId: 'vid-001',
      price: v1.price,
      promotionalPrice: v1.promotionalPrice,
      mileage: v1.mileage,
      status: VehicleStatus.AVAILABLE,
      heroImageUrl: v1.heroImageUrl,
      rawPayloadHash: v1.rawPayloadHash,
      title: v1.title,
      eligibleForMetaAds: v1.eligibleForMetaAds
    },
    {
      id: 'db-id-002',
      externalId: 'vid-002',
      price: v2.price,
      promotionalPrice: v2.promotionalPrice,
      mileage: v2.mileage,
      status: VehicleStatus.AVAILABLE,
      heroImageUrl: v2.heroImageUrl,
      rawPayloadHash: v2.rawPayloadHash,
      title: v2.title,
      eligibleForMetaAds: v2.eligibleForMetaAds
    },
    {
      id: 'db-id-003',
      externalId: 'vid-003',
      price: v3.price,
      promotionalPrice: v3.promotionalPrice,
      mileage: v3.mileage,
      status: VehicleStatus.AVAILABLE,
      heroImageUrl: v3.heroImageUrl,
      rawPayloadHash: v3.rawPayloadHash,
      title: v3.title,
      eligibleForMetaAds: v3.eligibleForMetaAds
    }
  ];

  // ============================================================================
  // CENÁRIO 2: Re-ingestão Idêntica (Zero Alterações)
  // ============================================================================
  console.log('\n🔄 2. Teste: Re-ingestão com Estoque Idêntico:');
  const diff2 = StockDiffEngine.computeDiff(dbState, [v1, v2, v3]);

  console.log(`  ✅ Criados: ${diff2.toCreate.length} (Esperado: 0)`);
  console.log(`  ✅ Atualizados: ${diff2.toUpdate.length} (Esperado: 0)`);
  console.log(`  ✅ Vendidos: ${diff2.toRemove.length} (Esperado: 0)`);
  console.log(`  ✅ Inalterados: ${diff2.unchanged.length} (Esperado: 3)`);

  if (diff2.unchanged.length !== 3) throw new Error('Falha no Cenário 2: esperado 3 inalterados.');

  // ============================================================================
  // CENÁRIO 3: Alteração de Preço e Quilometragem no GLC 300
  // ============================================================================
  console.log('\n💲 3. Teste: Atualização de Preço e Quilometragem:');
  const modifiedPayload1 = {
    ...payload1,
    preco: '479.900', // Desconto de R$ 9.800
    km: '4.950'       // Rodou mais km
  };
  const v1Modified = AutoMatchingEngine.normalize(modifiedPayload1);

  const diff3 = StockDiffEngine.computeDiff(dbState, [v1Modified, v2, v3]);

  console.log(`  ✅ Criados: ${diff3.toCreate.length} (Esperado: 0)`);
  console.log(`  ✅ Atualizados: ${diff3.toUpdate.length} (Esperado: 1)`);
  console.log(`     Campos modificados: [${diff3.toUpdate[0]?.changedFields.join(', ')}]`);
  console.log(`  ✅ Vendidos: ${diff3.toRemove.length} (Esperado: 0)`);
  console.log(`  ✅ Inalterados: ${diff3.unchanged.length} (Esperado: 2)`);

  if (diff3.toUpdate.length !== 1) throw new Error('Falha no Cenário 3: esperado 1 atualizado.');

  // ============================================================================
  // CENÁRIO 4: Veículo Vendido (Removido do Feed) + Nova Ferrari Entrando
  // ============================================================================
  console.log('\n🚗 4. Teste: Detecção de Veículo Vendido + Nova Inserção:');
  const payloadFerrari = {
    id: 'vid-004',
    marca: 'Ferrari',
    modelo: '296 GTB',
    versao: '3.0 V6 Turbo PHEV Assetto Fiorano',
    ano: '2023/2024',
    preco: '4.100.000',
    km: '1.200',
    fotos: ['https://cdn.teste.com/ferrari.jpg'],
    combustivel: 'Híbrido Plug-in',
    cambio: 'Dupla Embreagem'
  };
  const vFerrari = AutoMatchingEngine.normalize(payloadFerrari);

  // O Porsche 911 (vid-002) foi vendido e NÃO veio no feed
  const incomingMixed = [v1, vFerrari, v3];
  const diff4 = StockDiffEngine.computeDiff(dbState, incomingMixed);

  console.log(`  ✅ Criados (Nova Ferrari): ${diff4.toCreate.length} (Esperado: 1)`);
  console.log(`  ✅ Vendidos (Porsche 911 que saiu do feed): ${diff4.toRemove.length} (Esperado: 1) -> ID: ${diff4.toRemove[0]?.externalId}`);
  console.log(`  ✅ Inalterados: ${diff4.unchanged.length} (Esperado: 2)`);

  if (diff4.toCreate.length !== 1 || diff4.toRemove.length !== 1) {
    throw new Error('Falha no Cenário 4.');
  }

  console.log('\n🎉 Todos os testes do Motor de Diffs foram executados com 100% de sucesso!');
}

runDiffTests().catch((err) => {
  console.error('❌ Erro no teste de diffs:', err);
  process.exit(1);
});
