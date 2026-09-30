import { google } from "googleapis";
import { db } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/crypto";
import {
  createGoogleOAuthClient,
  getGoogleOAuthCredentials,
} from "@/lib/googleOAuth";

type SendGmailParams = {
  emailAccountId: string;
  userId: string;
  to: string;
  subject: string;
  body: string;
  unsubscribeUrl?: string;
};

function base64UrlEncode(input: string): string {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function createMimeMessage({
  to,
  from,
  subject,
  body,
}: {
  to: string;
  from: string;
  subject: string;
  body: string;
}) {
  return [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    body,
  ].join("\r\n");
}

export async function sendGmailMessage({
  emailAccountId,
  userId,
  to,
  subject,
  body,
  unsubscribeUrl,
}: SendGmailParams) {
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
    throw new Error(
      "Reconnect required. Connect Gmail again before sending this campaign.",
    );
  }

  if (account.status !== "connected") {
    throw new Error(
      "Reconnect required. Connect Gmail again before sending this campaign.",
    );
  }

  let accessToken = account.accessToken
    ? decrypt(account.accessToken)
    : "";

  const tokenIsFresh =
    Boolean(accessToken) &&
    Boolean(account.tokenExpiresAt) &&
    account.tokenExpiresAt!.getTime() > Date.now() + 60_000;

  if (!tokenIsFresh) {
    const { clientId, clientSecret } = getGoogleOAuthCredentials();

    const oauth = createGoogleOAuthClient();

    oauth.setCredentials({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: decrypt(account.refreshToken),
    });

    try {
      const result = await oauth.getAccessToken();

      accessToken =
        result.token ||
        oauth.credentials.access_token ||
        "";

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
        ).response?.data?.error ||
        (error as { code?: string }).code;

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

        throw new Error(
          "Reconnect required. Gmail authorization expired or was revoked.",
        );
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

  const fromHeader = account.displayName
    ? `${account.displayName} <${account.email}>`
    : account.email;

  const finalBody = unsubscribeUrl
    ? `${body}\n\nTo stop receiving these emails, unsubscribe: ${unsubscribeUrl}`
    : body;

  const mimeMessage = createMimeMessage({
    to,
    from: fromHeader,
    subject,
    body: finalBody,
  });

  try {
    const result = await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: base64UrlEncode(mimeMessage),
      },
    });

    return {
      messageId: result.data.id || undefined,
    };
  } catch (error) {
    console.error("[Gmail API] Send failed:", error);

    const message =
      error instanceof Error
        ? error.message
        : "Gmail API failed to send the email.";

    if (
      /invalid_grant/i.test(message) ||
      /unauthorized/i.test(message) ||
      /401/i.test(message)
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

    throw new Error(message);
  }
}