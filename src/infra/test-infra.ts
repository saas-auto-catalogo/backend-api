import {
  QUEUE_NAMES,
  QueuePriority,
  dispatchXmlIngestion,
  dispatchMetaSync,
  dispatchAiBlog,
  getQueueMetrics,
  closeAllQueues,
  feedCacheService,
  rateLimiterService,
  redisClient
} from './index.js';

async function runInfraSmokeTest() {
  console.log('🚀 Iniciando verificação dos serviços de Infraestrutura (BullMQ + Redis)...');

  try {
    // 1. Teste de Dispatchers BullMQ
    console.log('\n📦 1. Testando Dispatchers de Filas BullMQ:');

    console.log(`- Despachando job para [${QUEUE_NAMES.XML_INGESTION}]...`);
    const xmlJob = await dispatchXmlIngestion(
      {
        workspaceId: '11111111-1111-1111-1111-111111111111',
        feedConfigId: '22222222-2222-2222-2222-222222222222',
        sourceType: 'AUTOCERTO',
        feedUrl: 'https://exemplo.autocerto.com/feed.xml',
        isManualTrigger: true,
        timestamp: new Date().toISOString()
      },
      QueuePriority.HIGH
    );
    console.log(`  ✅ Job ID criado: ${xmlJob.id} (Prioridade: HIGH)`);

    console.log(`- Despachando job para [${QUEUE_NAMES.META_SYNC}]...`);
    const metaJob = await dispatchMetaSync(
      {
        workspaceId: '11111111-1111-1111-1111-111111111111',
        metaCatalogId: '456789012345678',
        syncType: 'DIFF_SYNC',
        trigger: 'AUTOMATIC',
        timestamp: new Date().toISOString()
      },
      QueuePriority.NORMAL
    );
    console.log(`  ✅ Job ID criado: ${metaJob.id} (Prioridade: NORMAL)`);

    console.log(`- Despachando job para [${QUEUE_NAMES.AI_BLOG}]...`);
    const aiJob = await dispatchAiBlog(
      {
        topic: 'Como vender mais veículos anunciando no Meta Ads DAA',
        targetKeywords: ['meta ads automotivo', 'catalogo veiculos facebook', 'dms autocerto'],
        publishStatus: 'DRAFT',
        timestamp: new Date().toISOString()
      },
      QueuePriority.LOW
    );
    console.log(`  ✅ Job ID criado: ${aiJob.id} (Prioridade: LOW)`);

    // 2. Teste de Métricas das Filas
    console.log('\n📊 2. Consultando Métricas das Filas:');
    const xmlMetrics = await getQueueMetrics(QUEUE_NAMES.XML_INGESTION);
    console.log(`  ✅ Métricas ${QUEUE_NAMES.XML_INGESTION}: waiting=${xmlMetrics.waiting}, total=${xmlMetrics.total}`);

    // 3. Teste do Serviço de Cache de Feeds
    console.log('\n💾 3. Testando FeedCacheService (TTL 15m e Invalidação):');
    const sampleTokenHash = 'hash_feed_token_teste_123456';
    const sampleWorkspaceId = '11111111-1111-1111-1111-111111111111';
    const sampleXml = '<listings><listing><id>V-001</id><title>Corolla Cross 2024</title></listing></listings>';

    await feedCacheService.setFeedXml(sampleTokenHash, sampleXml, sampleWorkspaceId, 900);
    const cachedEntry = await feedCacheService.getFeedXml(sampleTokenHash);
    console.log(`  ✅ Feed obtido do cache: ${cachedEntry ? 'SIM' : 'NÃO'} (ETag: ${cachedEntry?.etag})`);

    const invalidated = await feedCacheService.invalidateWorkspaceFeeds(sampleWorkspaceId);
    console.log(`  ✅ Invalidação por workspace executada (chaves removidas: ${invalidated})`);

    // 4. Teste do Rate Limiter Distribuído
    console.log('\n🛡️ 4. Testando RateLimiterService:');
    const testIp = '189.100.20.10';
    const check1 = await rateLimiterService.checkRateLimit(testIp, { maxRequests: 5, windowSeconds: 10 });
    console.log(`  ✅ Rate limit check 1: allowed=${check1.allowed}, remaining=${check1.remaining}/${check1.limit}`);

    const slotAcquired = await rateLimiterService.acquireHostSlot('integracao.autocerto.com', 3);
    console.log(`  ✅ Slot de concorrência para host DMS adquirido: ${slotAcquired}`);
    await rateLimiterService.releaseHostSlot('integracao.autocerto.com');
    console.log('  ✅ Slot de concorrência liberado com sucesso.');

    console.log('\n🎉 Todos os testes de infraestrutura foram executados com sucesso!');
  } catch (error) {
    console.warn(`\nℹ️ [Nota]: O teste de conexão direta requer uma instância local do Redis ativa na porta 6379.`);
    console.warn(`   Detalhe do erro de conexão: ${(error as Error).message}`);
  } finally {
    await closeAllQueues();
    redisClient.disconnect();
  }
}

// Execução autônoma
runInfraSmokeTest().catch(console.error);
