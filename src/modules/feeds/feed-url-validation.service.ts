import { Readable, PassThrough } from 'stream';
import { FeedSourceType } from '@prisma/client';
import { downloadFeedStream } from '../xml-ingestion/feed-downloader.js';
import { XmlStreamParser } from '../xml-ingestion/stream-parser.js';

const VALIDATE_TIMEOUT_MS = 10_000;
const SNIFF_BYTES = 512;

export type DetectedFormat = 'xml' | 'json' | 'unknown';

export interface ValidateFeedUrlResult {
  valid: boolean;
  vehicleCount?: number;
  contentType?: string;
  detectedFormat?: DetectedFormat;
  suggestedPresetId?: string;
  error?: string;
}

async function splitStreamPrefix(
  input: Readable,
  prefixLength: number
): Promise<{ prefix: Buffer; combined: Readable }> {
  const chunks: Buffer[] = [];
  let collected = 0;

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      input.removeListener('data', onData);
      input.removeListener('error', reject);
      input.removeListener('end', onEnd);
    };

    const onData = (chunk: Buffer | string) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);

      if (collected < prefixLength) {
        const remaining = prefixLength - collected;
        if (buf.length <= remaining) {
          chunks.push(buf);
          collected += buf.length;
          if (collected >= prefixLength) {
            cleanup();
            input.pause();
            const prefix = Buffer.concat(chunks);
            const combined = new PassThrough();
            combined.write(prefix);
            input.pipe(combined);
            resolve({ prefix, combined });
          }
        } else {
          cleanup();
          input.pause();
          const prefixPart = buf.subarray(0, remaining);
          const overflow = buf.subarray(remaining);
          const prefix = Buffer.concat([...chunks, prefixPart]);
          const combined = new PassThrough();
          combined.write(prefix);
          combined.write(overflow);
          input.pipe(combined);
          resolve({ prefix, combined });
        }
      }
    };

    const onEnd = () => {
      cleanup();
      const prefix = Buffer.concat(chunks);
      const combined = new PassThrough();
      combined.write(prefix);
      combined.end();
      resolve({ prefix, combined });
    };

    input.on('data', onData);
    input.on('error', reject);
    input.on('end', onEnd);
    input.resume();
  });
}

function detectFormat(contentType: string, prefix: Buffer): DetectedFormat {
  const ct = contentType.toLowerCase();
  const text = prefix.toString('utf-8').trimStart();

  if (ct.includes('json') || text.startsWith('{') || text.startsWith('[')) {
    return 'json';
  }
  if (ct.includes('xml') || text.startsWith('<') || text.startsWith('<?xml')) {
    return 'xml';
  }
  return 'unknown';
}

function suggestPreset(hostname: string, detectedRootTag?: string): FeedSourceType {
  const host = hostname.toLowerCase();
  if (host.includes('autocerto')) return 'AUTOCERTO';
  if (host.includes('altimus')) return 'ALTIMUS';
  if (host.includes('sisvag') || detectedRootTag?.toLowerCase() === 'sisvagfeed') return 'SISVAG';
  if (host.includes('bomcontrole')) return 'BOMCONTROLE';
  if (host.includes('webmotors')) return 'WEBMOTORS';
  return 'GENERIC_XML';
}

function mapDownloadError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : '';

  if (
    message.includes('abort') ||
    message.includes('AbortError') ||
    message.includes('aborted') ||
    cause.includes('abort')
  ) {
    return 'Tempo esgotado ao acessar o feed';
  }

  const httpMatch = message.match(/Falha HTTP ao baixar feed: (\d+)/);
  if (httpMatch) {
    return `Não foi possível acessar o feed (HTTP ${httpMatch[1]})`;
  }

  if (
    message.includes('ENOTFOUND') ||
    message.includes('getaddrinfo') ||
    message.includes('fetch failed') ||
    message.includes('ECONNREFUSED') ||
    message.includes('EAI_AGAIN') ||
    cause.includes('ENOTFOUND')
  ) {
    return 'URL inacessível — verifique o endereço';
  }

  return 'URL inacessível — verifique o endereço';
}

export class FeedUrlValidationService {
  async validate(url: string): Promise<ValidateFeedUrlResult> {
    try {
      new URL(url);
    } catch {
      return {
        valid: false,
        error: 'URL inacessível — verifique o endereço',
      };
    }

    let downloadResult;
    try {
      downloadResult = await downloadFeedStream(url, {
        timeoutMs: VALIDATE_TIMEOUT_MS,
        bypassCircuitBreaker: true,
        retryOptions: { maxAttempts: 1 },
      });
    } catch (error) {
      return {
        valid: false,
        error: mapDownloadError(error),
      };
    }

    const { prefix, combined } = await splitStreamPrefix(downloadResult.stream, SNIFF_BYTES);
    const contentType = downloadResult.contentType;
    const detectedFormat = detectFormat(contentType, prefix);
    const hostname = new URL(url).hostname;

    if (detectedFormat === 'json') {
      return {
        valid: false,
        contentType,
        detectedFormat: 'json',
        error: 'Formato não suportado — esperado XML',
      };
    }

    try {
      const stats = await XmlStreamParser.parseStream(combined, async () => {});

      if (detectedFormat === 'unknown' && stats.totalProcessed === 0 && !stats.detectedRootTag) {
        return {
          valid: false,
          contentType,
          detectedFormat: 'unknown',
          error: 'Formato não suportado — esperado XML',
        };
      }

      return {
        valid: true,
        vehicleCount: stats.totalProcessed,
        contentType,
        detectedFormat: detectedFormat === 'unknown' ? 'xml' : detectedFormat,
        suggestedPresetId: suggestPreset(hostname, stats.detectedRootTag),
      };
    } catch {
      return {
        valid: false,
        contentType,
        detectedFormat: detectedFormat === 'unknown' ? 'unknown' : detectedFormat,
        error: 'Formato não suportado — esperado XML',
      };
    }
  }
}

export const feedUrlValidationService = new FeedUrlValidationService();
