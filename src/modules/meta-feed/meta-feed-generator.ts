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
 * Mapeia Condition do Prisma para o Meta DAA.
 */
function mapCondition(condition: VehicleCondition | string, hasWarranty?: boolean): string {
  if (condition === VehicleCondition.NOVO) {
    return 'new';
  }
  if (hasWarranty) {
    return 'cpo'; // Certified Pre-Owned
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
 * Gerador de Feed XML em conformidade com Meta Automotive Inventory Ads (DAA).
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
    const catalogTitle = options.catalogName || 'DriveSync - Feed Meta Automotive Inventory Ads';

    const xmlLines: string[] = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0" xmlns:atom="http://www.w3.org/2005/Atom">',
      '  <channel>',
      `    <title>${escapeXml(catalogTitle)}</title>`,
      `    <link>${escapeXml(options.feedUrl)}</link>`,
      `    <description>${escapeXml(catalogTitle)}</description>`,
      `    <atom:link href="${escapeXml(options.feedUrl)}" rel="self" type="application/rss+xml" />`,
      `    <lastBuildDate>${new Date(nowIso).toUTCString()}</lastBuildDate>`
    ];

    let validCount = 0;

    for (const v of vehicles) {
      // Ignora veículos sem dados mínimos ou sem imagem principal
      if (!v.externalId || !v.price || !v.heroImageUrl) {
        continue;
      }

      validCount++;

      const priceStr = `${Number(v.price).toFixed(2)} BRL`;
      const salePriceStr = v.promotionalPrice && Number(v.promotionalPrice) > 0 && Number(v.promotionalPrice) < Number(v.price)
        ? `${Number(v.promotionalPrice).toFixed(2)} BRL`
        : undefined;

      const availability = v.status === VehicleStatus.AVAILABLE ? 'in stock' : 'out of stock';
      const vinStr = v.vin || v.licensePlate || v.externalId;
      const stateOfVehicle = mapCondition(v.condition || VehicleCondition.USADO, v.hasWarranty || false);
      const bodyStyleStr = mapBodyStyle(v.bodyStyle || BodyStyle.OTHER);
      const transmissionStr = mapTransmission(v.transmission || TransmissionType.OUTRO);
      const fuelTypeStr = mapFuelType(v.fuelType || FuelType.OUTRO);
      const labels = generateCustomLabels(v);

      xmlLines.push('    <item>');
      xmlLines.push(`      <g:id>${escapeXml(v.externalId)}</g:id>`);
      xmlLines.push(`      <g:vehicle_id>${escapeXml(v.externalId)}</g:vehicle_id>`);
      xmlLines.push(`      <title>${escapeXml(v.title || `${v.make} ${v.model}`)}</title>`);
      xmlLines.push(`      <description>${escapeXml(v.description || v.title)}</description>`);
      xmlLines.push(`      <link>${escapeXml(v.canonicalUrl || options.feedUrl)}</link>`);
      xmlLines.push(`      <g:url>${escapeXml(v.canonicalUrl || options.feedUrl)}</g:url>`);
      xmlLines.push(`      <g:image_link>${escapeXml(v.heroImageUrl)}</g:image_link>`);

      // Imagens adicionais da galeria (até 10 fotos)
      if (Array.isArray(v.images)) {
        const additionalImages = (v.images as unknown as VehicleImage[])
          .filter((img) => img.url && img.url !== v.heroImageUrl)
          .slice(0, 10);

        for (const img of additionalImages) {
          xmlLines.push(`      <g:additional_image_link>${escapeXml(img.url)}</g:additional_image_link>`);
        }
      }

      xmlLines.push(`      <g:price>${priceStr}</g:price>`);
      if (salePriceStr) {
        xmlLines.push(`      <g:sale_price>${salePriceStr}</g:sale_price>`);
      }

      xmlLines.push(`      <g:availability>${availability}</g:availability>`);
      xmlLines.push(`      <g:make>${escapeXml(v.make)}</g:make>`);
      xmlLines.push(`      <g:model>${escapeXml(v.model)}</g:model>`);
      xmlLines.push(`      <g:year>${v.modelYear || v.manufactureYear || new Date().getFullYear()}</g:year>`);

      xmlLines.push('      <g:mileage>');
      xmlLines.push(`        <g:value>${v.mileage || 0}</g:value>`);
      xmlLines.push('        <g:unit>KM</g:unit>');
      xmlLines.push('      </g:mileage>');

      xmlLines.push(`      <g:vin>${escapeXml(vinStr)}</g:vin>`);
      xmlLines.push(`      <g:state_of_vehicle>${stateOfVehicle}</g:state_of_vehicle>`);
      xmlLines.push(`      <g:body_style>${bodyStyleStr}</g:body_style>`);
      xmlLines.push(`      <g:transmission>${transmissionStr}</g:transmission>`);
      xmlLines.push(`      <g:fuel_type>${fuelTypeStr}</g:fuel_type>`);
      xmlLines.push(`      <g:exterior_color>${escapeXml(v.exteriorColor || 'Não informada')}</g:exterior_color>`);

      if (v.interiorColor) {
        xmlLines.push(`      <g:interior_color>${escapeXml(v.interiorColor)}</g:interior_color>`);
      }

      xmlLines.push(`      <g:doors>${v.doors || 4}</g:doors>`);

      if (v.drivetrain) {
        xmlLines.push(`      <g:drivetrain>${escapeXml(v.drivetrain.toLowerCase())}</g:drivetrain>`);
      }

      // Dados da Concessionária / Dealer
      if (options.dealership) {
        const dealerId = options.dealership.externalCode || options.dealership.id;
        const dealerName = options.dealership.tradeName || options.dealership.name || options.dealership.legalName;
        const dealerPhone = options.dealership.phone;

        if (dealerId) {
          xmlLines.push(`      <g:dealer_id>${escapeXml(dealerId)}</g:dealer_id>`);
        }
        if (dealerName) {
          xmlLines.push(`      <g:dealer_name>${escapeXml(dealerName)}</g:dealer_name>`);
        }
        if (dealerPhone) {
          xmlLines.push(`      <g:dealer_phone>${escapeXml(dealerPhone)}</g:dealer_phone>`);
        }
      }

      // Custom Labels de Campanhas
      xmlLines.push(`      <g:custom_label_0>${escapeXml(labels.custom_label_0)}</g:custom_label_0>`);
      xmlLines.push(`      <g:custom_label_1>${escapeXml(labels.custom_label_1)}</g:custom_label_1>`);
      xmlLines.push(`      <g:custom_label_2>${escapeXml(labels.custom_label_2)}</g:custom_label_2>`);
      xmlLines.push(`      <g:custom_label_3>${escapeXml(labels.custom_label_3)}</g:custom_label_3>`);
      xmlLines.push(`      <g:custom_label_4>${escapeXml(labels.custom_label_4)}</g:custom_label_4>`);

      xmlLines.push('    </item>');
    }

    xmlLines.push('  </channel>');
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
