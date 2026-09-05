import { Subscription } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { emailService } from '../../services/email/emailService.js';
import { writeBillingAuditLog } from './billing-audit.js';

export interface TrialLifecycleResult {
  expired: number;
  remindersSent: number;
}

function startOfUtcDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function addUtcDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function formatDatePtBr(date: Date): string {
  return date.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

function resolveOwnerEmail(subscription: Subscription & {
  workspace: {
    members: Array<{ role: string; user: { email: string; name: string } }>;
    dealerships: Array<{ email: string | null }>;
  };
}): { email: string; userName: string } | null {
  const owner = subscription.workspace.members.find((m) => m.role === 'OWNER');
  if (owner?.user.email) {
    return { email: owner.user.email, userName: owner.user.name };
  }

  const dealershipEmail = subscription.workspace.dealerships[0]?.email?.trim();
  if (dealershipEmail) {
    return { email: dealershipEmail, userName: dealershipEmail.split('@')[0] };
  }

  return null;
}

const subscriptionInclude = {
  workspace: {
    include: {
      members: {
        include: { user: true },
        where: { role: 'OWNER' as const },
        take: 1,
      },
      dealerships: {
        take: 1,
        orderBy: { createdAt: 'asc' as const },
      },
    },
  },
};

export class TrialLifecycleService {
  async expireTrials(now: Date = new Date()): Promise<number> {
    const expiredTrials = await prisma.subscription.findMany({
      where: {
        status: 'TRIALING',
        currentPeriodEnd: { lt: now },
      },
    });

    for (const subscription of expiredTrials) {
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { status: 'EXPIRED' },
      });

      await writeBillingAuditLog({
        workspaceId: subscription.workspaceId,
        action: 'TRIAL_EXPIRED',
        entityId: subscription.id,
        metadata: {
          previousStatus: 'TRIALING',
          currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
        },
      });
    }

    return expiredTrials.length;
  }

  async sendTrialReminders(now: Date = new Date()): Promise<number> {
    const reminderWindowStart = startOfUtcDay(addUtcDays(now, 3));
    const reminderWindowEnd = startOfUtcDay(addUtcDays(now, 4));

    const trialsDueForReminder = await prisma.subscription.findMany({
      where: {
        status: 'TRIALING',
        trialReminderSentAt: null,
        currentPeriodEnd: {
          gte: reminderWindowStart,
          lt: reminderWindowEnd,
        },
      },
      include: subscriptionInclude,
    });

    const frontendUrl = process.env.FRONTEND_URL || 'https://app.drivesync.me';
    let remindersSent = 0;

    for (const subscription of trialsDueForReminder) {
      const recipient = resolveOwnerEmail(subscription);
      if (!recipient) {
        continue;
      }

      await emailService.sendTrialEndingReminderEmail(recipient.email, {
        userName: recipient.userName,
        planName: `Plano ${subscription.planTier}`,
        trialEndDate: formatDatePtBr(subscription.currentPeriodEnd),
        upgradeUrl: `${frontendUrl}/settings/billing`,
      });

      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { trialReminderSentAt: now },
      });

      await writeBillingAuditLog({
        workspaceId: subscription.workspaceId,
        action: 'TRIAL_REMINDER_SENT',
        entityId: subscription.id,
        metadata: {
          recipientEmail: recipient.email,
          trialEndDate: subscription.currentPeriodEnd.toISOString(),
        },
      });

      remindersSent++;
    }

    return remindersSent;
  }

  async runTrialLifecycle(now: Date = new Date()): Promise<TrialLifecycleResult> {
    const expired = await this.expireTrials(now);
    const remindersSent = await this.sendTrialReminders(now);
    return { expired, remindersSent };
  }
}

export const trialLifecycleService = new TrialLifecycleService();
