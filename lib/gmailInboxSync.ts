import { google, type gmail_v1 } from "googleapis";
import { db } from "@/lib/db";
import { getGmailSenderCredentials } from "@/lib/gmailSender";
import { createGoogleOAuthClient } from "@/lib/googleOAuth";

const SYNC_INTERVAL_MS = 30_000;
const MAX_HISTORY_PAGES = 20;
const MAX_INITIAL_SEARCH_PAGES = 10;
const INITIAL_SEARCH_BATCH_SIZE = 20;

type SentDelivery = {
  id: string;
  campaignId: string;
  leadId: string;
  recipient: string;
  subject: string;
  messageId: string | null;
  gmailThreadId: string | null;
  sentAt: Date | null;
};

function decodeBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function collectBodyParts(payload: gmail_v1.Schema$MessagePart | null | undefined, mimeType: string): string[] {
  if (!payload) return [];
  const matches = payload.mimeType === mimeType && payload.body?.data
    ? [decodeBase64Url(payload.body.data)]
    : [];
  return [...matches, ...(payload.parts ?? []).flatMap((part) => collectBodyParts(part, mimeType))];
}

function htmlToText(value: string) {
  return value
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\/\s*\1\s*>/gi, " ")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*\/\s*p\s*>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function messageBody(message: gmail_v1.Schema$Message) {
  const plainText = collectBodyParts(message.payload, "text/plain").join("\n").trim();
  if (plainText) return plainText;
  const html = collectBodyParts(message.payload, "text/html").join("\n");
  return html ? htmlToText(html) : message.snippet ?? "";
}

function getHeader(message: gmail_v1.Schema$Message, name: string) {
  return message.payload?.headers?.find((header) => header.name?.toLowerCase() === name.toLowerCase())?.value?.trim() ?? "";
}

function parseMailbox(value: string) {
  const match = value.match(/^\s*(.*?)\s*<([^<>]+)>\s*$/);
  const email = (match?.[2] ?? value).trim().replace(/^mailto:/i, "").toLowerCase();
  const name = (match?.[1] ?? "").replace(/^"|"$/g, "").trim();
  return { email, name };
}

function parseMailboxList(value: string) {
  return value.split(/,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/).map(parseMailbox);
}

function apiStatus(error: unknown) {
  return (error as { code?: number; response?: { status?: number } })?.response?.status ??
    (error as { code?: number })?.code;
}

function normalizeSubject(subject: string) {
  return subject.replace(/^(\s*(re|fw|fwd):\s*)+/i, "").trim().toLowerCase();
}

async function listInitialReplyMessages(
  gmail: gmail_v1.Gmail,
  senderEmail: string,
  recipients: string[],
) {
  const ids = new Map<string, string>();
  for (let offset = 0; offset < recipients.length; offset += INITIAL_SEARCH_BATCH_SIZE) {
    const batch = recipients.slice(offset, offset + INITIAL_SEARCH_BATCH_SIZE);
    const query = `in:inbox to:${senderEmail} {${batch.map((email) => `from:${email}`).join(" ")}}`;
    let pageToken: string | undefined;
    for (let page = 0; page < MAX_INITIAL_SEARCH_PAGES; page++) {
      const result = await gmail.users.messages.list({
        userId: "me",
        q: query,
        maxResults: 100,
        pageToken,
      });
      for (const message of result.data.messages ?? []) {
        if (message.id && message.threadId) ids.set(message.id, message.threadId);
      }
      pageToken = result.data.nextPageToken ?? undefined;
      if (!pageToken) break;
    }
  }
  return ids;
}

async function findLegacyDeliveryForThread(
  gmail: gmail_v1.Gmail,
  threadId: string,
  senderEmail: string,
  deliveries: SentDelivery[],
) {
  const thread = await gmail.users.threads.get({ userId: "me", id: threadId, format: "full" });
  const originalMessages = thread.data.messages ?? [];
  const matchingSentMessages = originalMessages.filter((message) =>
    parseMailbox(getHeader(message, "From")).email === senderEmail.toLowerCase(),
  );
  const matchingDeliveries = deliveries.filter((delivery) =>
    matchingSentMessages.some((message) =>
      parseMailboxList(getHeader(message, "To")).some((recipient) => recipient.email === delivery.recipient.toLowerCase()) &&
      normalizeSubject(getHeader(message, "Subject")) === normalizeSubject(delivery.subject),
    ),
  );
  if (!matchingDeliveries.length) return null;

  const sentAt = matchingSentMessages
    .map((message) => Number(message.internalDate) || 0)
    .find(Boolean) ?? 0;
  return matchingDeliveries.sort((left, right) =>
    Math.abs((left.sentAt?.getTime() ?? 0) - sentAt) -
    Math.abs((right.sentAt?.getTime() ?? 0) - sentAt),
  )[0];
}

export async function syncGmailInbox(userId: string) {
  const campaigns = await db.campaign.findMany({
    where: {
      userId,
      emailAccountId: { not: null },
      emailDeliveries: { some: { status: "Sent", messageId: { not: null } } },
    },
    select: {
      id: true,
      emailAccountId: true,
      emailDeliveries: {
        where: { status: "Sent", messageId: { not: null } },
        select: {
          id: true,
          campaignId: true,
          leadId: true,
          recipient: true,
          subject: true,
          messageId: true,
          gmailThreadId: true,
          sentAt: true,
        },
        orderBy: { sentAt: "desc" },
      },
    },
  });

  const byAccount = new Map<string, SentDelivery[]>();
  for (const campaign of campaigns) {
    if (!campaign.emailAccountId) continue;
    const deliveries = byAccount.get(campaign.emailAccountId) ?? [];
    deliveries.push(...campaign.emailDeliveries as SentDelivery[]);
    byAccount.set(campaign.emailAccountId, deliveries);
  }

  let importedCount = 0;
  for (const [emailAccountId, deliveries] of byAccount) {
    const account = await db.emailAccount.findFirst({
      where: { id: emailAccountId, userId, status: "connected" },
      select: { id: true, email: true, gmailHistoryId: true, lastInboxSyncAt: true },
    });
    if (!account) continue;
    if (account.lastInboxSyncAt && Date.now() - account.lastInboxSyncAt.getTime() < SYNC_INTERVAL_MS) continue;

    const lock = await db.emailAccount.updateMany({
      where: {
        id: account.id,
        userId,
        status: "connected",
        OR: [
          { lastInboxSyncAt: null },
          { lastInboxSyncAt: { lt: new Date(Date.now() - SYNC_INTERVAL_MS) } },
        ],
      },
      data: { lastInboxSyncAt: new Date() },
    });
    if (!lock.count) continue;

    try {
      const credentials = await getGmailSenderCredentials(account.id, userId);
      const oauth = createGoogleOAuthClient();
      oauth.setCredentials({
        access_token: credentials.accessToken,
        refresh_token: credentials.refreshToken,
      });
      const gmail = google.gmail({ version: "v1", auth: oauth });

      const threadMap = new Map<string, SentDelivery>();
      const messageMap = new Map<string, SentDelivery>();
      for (const delivery of deliveries) {
        if (delivery.messageId) messageMap.set(delivery.messageId, delivery);
        if (delivery.gmailThreadId) threadMap.set(delivery.gmailThreadId, delivery);
      }

      for (const delivery of deliveries) {
        if (!delivery.messageId || delivery.gmailThreadId) continue;
        try {
          const sentMessage = await gmail.users.messages.get({
            userId: "me",
            id: delivery.messageId,
            format: "metadata",
          });
          const threadId = sentMessage.data.threadId;
          if (!threadId) continue;
          await db.emailDelivery.updateMany({
            where: { id: delivery.id, campaignId: delivery.campaignId },
            data: { gmailThreadId: threadId },
          });
          delivery.gmailThreadId = threadId;
          threadMap.set(threadId, delivery);
        } catch (error) {
          if (apiStatus(error) === 401 || apiStatus(error) === 403) throw error;
        }
      }

      let candidateMessages = new Map<string, string>();
      let nextHistoryId = account.gmailHistoryId;
      if (account.gmailHistoryId) {
        try {
          let pageToken: string | undefined;
          for (let page = 0; page < MAX_HISTORY_PAGES; page++) {
            const result = await gmail.users.history.list({
              userId: "me",
              startHistoryId: account.gmailHistoryId,
              historyTypes: ["messageAdded"],
              maxResults: 500,
              pageToken,
            });
            for (const history of result.data.history ?? []) {
              for (const entry of history.messagesAdded ?? []) {
                const message = entry.message;
                if (message?.id && message.threadId) candidateMessages.set(message.id, message.threadId);
              }
            }
            pageToken = result.data.nextPageToken ?? undefined;
            if (!pageToken) {
              nextHistoryId = result.data.historyId ?? nextHistoryId;
              break;
            }
          }
        } catch (error) {
          if (apiStatus(error) !== 404) throw error;
          nextHistoryId = null;
        }
      }

      if (!nextHistoryId || !account.gmailHistoryId) {
        const recipients = Array.from(new Set(deliveries.map((delivery) => delivery.recipient.trim().toLowerCase())))
          .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
        candidateMessages = await listInitialReplyMessages(gmail, account.email, recipients);
        const profile = await gmail.users.getProfile({ userId: "me" });
        nextHistoryId = profile.data.historyId ?? nextHistoryId;
      }

      for (const [gmailMessageId, listedThreadId] of candidateMessages) {
        let delivery = threadMap.get(listedThreadId) ?? messageMap.get(gmailMessageId);
        if (!delivery) {
          try {
            delivery = await findLegacyDeliveryForThread(gmail, listedThreadId, account.email, deliveries) ?? undefined;
            if (delivery) {
              delivery.gmailThreadId = listedThreadId;
              threadMap.set(listedThreadId, delivery);
              await db.emailDelivery.updateMany({
                where: { id: delivery.id, campaignId: delivery.campaignId },
                data: { gmailThreadId: listedThreadId },
              });
            }
          } catch (error) {
            if (apiStatus(error) !== 404) throw error;
          }
        }
        if (!delivery) continue;

        let result;
        try {
          result = await gmail.users.messages.get({
            userId: "me",
            id: gmailMessageId,
            format: "full",
          });
        } catch (error) {
          if (apiStatus(error) === 404) continue;
          throw error;
        }
        const message = result.data;
        if (!message.id || !message.threadId || !message.labelIds?.includes("INBOX")) continue;

        const from = parseMailbox(getHeader(message, "From"));
        if (
          !from.email ||
          from.email === account.email.toLowerCase() ||
          from.email !== delivery.recipient.trim().toLowerCase()
        ) continue;
        const recipients = parseMailboxList(getHeader(message, "To"));
        if (!recipients.some((recipient) => recipient.email === account.email.toLowerCase())) continue;

        const saved = await db.inboundEmail.upsert({
          where: {
            emailAccountId_gmailMessageId: {
              emailAccountId: account.id,
              gmailMessageId: message.id,
            },
          },
          create: {
            userId,
            emailAccountId: account.id,
            campaignId: delivery.campaignId,
            deliveryId: delivery.id,
            leadId: delivery.leadId,
            gmailMessageId: message.id,
            gmailThreadId: message.threadId,
            senderEmail: from.email,
            senderName: from.name || null,
            recipientEmail: account.email,
            subject: getHeader(message, "Subject") || "(No subject)",
            body: messageBody(message),
            receivedAt: new Date(Number(message.internalDate) || Date.now()),
          },
          update: {},
          select: { id: true },
        });
        if (saved.id) importedCount++;
        await db.lead.updateMany({
          where: { id: delivery.leadId, userId },
          data: { status: "Replied" },
        });
      }

      await db.emailAccount.updateMany({
        where: { id: account.id, userId },
        data: {
          gmailHistoryId: nextHistoryId,
          lastInboxSyncAt: new Date(),
        },
      });
    } catch (error) {
      if (apiStatus(error) === 401 || apiStatus(error) === 403) {
        await db.emailAccount.updateMany({
          where: { id: account.id, userId },
          data: { status: "reconnect_required" },
        });
      }
      console.error(`[Gmail Inbox Sync] Failed for ${account.email}:`, error);
    }
  }

  return importedCount;
}