import { z } from 'zod';
import { VehicleStatus } from '@prisma/client';

export const workspaceParamsSchema = z.object({
  workspaceId: z.string().min(3),
});

export const vehicleIdParamsSchema = workspaceParamsSchema.extend({
  vehicleId: z.string().min(3),
});

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const vehiclesListQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().min(1).optional(),
  make: z.string().trim().min(1).optional(),
  fuelType: z.string().trim().min(1).optional(),
  status: z.nativeEnum(VehicleStatus).optional(),
  eligibleOnly: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
  sortBy: z.enum(['updatedAt', 'price', 'make']).default('updatedAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const auditLogsQuerySchema = paginationQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  action: z.string().trim().min(1).optional(),
  entityName: z.string().trim().min(1).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});

export type VehiclesListQuery = z.infer<typeof vehiclesListQuerySchema>;
export type AuditLogsQuery = z.infer<typeof auditLogsQuerySchema>;
