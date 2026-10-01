import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/auth";
import { db } from "@/lib/db";
import { sendGmailMessage } from "@/lib/gmailApi";
import { personalizeEmailBody, personalizeText } from "@/lib/campaigns";
import { createUnsubscribeUrl } from "@/lib/unsubscribe";
import { getEmailRetryAt, isRetryableEmailError, MAX_DELIVERY_ATTEMPTS } from "@/lib/emailQueue";
import { checkDomainAuthentication } from "@/lib/emailDeliverability";
import "@/lib/scheduler";

import type { Campaign, Lead } from "@/types";

export const runtime = "nodejs";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MAX_RECIPIENTS_PER_LAUNCH = 10;
const MAX_EMAILS_PER_SENDER_PER_24_HOURS = 50;
const MAX_INLINE_SENDS_PER_LAUNCH = 1;

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Unauthorized. Please sign in." },
      { status: 401 },
    );
  }

  let lockedEmailAccountId: string | undefined;

  try {
    // ---------------------------------------------------------
    // 1. Parse request
    // ---------------------------------------------------------
    let input: unknown;

    try {
      input = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Request body must be valid JSON." },
        { status: 400 },
      );
    }

    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return NextResponse.json(
        { error: "Request body must be a JSON object." },
        { status: 400 },
      );
    }

    const body = input as {
      campaignId?: string;
      selectedLeadIds?: unknown;
      selectedLeads?: unknown;
      connectedEmail?: string;
      provider?: string;
    };

    if (
      typeof body.campaignId !== "string" ||
      !body.campaignId.trim() ||
      (body.selectedLeadIds !== undefined &&
        (!Array.isArray(body.selectedLeadIds) ||
          !body.selectedLeadIds.every(
            (id) => typeof id === "string",
          ))) ||
      (body.connectedEmail !== undefined &&
        typeof body.connectedEmail !== "string") ||
      (body.provider !== undefined &&
        typeof body.provider !== "string")
    ) {
      return NextResponse.json(
        {
          error:
            "Campaign ID, selected lead IDs, sender, or provider is invalid.",
        },
        { status: 400 },
      );
    }

    // ---------------------------------------------------------
    // 2. Get campaign belonging to current user
    // ---------------------------------------------------------
    const campaign = await db.campaign.findFirst({
      where: {
        id: body.campaignId,
        userId: session.user.id,
      },
    });

    if (!campaign) {
      return NextResponse.json(
        { error: "Campaign not found or access denied." },
        { status: 404 },
      );
    }

    // ---------------------------------------------------------
    // 3. Resolve leads
    // ---------------------------------------------------------
    const storedLeads = Array.isArray(campaign.selectedLeads)
      ? (campaign.selectedLeads as unknown as Lead[])
      : [];

    const payloadLeads = Array.isArray(body.selectedLeads)
      ? (body.selectedLeads as unknown as Lead[])
      : [];

    const storedLeadMap = new Map<string, Lead>();

    for (const lead of storedLeads) {
      if (lead && lead.id) {
        storedLeadMap.set(lead.id, lead);
      }
    }

    for (const lead of payloadLeads) {
      if (lead && lead.id && !storedLeadMap.has(lead.id)) {
        storedLeadMap.set(lead.id, lead);
      }
    }

    const savedLeadIds = Array.isArray(campaign.selectedLeadIds)
      ? (campaign.selectedLeadIds as string[])
      : [];

    const selectedLeadIds =
      body.selectedLeadIds as string[] | undefined;

    const leadIds =
      selectedLeadIds && selectedLeadIds.length > 0
        ? selectedLeadIds
        : savedLeadIds;

    if (
      !leadIds.length ||
      leadIds.length > MAX_RECIPIENTS_PER_LAUNCH ||
      leadIds.some((id) => typeof id !== "string") ||
      new Set(leadIds).size !== leadIds.length ||
      leadIds.some((id) => !storedLeadMap.has(id))
    ) {
      return NextResponse.json(
        {
          error: `Select 1-${MAX_RECIPIENTS_PER_LAUNCH} unique leads saved to this campaign before launching.`,
        },
        { status: 400 },
      );
    }

    const uniqueLeadIds = leadIds;

    const leadsToProcess: Lead[] = uniqueLeadIds.map(
      (id) => storedLeadMap.get(id)!,
    );

    // ---------------------------------------------------------
    // 4. Validate recipients
    // ---------------------------------------------------------
    const validRecipients = leadsToProcess
      .map((lead) => lead.email?.trim().toLowerCase() ?? "")
      .filter((email) => emailRegex.test(email));

    if (
      new Set(validRecipients).size !==
      validRecipients.length
    ) {
      return NextResponse.json(
        {
          error:
            "This campaign contains duplicate recipient email addresses.",
        },
        { status: 400 },
      );
    }

    // ---------------------------------------------------------
    // 5. Resolve Gmail account
    // ---------------------------------------------------------
    let emailAccountId = campaign.emailAccountId;

    if (!emailAccountId) {
      const emailToMatch =
        campaign.connectedEmail?.trim().toLowerCase() ||
        (typeof body.connectedEmail === "string"
          ? body.connectedEmail.trim().toLowerCase()
          : "");

      const foundAccount = emailToMatch
        ? await db.emailAccount.findFirst({
            where: {
              userId: session.user.id,
              email: emailToMatch,
              status: "connected",
            },
          })
        : await db.emailAccount.findFirst({
            where: {
              userId: session.user.id,
              status: "connected",
            },
            orderBy: {
              createdAt: "desc",
            },
          });

      if (foundAccount) {
        emailAccountId = foundAccount.id;

        await db.campaign.update({
          where: {
            id: campaign.id,
          },
          data: {
            emailAccountId: foundAccount.id,
            connectedEmail: foundAccount.email,
          },
        });
      }
    }

    if (!emailAccountId) {
      return NextResponse.json(
        {
          error:
            "Connect a Gmail account before launching this campaign.",
        },
        { status: 400 },
      );
    }

    // ---------------------------------------------------------
    // 6. Verify Gmail account belongs to current user
    // ---------------------------------------------------------
    const emailAccount = await db.emailAccount.findFirst({
      where: {
        id: emailAccountId,
        userId: session.user.id,
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        status: true,
      },
    });

    if (!emailAccount) {
      return NextResponse.json(
        {
          error:
            "Reconnect required. This campaign's Gmail account is unavailable.",
        },
        { status: 400 },
      );
    }

    if (emailAccount.status !== "connected") {
      return NextResponse.json(
        {
          error:
            "Reconnect required. This Gmail account needs authorization.",
        },
        { status: 400 },
      );
    }

    const senderDomain = emailAccount.email.split("@")[1]?.toLowerCase() ?? "";
    if (senderDomain && !["gmail.com", "googlemail.com"].includes(senderDomain)) {
      const domainAuth = await checkDomainAuthentication(senderDomain);
      const missingRecords = [
        !domainAuth.spf.configured ? "SPF" : null,
        !domainAuth.dkim.configured ? "DKIM" : null,
        !domainAuth.dmarc.configured ? "DMARC" : null,
      ].filter((record): record is string => Boolean(record));

      if (missingRecords.length) {
        const recommendations = domainAuth.recommendations.join(" ");
        return NextResponse.json(
          {
            error: `Sending domain ${senderDomain} is missing verified ${missingRecords.join(", ")} authentication. Publish the required DNS records before sending.${recommendations ? ` ${recommendations}` : ""}`,
            authentication: domainAuth,
          },
          { status: 409 },
        );
      }
    }

    // ---------------------------------------------------------
    // 7. Check suppressions
    // ---------------------------------------------------------
    const recipientEmails = leadsToProcess
      .map((lead) => lead.email?.trim().toLowerCase() ?? "")
      .filter((email) => emailRegex.test(email));

    const suppressions = await db.emailSuppression.findMany({
      where: {
        userId: session.user.id,
        email: {
          in: recipientEmails,
        },
      },
      select: {
        email: true,
      },
    });

    if (suppressions.length) {
      return NextResponse.json(
        {
          error: `${suppressions.length} selected recipient(s) have unsubscribed. Remove them before launching this campaign.`,
          suppressedCount: suppressions.length,
        },
        { status: 409 },
      );
    }

    // ---------------------------------------------------------
    // 8. Lock Gmail account
    // ---------------------------------------------------------
    const lockResult = await db.emailAccount.updateMany({
      where: {
        id: emailAccount.id,
        userId: session.user.id,
        OR: [
          {
            sendLockUntil: null,
          },
          {
            sendLockUntil: {
              lt: new Date(),
            },
          },
        ],
      },
      data: {
        sendLockUntil: new Date(
          Date.now() + 5 * 60 * 1000,
        ),
      },
    });

    if (lockResult.count !== 1) {
      return NextResponse.json(
        {
          error:
            "A campaign is already sending from this Gmail account. Try again shortly.",
        },
        { status: 429 },
      );
    }

    lockedEmailAccountId = emailAccount.id;

    // ---------------------------------------------------------
    // 9. Check daily sending limit
    // ---------------------------------------------------------
    const since = new Date(
      Date.now() - 24 * 60 * 60 * 1000,
    );

    const [sentInLast24Hours, existingDeliveries, reservedDeliveries] =
      await Promise.all([
        db.emailDelivery.count({
          where: {
            status: "Sent",
            sentAt: {
              gte: since,
            },
            OR: [
              {
                senderEmail: emailAccount.email,
              },
              {
                senderEmail: null,
                campaign: {
                  is: {
                    userId: session.user.id,
                    connectedEmail: emailAccount.email,
                  },
                },
              },
            ],
            campaign: {
              is: {
                userId: session.user.id,
              },
            },
          },
        }),

        db.emailDelivery.findMany({
          where: {
            campaignId: campaign.id,
            leadId: {
              in: uniqueLeadIds,
            },
            step: 1,
          },
          select: {
            leadId: true,
            status: true,
          },
        }),
        db.emailDelivery.count({
          where: {
            senderEmail: emailAccount.email,
            createdAt: { gte: since },
            status: { in: ["Pending", "Sending"] },
            campaign: { is: { userId: session.user.id } },
          },
        }),
      ]);

    const existingDeliveryIds = new Set(
      existingDeliveries.map((delivery) => delivery.leadId),
    );

    const newRecipientCount = leadsToProcess.filter(
      (lead) => !existingDeliveryIds.has(lead.id),
    ).length;

    if (
      sentInLast24Hours + reservedDeliveries + newRecipientCount >
      MAX_EMAILS_PER_SENDER_PER_24_HOURS
    ) {
      return NextResponse.json(
        {
          error: `This Gmail account is limited to ${MAX_EMAILS_PER_SENDER_PER_24_HOURS} campaign emails per rolling 24 hours.`,
        },
        { status: 429 },
      );
    }

    // ---------------------------------------------------------
    // 10. Prepare campaign content
    // ---------------------------------------------------------
    const personalizedMap =
      campaign.personalizedEmails as Record<
        string,
        {
          step: number;
          subject: string;
          body: string;
        }[]
      > | null;

    const baseSequence = (
      Array.isArray(campaign.emails)
        ? campaign.emails
        : []
    ) as Campaign["sequence"];

    const step1Base =
      baseSequence.find((s) => s.step === 1) ||
      baseSequence[0];

    const outcomes: Array<{
      leadId: string;
      recipient: string;
      status: "Sent" | "Failed" | "Pending";
      messageId?: string;
      error?: string;
      alreadySent?: boolean;
    }> = [];

    let sentCount = 0;
    let failedCount = 0;
    let pendingCount = 0;
    let sendAttempts = 0;
    const startedAt = campaign.startedAt ?? new Date();

    await db.campaign.update({
      where: {
        id: campaign.id,
      },
      data: {
        startedAt,
      },
    });

    // ---------------------------------------------------------
    // 11. Send emails
    // ---------------------------------------------------------
    for (const lead of leadsToProcess) {
      const recipient = lead.email?.trim() || "";

      if (!recipient || !emailRegex.test(recipient)) {
        const errorMsg =
          `Invalid or missing recipient email address: "${recipient || "empty"}".`;

        try {
          await db.emailDelivery.upsert({
            where: {
              campaignId_leadId_step: {
                campaignId: campaign.id,
                leadId: lead.id,
                step: 1,
              },
            },
            create: {
              campaignId: campaign.id,
              leadId: lead.id,
              step: 1,
              recipient: recipient || "unknown",
              subject: "Invalid recipient",
              body: "Invalid recipient",
              status: "Failed",
              error: errorMsg,
            },
            update: {
              status: "Failed",
              error: errorMsg,
            },
          });
        } catch (dbErr) {
          console.error(
            "[Launch] Failed to record invalid email:",
            dbErr,
          );
        }

        outcomes.push({
          leadId: lead.id,
          recipient: recipient || "unknown",
          status: "Failed",
          error: errorMsg,
        });

        failedCount++;
        continue;
      }

      // -------------------------------------------------------
      // Personalize content
      // -------------------------------------------------------
      const personalizedStep1 =
        personalizedMap?.[lead.id]?.find(
          (item) => item.step === 1,
        );

      const subjectTemplate =
        personalizedStep1?.subject ||
        step1Base?.subject ||
        "Partnership opportunity with {{company}}";

      const bodyTemplate =
        personalizedStep1?.body ||
        step1Base?.body ||
        `Hi {{first_name}},

I'm reaching out about the campaign topic at {{company}}. Would a brief conversation be useful?

Regards,`;

      const subject = personalizeText(
        subjectTemplate,
        lead,
      );

      const bodyText = personalizeEmailBody(
        bodyTemplate,
        lead,
      );

      const unsubscribeUrl = createUnsubscribeUrl(
        session.user.id,
        recipient,
      );

      const recordedBody =
        `${bodyText}\n\nTo stop receiving these emails, unsubscribe: ${unsubscribeUrl}`;

      // -------------------------------------------------------
      // Prevent duplicate send
      // -------------------------------------------------------
      const priorDelivery =
        await db.emailDelivery.findUnique({
          where: {
            campaignId_leadId_step: {
              campaignId: campaign.id,
              leadId: lead.id,
              step: 1,
            },
          },
        });

      if (priorDelivery?.status === "Sent") {
        outcomes.push({
          leadId: lead.id,
          recipient,
          status: "Sent",
          messageId:
            priorDelivery.messageId ?? undefined,
          alreadySent: true,
        });

        sentCount++;
        continue;
      }

      // -------------------------------------------------------
      // Create delivery record
      // -------------------------------------------------------
      const deliveryRecord =
        await db.emailDelivery.upsert({
          where: {
            campaignId_leadId_step: {
              campaignId: campaign.id,
              leadId: lead.id,
              step: 1,
            },
          },

          create: {
            campaignId: campaign.id,
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

      if (
        deliveryRecord.status === "Failed" &&
        deliveryRecord.attemptCount >= MAX_DELIVERY_ATTEMPTS
      ) {
        outcomes.push({ leadId: lead.id, recipient, status: "Failed", error: deliveryRecord.error ?? "Maximum delivery attempts reached." });
        failedCount++;
        continue;
      }

      if (
        sendAttempts >= MAX_INLINE_SENDS_PER_LAUNCH ||
        (deliveryRecord.nextAttemptAt && deliveryRecord.nextAttemptAt > new Date())
      ) {
        outcomes.push({ leadId: lead.id, recipient, status: "Pending" });
        pendingCount++;
        continue;
      }

      // -------------------------------------------------------
      // Claim delivery
      // -------------------------------------------------------
      const claim = await db.emailDelivery.updateMany({
        where: {
          id: deliveryRecord.id,
          status: {
            in: ["Pending", "Failed"],
          },
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
        const currentDelivery =
          await db.emailDelivery.findUnique({
            where: {
              id: deliveryRecord.id,
            },
            select: {
              status: true,
              messageId: true,
            },
          });

        const wasSent =
          currentDelivery?.status === "Sent";

        outcomes.push({
          leadId: lead.id,
          recipient,
          status: wasSent ? "Sent" : "Pending",
          ...(currentDelivery?.messageId
            ? {
                messageId:
                  currentDelivery.messageId,
              }
            : {}),
          ...(wasSent
            ? {
                alreadySent: true,
              }
            : {}),
        });

        if (wasSent) {
          sentCount++;
        } else if (currentDelivery?.status === "Failed") {
          failedCount++;
        } else {
          pendingCount++;
        }

        continue;
      }

      const attempt = deliveryRecord.attemptCount + 1;

      // -------------------------------------------------------
      // Send through Gmail API
      // -------------------------------------------------------
      try {
        sendAttempts++;

        const sendResult = await sendGmailMessage({
          emailAccountId: emailAccount.id,
          userId: session.user.id,
          to: recipient,
          subject,
          body: bodyText,
          unsubscribeUrl,
          deliveryId: deliveryRecord.id,
        });

        await db.emailDelivery.update({
          where: {
            id: deliveryRecord.id,
          },
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
          sendError instanceof Error
            ? sendError.message
            : "Gmail API send failed.";
        const shouldRetry = isRetryableEmailError(sendError) && attempt < MAX_DELIVERY_ATTEMPTS;

        console.error(
          `[Launch] Failed to send email to ${recipient}:`,
          errorMessage,
        );

        await db.emailDelivery.update({
          where: {
            id: deliveryRecord.id,
          },
          data: {
            status: shouldRetry ? "Pending" : "Failed",
            nextAttemptAt: shouldRetry ? getEmailRetryAt(attempt) : null,
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

    // ---------------------------------------------------------
    // 12. Final campaign status
    // ---------------------------------------------------------
    const totalProcessed = leadsToProcess.length;

    const campaignStatus = pendingCount
      ? "Live"
      : sentCount === totalProcessed &&
          totalProcessed > 0
        ? "Live"
        : sentCount > 0
          ? "Partially sent"
          : failedCount > 0
            ? "Failed"
            : "Ready";

    const [campaignSentCount, campaignFailedCount] = await Promise.all([
      db.emailDelivery.count({ where: { campaignId: campaign.id, status: "Sent" } }),
      db.emailDelivery.count({ where: { campaignId: campaign.id, status: "Failed" } }),
    ]);
    await db.campaign.update({
      where: { id: campaign.id },
      data: {
        status: campaignStatus,
        selectedLeadIds: uniqueLeadIds,
        selectedLeads: leadsToProcess as unknown as object,
        connectedEmail: emailAccount.email,
        provider: body.provider ?? campaign.provider ?? "Google Workspace / Gmail",
        startedAt,
        sentCount: campaignSentCount,
        failedCount: campaignFailedCount,
      },
    });

    return NextResponse.json({
      status: campaignStatus,
      sentCount,
      failedCount,
      pendingCount,
      total: totalProcessed,
      startedAt: startedAt.toISOString(),
      outcomes,
    });
  } catch (error) {
    console.error(
      "[API /api/campaigns/launch] Unhandled launch error:",
      error,
    );

    const message =
      error instanceof Error
        ? error.message
        : "Unable to launch campaign.";

    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  } finally {
    // Release sender lock
    if (lockedEmailAccountId) {
      try {
        await db.emailAccount.updateMany({
          where: {
            id: lockedEmailAccountId,
            userId: session.user.id,
          },
          data: {
            sendLockUntil: null,
          },
        });
      } catch (error) {
        console.error(
          "[API /api/campaigns/launch] Unable to release sender lock:",
          error,
        );
      }
    }
  }
}