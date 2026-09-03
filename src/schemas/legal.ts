import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Deve ser YYYY-MM-DD');
const contentHash = z
  .string()
  .regex(/^sha256:[a-f0-9]{64}$/i, 'Deve ser sha256: seguido de 64 hex');

export const legalDocumentSlugParamsSchema = z.object({
  slug: z.string().min(1, { message: 'slug é obrigatório' }).max(100),
});

export const createLegalAcceptanceSchema = z.object({
  slug: z.string().min(1).max(100),
  version: isoDate,
  contentHash,
  acceptedAt: z
    .string()
    .refine((value) => !Number.isNaN(Date.parse(value)), {
      message: 'acceptedAt deve ser ISO-8601',
    })
    .refine((value) => Date.parse(value) <= Date.now(), {
      message: 'acceptedAt não pode ser futuro',
    }),
  workspaceId: z.string().uuid().optional(),
});

export type LegalDocumentSlugParams = z.infer<typeof legalDocumentSlugParamsSchema>;
export type CreateLegalAcceptanceDTO = z.infer<typeof createLegalAcceptanceSchema>;
