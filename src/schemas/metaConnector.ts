import { z } from 'zod';

export const getAuthUrlQuerySchema = z.object({
  workspaceId: z.string().min(3),
  redirectUri: z.string().url()
});

export const postCallbackBodySchema = z.object({
  code: z.string().min(3),
  state: z.string().min(8),
  redirectUri: z.string().url(),
  catalogName: z.string().optional()
});

export const postSelectCatalogBodySchema = z.object({
  workspaceId: z.string().uuid(),
  metaSessionToken: z.string().min(1),
  catalogId: z.string().min(1).optional(),
  catalogName: z.string().min(1).optional(),
  createNew: z.boolean().optional(),
  businessId: z.string().min(1).optional()
});

export const diagnosticsParamsSchema = z.object({
  workspaceId: z.string().min(3),
  catalogId: z.string().min(3)
});
