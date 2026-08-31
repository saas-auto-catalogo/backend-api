import { BodyStyle } from '@prisma/client';

/**
 * Mapa Canônico de Marcas Automotivas e Aliases
 */
const BRAND_ALIASES: Record<string, string> = {
  'vw': 'VOLKSWAGEN',
  'volks': 'VOLKSWAGEN',
  'volkswagen': 'VOLKSWAGEN',
  'gm': 'CHEVROLET',
  'chevy': 'CHEVROLET',
  'chevrolet': 'CHEVROLET',
  'mb': 'MERCEDES-BENZ',
  'mercedes': 'MERCEDES-BENZ',
  'mercedes benz': 'MERCEDES-BENZ',
  'mercedes-benz': 'MERCEDES-BENZ',
  'land rover': 'LAND ROVER',
  'landrover': 'LAND ROVER',
  'range rover': 'LAND ROVER',
  'toyota': 'TOYOTA',
  'honda': 'HONDA',
  'hyundai': 'HYUNDAI',
  'jeep': 'JEEP',
  'fiat': 'FIAT',
  'ford': 'FORD',
  'renault': 'RENAULT',
  'nissan': 'NISSAN',
  'peugeot': 'PEUGEOT',
  'citroen': 'CITROEN',
  'citroën': 'CITROEN',
  'byd': 'BYD',
  'gwm': 'GWM',
  'haval': 'GWM',
  'ora': 'GWM',
  'bmw': 'BMW',
  'audi': 'AUDI',
  'porsche': 'PORSCHE',
  'volvo': 'VOLVO',
  'ram': 'RAM',
  'dodge': 'DODGE',
  'mitsubishi': 'MITSUBISHI',
  'kia': 'KIA',
  'chery': 'CAOAH CHERY',
  'caoa chery': 'CAOA CHERY',
  'changan': 'CHANGAN',
  'jac': 'JAC',
  'jac motors': 'JAC',
  'subaru': 'SUBARU',
  'suzuki': 'SUZUKI',
  'lexus': 'LEXUS',
  'mini': 'MINI',
  'ferrari': 'FERRARI',
  'lamborghini': 'LAMBORGHINI',
  'maserati': 'MASERATI',
  'jaguar': 'JAGUAR',
  'mclaren': 'MCLAREN',
  'aston martin': 'ASTON MARTIN',
  'corvette': 'CHEVROLET'
};

/**
 * Sanitiza e normaliza nomes de fabricantes/marcas.
 */
export function normalizeMake(rawMake: unknown): string {
  if (!rawMake || typeof rawMake !== 'string') {
    return 'OUTRO';
  }

  const cleaned = rawMake
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, ' ');

  if (BRAND_ALIASES[cleaned]) {
    return BRAND_ALIASES[cleaned];
  }

  // Retorna em caixa alta formatada
  return rawMake.trim().toUpperCase();
}

/**
 * Separa e normaliza modelo base e versão de acabamento.
 */
export function normalizeModelAndVersion(
  rawModel: unknown,
  rawVersion: unknown,
  rawShort?: unknown,
  make?: string
): { model: string; version: string; title: string } {
  let modelStr = typeof rawModel === 'string' ? rawModel.trim() : '';
  let versionStr = typeof rawVersion === 'string' ? rawVersion.trim() : '';
  const shortStr = typeof rawShort === 'string' ? rawShort.trim() : '';

  // Se o feed forneceu um nome curto explícito (ex: Base44 'short: GLC 300')
  if (shortStr && shortStr.length > 0) {
    modelStr = shortStr;
  }

  // Se o modelo contiver a marca no início, remove para evitar redundância ("TOYOTA COROLLA" -> "COROLLA")
  if (make && modelStr.toUpperCase().startsWith(make.toUpperCase())) {
    modelStr = modelStr.substring(make.length).trim();
  }

  // Se a versão estiver vazia e o modelo for longo, tenta extrair a versão
  if (!versionStr && modelStr.split(' ').length > 2) {
    const parts = modelStr.split(' ');
    modelStr = parts.slice(0, 2).join(' ');
    versionStr = parts.slice(2).join(' ');
  } else if (!versionStr) {
    versionStr = modelStr;
  }

  const title = `${make ? make + ' ' : ''}${modelStr} ${versionStr}`.replace(/\s+/g, ' ').trim();

  return {
    model: modelStr || 'MODELO NÃO INFORMADO',
    version: versionStr || modelStr || 'VERSÃO PADRÃO',
    title
  };
}

/**
 * Infere o tipo de carroceria (BodyStyle) compatível com o Meta DAA com base em palavras-chave.
 */
export function inferBodyStyle(
  make: string,
  model: string,
  version: string,
  notes?: string,
  rawCategory?: string
): BodyStyle {
  const combined = `${make} ${model} ${version} ${notes || ''} ${rawCategory || ''}`.toLowerCase();

  // 1. Pickups / Camionetes
  if (
    combined.includes('pickup') ||
    combined.includes('picape') ||
    combined.includes('cabine dupla') ||
    combined.includes('cabine simples') ||
    combined.includes('ranger') ||
    combined.includes('hilux') ||
    combined.includes('s10') ||
    combined.includes('toro') ||
    combined.includes('strada') ||
    combined.includes('saveiro') ||
    combined.includes('montana') ||
    combined.includes('ram 1500') ||
    combined.includes('ram 2500') ||
    combined.includes('ram 3500') ||
    combined.includes('rampage') ||
    combined.includes('amarok') ||
    combined.includes('frontier') ||
    combined.includes('l200') ||
    combined.includes('maverick') ||
    combined.includes('f-150') ||
    combined.includes('silverado')
  ) {
    return BodyStyle.PICKUP;
  }

  // 2. SUVs e Crossovers
  if (
    combined.includes('suv') ||
    combined.includes('crossover') ||
    combined.includes('cross') ||
    combined.includes('compass') ||
    combined.includes('renegade') ||
    combined.includes('commander') ||
    combined.includes('creta') ||
    combined.includes('t-cross') ||
    combined.includes('nivus') ||
    combined.includes('taos') ||
    combined.includes('tiguan') ||
    combined.includes('kicks') ||
    combined.includes('tracker') ||
    combined.includes('hr-v') ||
    combined.includes('cr-v') ||
    combined.includes('zr-v') ||
    combined.includes('duster') ||
    combined.includes('captur') ||
    combined.includes('kardian') ||
    combined.includes('pulse') ||
    combined.includes('fastback') ||
    combined.includes('glc') ||
    combined.includes('gle') ||
    combined.includes('gla') ||
    combined.includes('glb') ||
    combined.includes('q3') ||
    combined.includes('q5') ||
    combined.includes('q7') ||
    combined.includes('q8') ||
    combined.includes('x1') ||
    combined.includes('x3') ||
    combined.includes('x5') ||
    combined.includes('x6') ||
    combined.includes('macan') ||
    combined.includes('cayenne') ||
    combined.includes('song plus') ||
    combined.includes('yuan plus') ||
    combined.includes('haval h6') ||
    combined.includes('corolla cross') ||
    combined.includes('sw4') ||
    combined.includes('pajero') ||
    combined.includes('outlander')
  ) {
    return BodyStyle.SUV;
  }

  // 3. Sedans
  if (
    combined.includes('sedan') ||
    combined.includes('sedã') ||
    combined.includes('corolla') && !combined.includes('cross') ||
    combined.includes('civic') ||
    combined.includes('city') && combined.includes('sedan') ||
    combined.includes('virtus') ||
    combined.includes('jetta') ||
    combined.includes('passat') ||
    combined.includes('onix plus') ||
    combined.includes('cruze') && !combined.includes('sport6') ||
    combined.includes('hb20s') ||
    combined.includes('cronos') ||
    combined.includes('sentra') ||
    combined.includes('versa') ||
    combined.includes('yaris sedan') ||
    combined.includes('320i') ||
    combined.includes('330i') ||
    combined.includes('classe c') ||
    combined.includes('c180') ||
    combined.includes('c200') ||
    combined.includes('c300') ||
    combined.includes('a3 sedan') ||
    combined.includes('a4') ||
    combined.includes('a6') ||
    combined.includes('s60') ||
    combined.includes('king') && combined.includes('byd')
  ) {
    return BodyStyle.SEDAN;
  }

  // 4. Coupés & Esportivos
  if (
    combined.includes('coupé') ||
    combined.includes('coupe') ||
    combined.includes('911') ||
    combined.includes('718') ||
    combined.includes('cayman') ||
    combined.includes('mustang') ||
    combined.includes('camaro') ||
    combined.includes('corvette') ||
    combined.includes('amg gt') ||
    combined.includes('ferrari') ||
    combined.includes('huracan') ||
    combined.includes('aventador')
  ) {
    return BodyStyle.COUPE;
  }

  // 5. Conversíveis / Cabriolet
  if (
    combined.includes('conversível') ||
    combined.includes('conversivel') ||
    combined.includes('convertible') ||
    combined.includes('cabriolet') ||
    combined.includes('boxster') ||
    combined.includes('spider') ||
    combined.includes('roadster')
  ) {
    return BodyStyle.CONVERTIBLE;
  }

  // 6. Hatchbacks
  if (
    combined.includes('hatch') ||
    combined.includes('hatchback') ||
    combined.includes('gol') ||
    combined.includes('polo') ||
    combined.includes('onix') && !combined.includes('plus') ||
    combined.includes('hb20') && !combined.includes('hb20s') ||
    combined.includes('argo') ||
    combined.includes('mobi') ||
    combined.includes('kwid') ||
    combined.includes('208') ||
    combined.includes('c3') ||
    combined.includes('sandero') ||
    combined.includes('yaris') && !combined.includes('sedan') ||
    combined.includes('dolphin')
  ) {
    return BodyStyle.HATCHBACK;
  }

  // 7. Vans / Comerciais
  if (
    combined.includes('van') ||
    combined.includes('furgão') ||
    combined.includes('furgao') ||
    combined.includes('ducato') ||
    combined.includes('master') ||
    combined.includes('sprinter') ||
    combined.includes('transit') ||
    combined.includes('jumpy') ||
    combined.includes('expert')
  ) {
    return BodyStyle.VAN;
  }

  // 8. Motocicletas
  if (
    combined.includes('moto') ||
    combined.includes('motocicleta') ||
    combined.includes('scooter') ||
    combined.includes('cg 160') ||
    combined.includes('cb 500') ||
    combined.includes('fazer') ||
    combined.includes('mt-03') ||
    combined.includes('gs 1250')
  ) {
    return BodyStyle.MOTORCYCLE;
  }

  return BodyStyle.OTHER;
}

/**
 * Sanitiza descrições removendo tags HTML, scripts e excesso de espaços.
 */
export function sanitizeDescription(rawDescription: unknown, maxChars: number = 5000): string {
  if (!rawDescription || typeof rawDescription !== 'string') {
    return '';
  }

  const cleaned = rawDescription
    .replace(/<[^>]*>?/gm, ' ') // remove HTML tags
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/[\r\n]+/g, '\n')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleaned.length > maxChars) {
    return cleaned.substring(0, maxChars - 3) + '...';
  }

  return cleaned;
}
