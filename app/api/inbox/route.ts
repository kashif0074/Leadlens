import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { db } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { sendEmail, type SmtpCredentials } from "@/workers/processors/emailWorker";
import type { Lead } from "@/types";

export const runtime = "nodejs";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type InboxMessage = {
  id: string;
  deliveryId?: string;
  direction: "outbound" | "inbound";
  senderEmail: string;
  senderName?: string;
  recipient: string;
  recipientName?: string;
  subject: string;
  body: string;
  status: "Sent" | "Sending" | "Failed" | "Delivered" | "Replied" | "Pending";
  messageId?: string | null;
  error?: string | null;
  sentAt?: string | null;
  createdAt: string;
  step?: number;
};

export type InboxEmailItem = {
  id: string;
  threadId: string;
  folder: "inbox" | "sent";
  isUnread: boolean;
  senderEmail: string;
  senderName: string;
  recipientEmail: string;
  recipientName: string;
  subject: string;
  preview: string;
  body: string;
  status: string;
  date: string;
  campaignId?: string;
  campaignName?: string;
  leadId?: string;
  lead?: {
    id?: string;
    name: string;
    firstName?: string;
    lastName?: string;
    jobTitle?: string;
    role?: string;
    company?: string;
    industry?: string;
    location?: string;
    email: string;
    status?: string;
    matchScore?: number;
    matchReason?: string;
    verificationTag?: string;
  };
  messages: InboxMessage[];
};

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized. Please sign in." }, { status: 401 });
    }

    const userId = session.user.id;

    // 1. Fetch campaigns belonging to the user
    const campaigns = await db.campaign.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        connectedEmail: true,
        provider: true,
        status: true,
        selectedLeads: true,
        selectedLeadIds: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
    });

    const campaignIds = campaigns.map((c) => c.id);

    // 2. Fetch all email deliveries for user's campaigns
    const deliveries = campaignIds.length
      ? await db.emailDelivery.findMany({
          where: { campaignId: { in: campaignIds } },
          include: {
            campaign: {
              select: { id: true, name: true, connectedEmail: true },
            },
          },
          orderBy: { createdAt: "asc" },
        })
      : [];

    // 3. Fetch user's leads from database
    const dbLeads = await db.lead.findMany({
      where: {
        OR: [
          { userId },
          ...(campaignIds.length ? [{ campaignId: { in: campaignIds } }] : []),
        ],
      },
      orderBy: { updatedAt: "desc" },
    });

    // 4. Fetch connected email accounts
    const emailAccounts = await db.emailAccount.findMany({
      where: { userId },
      select: { id: true, email: true, displayName: true },
      orderBy: { createdAt: "desc" },
    });

    const userPrimaryEmail = emailAccounts[0]?.email || session.user.email || "you@leadlens.ai";
    const userDisplayName = emailAccounts[0]?.displayName || session.user.name || "You";

    // 5. Build lookup maps for leads
    const leadByEmailMap = new Map<string, Lead>();
    const leadByIdMap = new Map<string, Lead>();

    for (const lead of dbLeads) {
      const typedLead: Lead = {
        id: lead.id,
        name: lead.name,
        firstName: lead.firstName || undefined,
        lastName: lead.lastName || undefined,
        jobTitle: lead.jobTitle,
        role: (lead.role as Lead["role"]) || "Individual Contributor",
        function: lead.function || undefined,
        company: lead.company,
        industry: lead.industry,
        companySize: lead.companySize || "11-50",
        country: lead.country,
        state: lead.state || "",
        city: lead.city,
        location: lead.location,
        companyHeadquarters: lead.companyHeadquarters || undefined,
        email: lead.email,
        domain: lead.domain || undefined,
        verificationTag: (lead.verificationTag as Lead["verificationTag"]) || "Email verified",
        matchReason: lead.matchReason,
        matchScore: lead.matchScore,
        status: (lead.status as Lead["status"]) || "Contacted",
      };
      if (lead.email) leadByEmailMap.set(lead.email.toLowerCase().trim(), typedLead);
      if (lead.id) leadByIdMap.set(lead.id, typedLead);
    }

    for (const campaign of campaigns) {
      if (Array.isArray(campaign.selectedLeads)) {
        for (const rawLead of campaign.selectedLeads as unknown as Lead[]) {
          if (rawLead && rawLead.email) {
            const normalized = rawLead.email.toLowerCase().trim();
            if (!leadByEmailMap.has(normalized)) {
              leadByEmailMap.set(normalized, rawLead);
            }
          }
          if (rawLead && rawLead.id && !leadByIdMap.has(rawLead.id)) {
            leadByIdMap.set(rawLead.id, rawLead);
          }
        }
      }
    }

    // 6. Group into conversations
    const conversationMap = new Map<string, InboxEmailItem>();
    const sentItems: InboxEmailItem[] = [];
    const inboxItems: InboxEmailItem[] = [];

    for (const delivery of deliveries) {
      const recipientEmail = delivery.recipient.toLowerCase().trim();
      const leadInfo = leadByIdMap.get(delivery.leadId) || leadByEmailMap.get(recipientEmail);
      const convKey = recipientEmail || delivery.leadId;

      const leadDisplayName =
        leadInfo?.name ||
        (leadInfo?.firstName && leadInfo?.lastName
          ? `${leadInfo.firstName} ${leadInfo.lastName}`
          : recipientEmail.split("@")[0]);

      const isReplied = delivery.status === "Replied" || leadInfo?.status === "Replied" || leadInfo?.status === "Meeting Booked";

      const message: InboxMessage = {
        id: delivery.id,
        deliveryId: delivery.id,
        direction: delivery.status === "Replied" ? "inbound" : "outbound",
        senderEmail: delivery.senderEmail || delivery.campaign?.connectedEmail || userPrimaryEmail,
        senderName: delivery.status === "Replied" ? leadDisplayName : userDisplayName,
        recipient: delivery.recipient,
        recipientName: delivery.status === "Replied" ? userDisplayName : leadDisplayName,
        subject: delivery.subject,
        body: delivery.body,
        status: delivery.status as InboxMessage["status"],
        messageId: delivery.messageId,
        error: delivery.error,
        sentAt: delivery.sentAt ? delivery.sentAt.toISOString() : null,
        createdAt: delivery.createdAt.toISOString(),
        step: delivery.step,
      };

      if (!conversationMap.has(convKey)) {
        const item: InboxEmailItem = {
          id: delivery.id,
          threadId: convKey,
          folder: isReplied ? "inbox" : "sent",
          isUnread: isReplied,
          senderEmail: message.senderEmail,
          senderName: userDisplayName,
          recipientEmail: delivery.recipient,
          recipientName: leadDisplayName,
          subject: delivery.subject,
          preview: delivery.body.slice(0, 140).replace(/[\r\n]+/g, " "),
          body: delivery.body,
          status: delivery.status,
          date: message.sentAt || message.createdAt,
          campaignId: delivery.campaignId,
          campaignName: delivery.campaign?.name || "Outbound Campaign",
          leadId: leadInfo?.id || delivery.leadId,
          lead: {
            id: leadInfo?.id,
            name: leadDisplayName,
            firstName: leadInfo?.firstName,
            lastName: leadInfo?.lastName,
            jobTitle: leadInfo?.jobTitle || "Contact",
            role: leadInfo?.role,
            company: leadInfo?.company || "Organization",
            industry: leadInfo?.industry,
            location: leadInfo?.location,
            email: delivery.recipient,
            status: leadInfo?.status || (delivery.status === "Sent" ? "Contacted" : delivery.status),
            matchScore: leadInfo?.matchScore || 90,
            matchReason: leadInfo?.matchReason || "Discovered via ICP criteria",
            verificationTag: leadInfo?.verificationTag || "Email verified",
          },
          messages: [message],
        };
        conversationMap.set(convKey, item);
      } else {
        const existing = conversationMap.get(convKey)!;
        existing.messages.push(message);
        const msgDate = message.sentAt || message.createdAt;
        if (new Date(msgDate) > new Date(existing.date)) {
          existing.date = msgDate;
          existing.subject = delivery.subject;
          existing.preview = delivery.body.slice(0, 140).replace(/[\r\n]+/g, " ");
          existing.body = delivery.body;
          existing.status = delivery.status;
          if (isReplied) {
            existing.folder = "inbox";
            existing.isUnread = true;
          }
        }
      }

      // Also create an individual sent item record
      sentItems.push({
        id: delivery.id,
        threadId: convKey,
        folder: "sent",
        isUnread: false,
        senderEmail: message.senderEmail,
        senderName: userDisplayName,
        recipientEmail: delivery.recipient,
        recipientName: leadDisplayName,
        subject: delivery.subject,
        preview: delivery.body.slice(0, 140).replace(/[\r\n]+/g, " "),
        body: delivery.body,
        status: delivery.status,
        date: message.sentAt || message.createdAt,
        campaignId: delivery.campaignId,
        campaignName: delivery.campaign?.name || "Outbound Campaign",
        leadId: leadInfo?.id || delivery.leadId,
        lead: {
          id: leadInfo?.id,
          name: leadDisplayName,
          firstName: leadInfo?.firstName,
          lastName: leadInfo?.lastName,
          jobTitle: leadInfo?.jobTitle || "Contact",
          role: leadInfo?.role,
          company: leadInfo?.company || "Organization",
          industry: leadInfo?.industry,
          location: leadInfo?.location,
          email: delivery.recipient,
          status: leadInfo?.status || delivery.status,
          matchScore: leadInfo?.matchScore || 90,
          matchReason: leadInfo?.matchReason || "Discovered via ICP criteria",
          verificationTag: leadInfo?.verificationTag || "Email verified",
        },
        messages: [message],
      });
    }

    // Populate Inbox items from threads with replies or inbound messages
    for (const thread of conversationMap.values()) {
      if (thread.folder === "inbox" || thread.status === "Replied" || thread.lead?.status === "Replied" || thread.lead?.status === "Meeting Booked") {
        inboxItems.push({
          ...thread,
          folder: "inbox",
        });
      }
    }

    // Sort descending by date
    inboxItems.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    sentItems.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const allThreads = Array.from(conversationMap.values()).sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    const totalSent = deliveries.filter((d) => d.status === "Sent").length;
    const totalFailed = deliveries.filter((d) => d.status === "Failed").length;
    const unreadInboxCount = inboxItems.filter((i) => i.isUnread).length;

    return NextResponse.json({
      inboxItems,
      sentItems,
      threads: allThreads,
      stats: {
        inboxCount: inboxItems.length,
        unreadInboxCount,
        sentCount: sentItems.length,
        totalDeliveries: deliveries.length,
        totalSent,
        totalFailed,
        connectedAccountsCount: emailAccounts.length,
      },
      connectedAccounts: emailAccounts,
      currentUser: {
        email: userPrimaryEmail,
        name: userDisplayName,
      },
    });
  } catch (error) {
    console.error("[API /api/inbox] Error loading inbox conversations:", error);
    return NextResponse.json({ error: "Unable to load inbox conversations." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized. Please sign in." }, { status: 401 });
    }

    const userId = session.user.id;
    let body: {
      recipient?: unknown;
      subject?: unknown;
      body?: unknown;
      campaignId?: unknown;
      leadId?: unknown;
      senderEmail?: unknown;
    };

    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
    }

    const recipient = typeof body.recipient === "string" ? body.recipient.trim().toLowerCase() : "";
    const subject = typeof body.subject === "string" ? body.subject.trim() : "";
    const messageBody = typeof body.body === "string" ? body.body.trim() : "";
    const campaignId = typeof body.campaignId === "string" ? body.campaignId.trim() : "";
    const leadId = typeof body.leadId === "string" ? body.leadId.trim() : "";
    const senderEmail = typeof body.senderEmail === "string" ? body.senderEmail.trim().toLowerCase() : "";

    if (!recipient || !emailPattern.test(recipient)) {
      return NextResponse.json({ error: "A valid recipient email address is required." }, { status: 400 });
    }

    if (!subject) {
      return NextResponse.json({ error: "Email subject cannot be empty." }, { status: 400 });
    }

    if (!messageBody) {
      return NextResponse.json({ error: "Email message body cannot be empty." }, { status: 400 });
    }

    // Find the sending email account
    let emailAccount = null;
    if (senderEmail) {
      emailAccount = await db.emailAccount.findUnique({
        where: { userId_email: { userId, email: senderEmail } },
      });
    }

    if (!emailAccount) {
      emailAccount = await db.emailAccount.findFirst({
        where: { userId },
        orderBy: { createdAt: "desc" },
      });
    }

    if (!emailAccount) {
      return NextResponse.json(
        { error: "No connected Gmail account found. Please connect your Gmail account in Settings or Campaign Setup." },
        { status: 400 }
      );
    }

    // Decrypt credentials
    const appPassword = decrypt(emailAccount.appPassword);
    const credentials: SmtpCredentials = {
      email: emailAccount.email,
      appPassword,
      displayName: emailAccount.displayName || undefined,
    };

    // Find or assign campaign
    let targetCampaignId = campaignId;
    if (!targetCampaignId) {
      const existingCampaign = await db.campaign.findFirst({
        where: { userId },
        orderBy: { updatedAt: "desc" },
      });
      if (existingCampaign) {
        targetCampaignId = existingCampaign.id;
      } else {
        const newCampaign = await db.campaign.create({
          data: {
            userId,
            name: "Direct Outreach",
            prompt: "Direct outbound message from Inbox",
            status: "Live",
            selectedLeadIds: leadId ? [leadId] : [],
            selectedLeads: [],
            emails: [],
            connectedEmail: emailAccount.email,
          },
        });
        targetCampaignId = newCampaign.id;
      }
    }

    // Calculate next step number
    const prevDeliveryCount = await db.emailDelivery.count({
      where: {
        campaignId: targetCampaignId,
        recipient,
      },
    });

    // Send email using Nodemailer
    const sendResult = await sendEmail({
      to: recipient,
      subject,
      body: messageBody,
      fromName: credentials.displayName,
      credentials,
    });

    // Record delivery in database
    const delivery = await db.emailDelivery.create({
      data: {
        campaignId: targetCampaignId,
        leadId: leadId || `lead-${Date.now()}`,
        step: prevDeliveryCount + 1,
        recipient,
        senderEmail: emailAccount.email,
        subject,
        body: messageBody,
        status: "Sent",
        messageId: sendResult.messageId,
        sentAt: new Date(),
      },
    });

    // Update lead status in database if lead exists
    if (leadId) {
      await db.lead.updateMany({
        where: { id: leadId, userId },
        data: { status: "Contacted" },
      });
    }

    return NextResponse.json({
      success: true,
      message: "Email reply sent successfully.",
      delivery: {
        id: delivery.id,
        direction: "outbound",
        senderEmail: emailAccount.email,
        recipient,
        subject,
        body: messageBody,
        status: "Sent",
        messageId: sendResult.messageId,
        sentAt: delivery.sentAt?.toISOString(),
        createdAt: delivery.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("[API /api/inbox] Error sending email from inbox:", error);
    const message = error instanceof Error ? error.message : "Failed to send email reply.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized. Please sign in." }, { status: 401 });
    }

    const userId = session.user.id;
    let body: {
      leadId?: unknown;
      recipient?: unknown;
      status?: unknown;
    };

    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
    }

    const leadId = typeof body.leadId === "string" ? body.leadId.trim() : "";
    const recipient = typeof body.recipient === "string" ? body.recipient.trim().toLowerCase() : "";
    const status = typeof body.status === "string" ? body.status.trim() : "";

    const validStatuses = ["Contacted", "Replied", "Meeting Booked", "Discovered"];
    if (!status || !validStatuses.includes(status)) {
      return NextResponse.json({ error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` }, { status: 400 });
    }

    if (leadId) {
      await db.lead.updateMany({
        where: { id: leadId, userId },
        data: { status },
      });
    } else if (recipient) {
      await db.lead.updateMany({
        where: { email: recipient, userId },
        data: { status },
      });
    }

    return NextResponse.json({ success: true, status });
  } catch (error) {
    console.error("[API /api/inbox] Error updating conversation status:", error);
    return NextResponse.json({ error: "Unable to update status." }, { status: 500 });
  }
}
