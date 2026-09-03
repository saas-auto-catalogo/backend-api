import { Readable, PassThrough } from 'stream';
import { FeedSourceType } from '@prisma/client';
import { XmlStreamParser } from '../xml-ingestion/stream-parser.js';

export type DetectedFormat = 'xml' | 'json' | 'unknown';

export const SNIFF_BYTES = 512;

export type JsonFeedExtractResult =
  | { ok: true; vehicles: Record<string, unknown>[] }
  | { ok: false; error: string };

/**
 * Lê os primeiros bytes da stream e devolve um PassThrough "combined" que
 * contém o prefixo + o restante, permitindo sniff de formato sem perder dados.
 */
export async function splitStreamPrefix(
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

export function detectFeedFormat(contentType: string, prefix: Buffer): DetectedFormat {
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

export async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * Parseia um buffer JSON no formato { vehicles: [...] } e devolve o array de
 * veículos (não apenas a contagem) para permitir a ingestão no worker.
 */
export function extractJsonVehicles(buffer: Buffer): JsonFeedExtractResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(buffer.toString('utf-8'));
  } catch {
    return { ok: false, error: 'Formato não suportado — JSON inválido' };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'Formato não suportado — JSON inválido' };
  }

  const vehicles = (parsed as { vehicles?: unknown }).vehicles;
  if (!Array.isArray(vehicles)) {
    return { ok: false, error: 'Formato não suportado — JSON inválido' };
  }

  if (vehicles.length === 0) {
    return { ok: false, error: 'Formato não suportado — JSON inválido' };
  }

  return { ok: true, vehicles: vehicles as Record<string, unknown>[] };
}

export function suggestXmlPreset(hostname: string, detectedRootTag?: string): FeedSourceType {
  const host = hostname.toLowerCase();
  if (host.includes('autocerto')) return 'AUTOCERTO';
  if (host.includes('altimus')) return 'ALTIMUS';
  if (host.includes('sisvag') || detectedRootTag?.toLowerCase() === 'sisvagfeed') return 'SISVAG';
  if (host.includes('bomcontrole')) return 'BOMCONTROLE';
  if (host.includes('webmotors')) return 'WEBMOTORS';
  return 'GENERIC_XML';
}

export function suggestJsonPreset(hostname: string): FeedSourceType {
  const host = hostname.toLowerCase();
  if (host.includes('4boss') || host.includes('base44')) return 'BASE44';
  if (host.includes('jrcaseminovos') || host.includes('spicedigital')) return 'SPICE_DIGITAL';
  return 'GENERIC_JSON';
}

/**
 * Ingesta uma stream já resolvida (prefixo + conteúdo) a partir do formato
 * detectado, devolvendo a lista de veículos brutos. Testável sem BullMQ.
 */
export async function ingestFeedStream(
  stream: Readable,
  contentType: string
): Promise<{ format: DetectedFormat; rawVehicles: Record<string, unknown>[] }> {
  const { prefix, combined } = await splitStreamPrefix(stream, SNIFF_BYTES);
  const format = detectFeedFormat(contentType, prefix);

  if (format === 'json') {
    const buffer = await streamToBuffer(combined);
    const parsed = extractJsonVehicles(buffer);
    if (!parsed.ok) {
      throw new Error(parsed.error);
    }
    return { format, rawVehicles: parsed.vehicles };
  }

  const rawVehicles: Record<string, unknown>[] = [];
  await XmlStreamParser.parseStream(combined, async (vehicle) => {
    rawVehicles.push(vehicle);
  });

  return { format, rawVehicles };
}
