import { renderBaseLayout } from './base.layout.js';

export interface TrialEndingReminderEmailData {
  userName: string;
  planName: string;
  trialEndDate: string;
  upgradeUrl: string;
}

export function renderTrialEndingReminderEmail(
  data: TrialEndingReminderEmailData,
): { subject: string; html: string } {
  const subject = `Seu trial ${data.planName} termina em 3 dias`;

  const content = `
    <h1 style="color: #ffffff; font-size: 22px; margin-top: 0; margin-bottom: 16px;">
      Seu período de teste está chegando ao fim
    </h1>
    <p>Olá <strong>${data.userName}</strong>,</p>
    <p>Seu trial gratuito do <strong>${data.planName}</strong> termina em <strong>${data.trialEndDate}</strong> (faltam 3 dias).</p>

    <div class="highlight-box">
      <p style="margin: 0; font-size: 14px; color: #cbd5e1;">
        Para continuar usando todos os recursos Pro sem interrupção, assine um plano antes do fim do trial.
      </p>
    </div>

    <div style="text-align: center; margin: 32px 0;">
      <a href="${data.upgradeUrl}" class="btn-primary">Escolher Plano e Assinar</a>
    </div>

    <p style="font-size: 13px; color: #94a3b8;">
      Após o término do trial, o acesso aos recursos pagos será bloqueado até a assinatura de um plano.
    </p>
  `;

  return {
    subject,
    html: renderBaseLayout({
      title: subject,
      preheader: `Seu trial ${data.planName} termina em ${data.trialEndDate}. Assine para continuar.`,
      content,
    }),
  };
}
