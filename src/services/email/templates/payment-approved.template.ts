import { renderBaseLayout } from './base.layout.js';

export interface PaymentApprovedEmailData {
  userName: string;
  planName: string;
  amountFormatted: string;
  paymentMethod: string; // 'Cartão de Crédito' | 'Pix'
  nextBillingDate?: string;
  dashboardUrl: string;
}

export function renderPaymentApprovedEmail(data: PaymentApprovedEmailData): { subject: string; html: string } {
  const subject = `Pagamento Confirmado — Plano ${data.planName} Ativado! ✅`;

  const content = `
    <h1 style="color: #ffffff; font-size: 22px; margin-top: 0; margin-bottom: 16px;">
      Pagamento Aprovado com Sucesso!
    </h1>
    <p>Olá <strong>${data.userName}</strong>,</p>
    <p>Confirmamos o recebimento do seu pagamento para a assinatura do SaaS Auto Catálogo.</p>
    
    <div class="highlight-box">
      <table style="width: 100%; font-size: 14px; color: #cbd5e1;" cellpadding="4">
        <tr>
          <td><strong>Plano Contratado:</strong></td>
          <td align="right" style="color: #60a5fa; font-weight: bold;">${data.planName}</td>
        </tr>
        <tr>
          <td><strong>Valor Pago:</strong></td>
          <td align="right">${data.amountFormatted}</td>
        </tr>
        <tr>
          <td><strong>Forma de Pagamento:</strong></td>
          <td align="right">${data.paymentMethod}</td>
        </tr>
        ${data.nextBillingDate ? `
        <tr>
          <td><strong>Próxima Renovação:</strong></td>
          <td align="right">${data.nextBillingDate}</td>
        </tr>` : ''}
      </table>
    </div>

    <div style="text-align: center; margin: 32px 0;">
      <a href="${data.dashboardUrl}" class="btn-primary">Acessar Catálogos e Estoque</a>
    </div>

    <p style="font-size: 13px; color: #94a3b8;">
      A nota fiscal correspondente e o recibo de pagamento já estão disponíveis na aba de Faturamento do seu painel.
    </p>
  `;

  return {
    subject,
    html: renderBaseLayout({
      title: subject,
      preheader: `Seu plano ${data.planName} está 100% ativo e pronto para uso.`,
      content,
    }),
  };
}
