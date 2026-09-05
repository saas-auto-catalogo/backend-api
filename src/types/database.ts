// ==============================================================================
// DriveSync - Tipagens de Banco de Dados e Campos JSON Canônicos
// ==============================================================================

export interface VehicleImage {
  url: string;
  fullUrl?: string;
  order: number;
  isPrimary: boolean;
  label?: string;
}

export type VehicleFeatures = string[];

export interface VehicleValidationWarning {
  field: string;
  code: string;
  message: string;
  severity: 'WARNING' | 'ERROR' | 'INFO';
}

export interface CatalogFilterRules {
  minPrice?: number;
  maxPrice?: number;
  minYear?: number;
  maxYear?: number;
  bodyStyles?: string[];
  fuelTypes?: string[];
  onlyAvailable?: boolean;
  minImagesCount?: number;
  requireVin?: boolean;
}

export interface SyncHistoryDetails {
  sourceUrl?: string;
  rawPayloadSizeBytes?: number;
  ingestedCount?: number;
  skippedCount?: number;
  errorSamples?: Array<{
    externalId?: string;
    reason: string;
  }>;
}

export interface AuditLogMetadata {
  previousState?: Record<string, unknown>;
  newState?: Record<string, unknown>;
  reason?: string;
  clientInfo?: {
    browser?: string;
    os?: string;
  };
}
