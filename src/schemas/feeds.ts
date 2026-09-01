import { z } from 'zod';

export const feedParamsSchema = z.object({
  token: z.string().min(8, { message: 'Token inválido' })
});

export const validateFeedUrlBodySchema = z.object({
  url: z.string().url().max(2000),
});

export type FeedParams = z.infer<typeof feedParamsSchema>;
export type ValidateFeedUrlBody = z.infer<typeof validateFeedUrlBodySchema>;
