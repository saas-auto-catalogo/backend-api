import { FuelType, TransmissionType } from '@prisma/client';

/**
 * Normaliza o tipo de combustível.
 */
export function normalizeFuelType(rawFuel: unknown): FuelType {
  if (!rawFuel || typeof rawFuel !== 'string') {
    return FuelType.OUTRO;
  }

  const clean = rawFuel.trim().toLowerCase();

  if (clean.includes('híbrido plug-in') || clean.includes('hibrido plug-in') || clean.includes('phev') || clean.includes('e-hybrid') || clean.includes('tfsie') || clean.includes('dm-i')) {
    return FuelType.HIBRIDO_PLUG_IN;
  }

  if (clean.includes('mhev') || clean.includes('híbrido leve') || clean.includes('hibrido leve') || clean.includes('mild hybrid') || clean.includes('48v') || clean.includes('gasolina e elétrico') || clean.includes('gasolina e eletrico')) {
    return FuelType.MHEV_HIBRIDO_LEVE;
  }

  if (clean.includes('híbrido') || clean.includes('hibrido') || clean.includes('hybrid')) {
    return FuelType.HIBRIDO;
  }

  if (clean.includes('elétrico') || clean.includes('eletrico') || clean.includes('electric') || clean.includes('ev') || clean.includes('100% eletrico')) {
    return FuelType.ELETRICO;
  }

  if (clean.includes('flex') || clean.includes('álcool/gasolina') || clean.includes('gasolina/álcool') || clean.includes('gasolina e álcool') || clean.includes('bi-combustível') || clean.includes('total flex')) {
    return FuelType.FLEX;
  }

  if (clean.includes('diesel')) {
    return FuelType.DIESEL;
  }

  if (clean.includes('gasolina') || clean.includes('gasoline')) {
    return FuelType.GASOLINA;
  }

  if (clean.includes('etanol') || clean.includes('álcool') || clean.includes('alcohol')) {
    return FuelType.ETANOL;
  }

  if (clean.includes('gnv') || clean.includes('gás natural')) {
    return FuelType.GNV;
  }

  if (clean.includes('tetrafuel')) {
    return FuelType.TETRAFUEL;
  }

  return FuelType.OUTRO;
}

/**
 * Normaliza o tipo de transmissão/câmbio.
 */
export function normalizeTransmission(rawTransmission: unknown): TransmissionType {
  if (!rawTransmission || typeof rawTransmission !== 'string') {
    return TransmissionType.OUTRO;
  }

  const clean = rawTransmission.trim().toLowerCase();

  if (clean.includes('dupla embreagem') || clean.includes('pdk') || clean.includes('dsg') || clean.includes('dct') || clean.includes('s-tronic') || clean.includes('s tronic')) {
    return TransmissionType.DUPLA_EMBREAGEM;
  }

  if (clean.includes('cvt') || clean.includes('xtronic') || clean.includes('direct-shift')) {
    return TransmissionType.CVT;
  }

  if (clean.includes('automatizado') || clean.includes('i-motion') || clean.includes('dualogic') || clean.includes('easytronic')) {
    return TransmissionType.AUTOMATIZADO;
  }

  if (clean.includes('semi-automático') || clean.includes('semi-automatico') || clean.includes('semi automatico')) {
    return TransmissionType.SEMI_AUTOMATICO;
  }

  if (clean.includes('automática') || clean.includes('automático') || clean.includes('aut.') || clean.includes('tiptronic') || clean.includes('steptronic') || clean.includes('9g-tronic') || clean.includes('zf') || clean.includes('automatic')) {
    return TransmissionType.AUTOMATICO;
  }

  if (clean.includes('manual') || clean.includes('mecânico') || clean.includes('mecanico')) {
    return TransmissionType.MANUAL;
  }

  return TransmissionType.OUTRO;
}

/**
 * Dicionário de sinônimos e mapeamentos de opcionais/features para códigos padronizados
 */
const FEATURE_SYNONYMS: Record<string, string> = {
  'ar condicionado': 'AR_CONDICIONADO',
  'ar-condicionado': 'AR_CONDICIONADO',
  'ar condicionado digital': 'AR_CONDICIONADO_DIGITAL',
  'ar condicionado dual zone': 'AR_CONDICIONADO_DUAL_ZONE',
  'direcao hidraulica': 'DIRECAO_HIDRAULICA',
  'direção hidráulica': 'DIRECAO_HIDRAULICA',
  'direcao eletrica': 'DIRECAO_ELETRICA',
  'direção elétrica': 'DIRECAO_ELETRICA',
  'bancos de couro': 'BANCOS_COURO',
  'bancos em couro': 'BANCOS_COURO',
  'couro': 'BANCOS_COURO',
  'teto solar': 'TETO_SOLAR',
  'teto solar eletrico': 'TETO_SOLAR_ELETRICO',
  'teto solar elétrico': 'TETO_SOLAR_ELETRICO',
  'teto panoramico': 'TETO_PANORAMICO',
  'teto panorâmico': 'TETO_PANORAMICO',
  'tracao 4x4': 'TRACAO_4X4',
  'tração 4x4': 'TRACAO_4X4',
  '4x4': 'TRACAO_4X4',
  '4matic': 'TRACAO_4X4',
  'awd': 'TRACAO_AWD',
  'camera de re': 'CAMERA_RE',
  'câmera de ré': 'CAMERA_RE',
  'camera 360': 'CAMERA_360',
  'câmera 360': 'CAMERA_360',
  'sensor de estacionamento': 'SENSOR_ESTACIONAMENTO',
  'sensor de ré': 'SENSOR_ESTACIONAMENTO',
  'farois led': 'FAROIS_LED',
  'faróis led': 'FAROIS_LED',
  'farois full led': 'FAROIS_FULL_LED',
  'faróis full led': 'FAROIS_FULL_LED',
  'rodas de liga leve': 'RODAS_LIGA_LEVE',
  'rodas liga leve': 'RODAS_LIGA_LEVE',
  'piloto automatico': 'PILOTO_AUTOMATICO',
  'piloto automático': 'PILOTO_AUTOMATICO',
  'piloto automatico adaptativo': 'PILOTO_AUTOMATICO_ACC',
  'piloto automático adaptativo': 'PILOTO_AUTOMATICO_ACC',
  'acc': 'PILOTO_AUTOMATICO_ACC',
  'central multimidia': 'CENTRAL_MULTIMIDIA',
  'central multimídia': 'CENTRAL_MULTIMIDIA',
  'multimidia': 'CENTRAL_MULTIMIDIA',
  'apple carplay': 'APPLE_CARPLAY',
  'android auto': 'ANDROID_AUTO',
  'painel digital': 'PAINEL_DIGITAL',
  'chave presencial': 'CHAVE_PRESENCIAL',
  'keyless': 'CHAVE_PRESENCIAL',
  'start stop': 'START_STOP',
  'start-stop': 'START_STOP',
  'freios abs': 'FREIOS_ABS',
  'abs': 'FREIOS_ABS',
  'air bag': 'AIRBAG',
  'airbag': 'AIRBAG',
  'airbags': 'AIRBAG',
  'air bag duplo': 'AIRBAG_DUPLO',
  'airbag duplo': 'AIRBAG_DUPLO',
  'alerta de ponto cego': 'ALERTA_PONTO_CEGO',
  'frenagem autonoma': 'FRENAGEM_AUTONOMA',
  'frenagem autônoma': 'FRENAGEM_AUTONOMA',
  'blindado': 'BLINDADO',
  'blindagem': 'BLINDADO'
};

/**
 * Normaliza lista de opcionais brutos em array de strings formatadas e deduplicadas.
 */
export function normalizeFeatures(rawInput: unknown): string[] {
  if (!rawInput) return [];

  const rawList: string[] = [];

  if (Array.isArray(rawInput)) {
    for (const item of rawInput) {
      if (typeof item === 'string') {
        rawList.push(item);
      } else if (typeof item === 'object' && item !== null) {
        // Objeto XML (ex: { item: "Teto Solar" } ou { opcional: "..." })
        const val = item.item || item.opcional || item._text || Object.values(item)[0];
        if (typeof val === 'string') rawList.push(val);
      }
    }
  } else if (typeof rawInput === 'string') {
    // Separa por quebra de linha, vírgula ou ponto e vírgula
    const split = rawInput.split(/[\n\r;,]+/);
    rawList.push(...split);
  } else if (typeof rawInput === 'object' && rawInput !== null) {
    const values = Object.values(rawInput as Record<string, any>);
    for (const v of values) {
      if (typeof v === 'string') rawList.push(v);
      else if (Array.isArray(v)) rawList.push(...v.filter((x) => typeof x === 'string'));
    }
  }

  const featureSet = new Set<string>();

  for (const raw of rawList) {
    const clean = raw.trim().toLowerCase();
    if (!clean) continue;

    if (FEATURE_SYNONYMS[clean]) {
      featureSet.add(FEATURE_SYNONYMS[clean]);
    } else {
      // Converte para formato UPPER_SNAKE_CASE genérico limpo
      const genericCode = clean
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\w\s]/g, '')
        .replace(/\s+/g, '_')
        .toUpperCase();

      if (genericCode.length > 2) {
        featureSet.add(genericCode);
      }
    }
  }

  return Array.from(featureSet);
}
