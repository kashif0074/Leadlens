import { createHmac, timingSafeEqual } from "crypto";

type UnsubscribePayload = { userId: string; email: string };

function getSecret() {
  const secret = process.env.UNSUBSCRIBE_SECRET?.trim()
    || process.env.NEXTAUTH_SECRET?.trim()
    || process.env.AUTH_SECRET?.trim();
  if (!secret) throw new Error("A secret is required to create unsubscribe links.");
  return secret;
}

export function createUnsubscribeToken(userId: string, email: string) {
  const payload = Buffer.from(JSON.stringify({ userId, email: email.trim().toLowerCase() } satisfies UnsubscribePayload))
    .toString("base64url");
  const signature = createHmac("sha256", getSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyUnsubscribeToken(token: string): UnsubscribePayload | null {
  const [payload, signature, ...extra] = token.split(".");
  if (!payload || !signature || extra.length) return null;

  const expected = createHmac("sha256", getSecret()).update(payload).digest();
  let received: Buffer;
  try {
    received = Buffer.from(signature, "base64url");
  } catch {
    return null;
  }
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;

  try {
    const value: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!value || typeof value !== "object") return null;
    const candidate = value as Record<string, unknown>;
    if (typeof candidate.userId !== "string" || typeof candidate.email !== "string") return null;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate.email)) return null;
    return { userId: candidate.userId, email: candidate.email.toLowerCase() };
  } catch {
    return null;
  }
}

export function createUnsubscribeUrl(userId: string, email: string) {
  const baseUrl = process.env.NEXTAUTH_URL?.trim()
    || process.env.AUTH_URL?.trim()
    || (process.env.NODE_ENV === "development" ? "http://localhost:3000" : "");
  if (!baseUrl) throw new Error("Set NEXTAUTH_URL to the public HTTPS app URL before sending campaign email.");

  const url = new URL("/api/unsubscribe", baseUrl);
  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    throw new Error("NEXTAUTH_URL must use HTTPS for campaign unsubscribe links.");
  }
  url.searchParams.set("token", createUnsubscribeToken(userId, email));
  return url.toString();
}