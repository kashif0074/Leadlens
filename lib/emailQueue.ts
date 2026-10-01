import { db } from "@/lib/db";
import { sendGmailMessage } from "@/lib/gmailApi";
import { personalizeEmailBody, personalizeText } from "@/lib/campaigns";
import { createUnsubscribeUrl } from "@/lib/unsubscribe";
import type { Lead, Campaign } from "@/types";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAILS_PER_SENDER_PER_24_HOURS = 50;
const MIN_SEND_DELAY_MS = 2000;
const MAX_SEND_DELAY_MS = 3500;
export const MAX_DELIVERY_ATTEMPTS = 5;
const MAX_RETRY_DELAY_MS = 30 * 60 * 1000;
const STALE_SENDING_MS = 5 * 60 * 1000;
const SENDER_LEASE_MS = 2 * 60 * 1000;

export function isRetryableEmailError(error: unknown): boolean {
  const value = error as {
    code?: unknown;
    status?: unknown;
    responseCode?: unknown;
    response?: { status?: unknown; statusCode?: unknown };
    message?: unknown;
  } | null;
  const status = Number(value?.status ?? value?.response?.status ?? value?.response?.statusCode ?? value?.responseCode);
  const message = typeof value?.message === "string" ? value.message : String(error ?? "");
  const code = String(value?.code ?? "");

  if ([408, 425, 429, 500, 502, 503, 504].includes(status)) return true;
  if (/^4\d\d$/.test(String(status)) && ![401, 403, 404, 410, 422].includes(status)) return true;
  return /\b(?:408|425|429|500|502|503|504)\b|ETIMEDOUT|ESOCKETTIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|ENOTFOUND|rate.?limit|quotaExceeded|backendError|temporarily unavailable|try again/i.test(`${code} ${message}`);
}

export function getEmailRetryAt(attempt: number, now = Date.now()): Date {
  const exponentialDelay = Math.min(MAX_RETRY_DELAY_MS, 30_000 * 2 ** Math.max(0, attempt - 1));
  const jitter = Math.floor(Math.random() * Math.min(15_000, exponentialDelay * 0.2));
  return new Date(now + exponentialDelay + jitter);
}

export function getControlledSendDelay(): number {
  return MIN_SEND_DELAY_MS + Math.floor(Math.random() * (MAX_SEND_DELAY_MS - MIN_SEND_DELAY_MS));
}

export async function acquireSenderSendLease(emailAccountId: string, userId: string): Promise<Date | null> {
  const now = new Date();
  const leaseUntil = new Date(now.getTime() + SENDER_LEASE_MS);
  const result = await db.emailAccount.updateMany({
    where: {
      id: emailAccountId,
      userId,
      status: "connected",
      OR: [{ sendLockUntil: null }, { sendLockUntil: { lt: now } }],
    },
    data: { sendLockUntil: leaseUntil },
  });
  return result.count === 1 ? leaseUntil : null;
}

export async function releaseSenderSendLease(emailAccountId: string, userId: string, leaseUntil: Date): Promise<void> {
  await db.emailAccount.updateMany({
    where: { id: emailAccountId, userId, sendLockUntil: leaseUntil },
    data: { sendLockUntil: null },
  });
}

export interface QueueProcessOutcome {
  leadId: string;
  recipient: string;
  status: "Sent" | "Failed" | "Pending";
  messageId?: string;
  error?: string;
  alreadySent?: boolean;
}

export interface QueueProcessResult {
  campaignId: string;
  status: "Live" | "Partially sent" | "Failed" | "Ready" | "Draft saved";
  sentCount: number;
  failedCount: number;
  pendingCount: number;
  total: number;
  outcomes: QueueProcessOutcome[];
}

/**
 * Enqueues or prepares deliveries for a campaign and processes them sequentially with safe throttling.
 * Persistent in DB: pending items survive restarts and can be picked up by the background scheduler.
 */
export async function processCampaignEmailQueue({
  campaignId,
  userId,
  leadsToProcess,
  emailAccountId,
  maxBatchSize = 1,
}: {
  campaignId: string;
  userId: string;
  leadsToProcess: Lead[];
  emailAccountId: string;
  maxBatchSize?: number;
}): Promise<QueueProcessResult> {
  const campaign = await db.campaign.findFirst({
    where: { id: campaignId, userId },
  });

  if (!campaign) {
    throw new Error("Campaign not found or access denied.");
  }

  const emailAccount = await db.emailAccount.findFirst({
    where: { id: emailAccountId, userId, status: "connected" },
  });

  if (!emailAccount) {
    throw new Error("Connected Gmail account not found or authorization required.");
  }

  // 1. Check rolling 24-hour send volume
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const sentInLast24Hours = await db.emailDelivery.count({
    where: {
      status: "Sent",
      sentAt: { gte: since },
      OR: [
        { senderEmail: emailAccount.email },
        {
          senderEmail: null,
          campaign: { is: { userId, connectedEmail: emailAccount.email } },
        },
      ],
    },
  });

  const availableQuota = Math.max(0, MAX_EMAILS_PER_SENDER_PER_24_HOURS - sentInLast24Hours);

  // 2. Prepare templates & personalized maps
  const personalizedMap = campaign.personalizedEmails as Record<
    string,
    { step: number; subject: string; body: string }[]
  > | null;

  const baseSequence = (
    Array.isArray(campaign.emails) ? campaign.emails : []
  ) as Campaign["sequence"];

  const step1Base = baseSequence.find((s) => s.step === 1) || baseSequence[0];

  const outcomes: QueueProcessOutcome[] = [];
  let sentCount = 0;
  let failedCount = 0;
  let pendingCount = 0;
  let processedThisRun = 0;

  // 3. Persist and process each lead delivery individually
  for (const lead of leadsToProcess) {
    const recipient = lead.email?.trim() || "";

    // Validate email syntax
    if (!recipient || !emailRegex.test(recipient)) {
      const errorMsg = `Invalid or missing recipient email address: "${recipient || "empty"}".`;
      await db.emailDelivery.upsert({
        where: {
          campaignId_leadId_step: { campaignId, leadId: lead.id, step: 1 },
        },
        create: {
          campaignId,
          leadId: lead.id,
          step: 1,
          recipient: recipient || "unknown",
          subject: "Invalid recipient",
          body: "Invalid recipient",
          status: "Failed",
          error: errorMsg,
        },
        update: { status: "Failed", error: errorMsg },
      });

      outcomes.push({ leadId: lead.id, recipient: recipient || "unknown", status: "Failed", error: errorMsg });
      failedCount++;
      continue;
    }

    // Personalize content
    const personalizedStep1 = personalizedMap?.[lead.id]?.find((item) => item.step === 1);
    const subjectTemplate =
      personalizedStep1?.subject || step1Base?.subject || "Partnership opportunity with {{company}}";
    const bodyTemplate =
      personalizedStep1?.body ||
      step1Base?.body ||
      `Hi {{first_name}},\n\nI'm reaching out regarding your initiatives at {{company}}. Would a brief conversation be helpful?\n\nBest regards,`;

    const subject = personalizeText(subjectTemplate, lead);
    const bodyText = personalizeEmailBody(bodyTemplate, lead);
    const unsubscribeUrl = createUnsubscribeUrl(userId, recipient);
    const recordedBody = `${bodyText}\n\nTo stop receiving these emails, unsubscribe: ${unsubscribeUrl}`;

    // Check existing delivery record
    const priorDelivery = await db.emailDelivery.findUnique({
      where: {
        campaignId_leadId_step: { campaignId, leadId: lead.id, step: 1 },
      },
    });

    if (priorDelivery?.status === "Sent") {
      outcomes.push({
        leadId: lead.id,
        recipient,
        status: "Sent",
        messageId: priorDelivery.messageId ?? undefined,
        alreadySent: true,
      });
      sentCount++;
      continue;
    }

    // Upsert into persistent Queue
    const deliveryRecord = await db.emailDelivery.upsert({
      where: {
        campaignId_leadId_step: { campaignId, leadId: lead.id, step: 1 },
      },
      create: {
        campaignId,
        leadId: lead.id,
        step: 1,
        recipient,
        senderEmail: emailAccount.email,
        subject,
        body: recordedBody,
        status: "Pending",
      },
      update: {
        recipient,
        senderEmail: emailAccount.email,
        subject,
        body: recordedBody,
      },
    });

    // If quota exceeded or reached max batch limit for this synchronous invocation, keep pending
    if (processedThisRun >= availableQuota || processedThisRun >= maxBatchSize) {
      outcomes.push({ leadId: lead.id, recipient, status: "Pending" });
      pendingCount++;
      continue;
    }

    // Atomic claim from Pending/Failed to Sending
    const claim = await db.emailDelivery.updateMany({
      where: {
        id: deliveryRecord.id,
        status: { in: ["Pending", "Failed"] },
        attemptCount: { lt: MAX_DELIVERY_ATTEMPTS },
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }],
      },
      data: {
        status: "Sending",
        attemptCount: { increment: 1 },
        nextAttemptAt: null,
        error: null,
      },
    });

    if (claim.count !== 1) {
      const current = await db.emailDelivery.findUnique({
        where: { id: deliveryRecord.id },
        select: { status: true, messageId: true },
      });
      const wasSent = current?.status === "Sent";
      outcomes.push({
        leadId: lead.id,
        recipient,
        status: wasSent ? "Sent" : "Pending",
        messageId: current?.messageId ?? undefined,
        alreadySent: wasSent,
      });
      if (wasSent) sentCount++;
      else if (current?.status === "Failed") failedCount++;
      else pendingCount++;
      continue;
    }

    const attempt = deliveryRecord.attemptCount + 1;

    // Controlled throttle delay between consecutive sends to avoid sudden burst
    if (processedThisRun > 0) {
      await new Promise((resolve) => setTimeout(resolve, getControlledSendDelay()));
    }

    processedThisRun++;

    try {
      const sendResult = await sendGmailMessage({
        emailAccountId: emailAccount.id,
        userId,
        to: recipient,
        subject,
        body: bodyText,
        unsubscribeUrl,
        deliveryId: deliveryRecord.id,
      });

      await db.emailDelivery.update({
        where: { id: deliveryRecord.id },
        data: {
          status: "Sent",
          messageId: sendResult.messageId,
          gmailThreadId: sendResult.threadId,
          sentAt: new Date(),
          nextAttemptAt: null,
          error: null,
        },
      });

      outcomes.push({
        leadId: lead.id,
        recipient,
        status: "Sent",
        messageId: sendResult.messageId,
      });

      sentCount++;
    } catch (sendError) {
      const errorMessage =
        sendError instanceof Error ? sendError.message : "Gmail API send failed.";
      const shouldRetry = isRetryableEmailError(sendError) && attempt < MAX_DELIVERY_ATTEMPTS;
      const retryAt = shouldRetry ? getEmailRetryAt(attempt) : null;

      console.error(`[QueueWorker] Failed to send email to ${recipient}:`, errorMessage);

      await db.emailDelivery.update({
        where: { id: deliveryRecord.id },
        data: {
          status: shouldRetry ? "Pending" : "Failed",
          nextAttemptAt: retryAt,
          error: errorMessage.slice(0, 4000),
        },
      });

      outcomes.push({
        leadId: lead.id,
        recipient,
        status: shouldRetry ? "Pending" : "Failed",
        error: errorMessage,
      });

      if (shouldRetry) pendingCount++;
      else failedCount++;
    }
  }

  // 4. Update campaign status & metrics
  const total = leadsToProcess.length;
  const campaignStatus: Campaign["status"] = pendingCount
    ? "Live"
    : sentCount === total && total > 0
    ? "Live"
    : sentCount > 0
    ? "Partially sent"
    : failedCount > 0
    ? "Failed"
    : "Ready";

  await db.campaign.update({
    where: { id: campaign.id },
    data: {
      status: campaignStatus,
      sentCount: { set: sentCount },
      failedCount: { set: failedCount },
    },
  });

  return {
    campaignId,
    status: campaignStatus,
    sentCount,
    failedCount,
    pendingCount,
    total,
    outcomes,
  };
}

/**
 * Background Queue Processor: Processes any stranded or pending email deliveries across all active campaigns.
 * Called regularly by the scheduler or on-demand.
 */
export async function refreshCampaignDeliveryState(campaignId: string) {
  const [sentCount, failedCount, sentStepOne, failedStepOne, pendingStepOne] = await Promise.all([
    db.emailDelivery.count({ where: { campaignId, status: "Sent" } }),
    db.emailDelivery.count({ where: { campaignId, status: "Failed" } }),
    db.emailDelivery.count({ where: { campaignId, step: 1, status: "Sent" } }),
    db.emailDelivery.count({ where: { campaignId, step: 1, status: "Failed" } }),
    db.emailDelivery.count({ where: { campaignId, step: 1, status: { in: ["Pending", "Sending"] } } }),
  ]);

  const status: Campaign["status"] = pendingStepOne > 0
    ? "Live"
    : sentStepOne > 0 && failedStepOne > 0
      ? "Partially sent"
      : sentStepOne > 0
        ? "Live"
        : failedStepOne > 0
          ? "Failed"
          : "Ready";

  await db.campaign.update({
    where: { id: campaignId },
    data: { status, sentCount, failedCount },
  });
}

export async function processAllPendingQueueItems(maxBatchSize = 5): Promise<{
  processed: number;
  sent: number;
  failed: number;
  pending: number;
}> {
  const summary = { processed: 0, sent: 0, failed: 0, pending: 0 };
  const now = new Date();
  const staleBefore = new Date(now.getTime() - STALE_SENDING_MS);

  try {
    await db.emailDelivery.updateMany({
      where: { status: "Sending", attemptCount: { lt: MAX_DELIVERY_ATTEMPTS }, updatedAt: { lt: staleBefore } },
      data: { status: "Pending", nextAttemptAt: now, error: "Recovered after an interrupted send attempt." },
    });
    await db.emailDelivery.updateMany({
      where: { status: "Sending", attemptCount: { gte: MAX_DELIVERY_ATTEMPTS }, updatedAt: { lt: staleBefore } },
      data: { status: "Failed", nextAttemptAt: null, error: "Maximum delivery attempts reached after an interrupted send." },
    });
    await db.emailDelivery.updateMany({
      where: { status: "Pending", attemptCount: { gte: MAX_DELIVERY_ATTEMPTS } },
      data: { status: "Failed", nextAttemptAt: null, error: "Maximum delivery attempts reached." },
    });

    const pendingDeliveries = await db.emailDelivery.findMany({
      where: {
        status: "Pending",
        attemptCount: { lt: MAX_DELIVERY_ATTEMPTS },
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
      },
      include: {
        campaign: {
          include: {
            emailAccount: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
      take: Math.max(1, maxBatchSize),
    });

    if (!pendingDeliveries.length) return summary;

    for (const delivery of pendingDeliveries) {
      const campaign = delivery.campaign;
      if (!campaign || !campaign.userId) {
        await db.emailDelivery.update({
          where: { id: delivery.id },
          data: { status: "Failed", nextAttemptAt: null, error: "Campaign owner is unavailable." },
        });
        summary.failed++;
        continue;
      }

      const emailAccount =
        campaign.emailAccount ||
        (campaign.connectedEmail
          ? await db.emailAccount.findFirst({
              where: { userId: campaign.userId, email: campaign.connectedEmail, status: "connected" },
            })
          : null);

      if (!emailAccount || emailAccount.status !== "connected") {
        const error = "Reconnect required. Connect Gmail again before sending this campaign.";
        await db.emailDelivery.update({
          where: { id: delivery.id },
          data: { status: "Failed", nextAttemptAt: null, error },
        });
        summary.failed++;
        await refreshCampaignDeliveryState(campaign.id);
        continue;
      }

      const leaseUntil = await acquireSenderSendLease(emailAccount.id, campaign.userId);
      if (!leaseUntil) {
        summary.pending++;
        continue;
      }

      try {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const sentInLast24Hours = await db.emailDelivery.count({
          where: { status: "Sent", senderEmail: emailAccount.email, sentAt: { gte: since } },
        });

        if (sentInLast24Hours >= MAX_EMAILS_PER_SENDER_PER_24_HOURS) {
          const oldestRecentDelivery = await db.emailDelivery.findFirst({
            where: { status: "Sent", senderEmail: emailAccount.email, sentAt: { gte: since } },
            orderBy: { sentAt: "asc" },
            select: { sentAt: true },
          });
          const resumesAt = oldestRecentDelivery?.sentAt
            ? new Date(oldestRecentDelivery.sentAt.getTime() + 24 * 60 * 60 * 1000)
            : new Date(Date.now() + 60 * 60 * 1000);
          await db.emailDelivery.update({
            where: { id: delivery.id },
            data: { nextAttemptAt: resumesAt, error: "Sender rolling 24-hour limit reached; delivery is deferred." },
          });
          summary.pending++;
          continue;
        }

        const claim = await db.emailDelivery.updateMany({
          where: {
            id: delivery.id,
            status: "Pending",
            attemptCount: { lt: MAX_DELIVERY_ATTEMPTS },
            OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }],
          },
          data: { status: "Sending", attemptCount: { increment: 1 }, nextAttemptAt: null, error: null },
        });

        if (claim.count !== 1) continue;

        summary.processed++;

        const suppression = await db.emailSuppression.findFirst({
          where: { userId: campaign.userId, email: delivery.recipient.toLowerCase() },
          select: { id: true },
        });
        if (suppression) {
          await db.emailDelivery.update({
            where: { id: delivery.id },
            data: { status: "Failed", nextAttemptAt: null, error: "Recipient has unsubscribed and is suppressed." },
          });
          summary.failed++;
          await refreshCampaignDeliveryState(campaign.id);
          continue;
        }

        let previousDelivery: { messageId: string | null; gmailThreadId: string | null } | null = null;
        if (delivery.step > 1) {
          previousDelivery = await db.emailDelivery.findUnique({
            where: { campaignId_leadId_step: { campaignId: delivery.campaignId, leadId: delivery.leadId, step: delivery.step - 1 } },
            select: { messageId: true, gmailThreadId: true },
          });
          if (!previousDelivery?.messageId) {
            await db.emailDelivery.update({
              where: { id: delivery.id },
              data: { status: "Failed", nextAttemptAt: null, error: "Previous sequence email was not sent; refusing to send an unthreaded follow-up." },
            });
            summary.failed++;
            await refreshCampaignDeliveryState(campaign.id);
            continue;
          }
        }

        await new Promise((resolve) => setTimeout(resolve, getControlledSendDelay()));
        const unsubscribeUrl = createUnsubscribeUrl(campaign.userId, delivery.recipient);
        const sendResult = await sendGmailMessage({
          emailAccountId: emailAccount.id,
          userId: campaign.userId,
          to: delivery.recipient,
          subject: delivery.subject,
          body: delivery.body.replace(/\n\nTo stop receiving these emails, unsubscribe:.*/, ""),
          unsubscribeUrl,
          deliveryId: delivery.id,
          threadId: previousDelivery?.gmailThreadId ?? undefined,
          inReplyTo: previousDelivery?.messageId ?? undefined,
        });

        await db.emailDelivery.update({
          where: { id: delivery.id },
          data: {
            status: "Sent",
            messageId: sendResult.messageId,
            gmailThreadId: sendResult.threadId,
            sentAt: new Date(),
            nextAttemptAt: null,
            error: null,
          },
        });

        summary.sent++;
        await refreshCampaignDeliveryState(campaign.id);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Background send failed.";
        const shouldRetry = isRetryableEmailError(error) && delivery.attemptCount + 1 < MAX_DELIVERY_ATTEMPTS;
        await db.emailDelivery.update({
          where: { id: delivery.id },
          data: {
            status: shouldRetry ? "Pending" : "Failed",
            nextAttemptAt: shouldRetry ? getEmailRetryAt(delivery.attemptCount + 1) : null,
            error: message.slice(0, 4000),
          },
        });
        if (shouldRetry) summary.pending++;
        else summary.failed++;
        await refreshCampaignDeliveryState(campaign.id);
      } finally {
        await releaseSenderSendLease(emailAccount.id, campaign.userId, leaseUntil);
      }
    }
  } catch (err) {
    console.error("[EmailQueue] Error processing background pending queue:", err);
  }

  return summary;
}
