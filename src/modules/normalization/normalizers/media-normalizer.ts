import { VehicleImage } from '../../../types/database.js';

export interface NormalizedMediaResult {
  images: VehicleImage[];
  heroImageUrl: string;
  isValid: boolean;
  warnings?: string[];
}

/**
 * Valida e sanitiza uma URL de imagem, forçando protocolo HTTPS quando viável.
 */
export function sanitizeImageUrl(rawUrl: unknown): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return null;
  }

  let cleaned = rawUrl.trim();

  if (!cleaned.startsWith('http://') && !cleaned.startsWith('https://')) {
    if (cleaned.startsWith('//')) {
      cleaned = 'https:' + cleaned;
    } else {
      return null;
    }
  }

  // Upgrade automático para HTTPS
  if (cleaned.startsWith('http://')) {
    cleaned = cleaned.replace(/^http:\/\//i, 'https://');
  }

  try {
    const parsed = new URL(cleaned);
    if (!parsed.hostname || parsed.hostname.length < 3) {
      return null;
    }
    return cleaned;
  } catch {
    return null;
  }
}

/**
 * Normaliza a galeria de imagens a partir de fontes heterogêneas (arrays de strings, objetos ou nós XML).
 */
export function normalizeImages(
  rawPhotos: unknown,
  rawHeroImage?: unknown,
  rawImage?: unknown
): NormalizedMediaResult {
  const warnings: string[] = [];
  const normalizedImages: VehicleImage[] = [];
  const seenUrls = new Set<string>();

  const explicitHero = sanitizeImageUrl(rawHeroImage) || sanitizeImageUrl(rawImage);

  // 1. Extração de candidatos a imagens
  const rawList: Array<{ url: unknown; fullUrl?: unknown; isPrimary?: boolean; order?: number }> = [];

  if (explicitHero) {
    rawList.push({ url: explicitHero, fullUrl: explicitHero, isPrimary: true, order: 1 });
  }

  if (Array.isArray(rawPhotos)) {
    for (const item of rawPhotos) {
      if (typeof item === 'string') {
        rawList.push({ url: item });
      } else if (typeof item === 'object' && item !== null) {
        // Formato JRCA ({ url, full, alt }) ou Altimus ({ url, principal, ordem })
        const obj = item as Record<string, any>;
        const url = obj.full || obj.fullUrl || obj.url || obj.imagem || obj._text;
        const isPrimary =
          obj.isPrimary === true ||
          obj.principal === 'sim' ||
          obj.principal === 'true' ||
          obj.destaque === 'true';
        const order = obj.order ? parseInt(String(obj.order), 10) : (obj.ordem ? parseInt(String(obj.ordem), 10) : undefined);

        if (url) {
          rawList.push({ url, fullUrl: obj.full || obj.fullUrl, isPrimary, order });
        }
      }
    }
  } else if (typeof rawPhotos === 'object' && rawPhotos !== null) {
    // Objeto XML único (ex: <fotos><foto>url</foto></fotos>)
    const obj = rawPhotos as Record<string, any>;
    const items = obj.foto || obj.imagem || obj.photos || Object.values(obj);
    if (Array.isArray(items)) {
      for (const it of items) {
        const u = typeof it === 'string' ? it : it?.full || it?.url || it?._text || it?.imagem;
        if (u) rawList.push({ url: u });
      }
    } else if (typeof items === 'string') {
      rawList.push({ url: items });
    }
  } else if (typeof rawPhotos === 'string') {
    rawList.push({ url: rawPhotos });
  }

  // 2. Higienização, deduplicação e ordenação
  let currentOrder = 1;
  let primaryFound = false;

  for (const item of rawList) {
    const validUrl = sanitizeImageUrl(item.url);
    if (!validUrl || seenUrls.has(validUrl)) {
      continue;
    }

    seenUrls.add(validUrl);

    const isPrimary = item.isPrimary === true || (!primaryFound && currentOrder === 1);
    if (isPrimary) {
      primaryFound = true;
    }

    normalizedImages.push({
      url: validUrl,
      fullUrl: item.fullUrl ? sanitizeImageUrl(item.fullUrl) || validUrl : validUrl,
      order: item.order && !isNaN(item.order) ? item.order : currentOrder++,
      isPrimary
    });
  }

  // Garante que a primeira imagem seja a capa se nenhuma foi marcada explicitamente
  if (normalizedImages.length > 0 && !normalizedImages.some((img) => img.isPrimary)) {
    normalizedImages[0].isPrimary = true;
  }

  // Ordena por prioridade de ordem
  normalizedImages.sort((a, b) => {
    if (a.isPrimary) return -1;
    if (b.isPrimary) return 1;
    return a.order - b.order;
  });

  const heroImageUrl = normalizedImages[0]?.fullUrl || normalizedImages[0]?.url || '';
  const isValid = normalizedImages.length > 0 && heroImageUrl.startsWith('https://');

  if (!isValid) {
    warnings.push('Veículo sem imagens válidas em HTTPS (inelegível para o catálogo do Meta Ads).');
  }

  return {
    images: normalizedImages,
    heroImageUrl,
    isValid,
    warnings: warnings.length > 0 ? warnings : undefined
  };
}
