import { downloadFeedStream } from '../xml-ingestion/feed-downloader.js';
import { XmlStreamParser } from '../xml-ingestion/stream-parser.js';
import {
  detectFeedFormat,
  extractJsonVehicles,
  splitStreamPrefix,
  streamToBuffer,
  suggestJsonPreset,
  suggestXmlPreset,
  SNIFF_BYTES,
} from './feed-format.parser.js';
import type { DetectedFormat } from './feed-format.parser.js';

const VALIDATE_TIMEOUT_MS = 10_000;

export type { DetectedFormat };

export interface ValidateFeedUrlResult {
  valid: boolean;
  vehicleCount?: number;
  contentType?: string;
  detectedFormat?: DetectedFormat;
  suggestedPresetId?: string;
  error?: string;
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
    const detectedFormat = detectFeedFormat(contentType, prefix);
    const hostname = new URL(url).hostname;

    if (detectedFormat === 'json') {
      try {
        const buffer = await streamToBuffer(combined);
        const parsed = extractJsonVehicles(buffer);

        if (!parsed.ok) {
          return {
            valid: false,
            contentType,
            detectedFormat: 'json',
            error: parsed.error,
          };
        }

        return {
          valid: true,
          vehicleCount: parsed.vehicles.length,
          contentType,
          detectedFormat: 'json',
          suggestedPresetId: suggestJsonPreset(hostname),
        };
      } catch {
        return {
          valid: false,
          contentType,
          detectedFormat: 'json',
          error: 'Formato não suportado — JSON inválido',
        };
      }
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
        suggestedPresetId: suggestXmlPreset(hostname, stats.detectedRootTag),
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
