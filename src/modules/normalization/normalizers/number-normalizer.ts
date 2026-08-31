import { VehicleCondition } from '@prisma/client';

export interface NormalizedYears {
  manufactureYear: number;
  modelYear: number;
  isValid: boolean;
  warnings?: string[];
}

export interface NormalizedPricing {
  price: number;
  promotionalPrice?: number;
  currency: 'BRL';
  priceOnRequest: boolean;
  isValid: boolean;
}

const CURRENT_YEAR = new Date().getFullYear();

/**
 * Normaliza anos de fabricação e modelo a partir de formatos heterogêneos (string combinada, objeto ou campos separados).
 */
export function normalizeYears(
  rawYear: unknown,
  rawManufactureYear?: unknown,
  rawModelYear?: unknown
): NormalizedYears {
  let manYear: number = 0;
  let modYear: number = 0;
  const warnings: string[] = [];

  // Caso 1: Objeto estruturado do JRCA / Spice Digital (ex: { one: 2023, two: 2024 })
  if (typeof rawYear === 'object' && rawYear !== null) {
    const obj = rawYear as Record<string, any>;
    if (obj.one) manYear = parseInt(String(obj.one), 10);
    if (obj.two) modYear = parseInt(String(obj.two), 10);
  }

  // Caso 2: Campos explícitos do XML (ex: <anofabricacao>2023</anofabricacao> <anomodelo>2024</anomodelo>)
  if (!manYear && rawManufactureYear) {
    manYear = parseInt(String(rawManufactureYear).trim(), 10);
  }
  if (!modYear && rawModelYear) {
    modYear = parseInt(String(rawModelYear).trim(), 10);
  }

  // Caso 3: String combinada (ex: "2025/2026", "2024-2025", "24/25", "2024")
  if ((!manYear || !modYear) && typeof rawYear === 'string' && rawYear.trim().length > 0) {
    const cleaned = rawYear.trim();
    const parts = cleaned.split(/[\/\-_]/);

    if (parts.length >= 2) {
      let p1 = parseInt(parts[0].trim(), 10);
      let p2 = parseInt(parts[1].trim(), 10);

      // Tratamento de 2 dígitos (ex: "24/25" -> 2024 / 2025)
      if (p1 < 100) p1 += 2000;
      if (p2 < 100) p2 += 2000;

      if (!manYear) manYear = p1;
      if (!modYear) modYear = p2;
    } else if (parts.length === 1) {
      let single = parseInt(parts[0].trim(), 10);
      if (single < 100) single += 2000;
      if (!manYear) manYear = single;
      if (!modYear) modYear = single;
    }
  }

  // Fallbacks e validações
  if (!manYear && modYear) manYear = modYear;
  if (!modYear && manYear) modYear = manYear;
  if (!manYear && !modYear) {
    manYear = CURRENT_YEAR;
    modYear = CURRENT_YEAR;
    warnings.push('Ano ausente: atribuído ano corrente por fallback.');
  }

  // Validação de sanidade
  const maxAllowedYear = CURRENT_YEAR + 2;
  const minAllowedYear = 1950;
  const isValid =
    manYear >= minAllowedYear &&
    manYear <= maxAllowedYear &&
    modYear >= minAllowedYear &&
    modYear <= maxAllowedYear;

  if (!isValid) {
    warnings.push(`Ano fora da faixa de sanidade permitida (${minAllowedYear} - ${maxAllowedYear}): ${manYear}/${modYear}`);
  }

  return {
    manufactureYear: manYear,
    modelYear: modYear,
    isValid,
    warnings: warnings.length > 0 ? warnings : undefined
  };
}

/**
 * Converte qualquer representação monetária para float decimal de 2 casas.
 */
export function parseMonetaryValue(val: unknown): number {
  if (val === null || val === undefined) {
    return 0;
  }

  if (typeof val === 'number') {
    return isNaN(val) ? 0 : Number(val.toFixed(2));
  }

  if (typeof val === 'string') {
    let clean = val
      .replace(/R\$/gi, '')
      .replace(/BRL/gi, '')
      .trim();

    if (!clean) return 0;

    // Formato brasileiro completo: "149.900,00" ou "1.489.700,50"
    if (clean.includes(',') && clean.includes('.')) {
      clean = clean.replace(/\./g, '').replace(',', '.');
    } else if (clean.includes(',')) {
      // Formato com vírgula decimal: "149900,00"
      clean = clean.replace(',', '.');
    } else if (clean.includes('.')) {
      // Ex: "489.700" (milhar sem centavos) vs "489.70" (com centavos)
      const parts = clean.split('.');
      if (parts.length === 2 && parts[1].length === 3) {
        // Notação de milhar sem centavos (ex: "489.700" -> 489700.00)
        clean = parts[0] + parts[1];
      } else if (parts.length > 2) {
        // Ex: "6.200.000" -> 6200000
        clean = parts.join('');
      }
    }

    const parsed = parseFloat(clean);
    return isNaN(parsed) ? 0 : Number(parsed.toFixed(2));
  }

  return 0;
}

/**
 * Normaliza estrutura de precificação do veículo.
 */
export function normalizePricing(
  rawPrice: unknown,
  rawPromotionalPrice?: unknown,
  rawPriceOnRequest?: unknown
): NormalizedPricing {
  const price = parseMonetaryValue(rawPrice);
  const promo = rawPromotionalPrice ? parseMonetaryValue(rawPromotionalPrice) : undefined;
  const isExplicitPriceOnRequest =
    rawPriceOnRequest === true ||
    rawPriceOnRequest === 'true' ||
    rawPriceOnRequest === '1' ||
    String(rawPrice).toLowerCase().includes('consulta');

  const priceOnRequest = isExplicitPriceOnRequest || price <= 0;
  const isValid = price > 0 && !priceOnRequest;

  return {
    price,
    promotionalPrice: promo && promo > 0 && promo < price ? promo : undefined,
    currency: 'BRL',
    priceOnRequest,
    isValid
  };
}

/**
 * Normaliza valor de quilometragem.
 */
export function normalizeMileage(rawKm: unknown, rawKmRaw?: unknown): number {
  if (typeof rawKmRaw === 'number' && !isNaN(rawKmRaw)) {
    return Math.max(0, Math.floor(rawKmRaw));
  }

  if (typeof rawKm === 'number' && !isNaN(rawKm)) {
    return Math.max(0, Math.floor(rawKm));
  }

  if (typeof rawKm === 'string') {
    const cleaned = rawKm
      .replace(/km/gi, '')
      .replace(/[^\d]/g, '')
      .trim();

    const parsed = parseInt(cleaned, 10);
    return isNaN(parsed) ? 0 : Math.max(0, parsed);
  }

  return 0;
}

/**
 * Infere a condição do veículo (NOVO, SEMINOVO, USADO).
 */
export function inferCondition(
  mileage: number,
  modelYear: number,
  rawCondition?: unknown
): VehicleCondition {
  if (typeof rawCondition === 'string') {
    const upper = rawCondition.trim().toUpperCase();
    if (upper === 'NOVO' || upper === '0KM' || upper === 'NEW') return VehicleCondition.NOVO;
    if (upper === 'SEMINOVO' || upper === 'SEMI-NOVO') return VehicleCondition.SEMINOVO;
    if (upper === 'USADO' || upper === 'USED') return VehicleCondition.USADO;
  }

  if (mileage <= 100 && modelYear >= CURRENT_YEAR) {
    return VehicleCondition.NOVO;
  }

  if (mileage <= 60000 && modelYear >= CURRENT_YEAR - 5) {
    return VehicleCondition.SEMINOVO;
  }

  return VehicleCondition.USADO;
}
