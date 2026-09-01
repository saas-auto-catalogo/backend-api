import { renderBaseLayout } from './base.layout.js';

export interface WelcomeEmailData {
  userName: string;
  workspaceName: string;
  loginUrl: string;
}

export function renderWelcomeEmail(data: WelcomeEmailData): { subject: string; html: string } {
  const subject = `Bem-vindo ao SaaS Auto Catálogo, ${data.userName}! 🎉`;

  const content = `
    <h1 style="color: #ffffff; font-size: 22px; margin-top: 0; margin-bottom: 16px;">
      Sua conta está pronta!
    </h1>
    <p>Olá <strong>${data.userName}</strong>,</p>
    <p>É um prazer tê-lo conosco! O seu espaço de trabalho para <strong>${data.workspaceName}</strong> foi criado com sucesso.</p>
    
    <div class="highlight-box">
      <strong style="color: #60a5fa;">🚀 Próximo Passo: Conecte seu Estoque</strong>
      <p style="margin: 8px 0 0; font-size: 14px;">
        Para começar a publicar seus veículos automaticamente no Meta Ads DAA (Facebook e Instagram), conecte seu feed XML ou DMS agora mesmo.
      </p>
    </div>

    <div style="text-align: center; margin: 32px 0;">
      <a href="${data.loginUrl}" class="btn-primary">Acessar Meu Painel</a>
    </div>

    <p style="font-size: 13px; color: #94a3b8;">
      Se tiver alguma dúvida, nossa equipe de suporte está sempre à disposição através do email <a href="mailto:suporte@autocatalogo.com.br" style="color: #60a5fa;">suporte@autocatalogo.com.br</a>.
    </p>
  `;

  return {
    subject,
    html: renderBaseLayout({
      title: subject,
      preheader: `Sua conta na ${data.workspaceName} está pronta para sincronizar estoque.`,
      content,
    }),
  };
}
