import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { db } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { createSenderTransport, sendEmail, verifySenderAddress, type SmtpCredentials } from "@/workers/processors/emailWorker";
import { personalizeText } from "@/lib/campaigns";
import { createUnsubscribeUrl } from "@/lib/unsubscribe";
import type { Campaign, Lead } from "@/types";

export const runtime = "nodejs";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_RECIPIENTS_PER_LAUNCH = 10;
const MAX_EMAILS_PER_SENDER_PER_24_HOURS = 50;
const SEND_INTERVAL_MS = 1200;

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized. Please sign in." }, { status: 401 });
  }

  let senderTransport: ReturnType<typeof createSenderTransport> | undefined;
  let lockedEmailAccountId: string | undefined;

  try {
    let input: unknown;
    try {
      input = await request.json();
    } catch {
      return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
    }

    const body = input as {
      campaignId?: string;
      selectedLeadIds?: unknown;
      connectedEmail?: string;
      provider?: string;
    };

    if (
      typeof body.campaignId !== "string" ||
      !body.campaignId.trim() ||
      (body.selectedLeadIds !== undefined &&
        (!Array.isArray(body.selectedLeadIds) || !body.selectedLeadIds.every((id) => typeof id === "string"))) ||
      (body.connectedEmail !== undefined && typeof body.connectedEmail !== "string") ||
      (body.provider !== undefined && typeof body.provider !== "string")
    ) {
      return NextResponse.json({ error: "Campaign ID, selected lead IDs, sender, or provider is invalid." }, { status: 400 });
    }

    const campaign = await db.campaign.findFirst({
      where: { id: body.campaignId, userId: session.user.id },
    });

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found or access denied." }, { status: 404 });
    }

    // Resolve leads to send to
    const storedLeads = Array.isArray(campaign.selectedLeads)
      ? (campaign.selectedLeads as unknown as Lead[])
      : [];
    const storedLeadMap = new Map(storedLeads.map((lead) => [lead.id, lead]));
    const savedLeadIds = Array.isArray(campaign.selectedLeadIds)
      ? (campaign.selectedLeadIds as string[])
      : [];
    const selectedLeadIds = body.selectedLeadIds as string[] | undefined;
    const leadIds = selectedLeadIds
      ? selectedLeadIds
      : savedLeadIds;

    if (
      !leadIds.length ||
      leadIds.length > MAX_RECIPIENTS_PER_LAUNCH ||
      leadIds.some((id) => typeof id !== "string" || !savedLeadIds.includes(id)) ||
      new Set(leadIds).size !== leadIds.length ||
      leadIds.some((id) => !storedLeadMap.has(id))
    ) {
      return NextResponse.json(
        { error: `Select 1-${MAX_RECIPIENTS_PER_LAUNCH} unique leads saved to this campaign before launching.` },
        { status: 400 },
      );
    }

    const uniqueLeadIds = leadIds;
    const leadsToProcess: Lead[] = uniqueLeadIds.map((id) => storedLeadMap.get(id)!);
    const validRecipients = leadsToProcess
      .map((lead) => lead.email?.trim().toLowerCase() ?? "")
      .filter((email) => emailRegex.test(email));
    if (new Set(validRecipients).size !== validRecipients.length) {
      return NextResponse.json({ error: "This campaign contains duplicate recipient email addresses." }, { status: 400 });
    }

    const senderEmail = campaign.connectedEmail?.trim() || body.connectedEmail?.trim();
    if (!senderEmail) {
      return NextResponse.json({ error: "Connect a Gmail account before launching this campaign." }, { status: 400 });
    }

    const emailAccount = await db.emailAccount.findUnique({
      where: { userId_email: { userId: session.user.id, email: senderEmail.toLowerCase() } },
      select: { id: true, email: true, displayName: true, appPassword: true },
    });
    if (!emailAccount) {
      return NextResponse.json({ error: "The connected Gmail account is not available for this user. Connect it again." }, { status: 400 });
    }

    const recipientEmails = leadsToProcess
      .map((lead) => lead.email?.trim().toLowerCase() ?? "")
      .filter((email) => emailRegex.test(email));
    const suppressions = await db.emailSuppression.findMany({
      where: { userId: session.user.id, email: { in: recipientEmails } },
      select: { email: true },
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

    const lockResult = await db.emailAccount.updateMany({
      where: {
        id: emailAccount.id,
        userId: session.user.id,
        OR: [{ sendLockUntil: null }, { sendLockUntil: { lt: new Date() } }],
      },
      data: { sendLockUntil: new Date(Date.now() + 5 * 60 * 1000) },
    });
    if (lockResult.count !== 1) {
      return NextResponse.json({ error: "A campaign is already sending from this Gmail account. Try again shortly." }, { status: 429 });
    }
    lockedEmailAccountId = emailAccount.id;

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [sentInLast24Hours, previouslySent] = await Promise.all([
      db.emailDelivery.count({
        where: {
          status: "Sent",
          sentAt: { gte: since },
          OR: [
            { senderEmail: emailAccount.email },
            { senderEmail: null, campaign: { is: { userId: session.user.id, connectedEmail: emailAccount.email } } },
          ],
          campaign: { is: { userId: session.user.id } },
        },
      }),
      db.emailDelivery.findMany({
        where: {
          campaignId: campaign.id,
          leadId: { in: uniqueLeadIds },
          step: 1,
          status: "Sent",
        },
        select: { leadId: true },
      }),
    ]);
    const previouslySentIds = new Set(previouslySent.map((delivery) => delivery.leadId));
    const newRecipientCount = leadsToProcess.filter((lead) => !previouslySentIds.has(lead.id)).length;
    if (sentInLast24Hours + newRecipientCount > MAX_EMAILS_PER_SENDER_PER_24_HOURS) {
      return NextResponse.json(
        { error: `This Gmail account is limited to ${MAX_EMAILS_PER_SENDER_PER_24_HOURS} campaign emails per rolling 24 hours.` },
        { status: 429 },
      );
    }

    const senderCredentials: SmtpCredentials = {
      email: emailAccount.email,
      displayName: emailAccount.displayName,
      appPassword: decrypt(emailAccount.appPassword),
    };
    senderTransport = createSenderTransport(senderCredentials);

    // Recheck credentials before starting a batch so invalid accounts fail before delivery records are changed.
    let verifiedSenderEmail: string;
    try {
      verifiedSenderEmail = await verifySenderAddress(senderEmail, senderCredentials, senderTransport);
    } catch (senderError) {
      const senderMsg = senderError instanceof Error ? senderError.message : "Gmail verification failed.";
      return NextResponse.json({ error: senderMsg }, { status: 400 });
    }

    const personalizedMap = campaign.personalizedEmails as Record<
      string,
      { step: number; subject: string; body: string }[]
    > | null;
    const baseSequence = (Array.isArray(campaign.emails) ? campaign.emails : []) as Campaign["sequence"];
    const step1Base = baseSequence.find((s) => s.step === 1) || baseSequence[0];

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

    for (const lead of leadsToProcess) {
      const recipient = lead.email?.trim() || "";

      // 1. Verify Recipient email address
      if (!recipient || !emailRegex.test(recipient)) {
        const errorMsg = `Invalid or missing recipient email address: "${recipient || "empty"}".`;
        try {
          await db.emailDelivery.upsert({
            where: {
              campaignId_leadId_step: { campaignId: campaign.id, leadId: lead.id, step: 1 },
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
          console.error("[Launch] Failed to record invalid email in DB:", dbErr);
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

      // 2. Prepare personalized subject and body for THIS specific lead
      const personalizedStep1 = personalizedMap?.[lead.id]?.find((item) => item.step === 1);
      const subjectTemplate =
        personalizedStep1?.subject ||
        step1Base?.subject ||
        `Partnership opportunity with {{company}}`;
      const bodyTemplate =
        personalizedStep1?.body ||
        step1Base?.body ||
        `Hi {{first_name}},\n\nI'm reaching out about the campaign topic at {{company}}. Would a brief conversation be useful?\n\nRegards,`;

      const subject = personalizeText(subjectTemplate, lead);
      const bodyText = personalizeText(bodyTemplate, lead);
      const unsubscribeUrl = createUnsubscribeUrl(session.user.id, recipient);
      const recordedBody = `${bodyText}\n\nTo stop receiving these emails, unsubscribe: ${unsubscribeUrl}`;

      // 3. Prevent duplicate emails if already sent successfully
      const priorDelivery = await db.emailDelivery.findUnique({
        where: {
          campaignId_leadId_step: { campaignId: campaign.id, leadId: lead.id, step: 1 },
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

      const deliveryRecord = await db.emailDelivery.upsert({
        where: {
          campaignId_leadId_step: { campaignId: campaign.id, leadId: lead.id, step: 1 },
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
        update: { recipient, senderEmail: emailAccount.email, subject, body: recordedBody },
      });
      const claim = await db.emailDelivery.updateMany({
        where: { id: deliveryRecord.id, status: { in: ["Pending", "Failed"] } },
        data: { status: "Sending", error: null },
      });

      if (claim.count !== 1) {
        const currentDelivery = await db.emailDelivery.findUnique({
          where: { id: deliveryRecord.id },
          select: { status: true, messageId: true },
        });
        const wasSent = currentDelivery?.status === "Sent";
        outcomes.push({
          leadId: lead.id,
          recipient,
          status: wasSent ? "Sent" : "Pending",
          ...(currentDelivery?.messageId ? { messageId: currentDelivery.messageId } : {}),
          ...(wasSent ? { alreadySent: true } : {}),
        });
        if (wasSent) sentCount++;
        else pendingCount++;
        continue;
      }

      // 5. Send actual email via Nodemailer
      try {
        if (sendAttempts > 0) await new Promise((resolve) => setTimeout(resolve, SEND_INTERVAL_MS));
        sendAttempts++;
        const sendResult = await sendEmail({
          to: recipient,
          subject,
          body: bodyText,
          fromName: senderCredentials.displayName || undefined,
          unsubscribeUrl,
          credentials: senderCredentials,
          transport: senderTransport,
        });

        await db.emailDelivery.update({
          where: { id: deliveryRecord.id },
          data: {
            status: "Sent",
            messageId: sendResult.messageId,
            sentAt: new Date(),
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
        const errorMessage = sendError instanceof Error ? sendError.message : "SMTP send failed.";
        console.error(`[Launch] Failed to send email to ${recipient}:`, errorMessage);

        await db.emailDelivery.update({
          where: { id: deliveryRecord.id },
          data: {
            status: "Failed",
            error: errorMessage.slice(0, 4000),
          },
        });

        outcomes.push({
          leadId: lead.id,
          recipient,
          status: "Failed",
          error: errorMessage,
        });
        failedCount++;
        // Continue to the next lead without breaking the entire campaign loop
      }
    }

    // 6. Calculate accurate final campaign status based on actual sending results
    const totalProcessed = leadsToProcess.length;
    const campaignStatus = pendingCount
      ? campaign.status
      : sentCount === totalProcessed && totalProcessed > 0
        ? "Live"
        : sentCount > 0
          ? "Partially sent"
          : failedCount > 0
            ? "Failed"
            : "Ready";

    if (!pendingCount) {
      await db.campaign.update({
        where: { id: campaign.id },
        data: {
          status: campaignStatus,
          selectedLeadIds: uniqueLeadIds,
          selectedLeads: leadsToProcess as unknown as object,
          connectedEmail: verifiedSenderEmail,
          provider: body.provider ?? campaign.provider ?? "Google Workspace / Gmail",
          sentCount,
          failedCount,
        },
      });
    }

    return NextResponse.json({
      status: campaignStatus,
      sentCount,
      failedCount,
      pendingCount,
      total: totalProcessed,
      outcomes,
    });
  } catch (error) {
    console.error("[API /api/campaigns/launch] Unhandled launch error:", error);
    const message = error instanceof Error ? error.message : "Unable to launch campaign.";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    senderTransport?.close();
    if (lockedEmailAccountId) {
      try {
        await db.emailAccount.updateMany({
          where: { id: lockedEmailAccountId, userId: session.user.id },
          data: { sendLockUntil: null },
        });
      } catch (error) {
        console.error("[API /api/campaigns/launch] Unable to release sender lock:", error);
      }
    }
  }
}