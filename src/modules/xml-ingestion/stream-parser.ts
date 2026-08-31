import { Readable, Transform } from 'stream';
import sax from 'sax';
import iconv from 'iconv-lite';

export interface RawParsedVehicle {
  [key: string]: any;
}

export interface StreamParserOptions {
  encoding?: string;
  vehicleTagNames?: string[];
  onProgress?: (count: number) => void;
}

export interface StreamParserStats {
  totalProcessed: number;
  durationMs: number;
  detectedRootTag?: string;
}

// Tags conhecidas de veículos nos principais DMSs brasileiros e padrões internacionais
const DEFAULT_VEHICLE_TAGS = new Set([
  'veiculo',
  'anuncio',
  'entry',
  'listing',
  'carro',
  'item',
  'vehicle',
  'auto',
  'estoque_item'
]);

/**
 * Cria um Transform Stream para sanitizar caracteres e normalizar declarações de encoding XML.
 */
function createXmlStreamSanitizer(encoding?: string): Transform {
  let isFirstChunk = true;

  return new Transform({
    transform(chunk: Buffer, _enc, callback) {
      let text: string;

      if (encoding && !encoding.toLowerCase().includes('utf-8')) {
        text = iconv.decode(chunk, encoding);
      } else {
        // Tenta decodificar como UTF-8
        text = chunk.toString('utf-8');
      }

      if (isFirstChunk) {
        isFirstChunk = false;
        // Normaliza declarações de encoding antigas (ex: ISO-8859-1, Windows-1252) para UTF-8 após decodificação
        text = text.replace(/<\?xml([^>]*?)encoding=["'][^"']+["']([^>]*?)\?>/i, '<?xml$1encoding="UTF-8"$2?>');
      }

      // Substitui & isolados que não sejam entidades XML válidas por &amp;
      const sanitized = text.replace(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;');
      callback(null, Buffer.from(sanitized, 'utf-8'));
    }
  });
}

/**
 * Parser SAX de Alta Performance em Streaming para Feeds XML Automotivos.
 * Mantém consumo de memória estável (< 256MB) mesmo em arquivos com 5.000+ veículos.
 */
export class XmlStreamParser {
  /**
   * Processa uma stream XML e emite um callback para cada veículo encontrado.
   */
  static async parseStream(
    inputStream: Readable,
    onVehicleParsed: (vehicle: RawParsedVehicle, index: number) => Promise<void> | void,
    options: StreamParserOptions = {}
  ): Promise<StreamParserStats> {
    const startTime = Date.now();
    let totalProcessed = 0;
    let detectedRootTag: string | undefined;

    const targetTags = options.vehicleTagNames
      ? new Set(options.vehicleTagNames.map((t) => t.toLowerCase()))
      : DEFAULT_VEHICLE_TAGS;

    // Configura o parser SAX em modo strict com trim e normalize
    const saxParser = sax.createStream(true, {
      trim: true,
      normalize: true,
      lowercase: true
    });

    let currentItem: Record<string, any> | null = null;
    const tagStack: Array<{ name: string; obj: Record<string, any> }> = [];
    let currentText = '';

    saxParser.on('opentag', (node) => {
      const tagName = node.name.toLowerCase();

      if (!detectedRootTag) {
        detectedRootTag = tagName;
      }

      // Início de um novo registro de veículo
      if (targetTags.has(tagName) && !currentItem) {
        currentItem = { ...node.attributes };
        tagStack.length = 0;
        tagStack.push({ name: tagName, obj: currentItem });
        currentText = '';
        return;
      }

      if (currentItem) {
        const parent = tagStack[tagStack.length - 1];
        const newObj: Record<string, any> = { ...node.attributes };

        // Se a propriedade já existe no pai, converte para array
        if (parent && parent.obj[tagName] !== undefined) {
          if (!Array.isArray(parent.obj[tagName])) {
            parent.obj[tagName] = [parent.obj[tagName]];
          }
          parent.obj[tagName].push(newObj);
        } else if (parent) {
          parent.obj[tagName] = newObj;
        }

        tagStack.push({ name: tagName, obj: newObj });
        currentText = '';
      }
    });

    saxParser.on('text', (text) => {
      if (currentItem) {
        currentText += text;
      }
    });

    saxParser.on('cdata', (cdata) => {
      if (currentItem) {
        currentText += cdata;
      }
    });

    saxParser.on('closetag', async (tagName) => {
      const lowerTagName = tagName.toLowerCase();

      if (!currentItem) {
        return;
      }

      const top = tagStack[tagStack.length - 1];
      const trimmedText = currentText.trim();

      if (top && top.name === lowerTagName) {
        // Se o nó tem apenas texto e nenhum atributo/filho complexo, simplifica para string direta
        if (Object.keys(top.obj).length === 0 && trimmedText.length > 0) {
          const parent = tagStack[tagStack.length - 2];
          if (parent) {
            if (Array.isArray(parent.obj[lowerTagName])) {
              const lastIdx = parent.obj[lowerTagName].length - 1;
              parent.obj[lowerTagName][lastIdx] = trimmedText;
            } else {
              parent.obj[lowerTagName] = trimmedText;
            }
          }
        } else if (trimmedText.length > 0) {
          top.obj['_text'] = trimmedText;
        }

        tagStack.pop();
      }

      currentText = '';

      // Fechamento da tag de veículo: emite o callback e libera o objeto
      if (targetTags.has(lowerTagName) && tagStack.length === 0) {
        const finishedVehicle = currentItem;
        currentItem = null; // Libera imediatamente para GC
        totalProcessed++;

        if (options.onProgress && totalProcessed % 100 === 0) {
          options.onProgress(totalProcessed);
        }

        try {
          await onVehicleParsed(finishedVehicle, totalProcessed);
        } catch (err) {
          console.warn(`[XmlStreamParser] Aviso ao processar item ${totalProcessed}: ${(err as Error).message}`);
        }
      }
    });

    return new Promise<StreamParserStats>((resolve, reject) => {
      const sanitizer = createXmlStreamSanitizer(options.encoding);

      inputStream
        .pipe(sanitizer)
        .pipe(saxParser)
        .on('error', (err) => {
          reject(new Error(`Erro de sintaxe no streaming XML: ${err.message}`));
        })
        .on('end', () => {
          const durationMs = Date.now() - startTime;
          resolve({
            totalProcessed,
            durationMs,
            detectedRootTag
          });
        });
    });
  }
}
