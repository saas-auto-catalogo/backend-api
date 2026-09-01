import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email({ message: 'Email invalido' }),
  password: z.string().min(8, { message: 'Password deve ter ao menos 8 caracteres' })
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(20)
});

export const forgotPasswordSchema = z.object({
  email: z.string().email({ message: 'Email invalido' })
});

export const resetPasswordSchema = z.object({
  token: z.string().uuid({ message: 'Token de reset invalido' }),
  newPassword: z.string().min(8, { message: 'Nova senha deve ter ao menos 8 caracteres' })
});

export const logoutSchema = z.object({
  refreshToken: z.string().min(20)
});

export type LoginDTO = z.infer<typeof loginSchema>;
export type RefreshTokenDTO = z.infer<typeof refreshTokenSchema>;
export type ForgotPasswordDTO = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordDTO = z.infer<typeof resetPasswordSchema>;
export type LogoutDTO = z.infer<typeof logoutSchema>;
