import { z } from 'zod';
import { legalAcceptanceItemSchema } from './legal.js';

export const loginSchema = z.object({
  email: z.string().email({ message: 'Email invalido' }),
  password: z.string().min(8, { message: 'Password deve ter ao menos 8 caracteres' })
});

export const registerSchema = z.object({
  name: z.string().min(2, { message: 'Nome deve ter ao menos 2 caracteres' }).max(255),
  email: z.string().email({ message: 'Email invalido' }),
  password: z.string().min(8, { message: 'Password deve ter ao menos 8 caracteres' }),
  workspaceName: z.string().min(2, { message: 'Nome da revenda deve ter ao menos 2 caracteres' }).max(255),
  legalAcceptances: z.array(legalAcceptanceItemSchema).min(1, { message: 'legalAcceptances é obrigatório' }),
});

export const registerQuerySchema = z.object({
  plan: z.literal('trial').optional(),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(20).optional(),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email({ message: 'Email invalido' })
});

export const resetPasswordSchema = z.object({
  token: z.string().uuid({ message: 'Token de reset invalido' }),
  newPassword: z.string().min(8, { message: 'Nova senha deve ter ao menos 8 caracteres' })
});

export const logoutSchema = z.object({
  refreshToken: z.string().min(20).optional(),
});

export const updateOnboardingSchema = z
  .object({
    onboardingStep: z.number().int().min(1).max(4).optional(),
    onboardingCompleted: z.boolean().optional(),
  })
  .refine((data) => data.onboardingStep !== undefined || data.onboardingCompleted !== undefined, {
    message: 'Informe onboardingStep e/ou onboardingCompleted',
  });

export const updateMeSchema = z
  .object({
    name: z.string().min(2, { message: 'Nome deve ter ao menos 2 caracteres' }).max(255).optional(),
    avatarUrl: z.string().url({ message: 'URL de avatar invalida' }).max(1000).nullable().optional(),
  })
  .refine((data) => data.name !== undefined || data.avatarUrl !== undefined, {
    message: 'Informe name e/ou avatarUrl',
  });

export type LoginDTO = z.infer<typeof loginSchema>;
export type RegisterDTO = z.infer<typeof registerSchema>;
export type RegisterQueryDTO = z.infer<typeof registerQuerySchema>;
export type RefreshTokenDTO = z.infer<typeof refreshTokenSchema>;
export type ForgotPasswordDTO = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordDTO = z.infer<typeof resetPasswordSchema>;
export type LogoutDTO = z.infer<typeof logoutSchema>;
export type UpdateOnboardingDTO = z.infer<typeof updateOnboardingSchema>;
export type UpdateMeDTO = z.infer<typeof updateMeSchema>;
