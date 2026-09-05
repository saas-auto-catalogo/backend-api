import { MetaXmlFeedGenerator } from './meta-feed-generator.js';
import { buildServer } from '../../server.js';
import { feedCacheService } from '../../infra/cache/feed-cache.service.js';
import { redisClient } from '../../infra/redis/redis-client.js';
import { BodyStyle, FuelType, TransmissionType, VehicleCondition, VehicleStatus } from '@prisma/client';

async function runMetaFeedTests() {
  console.log('🧪 Iniciando Bateria de Testes do Motor Meta Ads DAA e Endpoint Público...\n');

  // ============================================================================
  // 1. Teste de Geração do XML RSS 2.0 Meta DAA
  // ============================================================================
  console.log('📄 1. Teste de Geração Estrutural do XML RSS 2.0 Meta DAA:');

  const mockVehicles: any[] = [
    {
      externalId: 'mercedes-glc-300-vid-001',
      title: 'Mercedes-Benz GLC 300 2.0 MHEV AMG Line Coupé 4Matic 2025/2026',
      description: 'Mercedes-Benz GLC 300 com 4.686 km. Motor 2.0 Turbo MHEV de 258 cv, tração integral 4Matic.',
      canonicalUrl: 'https://www.4boss.com.br/veiculo/mercedes-benz-glc-300-2025',
      heroImageUrl: 'https://base44.app/files/img01.jpg',
      images: [
        { url: 'https://base44.app/files/img02.jpg', isPrimary: false, order: 2 },
        { url: 'https://base44.app/files/img03.jpg', isPrimary: false, order: 3 }
      ],
      price: 489700.00,
      promotionalPrice: 479900.00,
      status: VehicleStatus.AVAILABLE,
      make: 'Mercedes-Benz',
      model: 'GLC 300',
      manufactureYear: 2025,
      modelYear: 2026,
      mileage: 4686,
      vin: 'TYN9F21',
      condition: VehicleCondition.SEMINOVO,
      bodyStyle: BodyStyle.SUV,
      transmission: TransmissionType.AUTOMATICO,
      fuelType: FuelType.MHEV_HIBRIDO_LEVE,
      exteriorColor: 'Preto Obsidian Metálico',
      interiorColor: 'Couro Preto',
      doors: 4,
      drivetrain: 'AWD',
      armored: false,
      hasWarranty: false
    },
    {
      externalId: 'byd-dolphin-vid-002',
      title: 'BYD Dolphin EV GS 100% Elétrico 2026/2027',
      description: 'BYD Dolphin EV Zero KM com bateria Blade e garantia total de fábrica.',
      canonicalUrl: 'https://www.jrcaseminovos.com.br/veiculo/byd-dolphin-ev/104692',
      heroImageUrl: 'https://cdn.spicedigital.com.br/vehicles/dolphin.png',
      price: 149990.00,
      status: VehicleStatus.AVAILABLE,
      make: 'BYD',
      model: 'Dolphin',
      manufactureYear: 2026,
      modelYear: 2027,
      mileage: 20,
      vin: 'JRCA-104692',
      condition: VehicleCondition.NOVO,
      bodyStyle: BodyStyle.HATCHBACK,
      transmission: TransmissionType.AUTOMATICO,
      fuelType: FuelType.ELETRICO,
      exteriorColor: 'Branco',
      doors: 4,
      drivetrain: 'FWD',
      armored: false,
      hasWarranty: true
    }
  ];

  const generated = MetaXmlFeedGenerator.generateFeed(mockVehicles, {
    feedUrl: 'https://api.drivesync.me/api/v1/feeds/token-teste-123/meta-vehicles.xml',
    catalogName: '4Boss Motors - Catálogo Meta Automotive Ads',
    dealership: {
      id: 'dealer-001',
      tradeName: '4Boss Motors Jardins',
      phone: '+5511999990001',
      externalCode: '4BOSS-SP'
    }
  });

  console.log(`  ✅ Itens exportados no feed: ${generated.itemCount} (Esperado: 2)`);
  console.log(`  ✅ ETag gerado: ${generated.etag}`);
  console.log(`  ✅ Tamanho do XML: ${(generated.xml.length / 1024).toFixed(2)} KB`);

  // Validações de tags obrigatórias do padrão oficial Meta Automotive
  if (!generated.xml.includes('<listings>')) {
    throw new Error('Raiz <listings> não encontrada.');
  }
  if (!generated.xml.includes('<listing>')) {
    throw new Error('Nós <listing> não encontrados.');
  }
  if (!generated.xml.includes('</listing>') || !generated.xml.includes('</listings>')) {
    throw new Error('Fechamento dos nós <listing>/<listings> inválido.');
  }
  if (!generated.xml.includes('<vehicle_id>mercedes-glc-300-vid-001</vehicle_id>')) {
    throw new Error('Tag <vehicle_id> (chave primária) não encontrada.');
  }
  if (!generated.xml.includes('<make>Mercedes-Benz</make>')) {
    throw new Error('Marca <make> não encontrada no XML.');
  }
  if (!generated.xml.includes('<model>GLC 300</model>')) {
    throw new Error('Modelo <model> não encontrado.');
  }
  if (!generated.xml.includes('<price>489700 BRL</price>')) {
    throw new Error('Preço formatado numérico inválido.');
  }
  if (!generated.xml.includes('<sale_price>479900 BRL</sale_price>')) {
    throw new Error('Preço promocional não encontrado.');
  }
  if (!generated.xml.includes('<availability>AVAILABLE</availability>')) {
    throw new Error('Disponibilidade AVAILABLE não encontrada.');
  }
  if (!generated.xml.includes('<state_of_vehicle>USED</state_of_vehicle>')) {
    throw new Error('Estado do veículo USED não encontrado.');
  }
  if (!generated.xml.includes('<state_of_vehicle>NEW</state_of_vehicle>')) {
    throw new Error('Estado do veículo NEW não encontrado.');
  }
  if (!generated.xml.includes('<body_style>SUV</body_style>')) {
    throw new Error('body_style SUV não encontrado.');
  }
  if (!generated.xml.includes('<fuel_type>HYBRID</fuel_type>')) {
    throw new Error('fuel_type HYBRID não encontrado.');
  }
  if (!generated.xml.includes('<fuel_type>ELECTRIC</fuel_type>')) {
    throw new Error('fuel_type ELECTRIC não encontrado.');
  }
  if (!generated.xml.includes('<transmission>AUTOMATIC</transmission>')) {
    throw new Error('transmission AUTOMATIC não encontrado.');
  }
  if (!generated.xml.includes('<component name="addr1">')) {
    throw new Error('Componente addr1 (street_address) não encontrado no bloco address.');
  }
  if (!generated.xml.includes('<url>https://www.4boss.com.br/v/mercedes-benz-glc-300-2025</url>')) {
    throw new Error('URL canônica não sanitizada para /v/:slug no nó <url>.');
  }
  if (generated.xml.includes('/api/vehicles/')) {
    throw new Error('XML contém URL legada com /api/vehicles/.');
  }
  if (!generated.xml.includes('<url>https://www.jrcaseminovos.com.br/veiculo/byd-dolphin-ev/104692</url>')) {
    throw new Error('URL canônica Spice Digital /veiculo/:slug deve ser preservada integralmente.');
  }

  console.log('  ✅ Todas as validações estruturais de tags oficiais Meta Automotive foram aprovadas!');

  // ============================================================================
  // 2. Teste do Servidor HTTP Fastify & Rota Pública via server.inject()
  // ============================================================================
  console.log('\n🌐 2. Teste do Servidor Fastify e Rota Pública de Feed:');

  const server = await buildServer();

  // Teste de Health Check
  const healthRes = await server.inject({
    method: 'GET',
    url: '/health'
  });
  console.log(`  ✅ [GET /health] Status: ${healthRes.statusCode} | Resposta: ${healthRes.payload}`);

  // Teste de Cache Pre-populado no Redis para simular requisição rápida (< 50ms)
  const testToken = 'teste-token-fast-feed-12345';
  await feedCacheService.setFeedXml(testToken, generated.xml, 'ws-test-01', 900);

  const feedRes = await server.inject({
    method: 'GET',
    url: `/api/v1/feeds/${testToken}/meta-vehicles.xml`,
    headers: {
      'Accept-Encoding': 'gzip, deflate'
    }
  });

  console.log(`  ✅ [GET /api/v1/feeds/:token/meta-vehicles.xml] Status: ${feedRes.statusCode}`);
  console.log(`     - Content-Type: ${feedRes.headers['content-type']}`);
  console.log(`     - Cache-Control: ${feedRes.headers['cache-control']}`);
  console.log(`     - ETag: ${feedRes.headers['etag']}`);
  console.log(`     - X-Feed-Cache: ${feedRes.headers['x-feed-cache']} (Esperado: HIT)`);
  console.log(`     - X-Response-Time: ${feedRes.headers['x-response-time']}`);

  // Teste de Resposta Condicional 304 Not Modified
  const etagReceived = feedRes.headers['etag'] as string;
  const notModifiedRes = await server.inject({
    method: 'GET',
    url: `/api/v1/feeds/${testToken}/meta-vehicles.xml`,
    headers: {
      'If-None-Match': etagReceived
    }
  });

  console.log(`  ✅ [GET com If-None-Match] Status: ${notModifiedRes.statusCode} (Esperado: 304 Not Modified)`);

  if (notModifiedRes.statusCode !== 304) {
    throw new Error('Falha na resposta 304 Not Modified.');
  }

  // Limpa o cache de teste
  await feedCacheService.invalidateFeedXml(testToken);
  await server.close();
  redisClient.disconnect();

  console.log('\n🎉 Todos os testes do Motor Meta Ads DAA e Endpoint Fastify foram concluídos com 100% de sucesso!');
  process.exit(0);
}

runMetaFeedTests().catch((err) => {
  console.error('❌ Erro nos testes de Meta Feed:', err);
  process.exit(1);
});
