import { Readable } from 'stream';

/**
 * Gerador de XMLs Sintéticos de Alta Carga para Benchmarks de Performance.
 * Produz payloads no formato AutoCerto, adequados para teste do XmlStreamParser.
 */

interface GeneratorOptions {
  /** DMS simulado: 'autocerto' | 'altimus' | 'sisvag' | 'bomcontrole' */
  dmsFormat?: 'autocerto' | 'altimus' | 'sisvag' | 'bomcontrole';
  /** Inclui casos de borda propositalmente malformados */
  injectEdgeCases?: boolean;
}

const MARCAS = ['Toyota', 'Volkswagen', 'Honda', 'Hyundai', 'Chevrolet', 'Fiat', 'Jeep', 'Renault', 'Nissan', 'Ford'];
const MODELOS: Record<string, string[]> = {
  Toyota: ['Corolla', 'Hilux', 'Yaris', 'RAV4', 'SW4'],
  Volkswagen: ['Gol', 'Polo', 'T-Cross', 'Tiguan', 'Virtus'],
  Honda: ['City', 'Civic', 'HR-V', 'WR-V', 'Fit'],
  Hyundai: ['HB20', 'Creta', 'Tucson', 'i30', 'Elantra'],
  Chevrolet: ['Onix', 'Tracker', 'Spin', 'S10', 'Cruze'],
  Fiat: ['Argo', 'Pulse', 'Mobi', 'Uno', 'Toro'],
  Jeep: ['Renegade', 'Compass', 'Commander', 'Wrangler', 'Cherokee'],
  Renault: ['Sandero', 'Duster', 'Kwid', 'Logan', 'Oroch'],
  Nissan: ['Kicks', 'Versa', 'March', 'Frontier', 'Sentra'],
  Ford: ['Ranger', 'Territory', 'Bronco Sport', 'Maverick', 'Mustang'],
};
const COMBUSTIVEIS = ['Flex', 'Gasolina', 'Etanol', 'Diesel', 'Elétrico', 'Híbrido'];
const CAMBIOS = ['Manual', 'Automático', 'CVT', 'Automatizado'];
const CORES = ['Branco Polar', 'Prata Metálico', 'Preto Onyx', 'Vermelho Chili', 'Azul Nitrous', 'Cinza Grafite'];
const OPCIONAIS = ['Ar Condicionado', 'Direção Elétrica', 'Vidros Elétricos', 'Travas Elétricas', 'Câmera de Ré', 'Sensor de Estacionamento', 'Banco de Couro', 'Teto Solar'];

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomItem<T>(arr: T[]): T {
  return arr[randomInt(0, arr.length - 1)];
}

function generateVehicleXmlAutoCerto(index: number, injectError = false): string {
  const marca = randomItem(MARCAS);
  const modelos = MODELOS[marca];
  const modelo = randomItem(modelos);
  const anoFab = randomInt(2018, 2024);
  const anoMod = anoFab + randomInt(0, 1);
  const km = randomInt(0, 120000);
  // Casos de borda: preço zerado ou negativo (propositalmente inválido)
  const preco = injectError ? '0.00' : (randomInt(50000, 350000)).toFixed(2);
  // Casos de borda: caractere & sem escapar (deve ser tratado pelo sanitizer)
  const obs = injectError
    ? `Veículo com & especial <script>xss</script>`
    : `Veículo em ótimo estado, revisões em dia.`;
  const cor = randomItem(CORES);
  const combustivel = randomItem(COMBUSTIVEIS);
  const cambio = randomItem(CAMBIOS);
  const fotos = injectError
    ? '' // sem fotos (caso de borda)
    : Array.from({ length: randomInt(1, 5) }, (_, i) =>
        `    <foto>https://img.autocerto.com/veiculos/vc${index}/${i + 1}.jpg</foto>`
      ).join('\n');
  const opcionaisCount = randomInt(2, 5);
  const opcionaisXml = Array.from({ length: opcionaisCount }, () =>
    `      <opcional>${randomItem(OPCIONAIS)}</opcional>`
  ).join('\n');

  return `  <veiculo>
    <codigo_veiculo>SYN-${String(index).padStart(6, '0')}</codigo_veiculo>
    <marca>${marca}</marca>
    <modelo>${modelo}</modelo>
    <versao>1.0 Flex Aut.</versao>
    <anofabricacao>${anoFab}</anofabricacao>
    <anomodelo>${anoMod}</anomodelo>
    <cor>${cor}</cor>
    <combustivel>${combustivel}</combustivel>
    <cambio>${cambio}</cambio>
    <portas>4</portas>
    <quilometragem>${km}</quilometragem>
    <valor_venda>${preco}</valor_venda>
    <status>disponivel</status>
    <fotos>
${fotos}
    </fotos>
    <opcionais>
${opcionaisXml}
    </opcionais>
    <observacoes>${obs}</observacoes>
  </veiculo>`;
}

/**
 * Gera um XML completo de estoque com N veículos (formato AutoCerto).
 * Para volumes acima de 1.000, considera-se uso de Streaming Parser.
 */
export function generateXmlPayload(vehicleCount: number, options: GeneratorOptions = {}): string {
  const { injectEdgeCases = false } = options;
  const header = `<?xml version="1.0" encoding="UTF-8"?>\n<estoque>`;
  const footer = `</estoque>`;

  const vehicleXmls: string[] = [];
  for (let i = 1; i <= vehicleCount; i++) {
    // Injeta edge cases nos últimos 3 veículos se configurado
    const isEdgeCase = injectEdgeCases && i > vehicleCount - 3;
    vehicleXmls.push(generateVehicleXmlAutoCerto(i, isEdgeCase));
  }

  return `${header}\n${vehicleXmls.join('\n')}\n${footer}`;
}

/**
 * Gera uma Readable Stream com N veículos (sem materializar o XML completo na memória).
 * Ideal para testar o streaming parser em volumes muito altos (5.000+).
 */
export function generateXmlStream(vehicleCount: number, options: GeneratorOptions = {}): Readable {
  const { injectEdgeCases = false } = options;
  let index = 0;
  let headerSent = false;
  let footerSent = false;

  return new Readable({
    read() {
      if (!headerSent) {
        this.push(`<?xml version="1.0" encoding="UTF-8"?>\n<estoque>\n`);
        headerSent = true;
        return;
      }

      if (index < vehicleCount) {
        index++;
        const isEdgeCase = injectEdgeCases && index > vehicleCount - 3;
        this.push(generateVehicleXmlAutoCerto(index, isEdgeCase) + '\n');
      } else if (!footerSent) {
        footerSent = true;
        this.push(`</estoque>\n`);
        this.push(null); // fim do stream
      }
    },
  });
}

/**
 * Benchmarks pré-definidos de carga para os testes de QA.
 */
export const LOAD_BENCHMARKS = {
  SMALL: 10,       // <10ms esperado
  MEDIUM: 500,     // <100ms esperado
  LARGE: 5000,     // <500ms esperado com streaming
} as const;
