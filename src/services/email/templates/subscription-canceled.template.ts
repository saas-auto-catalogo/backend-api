import { renderBaseLayout } from './base.layout.js';

export interface SubscriptionCanceledEmailData {
  userName: string;
  planName: string;
  accessUntilDate: string;
  reactivateUrl: string;
}

export function renderSubscriptionCanceledEmail(data: SubscriptionCanceledEmailData): { subject: string; html: string } {
  const subject = `Assinatura Cancelada — Confirmação e Prazo de Acesso`;

  const content = `
    <h1 style="color: #ffffff; font-size: 22px; margin-top: 0; margin-bottom: 16px;">
      Cancelamento Confirmado
    </h1>
    <p>Olá <strong>${data.userName}</strong>,</p>
    <p>Confirmamos a solicitação de cancelamento da sua assinatura do plano <strong>${data.planName}</strong>.</p>
    
    <div class="highlight-box">
      <p style="margin: 0; font-size: 14px;">
        Seus catálogos e sincronizações automáticas permanecerão ativos até <strong>${data.accessUntilDate}</strong>. Após essa data, a sincronização será suspensa.
      </p>
    </div>

    <p>Lamentamos vê-lo partir. Se você mudou de ideia ou deseja reativar o seu plano antes do término do período, basta clicar no botão abaixo:</p>

    <div style="text-align: center; margin: 32px 0;">
      <a href="${data.reactivateUrl}" class="btn-primary">Reativar Assinatura</a>
    </div>

    <p style="font-size: 13px; color: #94a3b8;">
      Todos os seus dados e configurações de mapeamento de feed serão mantidos com segurança caso decida retornar no futuro.
    </p>
  `;

  return {
    subject,
    html: renderBaseLayout({
      title: subject,
      preheader: `Seu acesso permanece liberado até ${data.accessUntilDate}.`,
      content,
    }),
  };
}
