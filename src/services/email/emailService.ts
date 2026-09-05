import { Resend } from 'resend';
import { renderWelcomeEmail, WelcomeEmailData } from './templates/welcome.template.js';
import { renderPasswordResetEmail, PasswordResetEmailData } from './templates/password-reset.template.js';
import { renderPaymentApprovedEmail, PaymentApprovedEmailData } from './templates/payment-approved.template.js';
import { renderSyncFailureEmail, SyncFailureEmailData } from './templates/sync-failure.template.js';
import { renderSubscriptionCanceledEmail, SubscriptionCanceledEmailData } from './templates/subscription-canceled.template.js';
import { renderRenewalReminderEmail, RenewalReminderEmailData } from './templates/renewal-reminder.template.js';
import { renderTrialEndingReminderEmail, TrialEndingReminderEmailData } from './templates/trial-ending-reminder.template.js';

export interface EmailSendResult {
  success: boolean;
  messageId: string;
  recipient: string;
  subject: string;
  attemptCount: number;
  durationMs: number;
  error?: string;
}

export class EmailService {
  private resendClient: Resend | null = null;
  private fromEmail: string;
  private isSandbox: boolean;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;
    this.fromEmail = process.env.EMAIL_FROM || 'DriveSync <noreply@drivesync.me>';

    if (apiKey && apiKey.startsWith('re_') && !apiKey.includes('your_resend_api_key')) {
      this.resendClient = new Resend(apiKey);
      this.isSandbox = false;
    } else {
      this.resendClient = null;
      this.isSandbox = true;
    }
  }

  /**
   * Envia um email genérico com suporte a retry e fallback para sandbox/mock
   */
  public async send(
    to: string,
    subject: string,
    html: string,
    metadata?: Record<string, unknown>
  ): Promise<EmailSendResult> {
    const start = Date.now();
    let lastError: Error | null = null;
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        let messageId = `msg_mock_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

        if (this.resendClient && !this.isSandbox) {
          const response = await this.resendClient.emails.send({
            from: this.fromEmail,
            to,
            subject,
            html,
          });

          if (response.error) {
            throw new Error(`Resend API error: ${response.error.message}`);
          }

          if (response.data?.id) {
            messageId = response.data.id;
          }
        } else {
          // Modo Sandbox / Dev Simulator
          if (process.env.NODE_ENV !== 'test') {
            console.log(`📨 [Email Sandbox] Enviado para: ${to} | Assunto: ${subject} | ID: ${messageId}`);
          }
        }

        const durationMs = Date.now() - start;
        return {
          success: true,
          messageId,
          recipient: to,
          subject,
          attemptCount: attempt,
          durationMs,
        };
      } catch (err) {
        lastError = err as Error;
        if (attempt < maxRetries) {
          // Backoff exponencial com jitter (100ms, 200ms, etc.)
          const delay = Math.pow(2, attempt) * 50;
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    const durationMs = Date.now() - start;
    return {
      success: false,
      messageId: '',
      recipient: to,
      subject,
      attemptCount: maxRetries,
      durationMs,
      error: lastError?.message || 'Falha desconhecida ao enviar email',
    };
  }

  // ─── MÉTODOS ESPECIALIZADOS DE ALTO NÍVEL ──────────────────────────────────

  public async sendWelcomeEmail(to: string, data: WelcomeEmailData): Promise<EmailSendResult> {
    const { subject, html } = renderWelcomeEmail(data);
    return this.send(to, subject, html, { event: 'USER_WELCOME', userName: data.userName });
  }

  public async sendPasswordResetEmail(to: string, data: PasswordResetEmailData): Promise<EmailSendResult> {
    const { subject, html } = renderPasswordResetEmail(data);
    return this.send(to, subject, html, { event: 'PASSWORD_RESET', userName: data.userName });
  }

  public async sendPaymentApprovedEmail(to: string, data: PaymentApprovedEmailData): Promise<EmailSendResult> {
    const { subject, html } = renderPaymentApprovedEmail(data);
    return this.send(to, subject, html, { event: 'PAYMENT_APPROVED', plan: data.planName });
  }

  public async sendSyncFailureEmail(to: string, data: SyncFailureEmailData): Promise<EmailSendResult> {
    const { subject, html } = renderSyncFailureEmail(data);
    return this.send(to, subject, html, { event: 'SYNC_FAILURE', feedName: data.feedName });
  }

  public async sendSubscriptionCanceledEmail(to: string, data: SubscriptionCanceledEmailData): Promise<EmailSendResult> {
    const { subject, html } = renderSubscriptionCanceledEmail(data);
    return this.send(to, subject, html, { event: 'SUBSCRIPTION_CANCELED', plan: data.planName });
  }

  public async sendRenewalReminderEmail(to: string, data: RenewalReminderEmailData): Promise<EmailSendResult> {
    const { subject, html } = renderRenewalReminderEmail(data);
    return this.send(to, subject, html, { event: 'RENEWAL_REMINDER', plan: data.planName });
  }

  public async sendTrialEndingReminderEmail(
    to: string,
    data: TrialEndingReminderEmailData,
  ): Promise<EmailSendResult> {
    const { subject, html } = renderTrialEndingReminderEmail(data);
    return this.send(to, subject, html, { event: 'TRIAL_ENDING_REMINDER', plan: data.planName });
  }
}

export const emailService = new EmailService();
