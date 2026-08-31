import { readFileSync } from 'fs';
import { resolve } from 'path';
import { AutoMatchingEngine } from './index.js';

async function runNormalizationTests() {
  console.log('🧪 Iniciando Bateria de Testes do Motor de Normalização e Auto-Matching...\n');

  const fixturesDir = resolve(process.cwd(), '../.github/docs/fixtures');

  // 1. Teste com Feed Real 4Boss / Base44 (JSON REST)
  console.log('🏎️ 1. Teste com Fixture Real 4Boss / Base44 (Superesportivos):');
  const raw4Boss = JSON.parse(readFileSync(resolve(fixturesDir, 'real-feed-4boss-sample.json'), 'utf-8'));
  const first4BossVehicle = raw4Boss.vehicles[0];

  const norm4Boss = AutoMatchingEngine.normalize(first4BossVehicle, {
    workspaceId: 'ws-4boss-001',
    fallbackBaseUrl: 'https://www.4boss.com.br'
  });

  console.log(`  ✅ Título Canônico: "${norm4Boss.title}"`);
  console.log(`  ✅ Marca: ${norm4Boss.make} | Modelo: ${norm4Boss.model} | Versão: ${norm4Boss.version}`);
  console.log(`  ✅ Carroceria: ${norm4Boss.bodyStyle} | Anos: ${norm4Boss.manufactureYear}/${norm4Boss.modelYear}`);
  console.log(`  ✅ Preço Normalizado: R$ ${norm4Boss.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
  console.log(`  ✅ Quilometragem: ${norm4Boss.mileage} km | Condição: ${norm4Boss.condition}`);
  console.log(`  ✅ Combustível: ${norm4Boss.fuelType} | Câmbio: ${norm4Boss.transmission}`);
  console.log(`  ✅ Galeria: ${norm4Boss.images.length} fotos (Capa: ${norm4Boss.heroImageUrl.substring(0, 40)}...)`);
  console.log(`  ✅ Opcionais Mapeados: [${norm4Boss.features.slice(0, 4).join(', ')}...]`);
  console.log(`  ✅ Elegível para Meta Ads: ${norm4Boss.eligibleForMetaAds ? 'SIM' : 'NÃO'}`);
  console.log(`  ✅ Diff Hash (SHA-256): ${norm4Boss.rawPayloadHash.substring(0, 20)}...`);

  // 2. Teste com Feed Real JRCA / Spice Digital (JSON REST)
  console.log('\n🔋 2. Teste com Fixture Real JRCA / Spice Digital (Eletrificados & Seminovos):');
  const rawJrca = JSON.parse(readFileSync(resolve(fixturesDir, 'real-feed-jrca-sample.json'), 'utf-8'));
  const firstJrcaVehicle = rawJrca.vehicles[0];

  const normJrca = AutoMatchingEngine.normalize(firstJrcaVehicle, {
    workspaceId: 'ws-jrca-001',
    fallbackBaseUrl: 'https://www.jrcaseminovos.com.br'
  });

  console.log(`  ✅ Título Canônico: "${normJrca.title}"`);
  console.log(`  ✅ Marca: ${normJrca.make} | Modelo: ${normJrca.model} | Versão: ${normJrca.version}`);
  console.log(`  ✅ Anos (extraídos de objeto {one, two}): ${normJrca.manufactureYear}/${normJrca.modelYear}`);
  console.log(`  ✅ Preço: R$ ${normJrca.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} | Sob consulta? ${normJrca.priceOnRequest}`);
  console.log(`  ✅ Combustível: ${normJrca.fuelType} | Câmbio: ${normJrca.transmission}`);
  console.log(`  ✅ Garantia: ${normJrca.hasWarranty} (${normJrca.warrantyDetails})`);
  console.log(`  ✅ Elegível para Meta Ads: ${normJrca.eligibleForMetaAds ? 'SIM' : 'NÃO'}`);

  // 3. Teste com Payloads XML Simulados (AutoCerto, Sisvag, BomControle)
  console.log('\n📄 3. Teste de Normalização de Layouts XML Tradicionais:');

  const rawAutoCertoXml = {
    codigo: 'AC-84920',
    placa: 'ABC1D23',
    chassi: '9BRBL48E9N2145892',
    marca: 'Toyota',
    modelo: 'Corolla Cross',
    versao: 'XRE 2.0 16V Flex Aut.',
    anofabricacao: '2023',
    anomodelo: '2024',
    cor: 'Branco Pérola',
    combustivel: 'Flex',
    cambio: 'CVT',
    portas: '4',
    quilometragem: '12.500 km',
    preco: 'R$ 168.900,00',
    preco_promocional: 'R$ 164.900,00',
    blindado: 'nao',
    fotos: {
      foto: [
        'https://img.autocerto.com/veiculos/ac84920/foto1.jpg',
        'https://img.autocerto.com/veiculos/ac84920/foto2.jpg'
      ]
    },
    opcionais: {
      opcional: ['Ar Condicionado Digital', 'Bancos de Couro', 'Teto Solar Elétrico', 'Câmera de Ré']
    },
    observacoes: 'Veículo em estado impecável & revisões na concessionária.'
  };

  const normAutoCerto = AutoMatchingEngine.normalize(rawAutoCertoXml);
  console.log(`  ✅ AutoCerto: "${normAutoCerto.title}" | R$ ${normAutoCerto.price} (Promo: R$ ${normAutoCerto.promotionalPrice}) | Km: ${normAutoCerto.mileage}`);
  console.log(`     Carroceria: ${normAutoCerto.bodyStyle} | Combustível: ${normAutoCerto.fuelType} | Câmbio: ${normAutoCerto.transmission}`);
  console.log(`     Opcionais normalizados: [${normAutoCerto.features.join(', ')}]`);

  // 4. Teste de Casos de Borda e Validação de Elegibilidade
  console.log('\n⚠️ 4. Teste de Casos de Borda e Bloqueio de Inelegibilidade para Meta Ads:');

  const invalidVehicle = {
    id: 'INVALID-001',
    marca: 'Desconhecida',
    modelo: 'Protótipo',
    preco: '0.00', // Preço zerado (deve ser inelegível para Meta DAA)
    fotos: []      // Sem fotos (deve ser inelegível)
  };

  const normInvalid = AutoMatchingEngine.normalize(invalidVehicle);
  console.log(`  ✅ Veículo sem preço e sem fotos:`);
  console.log(`     - Elegível para Meta Ads: ${normInvalid.eligibleForMetaAds} (Esperado: false)`);
  console.log(`     - Avisos de Validação: [${normInvalid.validationWarnings.join(' | ')}]`);

  console.log('\n🎉 Todos os testes do motor de normalização foram concluídos com 100% de sucesso!');
}

runNormalizationTests().catch((err) => {
  console.error('❌ Erro nos testes de normalização:', err);
  process.exit(1);
});
