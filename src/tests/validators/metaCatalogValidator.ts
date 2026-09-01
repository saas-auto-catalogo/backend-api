/**
 * Validador Oficial do Schema Meta Automotive Inventory Ads (DAA)
 * Verifica conformidade de todas as tags obrigatórias e formatos esperados.
 */

export interface MetaDAAVehicle {
  'g:vehicle_id': string;
  'g:title': string;
  'g:price': string;
  'g:availability': string;
  'g:image_link': string;
  'g:year': string;
  'g:make': string;
  'g:model': string;
  'g:mileage'?: string;
  'g:body_style'?: string;
  'g:fuel_type'?: string;
  'g:transmission'?: string;
  'g:condition'?: string;
  [key: string]: string | undefined;
}

export interface ValidationResult {
  valid: boolean;
  vehicleId: string;
  errors: string[];
  warnings: string[];
}

export interface BatchValidationResult {
  totalVehicles: number;
  valid: number;
  invalid: number;
  results: ValidationResult[];
  conformanceRate: number; // 0–100%
}

// Regex para validação de preço no formato Meta DAA: "129900.00 BRL"
const PRICE_REGEX = /^\d+(\.\d{2})?\s+BRL$/;
// Regex para URL HTTPS válida
const HTTPS_URL_REGEX = /^https:\/\/.+/;
// Regex para ano de 4 dígitos (entre 1900 e 2100)
const YEAR_REGEX = /^(19|20)\d{2}$/;
// Regex para formato de quilometragem: "12500 km"
const MILEAGE_REGEX = /^\d+\s+km$/;

const VALID_AVAILABILITY = new Set(['in stock', 'out of stock']);
const VALID_CONDITION = new Set(['new', 'used', 'refurbished']);

/**
 * Valida um único veículo contra o schema Meta DAA.
 */
export function validateMetaDAAVehicle(vehicle: MetaDAAVehicle, allIds?: Set<string>): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const vehicleId = vehicle['g:vehicle_id'] || '(sem id)';

  // ─── Campos Obrigatórios ──────────────────────────────────────────────────

  // g:vehicle_id
  if (!vehicle['g:vehicle_id'] || vehicle['g:vehicle_id'].trim().length === 0) {
    errors.push('g:vehicle_id é obrigatório e não pode ser vazio');
  } else if (allIds && allIds.has(vehicle['g:vehicle_id'])) {
    errors.push(`g:vehicle_id duplicado: "${vehicle['g:vehicle_id']}"`);
  } else if (allIds) {
    allIds.add(vehicle['g:vehicle_id']);
  }

  // g:title
  if (!vehicle['g:title'] || vehicle['g:title'].trim().length === 0) {
    errors.push('g:title é obrigatório');
  } else if (vehicle['g:title'].length > 150) {
    errors.push(`g:title excede 150 caracteres (atual: ${vehicle['g:title'].length})`);
  }

  // g:price
  if (!vehicle['g:price'] || vehicle['g:price'].trim().length === 0) {
    errors.push('g:price é obrigatório');
  } else if (!PRICE_REGEX.test(vehicle['g:price'])) {
    errors.push(`g:price com formato inválido: "${vehicle['g:price']}" (esperado: "129900.00 BRL")`);
  } else {
    const priceValue = parseFloat(vehicle['g:price'].split(' ')[0]);
    if (priceValue <= 0) {
      errors.push(`g:price não pode ser zero ou negativo: ${priceValue}`);
    }
  }

  // g:availability
  if (!vehicle['g:availability'] || vehicle['g:availability'].trim().length === 0) {
    errors.push('g:availability é obrigatório');
  } else if (!VALID_AVAILABILITY.has(vehicle['g:availability'].toLowerCase())) {
    errors.push(`g:availability inválido: "${vehicle['g:availability']}" (esperado: "in stock" ou "out of stock")`);
  }

  // g:image_link
  if (!vehicle['g:image_link'] || vehicle['g:image_link'].trim().length === 0) {
    errors.push('g:image_link é obrigatório');
  } else if (!HTTPS_URL_REGEX.test(vehicle['g:image_link'])) {
    errors.push(`g:image_link deve ser uma URL HTTPS válida: "${vehicle['g:image_link']}"`);
  }

  // g:year
  if (!vehicle['g:year'] || vehicle['g:year'].trim().length === 0) {
    errors.push('g:year é obrigatório');
  } else if (!YEAR_REGEX.test(vehicle['g:year'])) {
    errors.push(`g:year com formato inválido: "${vehicle['g:year']}" (esperado: 4 dígitos entre 1900-2099)`);
  }

  // g:make
  if (!vehicle['g:make'] || vehicle['g:make'].trim().length === 0) {
    errors.push('g:make é obrigatório');
  } else if (vehicle['g:make'].length > 100) {
    warnings.push(`g:make muito longo (${vehicle['g:make'].length} chars)`);
  }

  // g:model
  if (!vehicle['g:model'] || vehicle['g:model'].trim().length === 0) {
    errors.push('g:model é obrigatório');
  } else if (vehicle['g:model'].length > 100) {
    warnings.push(`g:model muito longo (${vehicle['g:model'].length} chars)`);
  }

  // ─── Campos Opcionais com Validação de Formato ───────────────────────────

  // g:mileage
  if (vehicle['g:mileage'] && !MILEAGE_REGEX.test(vehicle['g:mileage'])) {
    warnings.push(`g:mileage com formato inválido: "${vehicle['g:mileage']}" (esperado: "12500 km")`);
  }

  // g:condition
  if (vehicle['g:condition'] && !VALID_CONDITION.has(vehicle['g:condition'].toLowerCase())) {
    warnings.push(`g:condition inválido: "${vehicle['g:condition']}" (esperado: new, used ou refurbished)`);
  }

  return {
    valid: errors.length === 0,
    vehicleId,
    errors,
    warnings,
  };
}

/**
 * Valida um lote de veículos e retorna estatísticas de conformidade.
 */
export function validateMetaDAABatch(vehicles: MetaDAAVehicle[]): BatchValidationResult {
  const seenIds = new Set<string>();
  const results = vehicles.map((v) => validateMetaDAAVehicle(v, seenIds));
  const valid = results.filter((r) => r.valid).length;

  return {
    totalVehicles: vehicles.length,
    valid,
    invalid: vehicles.length - valid,
    results,
    conformanceRate: vehicles.length > 0 ? (valid / vehicles.length) * 100 : 0,
  };
}

/**
 * Utilitário: converte preço em centavos (number) para o formato Meta DAA.
 * Ex: 12990000 (centavos) → "129900.00 BRL"
 */
export function formatMetaPrice(centavos: number): string {
  return `${(centavos / 100).toFixed(2)} BRL`;
}

/**
 * Utilitário: converte quilometragem numérica para o formato Meta DAA.
 * Ex: 12500 → "12500 km"
 */
export function formatMetaMileage(km: number): string {
  return `${Math.round(km)} km`;
}
