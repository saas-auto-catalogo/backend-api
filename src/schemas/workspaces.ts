import { z } from 'zod';

export const workspaceParamsSchema = z.object({
  workspaceId: z.string().min(3)
});

export type WorkspaceParams = z.infer<typeof workspaceParamsSchema>;
