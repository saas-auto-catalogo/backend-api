import crypto from 'crypto';
import { VehicleStatus } from '@prisma/client';
import { normalizeMake, normalizeModelAndVersion, inferBodyStyle, sanitizeDescription } from './normalizers/string-normalizer.js';
import { normalizeYears, normalizePricing, normalizeMileage, inferCondition } from './normalizers/number-normalizer.js';
import { normalizeFuelType, normalizeTransmission, normalizeFeatures } from './normalizers/enums-normalizer.js';
import { normalizeImages } from './normalizers/media-normalizer.js';
import { VehicleImage } from '../../types/database.js';

export interface CanonicalVehicleOutput {
  externalId: string;
  vin?: string;
  licensePlate?: string;
  stockNumber?: string;
  make: string;
  model: string;
  version: string;
  title: string;
  bodyStyle: string;
  manufactureYear: number;
  modelYear: number;
  doors: number;
  exteriorColor: string;
  interiorColor?: string;
  mileage: number;
  fuelType: string;
  transmission: string;
  engineSize?: string;
  drivetrain?: string;
  armored: boolean;
  price: number;
  promotionalPrice?: number;
  currency: string;
  priceOnRequest: boolean;
  condition: string;
  status: VehicleStatus;
  hasWarranty: boolean;
  warrantyDetails?: string;
  canonicalUrl?: string;
  heroImageUrl: string;
  images: VehicleImage[];
  features: string[];
  description: string;
  notes?: string;
  rawPayloadHash: string;
  eligibleForMetaAds: boolean;
  validationWarnings: string[];
}

export interface NormalizationContext {
  workspaceId: string;
  feedConfigId?: string;
  dealershipId?: string;
  sourceType?: string;
  fallbackBaseUrl?: string;
}

/**
 * Gera hash SHA-256 canônico a partir do payload bruto.
 */
export function computeRawPayloadHash(rawPayload: Record<string, any>): string {
  const serialized = JSON.stringify(rawPayload, Object.keys(rawPayload).sort());
  return crypto.createHash('sha256').update(serialized).digest('hex');
}

/**
 * Motor de Auto-Matching e Normalização De/Para de Veículos Heterogêneos (XML e JSON).
 */
export class AutoMatchingEngine {
  /**
   * Converte qualquer objeto de veículo bruto para o modelo canônico.
   */
  static normalize(
    raw: Record<string, any>,
    context: NormalizationContext = { workspaceId: 'default-workspace' }
  ): CanonicalVehicleOutput {
    const warnings: string[] = [];

    // 1. Identificadores Básicos
    const externalId = String(
      raw.externalId ||
      raw.vid ||
      raw.id ||
      raw.codigo ||
      raw.codigo_veiculo ||
      raw.codigo_anuncio ||
      raw.codigo_estoque ||
      raw.chassi ||
      raw.placa ||
      `generated-${Date.now()}`
    ).trim();

    const vin = (raw.vin || raw.chassi || raw.chassi_completo || undefined) ? String(raw.vin || raw.chassi).trim() : undefined;
    const licensePlate = (raw.licensePlate || raw.plate || raw.placa || undefined) ? String(raw.licensePlate || raw.plate || raw.placa).trim() : undefined;
    const stockNumber = (raw.stockNumber || raw.codigo_estoque || raw.codigo_interno || raw.estoque || undefined) ? String(raw.stockNumber || raw.codigo_estoque || raw.codigo_interno || raw.estoque).trim() : undefined;

    // 2. Classificação: Marca, Modelo e Versão
    const rawMake = raw.brand || raw.make || raw.marca || raw.fabricante;
    const make = normalizeMake(rawMake);

    const rawModel = raw.model || raw.modelo;
    const rawVersion = raw.version || raw.versao || raw.display;
    const rawShort = raw.short || raw.shortModel;
    const { model, version, title } = normalizeModelAndVersion(rawModel, rawVersion, rawShort, make);

    // 3. Anos
    const years = normalizeYears(raw.year || raw.ano, raw.manufactureYear || raw.anofabricacao || raw.ano_fabricacao, raw.modelYear || raw.anomodelo || raw.ano_modelo);
    if (years.warnings) warnings.push(...years.warnings);

    // 4. Preço e Comercial
    const rawPrice = raw.priceRaw ?? raw.price ?? raw.preco ?? raw.valor ?? raw.preco_venda ?? raw.valor_venda;
    const rawPromo = raw.promotionalPrice ?? raw.preco_promocional ?? raw.valor_promocional;
    const rawPriceOnRequest = raw.priceOnRequest ?? raw.preco_sob_consulta;
    const pricing = normalizePricing(rawPrice, rawPromo, rawPriceOnRequest);

    // 5. Quilometragem e Condição
    const mileage = normalizeMileage(raw.km ?? raw.quilometragem, raw.kmRaw);
    const condition = inferCondition(mileage, years.modelYear, raw.condition || raw.estado);

    // 6. Trem de Força e Opcionais
    const fuelType = normalizeFuelType(raw.fuel || raw.combustivel || raw.tipo_combustivel);
    const transmission = normalizeTransmission(raw.transmission || raw.cambio || raw.exchange || raw.transmissao || raw.tipo_cambio);

    const armored =
      raw.armored === true ||
      raw.armored === 'true' ||
      raw.armored === 1 ||
      String(raw.blindado).toLowerCase() === 'sim' ||
      String(raw.blindado).toLowerCase() === 'true' ||
      String(raw.blindado) === '1';

    const rawFeatures = raw.options || raw.opcionais || raw.features || raw.itens_serie || raw.caracteristicas;
    const features = normalizeFeatures(rawFeatures);
    if (armored && !features.includes('BLINDADO')) {
      features.push('BLINDADO');
    }

    // 7. Carroceria (BodyStyle)
    const rawCategory = raw.carroceria || raw.categoria || raw.tipo || raw.bodyStyle;
    const bodyStyle = inferBodyStyle(make, model, version, raw.notes || raw.observacoes, rawCategory);

    // 8. Portas e Cores
    const doors = raw.doors ? parseInt(String(raw.doors), 10) : (raw.portas ? parseInt(String(raw.portas), 10) : (raw.qtd_portas ? parseInt(String(raw.qtd_portas), 10) : 4));
    const exteriorColor = String(raw.corExterna || raw.color || raw.cor || 'Não informada').trim();
    const interiorColor = (raw.corInterna || raw.interiorColor) ? String(raw.corInterna || raw.interiorColor).trim() : undefined;

    // 9. Mídia e Imagens
    const rawPhotos = raw.photos || raw.images || raw.fotos || raw.imagens;
    const media = normalizeImages(rawPhotos, raw.heroImage || raw.imagem_destaque, raw.image);
    if (media.warnings) warnings.push(...media.warnings);

    // 10. Descrição, Notas e Links
    const rawDesc = raw.description || raw.notes || raw.observacoes || raw.detalhes || raw.descricao || raw.informacoes_adicionais || title;
    const description = sanitizeDescription(rawDesc);
    const notes = raw.notes ? String(raw.notes).trim() : undefined;

    let canonicalUrl = raw.canonicalUrl || raw.url || raw.link_direto || raw.url_anuncio || raw.url_estoque;
    if (typeof canonicalUrl === 'string') {
      canonicalUrl = canonicalUrl.trim();
    } else if (raw.urlSlug && context.fallbackBaseUrl) {
      canonicalUrl = `${context.fallbackBaseUrl.replace(/\/$/, '')}/veiculo/${raw.urlSlug}`;
    }

    // 11. Garantia
    const hasWarranty =
      raw.hasWarranty === true ||
      raw.warranty === true ||
      String(raw.garantia).toLowerCase() === 'sim' ||
      Boolean(raw.warrantyDetails || raw.warrantyText);

    const warrantyDetails = raw.warrantyDetails || raw.warrantyText ? String(raw.warrantyDetails || raw.warrantyText).trim() : undefined;

    // 12. Avaliação de Elegibilidade para o Meta Ads DAA
    const hasValidCoreData = externalId.length > 0 && make !== 'OUTRO' && model.length > 0 && years.isValid;
    const hasValidPrice = pricing.isValid && pricing.price > 0 && !pricing.priceOnRequest;
    const hasValidMedia = media.isValid && media.heroImageUrl.length > 0;

    const eligibleForMetaAds = Boolean(hasValidCoreData && hasValidPrice && hasValidMedia);

    if (!hasValidCoreData) {
      warnings.push('Dados básicos essenciais ausentes ou inválidos (marca, modelo ou ano).');
    }
    if (!hasValidPrice) {
      warnings.push('Preço inválido, ausente ou sob consulta (inelegível para Meta DAA).');
    }

    const rawPayloadHash = computeRawPayloadHash(raw);

    return {
      externalId,
      vin,
      licensePlate,
      stockNumber,
      make,
      model,
      version,
      title,
      bodyStyle,
      manufactureYear: years.manufactureYear,
      modelYear: years.modelYear,
      doors: isNaN(doors) ? 4 : doors,
      exteriorColor,
      interiorColor,
      mileage,
      fuelType,
      transmission,
      engineSize: raw.engineSize ? String(raw.engineSize).trim() : undefined,
      drivetrain: raw.drivetrain ? String(raw.drivetrain).trim() : undefined,
      armored,
      price: pricing.price,
      promotionalPrice: pricing.promotionalPrice,
      currency: 'BRL',
      priceOnRequest: pricing.priceOnRequest,
      condition,
      status: VehicleStatus.AVAILABLE,
      hasWarranty,
      warrantyDetails,
      canonicalUrl,
      heroImageUrl: media.heroImageUrl,
      images: media.images,
      features,
      description,
      notes,
      rawPayloadHash,
      eligibleForMetaAds,
      validationWarnings: warnings
    };
  }
}
