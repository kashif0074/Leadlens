import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { google } from "googleapis";

export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
export const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export const GMAIL_OAUTH_STATE_COOKIE = "leadlens-gmail-oauth-state";

export type GmailOAuthState = {
  userId: string;
  campaignId: string;
  displayName: string;
  issuedAt: number;
  nonce: string;
};

export function getGoogleOAuthCredentials() {
  const clientId = process.env.AUTH_GOOGLE_ID ?? process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.AUTH_GOOGLE_SECRET ?? process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth client credentials are not configured on the server.");
  }
  return { clientId, clientSecret };
}

export function createGoogleOAuthClient(redirectUri?: string) {
  const { clientId, clientSecret } = getGoogleOAuthCredentials();
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function gmailOAuthCallbackUrl(origin: string) {
  const baseUrl = process.env.NEXTAUTH_URL?.trim() || origin;
  return new URL("/api/email-accounts/oauth/callback", baseUrl).toString();
}

function stateSecret() {
  const secret = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET or AUTH_SECRET is required for Gmail OAuth state.");
  return secret;
}

export function signGmailOAuthState(payload: Omit<GmailOAuthState, "issuedAt" | "nonce">) {
  const state: GmailOAuthState = {
    ...payload,
    issuedAt: Date.now(),
    nonce: randomBytes(24).toString("base64url"),
  };
  const encoded = Buffer.from(JSON.stringify(state)).toString("base64url");
  const signature = createHmac("sha256", stateSecret()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyGmailOAuthState(state: string, userId: string): GmailOAuthState | null {
  try {
    const [encoded, signature, extra] = state.split(".");
    if (!encoded || !signature || extra) return null;
    const expected = createHmac("sha256", stateSecret()).update(encoded).digest();
    const actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as GmailOAuthState;
    const age = Date.now() - parsed.issuedAt;
    if (
      parsed.userId !== userId ||
      !parsed.campaignId ||
      !parsed.nonce ||
      !Number.isFinite(age) ||
      age < 0 ||
      age > 10 * 60 * 1000
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}