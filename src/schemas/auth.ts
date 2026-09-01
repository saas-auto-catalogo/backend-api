import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email({ message: 'Email invalido' }),
  password: z.string().min(8, { message: 'Password deve ter ao menos 8 caracteres' })
});

export const registerSchema = z.object({
  name: z.string().min(2, { message: 'Nome deve ter ao menos 2 caracteres' }).max(255),
  email: z.string().email({ message: 'Email invalido' }),
  password: z.string().min(8, { message: 'Password deve ter ao menos 8 caracteres' }),
  workspaceName: z.string().min(2, { message: 'Nome da revenda deve ter ao menos 2 caracteres' }).max(255),
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

export type LoginDTO = z.infer<typeof loginSchema>;
export type RegisterDTO = z.infer<typeof registerSchema>;
export type RefreshTokenDTO = z.infer<typeof refreshTokenSchema>;
export type ForgotPasswordDTO = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordDTO = z.infer<typeof resetPasswordSchema>;
export type LogoutDTO = z.infer<typeof logoutSchema>;
