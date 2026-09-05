import crypto from 'crypto';
import { Vehicle, Dealership, Workspace, BodyStyle, FuelType, TransmissionType, VehicleCondition, VehicleStatus } from '@prisma/client';
import { VehicleImage } from '../../types/database.js';

export interface MetaFeedGeneratorOptions {
  feedUrl: string;
  catalogName?: string;
  workspace?: Partial<Workspace>;
  dealership?: Partial<Dealership> & { name?: string; externalCode?: string; tradeName?: string };
}

export interface GeneratedFeedResult {
  xml: string;
  etag: string;
  itemCount: number;
  generatedAt: string;
}

/**
 * Sanitiza texto para inclusão segura dentro de nós XML.
 */
function escapeXml(unsafe: unknown): string {
  if (unsafe === null || unsafe === undefined) {
    return '';
  }
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Formata valor monetário com moeda ISO 4217 (ex: '18000 BRL' ou '18000.50 BRL').
 */
function formatPrice(val: unknown): string {
  const num = Number(val);
  return num % 1 === 0 ? `${num.toFixed(0)} BRL` : `${num.toFixed(2)} BRL`;
}

/**
 * Sanitiza a URL canônica de um veículo no momento da geração do XML.
 * Corrige dinamicamente URLs legadas da 4Boss/Base44 que ainda contenham
 * /api/vehicles/veiculo/, /api/vehicles/v/ ou /veiculo/ para o formato
 * oficial /v/:slug. Rotas reais /veiculo/:slug de outras plataformas
 * (ex: Spice Digital / JR Casa Seminovos) são preservadas integralmente.
 * Retorna o fallback informado quando não há URL utilizável.
 */
function sanitizeCanonicalUrl(url?: string | null, fallbackUrl = ''): string {
  if (!url || typeof url !== 'string') {
    return fallbackUrl;
  }
  const candidate = url.trim();
  if (!candidate) {
    return fallbackUrl;
  }

  let origin = '';
  try {
    origin = new URL(candidate).origin;
  } catch {
    return candidate;
  }
  if (!origin) {
    return candidate;
  }

  // Reescrita /veiculo/ -> /v/ somente para o domínio 4Boss/Base44.
  // Demais domínios (ex: Spice Digital) preservam a rota real /veiculo/:slug.
  if (!/4boss|base44/i.test(origin)) {
    return candidate;
  }

  const legacyPatterns = [
    /\/api\/vehicles\/veiculo\/(.+)/i,
    /\/api\/vehicles\/v\/(.+)/i,
    /\/veiculo\/(.+)/i,
    /\/api\/vehicles\/(.+)/i,
  ];
  for (const pattern of legacyPatterns) {
    const match = candidate.match(pattern);
    if (match && match[1]) {
      return `${origin}/v/${encodeURIComponent(String(match[1]))}`;
    }
  }

  return candidate;
}

/**
 * Mapeia BodyStyle do Prisma para a especificação oficial Meta Automotive (UPPERCASE).
 */
function mapBodyStyleUpper(style?: BodyStyle | string | null): string {
  switch (style) {
    case BodyStyle.SUV:
    case 'SUV': return 'SUV';
    case BodyStyle.SEDAN:
    case 'SEDAN': return 'SEDAN';
    case BodyStyle.HATCHBACK:
    case 'HATCHBACK': return 'HATCHBACK';
    case BodyStyle.PICKUP:
    case 'PICKUP': return 'PICKUP';
    case BodyStyle.COUPE:
    case 'COUPE': return 'COUPE';
    case BodyStyle.CONVERTIBLE:
    case 'CONVERTIBLE': return 'CONVERTIBLE';
    case BodyStyle.MINIVAN:
    case 'MINIVAN': return 'MINIVAN';
    case BodyStyle.VAN:
    case 'VAN': return 'VAN';
    case BodyStyle.WAGON:
    case 'WAGON': return 'WAGON';
    case BodyStyle.COMMERCIAL:
    case 'COMMERCIAL': return 'TRUCK';
    case BodyStyle.MOTORCYCLE:
    case 'MOTORCYCLE': return 'OTHER';
    default: return 'OTHER';
  }
}

/**
 * Mapeia FuelType do Prisma para a especificação oficial Meta Automotive (UPPERCASE).
 */
function mapFuelTypeUpper(fuel?: FuelType | string | null): string {
  switch (fuel) {
    case FuelType.FLEX:
    case 'FLEX': return 'FLEX';
    case FuelType.GASOLINA:
    case 'GASOLINA': return 'GASOLINE';
    case FuelType.DIESEL:
    case 'DIESEL': return 'DIESEL';
    case FuelType.ELETRICO:
    case 'ELETRICO': return 'ELECTRIC';
    case FuelType.HIBRIDO:
    case FuelType.MHEV_HIBRIDO_LEVE:
    case 'HIBRIDO':
    case 'MHEV_HIBRIDO_LEVE': return 'HYBRID';
    case FuelType.HIBRIDO_PLUG_IN:
    case 'HIBRIDO_PLUG_IN': return 'PLUGIN_HYBRID';
    case FuelType.ETANOL:
    case 'ETANOL': return 'ETHANOL';
    case FuelType.GNV:
    case 'GNV': return 'NATURAL_GAS';
    default: return 'OTHER';
  }
}

/**
 * Mapeia TransmissionType do Prisma para a especificação oficial Meta Automotive.
 */
function mapTransmissionUpper(transmission?: TransmissionType | string | null): string {
  switch (transmission) {
    case TransmissionType.MANUAL:
    case 'MANUAL': return 'MANUAL';
    case TransmissionType.AUTOMATICO:
    case TransmissionType.CVT:
    case TransmissionType.DUPLA_EMBREAGEM:
    case TransmissionType.AUTOMATIZADO:
    case TransmissionType.SEMI_AUTOMATICO:
    case 'AUTOMATICO':
    case 'CVT':
    case 'DUPLA_EMBREAGEM':
    case 'AUTOMATIZADO':
    case 'SEMI_AUTOMATICO':
      return 'AUTOMATIC';
    default: return 'AUTOMATIC';
  }
}

/**
 * Mapeia estado de conservação do veículo: NEW, USED, CPO.
 */
function mapStateOfVehicle(condition?: VehicleCondition | string | null, hasWarranty?: boolean): string {
  if (condition === VehicleCondition.NOVO || condition === 'NOVO' || condition === 'new') {
    return 'NEW';
  }
  if (hasWarranty) {
    return 'CPO';
  }
  return 'USED';
}

/**
 * Gerador de Feed XML oficial da Meta para Catálogo de Veículos (Automotive Inventory Ads).
 * Emite a estrutura canônica <listings><listing>... validada pelo Meta Commerce Manager.
 */
export class MetaXmlFeedGenerator {
  /**
   * Gera o payload XML oficial do catálogo Meta Automotive a partir de uma lista de veículos.
   */
  static generateFeed(
    vehicles: Partial<Vehicle>[],
    options: MetaFeedGeneratorOptions
  ): GeneratedFeedResult {
    const nowIso = new Date().toISOString();
    const catalogTitle = options.catalogName || 'DriveSync - Vehicles Feed';

    const xmlLines: string[] = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<listings>',
      `    <title>${escapeXml(catalogTitle)}</title>`,
      `    <link rel="self" href="${escapeXml(options.feedUrl)}"/>`
    ];

    let validCount = 0;

    for (const v of vehicles) {
      // Ignora veículos sem dados mínimos ou sem imagem principal
      if (!v.externalId || !v.price || !v.heroImageUrl) {
        continue;
      }

      validCount++;

      const priceStr = formatPrice(v.price);
      const salePriceStr = v.promotionalPrice && Number(v.promotionalPrice) > 0 && Number(v.promotionalPrice) < Number(v.price)
        ? formatPrice(v.promotionalPrice)
        : undefined;

      const availability = v.status === VehicleStatus.AVAILABLE ? 'AVAILABLE' : 'SOLD';
      const stateOfVehicle = mapStateOfVehicle(v.condition, v.armored ? false : v.hasWarranty);
      const bodyStyle = mapBodyStyleUpper(v.bodyStyle);
      const transmission = mapTransmissionUpper(v.transmission);
      const fuelType = mapFuelTypeUpper(v.fuelType);
      const vinStr = v.vin || v.licensePlate || v.externalId;
      const link = sanitizeCanonicalUrl(v.canonicalUrl, options.feedUrl);

      xmlLines.push('    <listing>');
      xmlLines.push(`      <vehicle_id>${escapeXml(v.externalId)}</vehicle_id>`);
      xmlLines.push(`      <title>${escapeXml(v.title || `${v.make} ${v.model}`)}</title>`);
      xmlLines.push(`      <description>${escapeXml(v.description || v.title || `${v.make} ${v.model}`)}</description>`);
      xmlLines.push(`      <url>${escapeXml(link)}</url>`);
      xmlLines.push(`      <make>${escapeXml(v.make || 'Outro')}</make>`);
      xmlLines.push('      <image>');
      xmlLines.push(`        <url>${escapeXml(v.heroImageUrl)}</url>`);
      xmlLines.push('        <tag>Exterior</tag>');
      xmlLines.push('      </image>');

      // Imagens adicionais da galeria (até 10 fotos)
      if (Array.isArray(v.images)) {
        const additionalImages = (v.images as unknown as VehicleImage[])
          .filter((img) => img && img.url && img.url !== v.heroImageUrl)
          .slice(0, 10);

        for (const img of additionalImages) {
          xmlLines.push('      <image>');
          xmlLines.push(`        <url>${escapeXml(img.url)}</url>`);
          xmlLines.push('      </image>');
        }
      }

      xmlLines.push(`      <model>${escapeXml(v.model || 'Modelo')}</model>`);
      xmlLines.push(`      <year>${v.modelYear || v.manufactureYear || new Date().getFullYear()}</year>`);
      xmlLines.push('      <mileage>');
      xmlLines.push(`        <value>${v.mileage ?? 0}</value>`);
      xmlLines.push('        <unit>KM</unit>');
      xmlLines.push('      </mileage>');
      xmlLines.push(`      <drivetrain>${escapeXml(v.drivetrain ? String(v.drivetrain).toUpperCase() : 'FWD')}</drivetrain>`);
      xmlLines.push(`      <vin>${escapeXml(vinStr)}</vin>`);
      xmlLines.push(`      <body_style>${bodyStyle}</body_style>`);
      xmlLines.push(`      <fuel_type>${fuelType}</fuel_type>`);
      xmlLines.push(`      <transmission>${transmission}</transmission>`);
      xmlLines.push('      <condition>EXCELLENT</condition>');
      xmlLines.push(`      <price>${priceStr}</price>`);
      if (salePriceStr) {
        xmlLines.push(`      <sale_price>${salePriceStr}</sale_price>`);
      }

      const city = options.dealership?.city || options.workspace?.city || 'São Paulo';
      const state = options.dealership?.state || options.workspace?.state || 'SP';
      const addr1 = options.dealership?.address?.trim() || `${options.dealership?.tradeName || options.workspace?.name || 'Loja Principal'}, Centro`;
      const postalCode = options.dealership?.postalCode;

      xmlLines.push('      <address format="simple">');
      xmlLines.push(`        <component name="addr1">${escapeXml(addr1)}</component>`);
      xmlLines.push(`        <component name="city">${escapeXml(city)}</component>`);
      xmlLines.push(`        <component name="region">${escapeXml(state)}</component>`);
      if (postalCode) {
        xmlLines.push(`        <component name="postal_code">${escapeXml(postalCode)}</component>`);
      }
      xmlLines.push('        <component name="country">BR</component>');
      xmlLines.push('      </address>');

      xmlLines.push(`      <exterior_color>${escapeXml(v.exteriorColor || 'Branco')}</exterior_color>`);
      xmlLines.push(`      <availability>${availability}</availability>`);
      xmlLines.push(`      <state_of_vehicle>${stateOfVehicle}</state_of_vehicle>`);

      if (options.dealership) {
        const dealerId = options.dealership.externalCode || options.dealership.id;
        if (dealerId) {
          xmlLines.push(`      <dealer_id>${escapeXml(dealerId)}</dealer_id>`);
        }
      }

      xmlLines.push('    </listing>');
    }

    xmlLines.push('</listings>');
    const xml = xmlLines.join('\n');

    // Gera ETag SHA-256
    const etag = `"${crypto.createHash('sha256').update(xml).digest('hex').substring(0, 32)}"`;

    return {
      xml,
      etag,
      itemCount: validCount,
      generatedAt: nowIso
    };
  }
}
