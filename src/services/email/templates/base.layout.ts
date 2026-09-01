export interface BaseEmailLayoutOptions {
  title: string;
  preheader?: string;
  content: string;
  footerText?: string;
}

/**
 * Layout HTML Responsivo Base para Emails Transacionais do SaaS Auto Catálogo
 * Estilo moderno, dark mode clean e compatível com os principais clientes de email.
 */
export function renderBaseLayout(options: BaseEmailLayoutOptions): string {
  const {
    title,
    preheader = 'SaaS Auto Catálogo — Plataforma de Gestão e Anúncios de Veículos',
    content,
    footerText = 'Você recebeu este email porque possui uma conta ativa no SaaS Auto Catálogo.',
  } = options;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${title}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #0b0f19;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #e2e8f0;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      width: 100%;
      table-layout: fixed;
      background-color: #0b0f19;
      padding-bottom: 40px;
    }
    .main {
      background-color: #111827;
      margin: 0 auto;
      width: 100%;
      max-width: 600px;
      border-spacing: 0;
      border-radius: 12px;
      border: 1px solid #1f2937;
      overflow: hidden;
    }
    .header {
      padding: 32px 40px 24px;
      text-align: center;
      background: linear-gradient(180deg, #1e293b 0%, #111827 100%);
      border-bottom: 1px solid #1f2937;
    }
    .logo-badge {
      display: inline-block;
      padding: 8px 16px;
      background: rgba(59, 130, 246, 0.1);
      border: 1px solid rgba(59, 130, 246, 0.3);
      border-radius: 20px;
      color: #60a5fa;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    .content {
      padding: 36px 40px;
      font-size: 15px;
      line-height: 1.6;
      color: #cbd5e1;
    }
    .btn-primary {
      display: inline-block;
      padding: 14px 28px;
      background-color: #2563eb;
      color: #ffffff !important;
      text-decoration: none;
      font-weight: 600;
      font-size: 15px;
      border-radius: 8px;
      margin-top: 24px;
      margin-bottom: 16px;
      text-align: center;
    }
    .footer {
      padding: 24px 40px;
      text-align: center;
      font-size: 12px;
      color: #64748b;
      border-top: 1px solid #1e293b;
    }
    .footer a {
      color: #94a3b8;
      text-decoration: underline;
    }
    .highlight-box {
      background-color: #1e293b;
      border-left: 4px solid #3b82f6;
      padding: 16px;
      border-radius: 0 8px 8px 0;
      margin: 20px 0;
    }
    .danger-box {
      background-color: #2a1215;
      border-left: 4px solid #ef4444;
      padding: 16px;
      border-radius: 0 8px 8px 0;
      margin: 20px 0;
      color: #fca5a5;
    }
  </style>
</head>
<body>
  <!-- Preheader invisível para clientes de email -->
  <div style="display: none; font-size: 1px; color: #0b0f19; line-height: 1px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden;">
    ${preheader}
  </div>

  <table class="wrapper" width="100%" cellpadding="0" cellspacing="0" role="presentation">
    <tr>
      <td align="center" style="padding-top: 40px;">
        <table class="main" width="100%" cellpadding="0" cellspacing="0" role="presentation">
          <!-- Cabeçalho / Logo -->
          <tr>
            <td class="header">
              <span class="logo-badge">🚗 SaaS Auto Catálogo</span>
            </td>
          </tr>

          <!-- Corpo do Email -->
          <tr>
            <td class="content">
              ${content}
            </td>
          </tr>

          <!-- Rodapé -->
          <tr>
            <td class="footer">
              <p style="margin: 0 0 8px;">${footerText}</p>
              <p style="margin: 0;">© ${new Date().getFullYear()} SaaS Auto Catálogo Ltda. Todos os direitos reservados.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
