import { CanonicalVehicleOutput } from '../normalization/index.js';
import { Vehicle, VehicleStatus, SyncStatus } from '@prisma/client';

export type DiffAction = 'CREATE' | 'UPDATE' | 'REMOVE' | 'UNCHANGED';

export interface VehicleDiffItem {
  action: DiffAction;
  externalId: string;
  vehicle: CanonicalVehicleOutput;
  existingVehicle?: Partial<Vehicle>;
  changedFields?: string[];
}

export interface DiffResult {
  toCreate: CanonicalVehicleOutput[];
  toUpdate: Array<{
    vehicle: CanonicalVehicleOutput;
    existingId: string;
    changedFields: string[];
  }>;
  toRemove: Array<{
    id: string;
    externalId: string;
    currentStatus: VehicleStatus;
  }>;
  unchanged: CanonicalVehicleOutput[];
  totalIngested: number;
  totalCreated: number;
  totalUpdated: number;
  totalRemoved: number;
  totalUnchanged: number;
  totalErrors: number;
}

export interface SyncExecutionResult {
  syncHistoryId?: string;
  status: SyncStatus;
  diff: DiffResult;
  durationMs: number;
  cacheInvalidated: boolean;
  errorMessage?: string;
}
