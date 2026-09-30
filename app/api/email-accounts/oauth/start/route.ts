import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/auth";
import { db } from "@/lib/db";
import { createGoogleOAuthClient, GMAIL_OAUTH_STATE_COOKIE, GMAIL_SEND_SCOPE, gmailOAuthCallbackUrl, signGmailOAuthState } from "@/lib/googleOAuth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in before connecting Gmail." }, { status: 401 });

  const campaignId = request.nextUrl.searchParams.get("campaignId")?.trim() ?? "";
  const displayName = (request.nextUrl.searchParams.get("displayName") ?? "").trim().replace(/\s+/g, " ");
  if (!campaignId || displayName.length > 80 || /[\r\n\u0000-\u001f\u007f]/.test(displayName)) {
    return NextResponse.json({ error: "A valid campaign and sender name are required." }, { status: 400 });
  }

  const campaign = await db.campaign.findFirst({
    where: { id: campaignId, userId: session.user.id },
    select: { id: true },
  });
  if (!campaign) return NextResponse.json({ error: "Campaign not found or access denied." }, { status: 404 });

  try {
    const state = signGmailOAuthState({ userId: session.user.id, campaignId, displayName });
    const callbackUrl = gmailOAuthCallbackUrl(request.nextUrl.origin);
    const oauth = createGoogleOAuthClient(callbackUrl);
    const authorizationUrl = oauth.generateAuthUrl({
      access_type: "offline",
      include_granted_scopes: true,
      prompt: "consent select_account",
      scope: ["openid", "email", "profile", GMAIL_SEND_SCOPE],
      state,
    });
    const response = NextResponse.redirect(authorizationUrl);
    response.cookies.set(GMAIL_OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      secure: request.nextUrl.protocol === "https:",
      sameSite: "lax",
      path: "/api/email-accounts/oauth",
      maxAge: 10 * 60,
    });
    return response;
  } catch (error) {
    console.error("[Gmail OAuth] Unable to start authorization:", error);
    return NextResponse.json({ error: "Unable to start Gmail authorization." }, { status: 500 });
  }
}