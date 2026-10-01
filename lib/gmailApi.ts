import { google } from "googleapis";
import { db } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/crypto";
import { createGoogleOAuthClient } from "@/lib/googleOAuth";
import { buildCompliantMimeMessage, encodeMimeHeaderValue, sanitizeMimeHeader } from "@/lib/emailDeliverability";

export type SendGmailParams = {
  emailAccountId: string;
  userId: string;
  to: string;
  subject: string;
  body: string;
  threadId?: string;
  inReplyTo?: string;
  references?: string;
  unsubscribeUrl?: string;
  deliveryId?: string;
};

function formatFromHeader(displayName: string, email: string): string {
  const cleanName = sanitizeMimeHeader(displayName);
  if (!cleanName) return email;
  const formattedName = /[^\x20-\x7e]/.test(cleanName)
    ? encodeMimeHeaderValue(cleanName)
    : `"${cleanName.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;
  return `${formattedName} <${email}>`;
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Sends an email via Google Gmail API with OAuth2 credentials.
 * Formats RFC-compliant multipart/alternative MIME message (plain text + clean HTML)
 * and applies rate-limit backoff on transient network/quota errors.
 */
export async function sendGmailMessage({
  emailAccountId,
  userId,
  to,
  subject,
  body,
  threadId,
  inReplyTo,
  references,
  unsubscribeUrl,
  deliveryId,
}: SendGmailParams): Promise<{ messageId?: string; threadId?: string }> {
  const account = await db.emailAccount.findFirst({
    where: {
      id: emailAccountId,
      userId,
    },
    select: {
      id: true,
      email: true,
      displayName: true,
      accessToken: true,
      refreshToken: true,
      tokenExpiresAt: true,
      status: true,
    },
  });

  if (!account || !account.refreshToken) {
    throw new Error("Reconnect required. Connect Gmail again before sending this campaign.");
  }

  if (account.status !== "connected") {
    throw new Error("Reconnect required. Connect Gmail again before sending this campaign.");
  }

  let accessToken = account.accessToken ? decrypt(account.accessToken) : "";

  const tokenIsFresh =
    Boolean(accessToken) &&
    Boolean(account.tokenExpiresAt) &&
    account.tokenExpiresAt!.getTime() > Date.now() + 60_000;

  if (!tokenIsFresh) {
    const oauth = createGoogleOAuthClient();

    oauth.setCredentials({
      refresh_token: decrypt(account.refreshToken),
    });

    try {
      const result = await oauth.getAccessToken();

      accessToken = result.token || oauth.credentials.access_token || "";

      const expiresAt = oauth.credentials.expiry_date
        ? new Date(oauth.credentials.expiry_date)
        : null;

      if (!accessToken) {
        throw new Error("Google did not provide a new access token.");
      }

      await db.emailAccount.updateMany({
        where: {
          id: account.id,
          userId,
        },
        data: {
          accessToken: encrypt(accessToken),
          tokenExpiresAt: expiresAt,
          status: "connected",
        },
      });
    } catch (error) {
      const code =
        (
          error as {
            response?: {
              data?: {
                error?: string;
              };
            };
            code?: string;
          }
        ).response?.data?.error || (error as { code?: string }).code;

      if (code === "invalid_grant") {
        await db.emailAccount.updateMany({
          where: {
            id: account.id,
            userId,
          },
          data: {
            status: "reconnect_required",
          },
        });

        throw new Error("Reconnect required. Gmail authorization expired or was revoked.");
      }

      throw new Error("Unable to refresh Gmail authorization.");
    }
  }

  const oauth = createGoogleOAuthClient();

  oauth.setCredentials({
    access_token: accessToken,
    refresh_token: decrypt(account.refreshToken),
  });

  const gmail = google.gmail({
    version: "v1",
    auth: oauth,
  });

  const fromHeader = formatFromHeader(account.displayName ?? "", account.email);
  const rawSenderDomain = account.email.includes("@") ? account.email.split("@")[1].toLowerCase() : "gmail.com";
  const senderDomain = /^[a-z0-9.-]+$/.test(rawSenderDomain) ? rawSenderDomain : "gmail.com";
  const safeDeliveryId = deliveryId?.replace(/[^a-zA-Z0-9_-]/g, "");
  const rfcMessageId = safeDeliveryId ? `<leadlens-${safeDeliveryId}@${senderDomain}>` : undefined;

  // Build clean, standard multipart MIME message (text + HTML + headers)
  const mimeMessage = buildCompliantMimeMessage({
    to,
    from: fromHeader,
    replyTo: account.email,
    subject,
    messageId: rfcMessageId,
    plainText: body,
    inReplyTo,
    references,
    unsubscribeUrl,
    senderDomain,
  });

  // Queue retries are delayed and persistent; the stable Message-ID lets them detect an accepted send.
  let attempts = 0;
  const maxAttempts = 1;

  while (attempts < maxAttempts) {
    attempts++;
    try {
      if (rfcMessageId) {
        const existing = await gmail.users.messages.list({
          userId: "me",
          q: `in:sent rfc822msgid:${rfcMessageId.slice(1, -1)}`,
          maxResults: 1,
        });
        const existingMessage = existing.data.messages?.[0];
        if (existingMessage?.id) {
          return { messageId: existingMessage.id, threadId: existingMessage.threadId || undefined };
        }
      }

      const result = await gmail.users.messages.send({
        userId: "me",
        requestBody: {
          raw: base64UrlEncode(mimeMessage),
          ...(threadId ? { threadId } : {}),
        },
      });

      return {
        messageId: result.data.id || undefined,
        threadId: result.data.threadId || undefined,
      };
    } catch (error) {
      const errorStr = error instanceof Error ? error.message : String(error);
      const isRateLimit = /429|rateLimitExceeded|userRateLimitExceeded|quotaExceeded/i.test(errorStr);
      const isTransient = isRateLimit || /503|backendError|socket|timeout|ECONNRESET/i.test(errorStr);

      if (isTransient && attempts < maxAttempts) {
        // Exponential backoff with random jitter (2000ms - 4000ms)
        const delay = 2000 + Math.floor(Math.random() * 2000);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      console.error("[Gmail API] Send failed:", error);

      if (
        /invalid_grant/i.test(errorStr) ||
        /unauthorized/i.test(errorStr) ||
        /401/i.test(errorStr)
      ) {
        await db.emailAccount.updateMany({
          where: {
            id: account.id,
            userId,
          },
          data: {
            status: "reconnect_required",
          },
        });
      }

      throw new Error(errorStr);
    }
  }

  throw new Error("Gmail API send failed after retry attempts.");
}