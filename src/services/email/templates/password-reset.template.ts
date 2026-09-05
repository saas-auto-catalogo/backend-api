import { renderBaseLayout } from './base.layout.js';

export interface PasswordResetEmailData {
  userName: string;
  resetUrl: string;
  expiresInMinutes?: number;
}

export function renderPasswordResetEmail(data: PasswordResetEmailData): { subject: string; html: string } {
  const expiresIn = data.expiresInMinutes || 60;
  const subject = 'Recuperação de Senha — DriveSync 🔑';

  const content = `
    <h1 style="color: #ffffff; font-size: 22px; margin-top: 0; margin-bottom: 16px;">
      Redefinição de Senha
    </h1>
    <p>Olá <strong>${data.userName}</strong>,</p>
    <p>Recebemos uma solicitação para redefinir a senha da sua conta no DriveSync.</p>
    
    <div class="highlight-box">
      <p style="margin: 0; font-size: 14px;">
        Clique no botão abaixo para escolher uma nova senha de acesso. Este link é válido por <strong>${expiresIn} minutos</strong>.
      </p>
    </div>

    <div style="text-align: center; margin: 32px 0;">
      <a href="${data.resetUrl}" class="btn-primary">Redefinir Minha Senha</a>
    </div>

    <p style="font-size: 13px; color: #94a3b8;">
      Se você não solicitou esta alteração, por favor ignore este email. Sua senha atual permanecerá segura e inalterada.
    </p>
  `;

  return {
    subject,
    html: renderBaseLayout({
      title: subject,
      preheader: `Link de redefinição de senha válido por ${expiresIn} minutos.`,
      content,
    }),
  };
}
