import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyUnsubscribeToken } from "@/lib/unsubscribe";

export const runtime = "nodejs";

function readPayload(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  return token ? verifyUnsubscribeToken(token) : null;
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  if (!readPayload(request)) {
    return new NextResponse("Invalid unsubscribe link.", { status: 400 });
  }

  return new NextResponse(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Email preferences</title><body style="font-family:Arial,sans-serif;max-width:560px;margin:64px auto;padding:0 20px;color:#202124"><h1>Unsubscribe from these emails?</h1><p>Confirm below to stop receiving campaign email sent through LeadLens.</p><form method="post" action="/api/unsubscribe?token=${encodeURIComponent(token)}"><button style="padding:12px 18px" type="submit">Unsubscribe</button></form></body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );
}

export async function POST(request: NextRequest) {
  const payload = readPayload(request);
  if (!payload) return new NextResponse("Invalid unsubscribe link.", { status: 400 });

  try {
    const userExists = await db.user.findUnique({ where: { id: payload.userId }, select: { id: true } });
    if (userExists) {
      await db.emailSuppression.upsert({
        where: { userId_email: { userId: payload.userId, email: payload.email } },
        create: { userId: payload.userId, email: payload.email },
        update: {},
      });
    }
    return new NextResponse("You have been unsubscribed.", {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[API /api/unsubscribe] Unable to save suppression:", error);
    return new NextResponse("Unable to process unsubscribe request. Please try again.", { status: 500 });
  }
}