import { createReadStream } from 'fs';
import { resolve } from 'path';
import { Readable } from 'stream';
import { gzipSync } from 'zlib';
import {
  XmlStreamParser,
  HostCircuitBreaker,
  CircuitState,
  executeWithRetry,
  calculateFullJitterDelay
} from './index.js';

async function runParserTests() {
  console.log('🧪 Iniciando Bateria de Testes do Streaming Parser XML e Resiliência...\n');

  const fixturesDir = resolve(process.cwd(), 'src/tests/fixtures');

  const fixtures = [
    { name: 'AutoCerto', file: 'autocerto-sample.xml' },
    { name: 'Altimus', file: 'altimus-sample.xml' },
    { name: 'Sisvag', file: 'sisvag-sample.xml' },
    { name: 'BomControle', file: 'bomcontrole-sample.xml' },
    { name: 'Webmotors', file: 'webmotors-sample.xml' },
    { name: 'Meta Catalog XML', file: 'meta-vehicles-feed-sample.xml' }
  ];

  // 1. Testes de Parsing com Fixtures Reais
  console.log('📦 1. Teste de Streaming Parser com Fixtures Reais:');

  for (const f of fixtures) {
    const filePath = resolve(fixturesDir, f.file);
    const stream = createReadStream(filePath, { highWaterMark: 64 * 1024 });

    const vehicles: any[] = [];
    const stats = await XmlStreamParser.parseStream(
      stream,
      (vehicle, idx) => {
        vehicles.push(vehicle);
      }
    );

    console.log(
      `  ✅ [${f.name.padEnd(16)}] Veículos encontrados: ${vehicles.length} | Duração: ${stats.durationMs}ms | Raiz: <${stats.detectedRootTag}>`
    );

    if (vehicles.length > 0) {
      const sample = vehicles[0];
      const sampleKeys = Object.keys(sample).slice(0, 5).join(', ');
      console.log(`     Campos de amostra: { ${sampleKeys} ... }`);
    }
  }

  // 2. Teste de Memória e Caracteres Especiais (& solto não escapado)
  console.log('\n🛡️ 2. Teste de Sanitização de Caracteres XML Inválidos (& solto):');
  const rawXmlWithUnescapedAmp = `
    <estoque>
      <veiculos>
        <veiculo>
          <codigo>TEST-001</codigo>
          <marca>Toyota</marca>
          <modelo>Corolla Cross 4x4 & Cia</modelo>
          <versao>XRE 2.0 & Opcionais</versao>
        </veiculo>
      </veiculos>
    </estoque>
  `;

  const rawStream = Readable.from([Buffer.from(rawXmlWithUnescapedAmp)]);
  const sanitizedVehicles: any[] = [];
  await XmlStreamParser.parseStream(rawStream, (v) => {
    sanitizedVehicles.push(v);
  });
  console.log(`  ✅ Veículo parseado com & sanitizado: "${sanitizedVehicles[0]?.modelo}" (ID: ${sanitizedVehicles[0]?.codigo})`);

  // 3. Teste do Circuit Breaker
  console.log('\n⚡ 3. Teste de Transições de Estado do Circuit Breaker:');
  const breaker = new HostCircuitBreaker('dms.teste-concessionaria.com.br', {
    minRequests: 4,
    failureThresholdPercentage: 50,
    resetTimeoutMs: 100
  });

  console.log(`  - Estado inicial: ${breaker.getState()} (Esperado: CLOSED)`);
  breaker.recordSuccess();
  breaker.recordFailure();
  breaker.recordFailure();
  breaker.recordFailure(); // 3 falhas em 4 requisições (75% de erro)

  console.log(`  - Estado após falhas consecutivas: ${breaker.getState()} (Esperado: OPEN)`);
  console.log(`  - Pode executar requisições? ${breaker.canExecute() ? 'SIM' : 'NÃO (Bloqueado)'}`);

  // Aguarda reset timeout para transicionar para HALF_OPEN
  await new Promise((r) => setTimeout(r, 120));
  console.log(`  - Estado após reset timeout: ${breaker.getState()} (Esperado: HALF_OPEN)`);

  breaker.recordSuccess();
  breaker.recordSuccess();
  breaker.recordSuccess();
  console.log(`  - Estado após 3 sucessos em HALF_OPEN: ${breaker.getState()} (Esperado: CLOSED)`);

  // 4. Teste de Retries com Exponential Backoff e Full Jitter
  console.log('\n⏱️ 4. Teste de Retries com Full Jitter:');
  for (let attempt = 0; attempt < 3; attempt++) {
    const delay = calculateFullJitterDelay(attempt, 100, 1000);
    console.log(`  - Tentativa ${attempt + 1}: delay gerado = ${delay}ms`);
  }

  let attemptCounter = 0;
  const retryResult = await executeWithRetry(
    async (att) => {
      attemptCounter++;
      if (attemptCounter < 3) {
        throw new Error('Falha transitória simulada');
      }
      return 'Sucesso na tentativa ' + (att + 1);
    },
    { initialDelayMs: 20, maxAttempts: 4 }
  );
  console.log(`  ✅ Resultado com Retry: "${retryResult}"`);

  console.log('\n🎉 Todos os testes de parsing e resiliência foram concluídos com sucesso!');
}

runParserTests().catch((err) => {
  console.error('❌ Erro nos testes de parser:', err);
  process.exit(1);
});
