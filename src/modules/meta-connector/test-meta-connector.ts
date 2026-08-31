import { MetaOAuthService } from './meta-oauth.service.js';
import { MetaGraphApiClient } from './meta-graph.client.js';
import { buildServer } from '../../server.js';

async function runMetaConnectorTests() {
  console.log('🧪 Iniciando Bateria de Testes do Conector Meta Graph API e OAuth 2.0...\n');

  // ============================================================================
  // 1. Teste do Serviço de Autenticação OAuth 2.0
  // ============================================================================
  console.log('🔑 1. Teste de Geração e Validação de Estado OAuth com Assinatura HMAC (Anti-CSRF):');

  const oauth = new MetaOAuthService({
    appId: '123456789012345',
    appSecret: 'test-secret-key-32-bytes-length-xyz'
  });

  const workspaceId = 'ws-test-oauth-tenant-001';
  const redirectUri = 'https://app.autocatalogo.com.br/meta/callback';

  const { url, state } = oauth.generateAuthorizationUrl(workspaceId, redirectUri);

  console.log(`  ✅ URL de Login gerada: ${url.substring(0, 60)}...`);
  console.log(`  ✅ State gerado (base64url): ${state.substring(0, 30)}...`);

  // Validação do state legítimo
  const verifiedValid = oauth.verifyState(state);
  console.log(`  ✅ Validação de State legítimo: ${verifiedValid.isValid} | WorkspaceId: ${verifiedValid.workspaceId}`);
  if (!verifiedValid.isValid || verifiedValid.workspaceId !== workspaceId) {
    throw new Error('Falha na validação do state legítimo.');
  }

  // Validação de state corrompido / ataque CSRF
  const tamperedState = state.substring(0, state.length - 5) + 'AAAAA';
  const verifiedTampered = oauth.verifyState(tamperedState);
  console.log(`  ✅ Validação de State adulterado: ${verifiedTampered.isValid} (Esperado: false)`);
  if (verifiedTampered.isValid) {
    throw new Error('O sistema não bloqueou um state adulterado!');
  }

  // ============================================================================
  // 2. Teste do Cliente Graph API (Diagnósticos de Catálogo)
  // ============================================================================
  console.log('\n📊 2. Teste do Cliente Meta Graph API v21.0 & Diagnósticos:');

  const graphClient = new MetaGraphApiClient('v21.0');
  const diagnostics = await graphClient.getCatalogDiagnostics('mock-cat-12345', 'mock-user-token');

  console.log(`  ✅ Diagnóstico do Catálogo '${diagnostics.catalogId}':`);
  console.log(`     - Total de Produtos: ${diagnostics.totalProducts}`);
  console.log(`     - Produtos Elegíveis: ${diagnostics.eligibleProducts}`);
  console.log(`     - Produtos Rejeitados: ${diagnostics.rejectedProducts}`);
  console.log(`     - Índice de Saúde: ${diagnostics.healthScorePercentage}%`);
  console.log(`     - Issues Reportadas: ${diagnostics.issues.length}`);

  // ============================================================================
  // 3. Teste das Rotas Fastify via server.inject()
  // ============================================================================
  console.log('\n🌐 3. Teste dos Endpoints Fastify de Integração Meta:');

  const server = await buildServer();

  // Teste de GET /api/v1/integrations/meta/auth-url
  const authUrlRes = await server.inject({
    method: 'GET',
    url: `/api/v1/integrations/meta/auth-url?workspaceId=${workspaceId}&redirectUri=${encodeURIComponent(redirectUri)}`
  });

  console.log(`  ✅ [GET /api/v1/integrations/meta/auth-url] Status: ${authUrlRes.statusCode}`);
  const authData = JSON.parse(authUrlRes.payload);
  console.log(`     - Auth URL retornada: ${authData.authUrl.substring(0, 50)}...`);
  if (!authData.authUrl.includes('facebook.com')) {
    throw new Error('Auth URL não aponta para o Facebook.');
  }

  // Teste de GET /api/v1/workspaces/:workspaceId/meta-catalogs/:catalogId/diagnostics
  const diagRes = await server.inject({
    method: 'GET',
    url: `/api/v1/workspaces/${workspaceId}/meta-catalogs/mock-catalog-999/diagnostics`,
    headers: {
      Authorization: 'Bearer mock-valid-token'
    }
  });

  console.log(`  ✅ [GET /api/v1/workspaces/:ws/meta-catalogs/:cat/diagnostics] Status: ${diagRes.statusCode}`);
  const diagData = JSON.parse(diagRes.payload);
  console.log(`     - Report: Health Score = ${diagData.report.healthScorePercentage}%`);

  console.log('\n🎉 Todos os testes do Conector Meta Graph API e OAuth 2.0 foram concluídos com 100% de sucesso!');
}

runMetaConnectorTests().catch((err) => {
  console.error('❌ Erro nos testes de Meta Connector:', err);
  process.exit(1);
});
