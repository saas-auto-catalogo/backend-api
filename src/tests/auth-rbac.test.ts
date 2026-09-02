import { buildServer } from '../server.js';
import { teardownIntegrationTest } from './test-teardown.js';
import {
  PERMISSIONS,
  hasPermission,
  hasMinimumRole,
  isRoleAllowed,
  Role,
} from '../modules/auth/rbac.js';
import { AuthUser } from '../modules/auth/auth.middleware.js';

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
  console.log(`🔒 ${title}`);
  console.log('─'.repeat(60));
}

async function runAuthRbacTests() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   🔒 QA — Autenticação JWT, RBAC e Isolamento Multi-Tenant  ║');
  console.log('║   SaaS Auto Catálogo Backend API                            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  const app = await buildServer();
  const startTime = Date.now();

  try {
    // ─────────────────────────────────────────────────────────────────────────
    // 1. TESTES UNITÁRIOS DE RBAC & MATRIZ DE PERMISSÕES
    // ─────────────────────────────────────────────────────────────────────────
    section('1. Matriz de Permissões e Hierarquia RBAC');

    // Hierarquia
    assert(hasMinimumRole('SUPER_ADMIN', 'OWNER'), 'SUPER_ADMIN >= OWNER');
    assert(hasMinimumRole('OWNER', 'MANAGER'), 'OWNER >= MANAGER');
    assert(hasMinimumRole('MANAGER', 'VIEWER'), 'MANAGER >= VIEWER');
    assert(!hasMinimumRole('VIEWER', 'MANAGER'), 'VIEWER < MANAGER (não autorizado)');
    assert(!hasMinimumRole('MANAGER', 'OWNER'), 'MANAGER < OWNER (não autorizado)');

    // Allowed roles
    assert(isRoleAllowed('SUPER_ADMIN', ['OWNER']), 'SUPER_ADMIN sempre autorizado em isRoleAllowed');
    assert(isRoleAllowed('OWNER', ['OWNER', 'MANAGER']), 'OWNER autorizado em [OWNER, MANAGER]');
    assert(isRoleAllowed('MANAGER', ['OWNER', 'MANAGER']), 'MANAGER autorizado em [OWNER, MANAGER]');
    assert(!isRoleAllowed('VIEWER', ['OWNER', 'MANAGER']), 'VIEWER não autorizado em [OWNER, MANAGER]');

    // Permissões específicas
    assert(hasPermission('SUPER_ADMIN', 'GLOBAL_WORKSPACES_LIST'), 'SUPER_ADMIN pode listar todos workspaces');
    assert(!hasPermission('OWNER', 'GLOBAL_WORKSPACES_LIST'), 'OWNER não pode listar todos workspaces globais');
    assert(hasPermission('OWNER', 'WORKSPACE_SETTINGS_EDIT'), 'OWNER pode editar configurações do workspace');
    assert(!hasPermission('MANAGER', 'WORKSPACE_SETTINGS_EDIT'), 'MANAGER não pode editar configurações do workspace');
    assert(hasPermission('MANAGER', 'FEEDS_CREATE'), 'MANAGER pode criar feeds');
    assert(hasPermission('VIEWER', 'VEHICLES_VIEW'), 'VIEWER pode visualizar veículos');
    assert(!hasPermission('VIEWER', 'FEEDS_CREATE'), 'VIEWER não pode criar feeds');

    // ─────────────────────────────────────────────────────────────────────────
    // 2. GERAÇÃO DE TOKENS DE TESTE
    // ─────────────────────────────────────────────────────────────────────────
    section('2. Geração de Tokens JWT de Teste');

    const superAdminUser: AuthUser = {
      id: 'usr-super-admin-01',
      email: 'admin@autocatalogo.com.br',
      name: 'Super Admin',
      isSuperAdmin: true,
      role: 'SUPER_ADMIN' as Role,
    };

    const ownerUserTenantA: AuthUser = {
      id: 'usr-owner-tenant-a',
      email: 'owner@autoelite.com.br',
      name: 'Carlos Owner Tenant A',
      isSuperAdmin: false,
      workspaceId: 'workspace-tenant-a',
      dealershipId: 'dealership-a-01',
      role: 'OWNER' as Role,
    };

    const managerUserTenantA: AuthUser = {
      id: 'usr-manager-tenant-a',
      email: 'manager@autoelite.com.br',
      name: 'Marcos Manager Tenant A',
      isSuperAdmin: false,
      workspaceId: 'workspace-tenant-a',
      role: 'MANAGER' as Role,
    };

    const viewerUserTenantA: AuthUser = {
      id: 'usr-viewer-tenant-a',
      email: 'viewer@autoelite.com.br',
      name: 'Ana Viewer Tenant A',
      isSuperAdmin: false,
      workspaceId: 'workspace-tenant-a',
      role: 'VIEWER' as Role,
    };

    const ownerUserTenantB: AuthUser = {
      id: 'usr-owner-tenant-b',
      email: 'owner@jrcasa.com.br',
      name: 'Roberto Owner Tenant B',
      isSuperAdmin: false,
      workspaceId: 'workspace-tenant-b',
      role: 'OWNER' as Role,
    };

    const superAdminToken = app.jwt.sign(superAdminUser);
    const ownerTokenA = app.jwt.sign(ownerUserTenantA);
    const managerTokenA = app.jwt.sign(managerUserTenantA);
    const viewerTokenA = app.jwt.sign(viewerUserTenantA);
    const ownerTokenB = app.jwt.sign(ownerUserTenantB);

    assert(typeof superAdminToken === 'string' && superAdminToken.length > 20, 'Token JWT gerado para Super Admin');
    assert(typeof ownerTokenA === 'string' && ownerTokenA.length > 20, 'Token JWT gerado para Owner Tenant A');

    // ─────────────────────────────────────────────────────────────────────────
    // 3. ROTAS PÚBLICAS (NÃO DEVEM EXIGIR JWT)
    // ─────────────────────────────────────────────────────────────────────────
    section('3. Acesso a Rotas Públicas');

    const resHealth = await app.inject({ method: 'GET', url: '/health' });
    assert(resHealth.statusCode === 200, 'GET /health é público (200 OK)');

    const resCheckoutPix = await app.inject({
      method: 'POST',
      url: '/api/v1/checkout/stripe/pix',
      payload: {
        plan: 'PRO',
        customer: {
          dealershipName: 'Auto Elite Motors',
          email: 'contato@autoelitemotors.com.br',
          cnpj: '12.345.678/0001-90',
          phone: '11988887777'
        }
      }
    });
    assert(resCheckoutPix.statusCode === 201, 'POST /api/v1/checkout/stripe/pix é público (201 Created)');

    // ─────────────────────────────────────────────────────────────────────────
    // 4. AUTENTICAÇÃO JWT BÁSICA (/api/v1/auth/me)
    // ─────────────────────────────────────────────────────────────────────────
    section('4. Validação de Token JWT na Rota Privada (/api/v1/auth/me)');

    // Sem token
    const resNoToken = await app.inject({ method: 'GET', url: '/api/v1/auth/me' });
    assert(resNoToken.statusCode === 401, 'Requisição sem token retorna 401 Unauthorized');
    const errNoToken = JSON.parse(resNoToken.payload);
    assert(errNoToken.status === 401, 'RFC 7807: status 401');
    assert(errNoToken.type.includes('unauthorized'), 'RFC 7807: type unauthorized');

    // Com token malformado/inválido
    const resBadToken = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: 'Bearer token-invalido-123456' }
    });
    assert(resBadToken.statusCode === 401, 'Token malformado retorna 401');

    // Com token válido
    const resValidToken = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${ownerTokenA}` }
    });
    assert(resValidToken.statusCode === 200, 'Token válido retorna 200 OK');
    const dataMe = JSON.parse(resValidToken.payload);
    assert(dataMe.user.email === 'owner@autoelite.com.br', 'Email do usuário autenticado decodificado corretamente');
    assert(dataMe.user.role === 'OWNER', 'Role OWNER decodificada corretamente');
    assert(dataMe.user.workspaceId === 'workspace-tenant-a', 'WorkspaceId decodificado');

    // ─────────────────────────────────────────────────────────────────────────
    // 5. RBAC NAS ROTAS DE INTEGRAÇÃO (META OAUTH - REQUER OWNER OU SUPER_ADMIN)
    // ─────────────────────────────────────────────────────────────────────────
    section('5. RBAC — Permissões de Integração Meta (/api/v1/integrations/meta/auth-url)');

    const validOAuthQuery = '?workspaceId=workspace-tenant-a&redirectUri=https://app.autocatalogo.com.br/oauth/callback';

    // VIEWER tentando acessar rota restrita a OWNER
    const resViewerMeta = await app.inject({
      method: 'GET',
      url: `/api/v1/integrations/meta/auth-url${validOAuthQuery}`,
      headers: { authorization: `Bearer ${viewerTokenA}` }
    });
    assert(resViewerMeta.statusCode === 403, 'VIEWER recebe 403 Forbidden em rota restrita a OWNER');
    const errViewer = JSON.parse(resViewerMeta.payload);
    assert(errViewer.status === 403, 'RFC 7807: status 403');
    assert(errViewer.detail.includes('VIEWER'), 'Mensagem de erro informa papel insuficiente do VIEWER');

    // MANAGER tentando acessar rota restrita a OWNER
    const resManagerMeta = await app.inject({
      method: 'GET',
      url: `/api/v1/integrations/meta/auth-url${validOAuthQuery}`,
      headers: { authorization: `Bearer ${managerTokenA}` }
    });
    assert(resManagerMeta.statusCode === 403, 'MANAGER recebe 403 Forbidden em rota restrita a OWNER');

    // OWNER acessando
    const resOwnerMeta = await app.inject({
      method: 'GET',
      url: `/api/v1/integrations/meta/auth-url${validOAuthQuery}`,
      headers: { authorization: `Bearer ${ownerTokenA}` }
    });
    assert(resOwnerMeta.statusCode === 200, 'OWNER recebe 200 OK para iniciar OAuth Meta');
    const dataOwnerMeta = JSON.parse(resOwnerMeta.payload);
    assert(typeof dataOwnerMeta.authUrl === 'string' && dataOwnerMeta.authUrl.includes('facebook.com'), 'URL de autorização gerada com sucesso');

    // SUPER_ADMIN acessando
    const resAdminMeta = await app.inject({
      method: 'GET',
      url: `/api/v1/integrations/meta/auth-url${validOAuthQuery}`,
      headers: { authorization: `Bearer ${superAdminToken}` }
    });
    assert(resAdminMeta.statusCode === 200, 'SUPER_ADMIN recebe 200 OK (bypass autorizado)');

    // ─────────────────────────────────────────────────────────────────────────
    // 6. ISOLAMENTO MULTI-TENANT POR WORKSPACE_ID
    // ─────────────────────────────────────────────────────────────────────────
    section('6. Isolamento Multi-Tenant (Tenant A não acessa Tenant B)');

    // Owner do Tenant B tentando acessar recurso do Tenant A
    const resTenantBInA = await app.inject({
      method: 'GET',
      url: '/api/v1/workspaces/workspace-tenant-a/meta-catalogs/cat-001/diagnostics',
      headers: { authorization: `Bearer ${ownerTokenB}` }
    });
    assert(resTenantBInA.statusCode === 403, 'Owner do Tenant B recebe 403 ao tentar acessar dados do Tenant A');
    const errIsolation = JSON.parse(resTenantBInA.payload);
    assert(errIsolation.type.includes('tenant-isolation-violation'), 'Erro específico de violação de isolamento multi-tenant');

    // Owner do Tenant A acessando seu próprio recurso
    const resOwnerAInA = await app.inject({
      method: 'GET',
      url: '/api/v1/workspaces/workspace-tenant-a/meta-catalogs/cat-001/diagnostics',
      headers: { authorization: `Bearer ${ownerTokenA}` }
    });
    assert(resOwnerAInA.statusCode === 200, 'Owner do Tenant A acessa com sucesso seu próprio workspace (200 OK)');

    // Manager do Tenant A acessando seu próprio recurso (Manager tem permissão de diagnósticos)
    const resManagerAInA = await app.inject({
      method: 'GET',
      url: '/api/v1/workspaces/workspace-tenant-a/meta-catalogs/cat-001/diagnostics',
      headers: { authorization: `Bearer ${managerTokenA}` }
    });
    assert(resManagerAInA.statusCode === 200, 'Manager do Tenant A acessa diagnósticos do seu workspace (200 OK)');

    // Viewer do Tenant A tentando acessar diagnósticos (bloqueado por role, mesmo no mesmo tenant)
    const resViewerAInA = await app.inject({
      method: 'GET',
      url: '/api/v1/workspaces/workspace-tenant-a/meta-catalogs/cat-001/diagnostics',
      headers: { authorization: `Bearer ${viewerTokenA}` }
    });
    assert(resViewerAInA.statusCode === 403, 'Viewer do Tenant A é bloqueado por RBAC (não possui role MANAGER+)');

    // Super Admin acessando recurso do Tenant A
    const resAdminInA = await app.inject({
      method: 'GET',
      url: '/api/v1/workspaces/workspace-tenant-a/meta-catalogs/cat-001/diagnostics',
      headers: { authorization: `Bearer ${superAdminToken}` }
    });
    assert(resAdminInA.statusCode === 200, 'Super Admin tem acesso global ao Tenant A');

    // Super Admin acessando recurso do Tenant B
    const resAdminInB = await app.inject({
      method: 'GET',
      url: '/api/v1/workspaces/workspace-tenant-b/meta-catalogs/cat-002/diagnostics',
      headers: { authorization: `Bearer ${superAdminToken}` }
    });
    assert(resAdminInB.statusCode === 200, 'Super Admin tem acesso global ao Tenant B');
  } finally {
    await app.close();
    await teardownIntegrationTest();
  }

  const elapsed = Date.now() - startTime;

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`📊 RESULTADO FINAL DOS TESTES DE AUTH & RBAC`);
  console.log('═'.repeat(60));
  console.log(`  Total de testes: ${totalTests}`);
  console.log(`  ✅ Passou:        ${passedTests}`);
  console.log(`  ❌ Falhou:        ${failures.length}`);
  console.log(`  ⏱️  Tempo total:   ${elapsed}ms`);

  if (failures.length > 0) {
    console.log('\n🔴 Falhas encontradas:');
    failures.forEach(f => console.log(`  - ${f}`));
    process.exit(1);
  }

  console.log('\n🎉 Todos os testes de Autenticação JWT, RBAC e Isolamento Multi-Tenant passaram com 100% de sucesso!');
  process.exit(0);
}

runAuthRbacTests().catch((err) => {
  console.error('\n💥 Erro crítico no teste de auth:', err);
  process.exit(1);
});
