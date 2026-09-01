import {
  emailService,
  renderWelcomeEmail,
  renderPasswordResetEmail,
  renderPaymentApprovedEmail,
  renderSyncFailureEmail,
  renderSubscriptionCanceledEmail,
  renderRenewalReminderEmail,
  renderBaseLayout,
} from '../services/email/index.js';

let totalTests = 0;
let passedTests = 0;
const failures: string[] = [];

function assert(condition: boolean, testName: string, detail?: string): void {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ ${testName}`);
  } else {
    failures.push(detail ? `${testName}: ${detail}` : testName);
    console.error(`  ❌ ${testName}${detail ? ` — ${detail}` : ''}`);
  }
}

function section(title: string): void {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`📧 ${title}`);
  console.log('─'.repeat(60));
}

async function runEmailTestSuite() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   📧 QA — Suíte de Testes de Emails Transacionais (Resend)   ║');
  console.log('║   SaaS Auto Catálogo Backend API                            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  const startTime = Date.now();

  try {
    // ─────────────────────────────────────────────────────────────────────────
    // 1. LAYOUT BASE HTML
    // ─────────────────────────────────────────────────────────────────────────
    section('1. Renderização do Layout Base HTML');

    const baseHtml = renderBaseLayout({
      title: 'Teste de Layout Base',
      preheader: 'Preheader de Teste',
      content: '<p>Conteúdo de teste</p>',
    });

    assert(baseHtml.includes('<!DOCTYPE html>'), 'Layout contém DOCTYPE html');
    assert(baseHtml.includes('SaaS Auto Catálogo'), 'Layout contém cabeçalho com marca do SaaS');
    assert(baseHtml.includes('Preheader de Teste'), 'Layout inclui preheader invisível');
    assert(baseHtml.includes('<p>Conteúdo de teste</p>'), 'Layout renderiza conteúdo filho');
    assert(baseHtml.includes('Todos os direitos reservados'), 'Layout contém footer com copyright');

    // ─────────────────────────────────────────────────────────────────────────
    // 2. TEMPLATE DE BOAS-VINDAS
    // ─────────────────────────────────────────────────────────────────────────
    section('2. Template: Boas-Vindas');

    const welcome = renderWelcomeEmail({
      userName: 'Carlos Silva',
      workspaceName: 'Auto Elite Motors',
      loginUrl: 'https://app.autocatalogo.com.br/login',
    });

    assert(welcome.subject.includes('Carlos Silva'), 'Assunto contém o nome do usuário');
    assert(welcome.html.includes('Auto Elite Motors'), 'HTML contém o nome da revenda/workspace');
    assert(welcome.html.includes('https://app.autocatalogo.com.br/login'), 'HTML contém link correto de login');
    assert(welcome.html.includes('Conecte seu Estoque'), 'HTML contém chamada de onboarding');

    // ─────────────────────────────────────────────────────────────────────────
    // 3. TEMPLATE DE RECUPERAÇÃO DE SENHA
    // ─────────────────────────────────────────────────────────────────────────
    section('3. Template: Recuperação de Senha');

    const reset = renderPasswordResetEmail({
      userName: 'Carlos Silva',
      resetUrl: 'https://app.autocatalogo.com.br/reset-password?token=sec_tok_991823',
      expiresInMinutes: 60,
    });

    assert(reset.subject.includes('Recuperação de Senha'), 'Assunto correto de recuperação de senha');
    assert(reset.html.includes('60 minutos'), 'HTML informa o prazo de expiração de 60min');
    assert(reset.html.includes('sec_tok_991823'), 'HTML contém token seguro no link de redefinição');

    // ─────────────────────────────────────────────────────────────────────────
    // 4. TEMPLATE DE PAGAMENTO APROVADO
    // ─────────────────────────────────────────────────────────────────────────
    section('4. Template: Pagamento Aprovado');

    const payment = renderPaymentApprovedEmail({
      userName: 'Carlos Silva',
      planName: 'Plano Pro (500 Veículos)',
      amountFormatted: 'R$ 297,00/mês',
      paymentMethod: 'Pix',
      nextBillingDate: '30/09/2026',
      dashboardUrl: 'https://app.autocatalogo.com.br/dashboard',
    });

    assert(payment.subject.includes('Pagamento Confirmado'), 'Assunto correto de pagamento');
    assert(payment.html.includes('Plano Pro (500 Veículos)'), 'HTML contém o nome do plano');
    assert(payment.html.includes('R$ 297,00/mês'), 'HTML contém o valor formatado');
    assert(payment.html.includes('Pix'), 'HTML contém a forma de pagamento');
    assert(payment.html.includes('30/09/2026'), 'HTML contém a próxima data de cobrança');

    // ─────────────────────────────────────────────────────────────────────────
    // 5. TEMPLATE DE ALERTA DE FALHA NO SYNC DE FEED
    // ─────────────────────────────────────────────────────────────────────────
    section('5. Template: Falha Crítica no Sync de Feed XML');

    const syncFail = renderSyncFailureEmail({
      userName: 'Carlos Silva',
      feedName: 'Estoque AutoCerto Matriz',
      sourceType: 'AUTOCERTO (XML SAX Stream)',
      errorMessage: 'HTTP 403 Forbidden: Token de integração do DMS revogado pelo servidor remoto',
      failedAt: '31/08/2026 às 23:10',
      diagnosticsUrl: 'https://app.autocatalogo.com.br/feeds/feed-123/diagnostics',
    });

    assert(syncFail.subject.includes('Falha na Sincronização'), 'Assunto com alerta de falha');
    assert(syncFail.html.includes('Estoque AutoCerto Matriz'), 'HTML identifica o feed com erro');
    assert(syncFail.html.includes('HTTP 403 Forbidden'), 'HTML exibe a mensagem de erro específica');
    assert(syncFail.html.includes('Forçar Sincronização'), 'HTML contém CTA para resolução de problemas');

    // ─────────────────────────────────────────────────────────────────────────
    // 6. TEMPLATE DE CANCELAMENTO DE ASSINATURA
    // ─────────────────────────────────────────────────────────────────────────
    section('6. Template: Cancelamento de Assinatura');

    const canceled = renderSubscriptionCanceledEmail({
      userName: 'Carlos Silva',
      planName: 'Plano Pro',
      accessUntilDate: '30/09/2026',
      reactivateUrl: 'https://app.autocatalogo.com.br/settings/billing',
    });

    assert(canceled.subject.includes('Assinatura Cancelada'), 'Assunto de cancelamento');
    assert(canceled.html.includes('30/09/2026'), 'HTML informa até quando o acesso permanece ativo');
    assert(canceled.html.includes('Reativar Assinatura'), 'HTML contém CTA de reativação');

    // ─────────────────────────────────────────────────────────────────────────
    // 7. TEMPLATE DE LEMBRETE DE RENOVAÇÃO
    // ─────────────────────────────────────────────────────────────────────────
    section('7. Template: Lembrete de Renovação (3 dias antes)');

    const renewal = renderRenewalReminderEmail({
      userName: 'Carlos Silva',
      planName: 'Plano Pro',
      amountFormatted: 'R$ 297,00',
      renewalDate: '03/09/2026',
      paymentMethodLast4: '4242',
      billingPortalUrl: 'https://billing.stripe.com/p/session_123',
    });

    assert(renewal.subject.includes('Lembrete de Renovação'), 'Assunto de lembrete de cobrança');
    assert(renewal.html.includes('03/09/2026'), 'HTML contém a data da próxima cobrança');
    assert(renewal.html.includes('•••• 4242'), 'HTML exibe os 4 últimos dígitos do cartão');
    assert(renewal.html.includes('https://billing.stripe.com/p/session_123'), 'HTML direciona para o Stripe Portal');

    // ─────────────────────────────────────────────────────────────────────────
    // 8. DISPAROS VIA EMAIL SERVICE (SANDBOX / MOCK ENGINE)
    // ─────────────────────────────────────────────────────────────────────────
    section('8. Envio de Emails via EmailService (Sandbox Engine)');

    const targetEmail = 'carlos.silva@autoelitemotors.com.br';

    // 8.1 Boas-Vindas
    const res1 = await emailService.sendWelcomeEmail(targetEmail, {
      userName: 'Carlos Silva',
      workspaceName: 'Auto Elite Motors',
      loginUrl: 'https://app.autocatalogo.com.br/login',
    });
    assert(res1.success, 'Disparo de email de boas-vindas com sucesso');
    assert(res1.recipient === targetEmail, `Destinatário correto: ${res1.recipient}`);
    assert(res1.messageId.length > 0, `Message ID retornado: ${res1.messageId}`);
    assert(res1.durationMs < 100, `Latência de envio sandbox < 100ms (${res1.durationMs}ms)`);

    // 8.2 Reset de Senha
    const res2 = await emailService.sendPasswordResetEmail(targetEmail, {
      userName: 'Carlos Silva',
      resetUrl: 'https://app.autocatalogo.com.br/reset-password?token=sec_123',
    });
    assert(res2.success, 'Disparo de email de reset de senha com sucesso');

    // 8.3 Pagamento Aprovado
    const res3 = await emailService.sendPaymentApprovedEmail(targetEmail, {
      userName: 'Carlos Silva',
      planName: 'Plano Pro',
      amountFormatted: 'R$ 297,00/mês',
      paymentMethod: 'Cartão de Crédito',
      dashboardUrl: 'https://app.autocatalogo.com.br/dashboard',
    });
    assert(res3.success, 'Disparo de email de pagamento aprovado com sucesso');

    // 8.4 Falha no Sync
    const res4 = await emailService.sendSyncFailureEmail(targetEmail, {
      userName: 'Carlos Silva',
      feedName: 'Estoque AutoCerto',
      sourceType: 'AUTOCERTO',
      errorMessage: 'Timeout após 15000ms',
      failedAt: '31/08/2026 23:15',
      diagnosticsUrl: 'https://app.autocatalogo.com.br/feeds/1/diagnostics',
    });
    assert(res4.success, 'Disparo de email de alerta de falha de sync com sucesso');

    // 8.5 Cancelamento
    const res5 = await emailService.sendSubscriptionCanceledEmail(targetEmail, {
      userName: 'Carlos Silva',
      planName: 'Plano Pro',
      accessUntilDate: '30/09/2026',
      reactivateUrl: 'https://app.autocatalogo.com.br/settings/billing',
    });
    assert(res5.success, 'Disparo de email de cancelamento de assinatura com sucesso');

    // 8.6 Lembrete de Renovação
    const res6 = await emailService.sendRenewalReminderEmail(targetEmail, {
      userName: 'Carlos Silva',
      planName: 'Plano Pro',
      amountFormatted: 'R$ 297,00',
      renewalDate: '03/09/2026',
      billingPortalUrl: 'https://billing.stripe.com',
    });
    assert(res6.success, 'Disparo de email de lembrete de renovação com sucesso');

    const elapsed = Date.now() - startTime;

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`📊 RESULTADO FINAL DOS TESTES DE EMAIL`);
    console.log('═'.repeat(60));
    console.log(`  Total de testes: ${totalTests}`);
    console.log(`  ✅ Passou:        ${passedTests}`);
    console.log(`  ❌ Falhou:        ${failures.length}`);
    console.log(`  ⏱️  Tempo total:   ${elapsed}ms`);

    if (failures.length > 0) {
      console.log('\n🔴 Falhas encontradas:');
      failures.forEach((f) => console.log(`  - ${f}`));
      process.exit(1);
    } else {
      console.log('\n🎉 Todos os testes de templates e serviço de emails passaram com 100% de sucesso!');
    }
  } catch (err) {
    console.error('Erro na execução dos testes de email:', err);
    process.exit(1);
  }
}

runEmailTestSuite().catch((err) => {
  console.error('\n💥 Erro crítico no teste de email:', err);
  process.exit(1);
});
