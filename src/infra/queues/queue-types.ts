// ==============================================================================
// SaaS Auto Catálogo - Contratos de Filas e Jobs Assíncronos (BullMQ)
// ==============================================================================

export const QUEUE_NAMES = {
  XML_INGESTION: 'xml-ingestion-queue',
  META_SYNC: 'meta-sync-queue',
  AI_BLOG: 'ai-blog-queue'
} as const;

export type QueueName = typeof QUEUE_NAMES[keyof typeof QUEUE_NAMES];

export const JOB_NAMES = {
  SYNC_FEED: 'SYNC_FEED',
  SYNC_META_CATALOG: 'SYNC_META_CATALOG',
  GENERATE_BLOG_POST: 'GENERATE_BLOG_POST',
} as const;

export type JobName = typeof JOB_NAMES[keyof typeof JOB_NAMES];

export enum QueuePriority {
  HIGH = 1,    // Sincronização manual solicitada pelo lojista
  NORMAL = 2,  // Sincronização automática agendada (rotina)
  LOW = 3      // Reprocessamento, DLQ e tarefas de baixa urgência
}

/**
 * Payload para a fila de ingestão e streaming de feeds XML/JSON (DMS)
 */
export interface XmlIngestionJobData {
  workspaceId: string;
  feedConfigId: string;
  dealershipId?: string;
  sourceType: string;
  feedUrl: string;
  isManualTrigger: boolean;
  requestedByUserId?: string;
  timestamp: string;
}

/**
 * Payload para a fila de sincronização com o Catálogo Meta Ads DAA / Graph API
 */
export interface MetaSyncJobData {
  workspaceId: string;
  dealershipId?: string;
  metaCatalogId?: string;
  syncType: 'FULL_EXPORT' | 'DIFF_SYNC' | 'CATALOG_DIAGNOSTIC';
  trigger: 'AUTOMATIC' | 'MANUAL' | 'WEBHOOK';
  requestedByUserId?: string;
  timestamp: string;
}

/**
 * Payload para a fila de geração e publicação de conteúdo IA (Blog / SEO)
 */
export interface AiBlogJobData {
  articleId?: string;
  topic: string;
  targetKeywords: string[];
  referenceLinks?: string[];
  language?: string;
  publishStatus: 'DRAFT' | 'PUBLISHED';
  authorId?: string;
  timestamp: string;
}
