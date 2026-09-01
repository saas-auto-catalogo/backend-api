import { renderBaseLayout } from './base.layout.js';

export interface SyncFailureEmailData {
  userName: string;
  feedName: string;
  sourceType: string;
  errorMessage: string;
  failedAt: string;
  diagnosticsUrl: string;
}

export function renderSyncFailureEmail(data: SyncFailureEmailData): { subject: string; html: string } {
  const subject = `⚠️ Falha na Sincronização de Feed — ${data.feedName}`;

  const content = `
    <h1 style="color: #f87171; font-size: 22px; margin-top: 0; margin-bottom: 16px;">
      Alerta de Sincronização de Estoque
    </h1>
    <p>Olá <strong>${data.userName}</strong>,</p>
    <p>Identificamos um erro ao tentar processar o seu feed de veículos na última rotina agendada.</p>
    
    <div class="danger-box">
      <p style="margin: 0 0 8px;"><strong>Fonte DMS / API:</strong> ${data.sourceType}</p>
      <p style="margin: 0 0 8px;"><strong>Feed Afetado:</strong> ${data.feedName}</p>
      <p style="margin: 0 0 8px;"><strong>Data e Hora:</strong> ${data.failedAt}</p>
      <p style="margin: 0;"><strong>Mensagem de Erro:</strong> <code style="background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 4px;">${data.errorMessage}</code></p>
    </div>

    <p>Os anúncios já publicados no Meta Ads continuam ativos com a última versão válida do catálogo, mas novos veículos ou alterações de preço não foram aplicados.</p>

    <div style="text-align: center; margin: 32px 0;">
      <a href="${data.diagnosticsUrl}" class="btn-primary" style="background-color: #dc2626;">Ver Diagnóstico e Forçar Sincronização</a>
    </div>

    <p style="font-size: 13px; color: #94a3b8;">
      Recomendamos verificar se a URL do feed XML está acessível ou se as credenciais da API do DMS expiraram.
    </p>
  `;

  return {
    subject,
    html: renderBaseLayout({
      title: subject,
      preheader: `Erro na sincronização do feed ${data.feedName}: ${data.errorMessage}`,
      content,
    }),
  };
}
