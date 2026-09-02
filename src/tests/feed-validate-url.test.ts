import { createServer, Server } from 'http';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { AddressInfo } from 'net';
import { buildServer } from '../server.js';
import { AuthUser } from '../modules/auth/auth.middleware.js';
import { redisClient } from '../infra/redis/redis-client.js';

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
  console.log(`📡 ${title}`);
  console.log('─'.repeat(60));
}

const fixturesDir = resolve(process.cwd(), 'src/tests/fixtures');
const xmlFixture = readFileSync(resolve(fixturesDir, 'autocerto-sample.xml'));
const jsonFixture = readFileSync(resolve(fixturesDir, 'vehicles-4boss.json'));

function startFixtureServer(
  handler: (req: import('http').IncomingMessage, res: import('http').ServerResponse) => void
): Promise<{ server: Server; baseUrl: string }> {
  return new Promise((resolvePromise, reject) => {
    const server = createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as AddressInfo;
      resolvePromise({ server, baseUrl: `http://127.0.0.1:${address.port}` });
    });
    server.on('error', reject);
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    server.close((err) => (err ? reject(err) : resolvePromise()));
  });
}

async function runFeedValidateUrlTestSuite() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   📡 QA — Validação de URL de Feed (validate-url)            ║');
  console.log('║   SaaS Auto Catálogo Backend API                            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  const app = await buildServer();
  const startTime = Date.now();

  const managerTenantA: AuthUser = {
    id: 'usr-manager-a',
    email: 'manager@autoelite.com.br',
    name: 'Marcos Manager',
    isSuperAdmin: false,
    workspaceId: 'workspace-tenant-a',
    role: 'MANAGER',
  };

  const viewerTenantA: AuthUser = {
    id: 'usr-viewer-a',
    email: 'viewer@autoelite.com.br',
    name: 'Ana Viewer',
    isSuperAdmin: false,
    workspaceId: 'workspace-tenant-a',
    role: 'VIEWER',
  };

  const tokenManagerA = app.jwt.sign(managerTenantA);
  const tokenViewerA = app.jwt.sign(viewerTenantA);

  const endpoint = '/api/v1/workspaces/workspace-tenant-a/feeds/validate-url';

  try {
    // ─────────────────────────────────────────────────────────────────────────
    // 1. RBAC
    // ─────────────────────────────────────────────────────────────────────────
    section('1. RBAC — validate-url');

    const noAuthRes = await app.inject({
      method: 'POST',
      url: endpoint,
      payload: { url: 'https://example.com/feed.xml' },
    });
    assert(noAuthRes.statusCode === 401, 'Sem token retorna 401');

    const viewerRes = await app.inject({
      method: 'POST',
      url: endpoint,
      headers: { authorization: `Bearer ${tokenViewerA}` },
      payload: { url: 'https://example.com/feed.xml' },
    });
    assert(viewerRes.statusCode === 403, 'VIEWER retorna 403');

    // ─────────────────────────────────────────────────────────────────────────
    // 2. XML válido
    // ─────────────────────────────────────────────────────────────────────────
    section('2. XML válido');

    const xmlServer = await startFixtureServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8' });
      res.end(xmlFixture);
    });

    const xmlRes = await app.inject({
      method: 'POST',
      url: endpoint,
      headers: { authorization: `Bearer ${tokenManagerA}` },
      payload: { url: `${xmlServer.baseUrl}/feed.xml` },
    });
    const xmlBody = JSON.parse(xmlRes.payload);

    assert(xmlRes.statusCode === 200, 'XML válido retorna 200');
    assert(xmlBody.valid === true, 'XML válido: valid=true', JSON.stringify(xmlBody));
    assert(xmlBody.vehicleCount > 0, 'XML válido: vehicleCount > 0', String(xmlBody.vehicleCount));
    assert(xmlBody.detectedFormat === 'xml', 'XML válido: detectedFormat=xml', xmlBody.detectedFormat);
    assert(
      typeof xmlBody.suggestedPresetId === 'string',
      'XML válido: suggestedPresetId presente',
      xmlBody.suggestedPresetId
    );

    await closeServer(xmlServer.server);

    // ─────────────────────────────────────────────────────────────────────────
    // 3. JSON rejeitado
    // ─────────────────────────────────────────────────────────────────────────
    section('3. JSON rejeitado');

    const jsonServer = await startFixtureServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(jsonFixture);
    });

    const jsonRes = await app.inject({
      method: 'POST',
      url: endpoint,
      headers: { authorization: `Bearer ${tokenManagerA}` },
      payload: { url: `${jsonServer.baseUrl}/vehicles` },
    });
    const jsonBody = JSON.parse(jsonRes.payload);

    assert(jsonRes.statusCode === 200, 'JSON rejeitado retorna 200');
    assert(jsonBody.valid === false, 'JSON rejeitado: valid=false');
    assert(jsonBody.detectedFormat === 'json', 'JSON rejeitado: detectedFormat=json');
    assert(
      jsonBody.error === 'Formato não suportado — esperado XML',
      'JSON rejeitado: mensagem correta',
      jsonBody.error
    );

    await closeServer(jsonServer.server);

    // ─────────────────────────────────────────────────────────────────────────
    // 4. URL inacessível (HTTP 404)
    // ─────────────────────────────────────────────────────────────────────────
    section('4. URL inacessível');

    const notFoundServer = await startFixtureServer((_req, res) => {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    });

    const notFoundRes = await app.inject({
      method: 'POST',
      url: endpoint,
      headers: { authorization: `Bearer ${tokenManagerA}` },
      payload: { url: `${notFoundServer.baseUrl}/missing.xml` },
    });
    const notFoundBody = JSON.parse(notFoundRes.payload);

    assert(notFoundRes.statusCode === 200, 'HTTP 404 retorna 200 com valid=false');
    assert(notFoundBody.valid === false, 'HTTP 404: valid=false');
    assert(
      notFoundBody.error?.includes('HTTP 404'),
      'HTTP 404: mensagem amigável',
      notFoundBody.error
    );

    await closeServer(notFoundServer.server);

    const dnsRes = await app.inject({
      method: 'POST',
      url: endpoint,
      headers: { authorization: `Bearer ${tokenManagerA}` },
      payload: { url: 'http://this-host-definitely-does-not-exist-xyz123.invalid/feed.xml' },
    });
    const dnsBody = JSON.parse(dnsRes.payload);

    assert(dnsRes.statusCode === 200, 'DNS failure retorna 200 com valid=false');
    assert(dnsBody.valid === false, 'DNS failure: valid=false');
    assert(
      dnsBody.error === 'URL inacessível — verifique o endereço',
      'DNS failure: mensagem amigável',
      dnsBody.error
    );

    // ─────────────────────────────────────────────────────────────────────────
    // 5. Timeout
    // ─────────────────────────────────────────────────────────────────────────
    section('5. Timeout');

    const slowServer = await startFixtureServer((_req, res) => {
      setTimeout(() => {
        res.writeHead(200, { 'Content-Type': 'application/xml' });
        res.end(xmlFixture);
      }, 12_000);
    });

    const timeoutRes = await app.inject({
      method: 'POST',
      url: endpoint,
      headers: { authorization: `Bearer ${tokenManagerA}` },
      payload: { url: `${slowServer.baseUrl}/slow.xml` },
    });
    const timeoutBody = JSON.parse(timeoutRes.payload);

    assert(timeoutRes.statusCode === 200, 'Timeout retorna 200 com valid=false');
    assert(timeoutBody.valid === false, 'Timeout: valid=false');
    assert(
      timeoutBody.error === 'Tempo esgotado ao acessar o feed',
      'Timeout: mensagem correta',
      timeoutBody.error
    );

    await closeServer(slowServer.server);

    // ─────────────────────────────────────────────────────────────────────────
    // 6. Body inválido
    // ─────────────────────────────────────────────────────────────────────────
    section('6. Validação de body');

    const invalidBodyRes = await app.inject({
      method: 'POST',
      url: endpoint,
      headers: { authorization: `Bearer ${tokenManagerA}` },
      payload: { url: 'not-a-valid-url' },
    });
    assert(invalidBodyRes.statusCode === 422, 'URL inválida retorna 422');
  } finally {
    await app.close();
    redisClient.disconnect();
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`Resultado: ${passedTests}/${totalTests} testes passaram (${elapsed}s)`);

  if (failures.length > 0) {
    console.error('\nFalhas:');
    failures.forEach((f) => console.error(`  - ${f}`));
    process.exit(1);
  }

  console.log('\n✅ Todos os testes de validate-url passaram!');
  process.exit(0);
}

runFeedValidateUrlTestSuite().catch((err) => {
  console.error('Erro fatal na suíte de testes:', err);
  process.exit(1);
});
