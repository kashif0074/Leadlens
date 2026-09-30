import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/auth";
import { encrypt } from "@/lib/crypto";
import { db } from "@/lib/db";
import { createGoogleOAuthClient, GMAIL_OAUTH_STATE_COOKIE, GMAIL_READONLY_SCOPE, GMAIL_SEND_SCOPE, gmailOAuthCallbackUrl, verifyGmailOAuthState } from "@/lib/googleOAuth";
import { google } from "googleapis";

export const runtime = "nodejs";

function popupResponse(origin: string, payload: { type: "leadlens:gmail-oauth"; account?: { id: string; email: string; displayName: string; status: string }; error?: string }) {
  const message = JSON.stringify(payload).replace(/</g, "\\u003c");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Gmail connection</title></head><body><script>window.opener?.postMessage(${message}, ${JSON.stringify(origin)});window.close();</script><p>Gmail connection complete. You may close this window.</p></body></html>`;
  const response = new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
      "X-Content-Type-Options": "nosniff",
    },
  });
  response.cookies.set(GMAIL_OAUTH_STATE_COOKIE, "", {
    httpOnly: true,
    secure: origin.startsWith("https://"),
    sameSite: "lax",
    path: "/api/email-accounts/oauth",
    maxAge: 0,
  });
  return response;
}

export async function GET(request: NextRequest) {
  const origin = new URL(process.env.NEXTAUTH_URL?.trim() || request.nextUrl.origin).origin;
  const stateParam = request.nextUrl.searchParams.get("state") ?? "";
  const cookieState = request.cookies.get(GMAIL_OAUTH_STATE_COOKIE)?.value ?? "";
  const session = await getServerSession(authOptions);
  const state = session?.user?.id && cookieState === stateParam
    ? verifyGmailOAuthState(stateParam, session.user.id)
    : null;

  if (!state) return popupResponse(origin, { type: "leadlens:gmail-oauth", error: "Gmail authorization could not be verified. Please try again." });
  if (request.nextUrl.searchParams.has("error")) {
    return popupResponse(origin, { type: "leadlens:gmail-oauth", error: "Gmail authorization was cancelled." });
  }
  const code = request.nextUrl.searchParams.get("code");
  if (!code) return popupResponse(origin, { type: "leadlens:gmail-oauth", error: "Google did not return an authorization code." });

  try {
    const campaign = await db.campaign.findFirst({
      where: { id: state.campaignId, userId: session!.user!.id },
      select: { id: true },
    });
    if (!campaign) return popupResponse(origin, { type: "leadlens:gmail-oauth", error: "Campaign not found or access denied." });

    const oauth = createGoogleOAuthClient(gmailOAuthCallbackUrl(origin));
    const { tokens } = await oauth.getToken(code);
    if (!tokens.access_token) throw new Error("Google did not provide an access token.");
    const grantedScopes = tokens.scope?.split(/\s+/) ?? [];
    if (!grantedScopes.includes(GMAIL_SEND_SCOPE) || !grantedScopes.includes(GMAIL_READONLY_SCOPE)) {
      throw new Error("Gmail send and inbox read permissions were not granted. Reconnect and approve the Gmail access request.");
    }
    oauth.setCredentials(tokens);
    const userInfo = await google.oauth2({ version: "v2", auth: oauth }).userinfo.get();
    const gmailProfile = await google.gmail({ version: "v1", auth: oauth }).users.getProfile({ userId: "me" });
    const email = userInfo.data.email?.trim().toLowerCase();
    if (!email || !userInfo.data.verified_email) throw new Error("Google did not verify the selected Gmail address.");

    const existing = await db.emailAccount.findUnique({
      where: { userId_email: { userId: session!.user!.id, email } },
      select: { refreshToken: true },
    });
    const refreshToken = tokens.refresh_token
      ? encrypt(tokens.refresh_token)
      : existing?.refreshToken;
    if (!refreshToken) throw new Error("Google did not return a refresh token. Reconnect and approve the Gmail access request.");

    const account = await db.emailAccount.upsert({
      where: { userId_email: { userId: session!.user!.id, email } },
      create: {
        userId: session!.user!.id,
        email,
        displayName: state.displayName,
        accessToken: encrypt(tokens.access_token),
        refreshToken,
        tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        gmailHistoryId: gmailProfile.data.historyId ?? null,
        status: "connected",
      },
      update: {
        displayName: state.displayName,
        accessToken: encrypt(tokens.access_token),
        refreshToken,
        tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        status: "connected",
      },
      select: { id: true, email: true, displayName: true, status: true },
    });

    return popupResponse(origin, { type: "leadlens:gmail-oauth", account });
  } catch (error) {
    console.error("[Gmail OAuth] Callback failed:", error);
    const message = error instanceof Error ? error.message : "Gmail authorization failed.";
    return popupResponse(origin, { type: "leadlens:gmail-oauth", error: message });
  }
}