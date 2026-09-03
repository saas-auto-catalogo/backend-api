import { buildServer } from '../server.js';
import { prisma } from '../lib/prisma.js';
import { teardownIntegrationTest, resetAuthRateLimits } from './test-teardown.js';
import { loadIntegrationSeedContext } from './seed-test-context.js';
import { withRegisterConsent } from './legal-test-helpers.js';

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
  console.log(`👤 ${title}`);
  console.log('─'.repeat(60));
}

async function runProfileTestSuite() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   👤 QA — APIs de Perfil (User + Workspace/Dealership)        ║');
  console.log('║   SaaS Auto Catálogo Backend API                            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  const app = await buildServer();
  await resetAuthRateLimits();
  const seed = await loadIntegrationSeedContext();
  const startTime = Date.now();
  const uniqueEmail = `profile-test-${Date.now()}@test.local`;
  const password = 'SenhaSegura123!';

  try {
    section('1. PATCH /auth/me — perfil do usuário');

    const resRegister = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: await withRegisterConsent({
        name: 'Usuario Perfil',
        email: uniqueEmail,
        password,
        workspaceName: 'Revenda Perfil Test',
      }),
    });
    assert(resRegister.statusCode === 201, `Register retorna 201 (got ${resRegister.statusCode})`);

    const registerData = JSON.parse(resRegister.payload);
    const accessToken = registerData.accessToken as string;

    const resPatchName = await app.inject({
      method: 'PATCH',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { name: 'Usuario Perfil Atualizado' },
    });
    assert(resPatchName.statusCode === 200, `PATCH /me com name retorna 200 (got ${resPatchName.statusCode})`);

    const patchNameBody = JSON.parse(resPatchName.payload).user;
    assert(patchNameBody?.name === 'Usuario Perfil Atualizado', 'Nome atualizado no PATCH /me');

    const resMe = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const meBody = JSON.parse(resMe.payload).user;
    assert(meBody?.name === 'Usuario Perfil Atualizado', 'GET /me reflete nome atualizado');

    const resPatchEmpty = await app.inject({
      method: 'PATCH',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {},
    });
    assert(resPatchEmpty.statusCode === 422, `PATCH /me body vazio retorna 422 (got ${resPatchEmpty.statusCode})`);

    const resPatchNoAuth = await app.inject({
      method: 'PATCH',
      url: '/api/v1/auth/me',
      payload: { name: 'Sem Token' },
    });
    assert(resPatchNoAuth.statusCode === 401, `PATCH /me sem token retorna 401 (got ${resPatchNoAuth.statusCode})`);

    if (!seed.fromDatabase) {
      console.log('    ℹ️ Pulando testes de workspace profile — seed não disponível no banco');
    } else {
      const tokenOwnerA = app.jwt.sign(seed.ownerA);
      const tokenManagerA = app.jwt.sign(seed.managerA);
      const tokenViewerA = app.jwt.sign(seed.viewerA);
      const tokenOwnerB = app.jwt.sign(seed.ownerB);

      section('2. GET /workspaces/:id/profile');

      const resGetViewer = await app.inject({
        method: 'GET',
        url: `/api/v1/workspaces/${seed.workspaceAId}/profile`,
        headers: { authorization: `Bearer ${tokenViewerA}` },
      });
      assert(resGetViewer.statusCode === 200, `VIEWER acessa GET profile (got ${resGetViewer.statusCode})`);

      const profileViewer = JSON.parse(resGetViewer.payload);
      assert(!!profileViewer.workspace?.id, 'Resposta contém workspace');
      assert(!!profileViewer.dealership?.tradeName, 'Resposta contém dealership principal');

      const resGetCrossTenant = await app.inject({
        method: 'GET',
        url: `/api/v1/workspaces/${seed.workspaceAId}/profile`,
        headers: { authorization: `Bearer ${tokenOwnerB}` },
      });
      assert(resGetCrossTenant.statusCode === 403, `Owner tenant B bloqueado no tenant A (got ${resGetCrossTenant.statusCode})`);

      section('3. PATCH /workspaces/:id/profile');

      const resPatchManager = await app.inject({
        method: 'PATCH',
        url: `/api/v1/workspaces/${seed.workspaceAId}/profile`,
        headers: { authorization: `Bearer ${tokenManagerA}` },
        payload: { tradeName: 'Tentativa Manager' },
      });
      assert(resPatchManager.statusCode === 403, `MANAGER bloqueado no PATCH profile (got ${resPatchManager.statusCode})`);

      const resPatchOwner = await app.inject({
        method: 'PATCH',
        url: `/api/v1/workspaces/${seed.workspaceAId}/profile`,
        headers: { authorization: `Bearer ${tokenOwnerA}` },
        payload: {
          tradeName: 'Auto Elite Motors Atualizado',
          city: 'Campinas',
          state: 'SP',
        },
      });
      assert(resPatchOwner.statusCode === 200, `OWNER atualiza profile (got ${resPatchOwner.statusCode})`);

      const profileUpdated = JSON.parse(resPatchOwner.payload);
      assert(
        profileUpdated.dealership?.tradeName === 'Auto Elite Motors Atualizado',
        'tradeName atualizado no dealership',
      );
      assert(profileUpdated.workspace?.city === 'Campinas', 'city atualizada no workspace');

      const auditLog = await prisma.auditLog.findFirst({
        where: {
          workspaceId: seed.workspaceAId,
          action: 'WORKSPACE_PROFILE_UPDATED',
          actorUserId: seed.ownerA.id,
        },
        orderBy: { createdAt: 'desc' },
      });
      assert(auditLog !== null, 'Audit log WORKSPACE_PROFILE_UPDATED registrado');
    }
  } finally {
    await app.close();
    await teardownIntegrationTest();
  }

  const elapsed = Date.now() - startTime;
  console.log('\n════════════════════════════════════════════════════════════');
  console.log('📊 RESULTADO FINAL DOS TESTES DE PERFIL');
  console.log('════════════════════════════════════════════════════════════');
  console.log(`  Total de testes: ${totalTests}`);
  console.log(`  ✅ Passou:        ${passedTests}`);
  console.log(`  ❌ Falhou:        ${failures.length}`);
  console.log(`  ⏱️  Tempo total:   ${elapsed}ms`);

  if (failures.length > 0) {
    console.log('\nFalhas:');
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  }

  console.log('\n🎉 Todos os testes de perfil passaram com 100% de sucesso!');
  process.exit(0);
}

runProfileTestSuite().catch((err) => {
  console.error('Erro fatal na suíte de testes de perfil:', err);
  process.exit(1);
});
