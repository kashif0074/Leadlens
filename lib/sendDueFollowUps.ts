import { db } from "@/lib/db";
import { sendGmailMessage } from "@/lib/gmailApi";
import { personalizeEmailBody, personalizeText } from "@/lib/campaigns";
import { createUnsubscribeUrl } from "@/lib/unsubscribe";
import { acquireSenderSendLease, getControlledSendDelay, getEmailRetryAt, isRetryableEmailError, MAX_DELIVERY_ATTEMPTS, refreshCampaignDeliveryState, releaseSenderSendLease } from "@/lib/emailQueue";
import type { Lead } from "@/types";

const MAX_EMAILS_PER_SENDER_PER_24_HOURS = 50;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type FollowUpStep = {
  step: number;
  delayDays?: number;
  intervalDays?: number;
  scheduledAt?: string | null;
  scheduledTime?: string;
  scheduleMode?: "default" | "custom";
  customSendAt?: string;
  subject: string;
  body: string;
  manuallyEdited?: boolean;
};

/**
 * Resolves the target send date for a follow-up step.
 * - If custom schedule is specified via customSendAt or scheduledAt, returns that exact parsed Date.
 * - Otherwise, calculates relative to previousSendAt.
 */
export function resolveNextSendAt(
  followUpStep: FollowUpStep,
  previousSendAt: Date | string = new Date(),
  stepIndex: number = 1,
  allSteps?: FollowUpStep[],
): Date {
  // If explicitly custom scheduled
  if (followUpStep.scheduleMode === "custom" && followUpStep.customSendAt) {
    const customDate = new Date(followUpStep.customSendAt);
    if (!isNaN(customDate.getTime())) {
      return customDate;
    }
  }

  if (followUpStep.scheduledAt) {
    const scheduled = new Date(followUpStep.scheduledAt);
    if (!isNaN(scheduled.getTime())) {
      return scheduled;
    }
  }

  // If follow-up 2 and previousSendAt is not set, attempt relative calculation from allSteps follow-up 1
  if (stepIndex === 2 && allSteps && allSteps[1]?.customSendAt && !previousSendAt) {
    const fu1Custom = new Date(allSteps[1].customSendAt);
    if (!isNaN(fu1Custom.getTime())) {
      const intervalDays = followUpStep.intervalDays ?? 3;
      return new Date(fu1Custom.getTime() + intervalDays * 24 * 60 * 60 * 1000);
    }
  }

  // Default calculation
  const baseDate = typeof previousSendAt === "string" ? new Date(previousSendAt) : previousSendAt;
  const baseTime = isNaN(baseDate.getTime()) ? Date.now() : baseDate.getTime();

  if (stepIndex === 1) {
    // Follow-up 1 default: 7 days (1 week) after initial email
    const days = followUpStep.intervalDays ?? followUpStep.delayDays ?? 7;
    return new Date(baseTime + days * 24 * 60 * 60 * 1000);
  } else {
    // Follow-up 2 default: 3 days after Follow-up 1
    const intervalDays = followUpStep.intervalDays ?? 3;
    return new Date(baseTime + intervalDays * 24 * 60 * 60 * 1000);
  }
}

/**
 * Main worker function to check and send due follow-ups across all active campaigns.
 */
export async function sendDueFollowUps(targetCampaignId?: string) {
  const now = new Date();
  const summary = {
    processedCampaigns: 0,
    sentFollowUps: 0,
    failedFollowUps: 0,
    skipped: 0,
    errors: [] as string[],
  };

  try {
    // 1. Fetch active campaigns
    const campaigns = await db.campaign.findMany({
      where: {
        status: { in: ["Live", "Partially sent"] },
        ...(targetCampaignId ? { id: targetCampaignId } : {}),
      },
      include: {
        emailAccount: true,
      },
    });

    summary.processedCampaigns = campaigns.length;

    for (const campaign of campaigns) {
      if (!campaign.userId || !campaign.emailAccount) {
        continue;
      }

      const emailAccount = campaign.emailAccount;
      if (emailAccount.status !== "connected") {
        continue;
      }

      // Check sender 24-hour volume
      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const sentInLast24h = await db.emailDelivery.count({
        where: {
          status: "Sent",
          senderEmail: emailAccount.email,
          sentAt: { gte: since24h },
        },
      });

      if (sentInLast24h >= MAX_EMAILS_PER_SENDER_PER_24_HOURS) {
        continue;
      }

      const sequence = (Array.isArray(campaign.emails) ? campaign.emails : []) as unknown as FollowUpStep[];
      if (sequence.length < 2) {
        continue; // No follow-ups configured in sequence
      }

      const personalizedMap = campaign.personalizedEmails as Record<
        string,
        { step: number; subject: string; body: string }[]
      > | null;

      const storedLeads = (Array.isArray(campaign.selectedLeads) ? campaign.selectedLeads : []) as unknown as Lead[];
      const leadMap = new Map<string, Lead>();
      for (const l of storedLeads) {
        if (l && l.id) leadMap.set(l.id, l);
      }

      // Fetch all Step 1 deliveries that were successfully sent for this campaign
      const step1Deliveries = await db.emailDelivery.findMany({
        where: {
          campaignId: campaign.id,
          step: 1,
          status: "Sent",
        },
      });

      // Fetch suppressed / unsubscribed emails for this user
      const suppressions = await db.emailSuppression.findMany({
        where: { userId: campaign.userId },
        select: { email: true },
      });
      const suppressedEmails = new Set(suppressions.map((s) => s.email.toLowerCase()));

      // Fetch inbound replies or replied leads for this campaign
      const repliedLeads = await db.inboundEmail.findMany({
        where: { campaignId: campaign.id },
        select: { senderEmail: true, leadId: true },
      });
      const repliedSet = new Set([
        ...repliedLeads.map((r) => r.senderEmail.toLowerCase()),
        ...repliedLeads.map((r) => r.leadId).filter(Boolean) as string[],
      ]);

      // Process Follow-up 1 (Step 2) and Follow-up 2 (Step 3) for each lead
      for (const step1 of step1Deliveries) {
        const lead = leadMap.get(step1.leadId) || {
          id: step1.leadId,
          email: step1.recipient,
          name: "there",
          jobTitle: "Leader",
          role: "Individual Contributor",
          company: "your team",
          industry: "Industry",
          companySize: "10-50",
          country: "Global",
          city: "Global",
          location: "Global",
          matchReason: "",
          matchScore: 90,
          verificationTag: "Email verified",
        };

        const recipient = (step1.recipient || lead.email || "").trim().toLowerCase();
        if (!recipient || !emailRegex.test(recipient)) {
          continue;
        }

        // Check if unsubscribed or replied
        if (suppressedEmails.has(recipient) || repliedSet.has(recipient) || repliedSet.has(lead.id)) {
          summary.skipped++;
          continue;
        }

        // -------------------------------------------------------------
        // EVALUATE FOLLOW-UP 1 (Step 2)
        // -------------------------------------------------------------
        const fu1Step = sequence.find((s) => s.step === 2) || sequence[1];
        let step2Delivery = await db.emailDelivery.findUnique({
          where: {
            campaignId_leadId_step: {
              campaignId: campaign.id,
              leadId: lead.id,
              step: 2,
            },
          },
        });

        if (fu1Step && (!step2Delivery || step2Delivery.status === "Pending" || step2Delivery.status === "Failed")) {
          const fu1TargetSendAt = resolveNextSendAt(fu1Step, step1.sentAt || step1.createdAt, 1, sequence);

          if (now.getTime() >= fu1TargetSendAt.getTime()) {
            // Check daily limit before sending
            const currentSent24h = await db.emailDelivery.count({
              where: {
                status: "Sent",
                senderEmail: emailAccount.email,
                sentAt: { gte: since24h },
              },
            });
            if (currentSent24h >= MAX_EMAILS_PER_SENDER_PER_24_HOURS) {
              break; // Daily cap hit
            }

            // Create or claim Step 2 delivery
            const deliveryRecord = await db.emailDelivery.upsert({
              where: {
                campaignId_leadId_step: {
                  campaignId: campaign.id,
                  leadId: lead.id,
                  step: 2,
                },
              },
              create: {
                campaignId: campaign.id,
                leadId: lead.id,
                step: 2,
                recipient,
                senderEmail: emailAccount.email,
                subject: fu1Step.subject,
                body: fu1Step.body,
                status: "Pending",
              },
              update: {
                recipient,
                senderEmail: emailAccount.email,
              },
            });

            const leaseUntil = await acquireSenderSendLease(emailAccount.id, campaign.userId);
            if (!leaseUntil) {
              summary.skipped++;
              continue;
            }

            try {
              const claim = await db.emailDelivery.updateMany({
                where: {
                  id: deliveryRecord.id,
                  status: { in: ["Pending", "Failed"] },
                  attemptCount: { lt: MAX_DELIVERY_ATTEMPTS },
                  OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }],
                },
                data: { status: "Sending", attemptCount: { increment: 1 }, nextAttemptAt: null, error: null },
              });

              if (claim.count === 1) {
                const attempt = deliveryRecord.attemptCount + 1;
                try {
                  const personalizedStep2 = personalizedMap?.[lead.id]?.find((item) => item.step === 2);
                  const rawSubject = personalizedStep2?.subject || fu1Step.subject || "Following up on my previous note";
                  const rawBody = personalizedStep2?.body || fu1Step.body || "Following up to see if you have any questions.";
                  const subject = personalizeText(rawSubject, lead);
                  const bodyText = personalizeEmailBody(rawBody, lead);
                  const unsubscribeUrl = createUnsubscribeUrl(campaign.userId, recipient);

                  await new Promise((resolve) => setTimeout(resolve, getControlledSendDelay()));
                  const sendResult = await sendGmailMessage({
                    emailAccountId: emailAccount.id,
                    userId: campaign.userId,
                    to: recipient,
                    subject,
                    body: bodyText,
                    threadId: step1.gmailThreadId || undefined,
                    inReplyTo: step1.messageId || undefined,
                    unsubscribeUrl,
                    deliveryId: deliveryRecord.id,
                  });

                  step2Delivery = await db.emailDelivery.update({
                    where: { id: deliveryRecord.id },
                    data: {
                      status: "Sent",
                      subject,
                      body: `${bodyText}\n\nTo stop receiving these emails, unsubscribe: ${unsubscribeUrl}`,
                      messageId: sendResult.messageId,
                      gmailThreadId: sendResult.threadId || step1.gmailThreadId,
                      sentAt: new Date(),
                      nextAttemptAt: null,
                      error: null,
                    },
                  });

                  await refreshCampaignDeliveryState(campaign.id);
                  summary.sentFollowUps++;
                } catch (sendErr) {
                  const errMsg = sendErr instanceof Error ? sendErr.message : "Failed to send Follow-up 1";
                  const shouldRetry = isRetryableEmailError(sendErr) && attempt < MAX_DELIVERY_ATTEMPTS;
                  await db.emailDelivery.update({
                    where: { id: deliveryRecord.id },
                    data: {
                      status: shouldRetry ? "Pending" : "Failed",
                      nextAttemptAt: shouldRetry ? getEmailRetryAt(attempt) : null,
                      error: errMsg.slice(0, 4000),
                    },
                  });
                  if (shouldRetry) summary.skipped++;
                  else summary.failedFollowUps++;
                  await refreshCampaignDeliveryState(campaign.id);
                  summary.errors.push(`FU1 failed for ${recipient}: ${errMsg}`);
                }
              }
            } finally {
              await releaseSenderSendLease(emailAccount.id, campaign.userId, leaseUntil);
            }
          }
        }

        // -------------------------------------------------------------
        // EVALUATE FOLLOW-UP 2 (Step 3)
        // -------------------------------------------------------------
        const fu2Step = sequence.find((s) => s.step === 3) || sequence[2];
        if (fu2Step && step2Delivery && step2Delivery.status === "Sent" && step2Delivery.sentAt) {
          const step3Delivery = await db.emailDelivery.findUnique({
            where: {
              campaignId_leadId_step: {
                campaignId: campaign.id,
                leadId: lead.id,
                step: 3,
              },
            },
          });

          if (!step3Delivery || step3Delivery.status === "Pending" || step3Delivery.status === "Failed") {
            const fu2TargetSendAt = resolveNextSendAt(fu2Step, step2Delivery.sentAt, 2, sequence);

            if (now.getTime() >= fu2TargetSendAt.getTime()) {
              // Check daily limit before sending
              const currentSent24h = await db.emailDelivery.count({
                where: {
                  status: "Sent",
                  senderEmail: emailAccount.email,
                  sentAt: { gte: since24h },
                },
              });
              if (currentSent24h >= MAX_EMAILS_PER_SENDER_PER_24_HOURS) {
                break;
              }

              // Create or claim Step 3 delivery
              const deliveryRecord = await db.emailDelivery.upsert({
                where: {
                  campaignId_leadId_step: {
                    campaignId: campaign.id,
                    leadId: lead.id,
                    step: 3,
                  },
                },
                create: {
                  campaignId: campaign.id,
                  leadId: lead.id,
                  step: 3,
                  recipient,
                  senderEmail: emailAccount.email,
                  subject: fu2Step.subject,
                  body: fu2Step.body,
                  status: "Pending",
                },
                update: {
                  recipient,
                  senderEmail: emailAccount.email,
                },
              });

              const leaseUntil = await acquireSenderSendLease(emailAccount.id, campaign.userId);
              if (!leaseUntil) {
                summary.skipped++;
                continue;
              }

              try {
                const claim = await db.emailDelivery.updateMany({
                  where: {
                    id: deliveryRecord.id,
                    status: { in: ["Pending", "Failed"] },
                    attemptCount: { lt: MAX_DELIVERY_ATTEMPTS },
                    OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }],
                  },
                  data: { status: "Sending", attemptCount: { increment: 1 }, nextAttemptAt: null, error: null },
                });

                if (claim.count === 1) {
                  const attempt = deliveryRecord.attemptCount + 1;
                  try {
                    const personalizedStep3 = personalizedMap?.[lead.id]?.find((item) => item.step === 3);
                    const rawSubject = personalizedStep3?.subject || fu2Step.subject || "Final note on partnership";
                    const rawBody = personalizedStep3?.body || fu2Step.body || "One final note in case you would like to connect.";
                    const subject = personalizeText(rawSubject, lead);
                    const bodyText = personalizeEmailBody(rawBody, lead);
                    const unsubscribeUrl = createUnsubscribeUrl(campaign.userId, recipient);

                    await new Promise((resolve) => setTimeout(resolve, getControlledSendDelay()));
                    const sendResult = await sendGmailMessage({
                      emailAccountId: emailAccount.id,
                      userId: campaign.userId,
                      to: recipient,
                      subject,
                      body: bodyText,
                      threadId: step2Delivery.gmailThreadId || step1.gmailThreadId || undefined,
                      inReplyTo: step2Delivery.messageId || step1.messageId || undefined,
                      unsubscribeUrl,
                      deliveryId: deliveryRecord.id,
                    });

                    await db.emailDelivery.update({
                      where: { id: deliveryRecord.id },
                      data: {
                        status: "Sent",
                        subject,
                        body: `${bodyText}\n\nTo stop receiving these emails, unsubscribe: ${unsubscribeUrl}`,
                        messageId: sendResult.messageId,
                        gmailThreadId: sendResult.threadId || step2Delivery.gmailThreadId || step1.gmailThreadId,
                        sentAt: new Date(),
                        nextAttemptAt: null,
                        error: null,
                      },
                    });

                    await refreshCampaignDeliveryState(campaign.id);
                    summary.sentFollowUps++;
                  } catch (sendErr) {
                    const errMsg = sendErr instanceof Error ? sendErr.message : "Failed to send Follow-up 2";
                    const shouldRetry = isRetryableEmailError(sendErr) && attempt < MAX_DELIVERY_ATTEMPTS;
                    await db.emailDelivery.update({
                      where: { id: deliveryRecord.id },
                      data: {
                        status: shouldRetry ? "Pending" : "Failed",
                        nextAttemptAt: shouldRetry ? getEmailRetryAt(attempt) : null,
                        error: errMsg.slice(0, 4000),
                      },
                    });
                    if (shouldRetry) summary.skipped++;
                    else summary.failedFollowUps++;
                    await refreshCampaignDeliveryState(campaign.id);
                    summary.errors.push(`FU2 failed for ${recipient}: ${errMsg}`);
                  }
                }
              } finally {
                await releaseSenderSendLease(emailAccount.id, campaign.userId, leaseUntil);
              }
            }
          }
        }
      }
    }
  } catch (globalErr) {
    const msg = globalErr instanceof Error ? globalErr.message : "Global follow-up scheduler error";
    summary.errors.push(msg);
  }

  return summary;
}
