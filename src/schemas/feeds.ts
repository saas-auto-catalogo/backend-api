import { z } from 'zod';

export const feedParamsSchema = z.object({
  token: z.string().min(8, { message: 'Token inválido' })
});

export type FeedParams = z.infer<typeof feedParamsSchema>;
