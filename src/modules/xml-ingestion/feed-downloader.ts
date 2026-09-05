import { Readable, PassThrough } from 'stream';
import { createGunzip } from 'zlib';
import * as unzipper from 'unzipper';
import { CircuitBreakerManager, CircuitState } from './circuit-breaker.js';
import { executeWithRetry, RetryOptions } from './retry-policy.js';

export interface FeedAuthOptions {
  type?: 'NONE' | 'BASIC' | 'BEARER' | 'CUSTOM_HEADERS';
  username?: string;
  password?: string;
  token?: string;
  customHeaders?: Record<string, string>;
}

export interface DownloadFeedOptions {
  auth?: FeedAuthOptions;
  timeoutMs?: number;
  retryOptions?: RetryOptions;
  bypassCircuitBreaker?: boolean;
}

export interface DownloadFeedResult {
  stream: Readable;
  contentType: string;
  contentEncoding?: string;
  isCompressed: boolean;
  compressionType?: 'GZIP' | 'ZIP';
  sourceUrl: string;
}

/**
 * Faz download resiliente em streaming de feeds remotos com descompressão automática e Circuit Breaker.
 */
export async function downloadFeedStream(
  feedUrl: string,
  options: DownloadFeedOptions = {}
): Promise<DownloadFeedResult> {
  const urlObj = new URL(feedUrl);
  const host = urlObj.hostname;
  const timeoutMs = options.timeoutMs ?? 60000; // 60 segundos padrão

  const circuitBreaker = CircuitBreakerManager.getBreaker(host);

  // 1. Checagem do Circuit Breaker
  if (!options.bypassCircuitBreaker && !circuitBreaker.canExecute()) {
    throw new Error(
      `[CircuitBreaker:OPEN] O host de DMS '${host}' está temporariamente bloqueado devido a falhas consecutivas recentes. Tente novamente mais tarde.`
    );
  }

  // 2. Montagem dos Headers HTTP de Autenticação
  const headers: Record<string, string> = {
    'User-Agent': 'SaaS-Auto-Catalogo-Feed-Ingestor/1.0 (+https://drivesync.me)',
    'Accept': 'application/xml, text/xml, application/zip, application/x-gzip, */*;q=0.8',
    'Accept-Encoding': 'gzip, deflate',
    ...(options.auth?.customHeaders || {})
  };

  if (options.auth?.type === 'BASIC' && options.auth.username && options.auth.password) {
    const creds = Buffer.from(`${options.auth.username}:${options.auth.password}`).toString('base64');
    headers['Authorization'] = `Basic ${creds}`;
  } else if (options.auth?.type === 'BEARER' && options.auth.token) {
    headers['Authorization'] = `Bearer ${options.auth.token}`;
  }

  // 3. Execução com Retries e Exponential Backoff
  try {
    const result = await executeWithRetry(
      async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        try {
          const response = await fetch(feedUrl, {
            method: 'GET',
            headers,
            signal: controller.signal
          });

          if (!response.ok) {
            throw new Error(`Falha HTTP ao baixar feed: ${response.status} ${response.statusText}`);
          }

          if (!response.body) {
            throw new Error('Corpo de resposta HTTP vazio retornado pelo servidor de feed.');
          }

          const rawNodeStream = Readable.fromWeb(response.body as any);
          const contentType = response.headers.get('content-type') || '';
          const contentEncoding = response.headers.get('content-encoding') || '';

          // 4. Detecção e Aplicação de Pipeline de Descompressão
          const isGzip =
            contentType.includes('gzip') ||
            feedUrl.toLowerCase().endsWith('.gz') ||
            feedUrl.toLowerCase().endsWith('.gzip');

          const isZip =
            contentType.includes('zip') ||
            feedUrl.toLowerCase().endsWith('.zip');

          let processedStream: Readable = rawNodeStream;
          let compressionType: 'GZIP' | 'ZIP' | undefined;

          if (isGzip) {
            compressionType = 'GZIP';
            const gunzip = createGunzip();
            processedStream = rawNodeStream.pipe(gunzip);
          } else if (isZip) {
            compressionType = 'ZIP';
            // Extrai o primeiro arquivo do arquivo .zip em stream
            const unzipStream = rawNodeStream.pipe(unzipper.ParseOne());
            processedStream = unzipStream;
          }

          return {
            stream: processedStream,
            contentType,
            contentEncoding,
            isCompressed: isGzip || isZip,
            compressionType,
            sourceUrl: feedUrl
          };
        } finally {
          clearTimeout(timer);
        }
      },
      options.retryOptions
    );

    circuitBreaker.recordSuccess();
    return result;
  } catch (error) {
    circuitBreaker.recordFailure();
    throw error;
  }
}
