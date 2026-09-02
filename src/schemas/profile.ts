import { z } from 'zod';

export const updateWorkspaceProfileSchema = z
  .object({
    tradeName: z.string().min(2, { message: 'Nome fantasia deve ter ao menos 2 caracteres' }).max(255).optional(),
    cnpj: z.string().min(11, { message: 'CNPJ invalido' }).max(20).optional(),
    phone: z.string().min(8, { message: 'Telefone invalido' }).max(30).optional(),
    city: z.string().min(2, { message: 'Cidade invalida' }).max(100).optional(),
    state: z.string().length(2, { message: 'Estado deve ter 2 caracteres (UF)' }).optional(),
    logoUrl: z.string().url({ message: 'URL do logo invalida' }).max(2000).nullable().optional(),
  })
  .refine(
    (data) =>
      data.tradeName !== undefined ||
      data.cnpj !== undefined ||
      data.phone !== undefined ||
      data.city !== undefined ||
      data.state !== undefined ||
      data.logoUrl !== undefined,
    { message: 'Informe ao menos um campo para atualizar' },
  );

export type UpdateWorkspaceProfileDTO = z.infer<typeof updateWorkspaceProfileSchema>;
