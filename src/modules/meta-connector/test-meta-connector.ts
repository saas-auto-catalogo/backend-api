import { MetaOAuthService } from './meta-oauth.service.js';
import { MetaGraphApiClient } from './meta-graph.client.js';
import { buildServer } from '../../server.js';
import { AuthUser } from '../auth/auth.middleware.js';
import { redisClient } from '../../infra/redis/redis-client.js';

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
  const redirectUri = 'https://app.drivesync.me/meta/callback';

  const { url, state } = oauth.generateAuthorizationUrl(workspaceId, redirectUri);

  console.log(`  ✅ URL de Login gerada: ${url.substring(0, 60)}...`);
  console.log(`  ✅ State gerado (base64url): ${state.substring(0, 30)}...`);

  const verifiedValid = oauth.verifyState(state);
  console.log(`  ✅ Validação de State legítimo: ${verifiedValid.isValid} | WorkspaceId: ${verifiedValid.workspaceId}`);
  if (!verifiedValid.isValid || verifiedValid.workspaceId !== workspaceId) {
    throw new Error('Falha na validação do state legítimo.');
  }

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

  const ownerUser: AuthUser = {
    id: 'usr-owner-meta',
    email: 'owner@autoelite.com.br',
    name: 'Carlos Owner',
    isSuperAdmin: false,
    workspaceId,
    role: 'OWNER',
  };

  const managerUser: AuthUser = {
    id: 'usr-manager-meta',
    email: 'manager@autoelite.com.br',
    name: 'Marcos Manager',
    isSuperAdmin: false,
    workspaceId,
    role: 'MANAGER',
  };

  const ownerToken = server.jwt.sign(ownerUser);
  const managerToken = server.jwt.sign(managerUser);

  const authUrlRes = await server.inject({
    method: 'GET',
    url: `/api/v1/integrations/meta/auth-url?workspaceId=${workspaceId}&redirectUri=${encodeURIComponent(redirectUri)}`,
    headers: { authorization: `Bearer ${ownerToken}` },
  });

  console.log(`  ✅ [GET /api/v1/integrations/meta/auth-url] Status: ${authUrlRes.statusCode}`);
  if (authUrlRes.statusCode !== 200) {
    throw new Error(`Auth URL retornou ${authUrlRes.statusCode}: ${authUrlRes.payload}`);
  }

  const authData = JSON.parse(authUrlRes.payload);
  console.log(`     - Auth URL retornada: ${authData.authUrl.substring(0, 50)}...`);
  if (!authData.authUrl.includes('facebook.com')) {
    throw new Error('Auth URL não aponta para o Facebook.');
  }

  const diagRes = await server.inject({
    method: 'GET',
    url: `/api/v1/workspaces/${workspaceId}/meta-catalogs/mock-catalog-999/diagnostics`,
    headers: { authorization: `Bearer ${managerToken}` },
  });

  console.log(`  ✅ [GET /api/v1/workspaces/:ws/meta-catalogs/:cat/diagnostics] Status: ${diagRes.statusCode}`);
  if (diagRes.statusCode !== 200) {
    throw new Error(`Diagnostics retornou ${diagRes.statusCode}: ${diagRes.payload}`);
  }

  const diagData = JSON.parse(diagRes.payload);
  console.log(`     - Report: Health Score = ${diagData.report.healthScorePercentage}%`);

  await server.close();
  redisClient.disconnect();

  console.log('\n🎉 Todos os testes do Conector Meta Graph API e OAuth 2.0 foram concluídos com 100% de sucesso!');
  process.exit(0);
}

runMetaConnectorTests().catch((err) => {
  console.error('❌ Erro nos testes de Meta Connector:', err);
  redisClient.disconnect();
  process.exit(1);
});
