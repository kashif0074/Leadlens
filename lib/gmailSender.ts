import { db } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/crypto";
import { createGoogleOAuthClient, getGoogleOAuthCredentials } from "@/lib/googleOAuth";

export type GmailSenderCredentials = {
  email: string;
  displayName?: string;
  accessToken: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
};

export async function getGmailSenderCredentials(emailAccountId: string, userId: string): Promise<GmailSenderCredentials> {
  const account = await db.emailAccount.findFirst({
    where: { id: emailAccountId, userId },
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

  const accessToken = account.accessToken ? decrypt(account.accessToken) : "";
  const tokenIsFresh = Boolean(
    accessToken && account.tokenExpiresAt && account.tokenExpiresAt.getTime() > Date.now() + 60_000,
  );
  let refreshedAccessToken = accessToken;
  let expiresAt = account.tokenExpiresAt;

  if (!tokenIsFresh) {
    const oauth = createGoogleOAuthClient();
    oauth.setCredentials({ refresh_token: decrypt(account.refreshToken) });
    try {
      const result = await oauth.getAccessToken();
      refreshedAccessToken = result.token ?? oauth.credentials.access_token ?? "";
      expiresAt = oauth.credentials.expiry_date ? new Date(oauth.credentials.expiry_date) : null;
    } catch (error) {
      const code = (error as { response?: { data?: { error?: string } }; code?: string }).response?.data?.error;
      if (code === "invalid_grant") {
        await db.emailAccount.updateMany({
          where: { id: account.id, userId },
          data: { status: "reconnect_required" },
        });
        throw new Error("Reconnect required. Gmail authorization expired or was revoked.");
      }
      throw new Error("Unable to refresh Gmail authorization. Try again shortly.");
    }

    if (!refreshedAccessToken) {
      await db.emailAccount.updateMany({
        where: { id: account.id, userId },
        data: { status: "reconnect_required" },
      });
      throw new Error("Reconnect required. Gmail authorization expired or was revoked.");
    }

    await db.emailAccount.updateMany({
      where: { id: account.id, userId },
      data: {
        accessToken: encrypt(refreshedAccessToken),
        tokenExpiresAt: expiresAt,
        status: "connected",
      },
    });
  }

  const { clientId, clientSecret } = getGoogleOAuthCredentials();

  return {
    email: account.email,
    displayName: account.displayName || undefined,
    accessToken: refreshedAccessToken,
    clientId,
    clientSecret,
    refreshToken: decrypt(account.refreshToken),
  };
}