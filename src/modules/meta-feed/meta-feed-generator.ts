import crypto from 'crypto';
import { Vehicle, Dealership, Workspace, BodyStyle, FuelType, TransmissionType, VehicleCondition, VehicleStatus } from '@prisma/client';
import { VehicleImage } from '../../types/database.js';

export interface MetaFeedGeneratorOptions {
  feedUrl: string;
  catalogName?: string;
  workspace?: Partial<Workspace>;
  dealership?: Partial<Dealership> & { name?: string; externalCode?: string };
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
 * Mapeia BodyStyle do Prisma para os valores esperados pelo Meta DAA (minúsculo).
 */
function mapBodyStyle(style: BodyStyle | string): string {
  switch (style) {
    case BodyStyle.SUV: return 'suv';
    case BodyStyle.SEDAN: return 'sedan';
    case BodyStyle.HATCHBACK: return 'hatchback';
    case BodyStyle.PICKUP: return 'pickup';
    case BodyStyle.COUPE: return 'coupe';
    case BodyStyle.CONVERTIBLE: return 'convertible';
    case BodyStyle.MINIVAN: return 'minivan';
    case BodyStyle.VAN: return 'van';
    case BodyStyle.WAGON: return 'wagon';
    default: return 'other';
  }
}

/**
 * Mapeia FuelType do Prisma para os valores aceitos pelo Meta DAA.
 */
function mapFuelType(fuel: FuelType | string): string {
  switch (fuel) {
    case FuelType.FLEX: return 'flex';
    case FuelType.GASOLINA: return 'gasoline';
    case FuelType.DIESEL: return 'diesel';
    case FuelType.ELETRICO: return 'electric';
    case FuelType.HIBRIDO:
    case FuelType.MHEV_HIBRIDO_LEVE: return 'hybrid';
    case FuelType.HIBRIDO_PLUG_IN: return 'plugin_hybrid';
    default: return 'other';
  }
}

/**
 * Mapeia TransmissionType do Prisma para o Meta DAA.
 */
function mapTransmission(transmission: TransmissionType | string): string {
  switch (transmission) {
    case TransmissionType.AUTOMATICO:
    case TransmissionType.CVT:
    case TransmissionType.DUPLA_EMBREAGEM:
    case TransmissionType.AUTOMATIZADO:
    case TransmissionType.SEMI_AUTOMATICO:
      return 'automatic';
    case TransmissionType.MANUAL:
      return 'manual';
    default:
      return 'other';
  }
}

/**
 * Mapeia Condition para o padrão Google/Meta Product Catalog ('new' ou 'used').
 */
function mapCondition(condition: VehicleCondition | string): string {
  if (condition === VehicleCondition.NOVO || condition === 'NOVO' || condition === 'new') {
    return 'new';
  }
  return 'used';
}

/**
 * Gera as Custom Labels para segmentação inteligente no Gerenciador de Anúncios da Meta.
 */
function generateCustomLabels(vehicle: Partial<Vehicle>): { [key: string]: string } {
  const price = Number(vehicle.price || 0);

  // Label 0: Faixa de Preço
  let label0 = 'Abaixo de 50k';
  if (price >= 300000) label0 = 'Acima de 300k';
  else if (price >= 200000) label0 = '200k a 300k';
  else if (price >= 100000) label0 = '100k a 200k';
  else if (price >= 50000) label0 = '50k a 100k';

  // Label 1: Carroceria / Estilo
  const label1 = mapBodyStyle(vehicle.bodyStyle || BodyStyle.OTHER).toUpperCase();

  // Label 2: Propulsão
  let label2 = 'Combustão';
  if (vehicle.fuelType === FuelType.ELETRICO) label2 = '100% Elétrico';
  else if (
    vehicle.fuelType === FuelType.HIBRIDO ||
    vehicle.fuelType === FuelType.HIBRIDO_PLUG_IN ||
    vehicle.fuelType === FuelType.MHEV_HIBRIDO_LEVE
  ) {
    label2 = 'Eletrificado';
  }

  // Label 3: Destaques (Garantia / Blindado)
  let label3 = 'Sem Blindagem';
  if (vehicle.armored) label3 = 'Blindado';
  else if (vehicle.hasWarranty) label3 = 'Com Garantia';
  else if (vehicle.mileage !== undefined && vehicle.mileage <= 100) label3 = 'Zero KM';

  // Label 4: Disponibilidade
  const label4 = vehicle.status === VehicleStatus.AVAILABLE ? 'Disponível' : 'Vendido';

  return {
    custom_label_0: label0,
    custom_label_1: label1,
    custom_label_2: label2,
    custom_label_3: label3,
    custom_label_4: label4
  };
}

/**
 * Gerador de Feed XML em conformidade estrita com o padrão de Catálogo Meta Commerce Manager / Google Shopping.
 * Estrutura baseada na especificação canônica aceita para estoques automotivos no Brasil.
 */
export class MetaXmlFeedGenerator {
  /**
   * Gera o payload XML completo do catálogo Meta Ads a partir de uma lista de veículos.
   */
  static generateFeed(
    vehicles: Partial<Vehicle>[],
    options: MetaFeedGeneratorOptions
  ): GeneratedFeedResult {
    const nowIso = new Date().toISOString();
    const catalogTitle = options.catalogName || 'DriveSync - Feed Estoque';

    const xmlLines: string[] = [
      '<?xml version="1.0"?>',
      '<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">',
      '    <channel>',
      `        <title>${escapeXml(catalogTitle)}</title>`,
      `        <description>${escapeXml(catalogTitle)}</description>`,
      `        <link>${escapeXml(options.feedUrl)}</link>`
    ];

    let validCount = 0;

    for (const v of vehicles) {
      // Ignora veículos sem dados mínimos ou sem imagem principal
      if (!v.externalId || !v.price || !v.heroImageUrl) {
        continue;
      }

      validCount++;

      const priceStr = `${Number(v.price).toFixed(2)}`;
      const salePriceStr = v.promotionalPrice && Number(v.promotionalPrice) > 0 && Number(v.promotionalPrice) < Number(v.price)
        ? `${Number(v.promotionalPrice).toFixed(2)}`
        : undefined;

      const availability = v.status === VehicleStatus.AVAILABLE ? 'In stock' : 'Out of stock';
      const condition = mapCondition(v.condition || VehicleCondition.USADO);
      const brand = (v.make || 'OUTRO').toUpperCase();
      const color = v.exteriorColor || 'Não informada';
      const bodyStyleStr = mapBodyStyle(v.bodyStyle || BodyStyle.OTHER);
      const link = v.canonicalUrl || options.feedUrl;
      const labels = generateCustomLabels(v);

      xmlLines.push('        <item>');
      xmlLines.push(`            <g:id>${escapeXml(v.externalId)}</g:id>`);
      xmlLines.push(`            <g:title><![CDATA[${v.title || `${v.make} ${v.model}`}]]></g:title>`);
      xmlLines.push(`            <g:description><![CDATA[${v.description || v.title || `${v.make} ${v.model}`}]]></g:description>`);
      xmlLines.push(`            <g:availability>${availability}</g:availability>`);
      xmlLines.push(`            <g:condition>${condition}</g:condition>`);
      xmlLines.push(`            <g:link>${escapeXml(link)}</g:link>`);
      xmlLines.push(`            <g:image_link>${escapeXml(v.heroImageUrl)}</g:image_link>`);

      // Imagens adicionais da galeria (até 10 fotos)
      if (Array.isArray(v.images)) {
        const additionalImages = (v.images as unknown as VehicleImage[])
          .filter((img) => img.url && img.url !== v.heroImageUrl)
          .slice(0, 10);

        for (const img of additionalImages) {
          xmlLines.push(`            <g:additional_image_link>${escapeXml(img.url)}</g:additional_image_link>`);
        }
      }

      xmlLines.push(`            <g:brand>${escapeXml(brand)}</g:brand>`);
      xmlLines.push(`            <g:color>${escapeXml(color)}</g:color>`);
      xmlLines.push('            <g:google_product_category>1267</g:google_product_category>');
      xmlLines.push(`            <g:price>${priceStr}</g:price>`);
      if (salePriceStr) {
        xmlLines.push(`            <g:sale_price>${salePriceStr}</g:sale_price>`);
      }
      xmlLines.push(`            <g:size>${escapeXml(bodyStyleStr)}</g:size>`);

      // Custom Labels de Campanhas
      xmlLines.push(`            <g:custom_label_0>${escapeXml(labels.custom_label_0)}</g:custom_label_0>`);
      xmlLines.push(`            <g:custom_label_1>${escapeXml(labels.custom_label_1)}</g:custom_label_1>`);
      xmlLines.push(`            <g:custom_label_2>${escapeXml(labels.custom_label_2)}</g:custom_label_2>`);
      xmlLines.push(`            <g:custom_label_3>${escapeXml(labels.custom_label_3)}</g:custom_label_3>`);
      xmlLines.push(`            <g:custom_label_4>${escapeXml(labels.custom_label_4)}</g:custom_label_4>`);

      xmlLines.push('        </item>');
    }

    xmlLines.push('    </channel>');
    xmlLines.push('</rss>');
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
