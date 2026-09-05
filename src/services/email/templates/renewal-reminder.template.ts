import { renderBaseLayout } from './base.layout.js';

export interface RenewalReminderEmailData {
  userName: string;
  planName: string;
  amountFormatted: string;
  renewalDate: string;
  paymentMethodLast4?: string;
  billingPortalUrl: string;
}

export function renderRenewalReminderEmail(data: RenewalReminderEmailData): { subject: string; html: string } {
  const subject = `Lembrete de Renovação do Plano ${data.planName} em 3 dias 💳`;

  const content = `
    <h1 style="color: #ffffff; font-size: 22px; margin-top: 0; margin-bottom: 16px;">
      Lembrete de Renovação de Assinatura
    </h1>
    <p>Olá <strong>${data.userName}</strong>,</p>
    <p>Este é um lembrete amigável de que a sua assinatura do DriveSync será renovada automaticamente em <strong>${data.renewalDate}</strong>.</p>
    
    <div class="highlight-box">
      <table style="width: 100%; font-size: 14px; color: #cbd5e1;" cellpadding="4">
        <tr>
          <td><strong>Plano:</strong></td>
          <td align="right" style="color: #60a5fa; font-weight: bold;">${data.planName}</td>
        </tr>
        <tr>
          <td><strong>Valor da Renovação:</strong></td>
          <td align="right">${data.amountFormatted}</td>
        </tr>
        <tr>
          <td><strong>Data Prevista:</strong></td>
          <td align="right">${data.renewalDate}</td>
        </tr>
        ${data.paymentMethodLast4 ? `
        <tr>
          <td><strong>Cartão Final:</strong></td>
          <td align="right">•••• ${data.paymentMethodLast4}</td>
        </tr>` : ''}
      </table>
    </div>

    <p>Nenhuma ação é necessária se você deseja continuar utilizando o serviço normalmente. Caso precise atualizar os dados do cartão ou gerenciar sua assinatura, acesse o portal de faturamento:</p>

    <div style="text-align: center; margin: 32px 0;">
      <a href="${data.billingPortalUrl}" class="btn-primary">Gerenciar Faturamento e Cartão</a>
    </div>

    <p style="font-size: 13px; color: #94a3b8;">
      Agradecemos pela parceria! Estamos comprometidos em manter seu estoque sincronizado sem interrupções.
    </p>
  `;

  return {
    subject,
    html: renderBaseLayout({
      title: subject,
      preheader: `Sua assinatura ${data.planName} (${data.amountFormatted}) renova em ${data.renewalDate}.`,
      content,
    }),
  };
}
