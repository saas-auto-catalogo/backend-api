import { createServer, Server } from 'http';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { AddressInfo } from 'net';
import { gzipSync } from 'zlib';
import { buildServer } from '../server.js';
import { AuthUser } from '../modules/auth/auth.middleware.js';
import { teardownIntegrationTest } from './test-teardown.js';

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
const spiceJsonFixture = readFileSync(resolve(fixturesDir, 'vehicles-jrcaseminovos.json'));

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
  console.log('║   DriveSync Backend API                            ║');
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
    // 3. JSON válido (4boss / Base44)
    // ─────────────────────────────────────────────────────────────────────────
    section('3. JSON válido (4boss / Base44)');

    const jsonServer = await startFixtureServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(jsonFixture);
    });
    const jsonServerPort = (jsonServer.server.address() as AddressInfo).port;

    const jsonRes = await app.inject({
      method: 'POST',
      url: endpoint,
      headers: { authorization: `Bearer ${tokenManagerA}` },
      payload: { url: `http://www.4boss.localhost:${jsonServerPort}/vehicles` },
    });
    const jsonBody = JSON.parse(jsonRes.payload);

    assert(jsonRes.statusCode === 200, 'JSON válido retorna 200');
    assert(jsonBody.valid === true, 'JSON válido: valid=true', JSON.stringify(jsonBody));
    assert(jsonBody.vehicleCount === 3, 'JSON válido: vehicleCount=3', String(jsonBody.vehicleCount));
    assert(jsonBody.detectedFormat === 'json', 'JSON válido: detectedFormat=json', jsonBody.detectedFormat);
    assert(
      jsonBody.suggestedPresetId === 'BASE44',
      'JSON válido: suggestedPresetId=BASE44',
      jsonBody.suggestedPresetId
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

    // ─────────────────────────────────────────────────────────────────────────
    // 7. Gzip via fetch (sem double decompress)
    // ─────────────────────────────────────────────────────────────────────────
    section('7. Gzip via fetch (sem double decompress)');

    const gzipJsonServer = await startFixtureServer((_req, res) => {
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Encoding': 'gzip',
      });
      res.end(gzipSync(jsonFixture));
    });
    const gzipJsonServerPort = (gzipJsonServer.server.address() as AddressInfo).port;

    const gzipJsonRes = await app.inject({
      method: 'POST',
      url: endpoint,
      headers: { authorization: `Bearer ${tokenManagerA}` },
      payload: { url: `http://www.4boss.localhost:${gzipJsonServerPort}/vehicles` },
    });
    const gzipJsonBody = JSON.parse(gzipJsonRes.payload);

    assert(gzipJsonRes.statusCode === 200, 'Gzip-encoded JSON retorna 200');
    assert(gzipJsonBody.valid === true, 'Gzip-encoded JSON: valid=true', JSON.stringify(gzipJsonBody));
    assert(gzipJsonBody.vehicleCount === 3, 'Gzip-encoded JSON: vehicleCount=3', String(gzipJsonBody.vehicleCount));
    assert(gzipJsonBody.detectedFormat === 'json', 'Gzip-encoded JSON: detectedFormat=json');
    assert(
      gzipJsonBody.suggestedPresetId === 'BASE44',
      'Gzip-encoded JSON: suggestedPresetId=BASE44',
      gzipJsonBody.suggestedPresetId
    );

    await closeServer(gzipJsonServer.server);

    // ─────────────────────────────────────────────────────────────────────────
    // 8. JSON Spice Digital (jrcaseminovos)
    // ─────────────────────────────────────────────────────────────────────────
    section('8. JSON Spice Digital (jrcaseminovos)');

    const spiceServer = await startFixtureServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(spiceJsonFixture);
    });
    const spiceServerPort = (spiceServer.server.address() as AddressInfo).port;

    const spiceRes = await app.inject({
      method: 'POST',
      url: endpoint,
      headers: { authorization: `Bearer ${tokenManagerA}` },
      payload: { url: `http://www.jrcaseminovos.localhost:${spiceServerPort}/vehicles` },
    });
    const spiceBody = JSON.parse(spiceRes.payload);

    assert(spiceRes.statusCode === 200, 'JSON Spice retorna 200');
    assert(spiceBody.valid === true, 'JSON Spice: valid=true', JSON.stringify(spiceBody));
    assert(spiceBody.vehicleCount === 4, 'JSON Spice: vehicleCount=4', String(spiceBody.vehicleCount));
    assert(
      spiceBody.suggestedPresetId === 'SPICE_DIGITAL',
      'JSON Spice: suggestedPresetId=SPICE_DIGITAL',
      spiceBody.suggestedPresetId
    );

    await closeServer(spiceServer.server);

    // ─────────────────────────────────────────────────────────────────────────
    // 9. JSON genérico (GENERIC_JSON)
    // ─────────────────────────────────────────────────────────────────────────
    section('9. JSON genérico (GENERIC_JSON)');

    const genericJsonServer = await startFixtureServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(jsonFixture);
    });
    const genericJsonServerPort = (genericJsonServer.server.address() as AddressInfo).port;

    const genericJsonRes = await app.inject({
      method: 'POST',
      url: endpoint,
      headers: { authorization: `Bearer ${tokenManagerA}` },
      payload: { url: `http://feed.example.localhost:${genericJsonServerPort}/vehicles` },
    });
    const genericJsonBody = JSON.parse(genericJsonRes.payload);

    assert(genericJsonRes.statusCode === 200, 'JSON genérico retorna 200');
    assert(genericJsonBody.valid === true, 'JSON genérico: valid=true', JSON.stringify(genericJsonBody));
    assert(
      genericJsonBody.suggestedPresetId === 'GENERIC_JSON',
      'JSON genérico: suggestedPresetId=GENERIC_JSON',
      genericJsonBody.suggestedPresetId
    );

    await closeServer(genericJsonServer.server);
  } finally {
    await app.close();
    await teardownIntegrationTest();
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
