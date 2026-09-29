import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { db } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import nodemailer from "nodemailer";

export const runtime = "nodejs";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { email?: unknown; appPassword?: unknown; displayName?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "A valid JSON body is required." }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const appPassword = typeof body.appPassword === "string" ? body.appPassword.replace(/\s+/g, "") : "";
  const displayName = typeof body.displayName === "string" ? body.displayName.trim().replace(/\s+/g, " ") : "";
  if (
    !emailPattern.test(email) ||
    appPassword.length !== 16 ||
    !displayName ||
    displayName.length > 80 ||
    /[\r\n\u0000-\u001f\u007f]/.test(displayName)
  ) {
    return NextResponse.json({ error: "Enter a sender name, valid email, and 16-character Gmail App Password." }, { status: 400 });
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: email, pass: appPassword },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
  });

  try {
    await transporter.verify();
  } catch {
    return NextResponse.json({ error: "Gmail rejected these credentials. Check the app password." }, { status: 400 });
  } finally {
    transporter.close();
  }

  try {
    const account = await db.emailAccount.upsert({
      where: { userId_email: { userId: session.user.id, email } },
      create: { userId: session.user.id, email, displayName, appPassword: encrypt(appPassword) },
      update: { displayName, appPassword: encrypt(appPassword) },
      select: { id: true, email: true, displayName: true },
    });

    return NextResponse.json(account);
  } catch (error) {
    console.error("[API /api/email-accounts] Unable to save Gmail account:", error);
    return NextResponse.json({ error: "Unable to save the Gmail account." }, { status: 500 });
  }
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  try {
    const accounts = await db.emailAccount.findMany({
      where: { userId: session.user.id },
      select: { id: true, email: true, displayName: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ accounts });
  } catch (error) {
    console.error("[API /api/email-accounts] Unable to load Gmail accounts:", error);
    return NextResponse.json({ error: "Unable to load Gmail accounts." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: { accountId?: unknown; displayName?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "A valid JSON body is required." }, { status: 400 });
  }

  const accountId = typeof body.accountId === "string" ? body.accountId.trim() : "";
  const displayName = typeof body.displayName === "string" ? body.displayName.trim().replace(/\s+/g, " ") : "";
  if (!accountId || !displayName || displayName.length > 80 || /[\r\n\u0000-\u001f\u007f]/.test(displayName)) {
    return NextResponse.json({ error: "Enter a valid sender name." }, { status: 400 });
  }

  try {
    const updated = await db.emailAccount.updateMany({
      where: { id: accountId, userId: session.user.id },
      data: { displayName },
    });
    if (!updated.count) return NextResponse.json({ error: "Gmail account not found." }, { status: 404 });

    const account = await db.emailAccount.findFirst({
      where: { id: accountId, userId: session.user.id },
      select: { id: true, email: true, displayName: true },
    });
    return NextResponse.json(account);
  } catch (error) {
    console.error("[API /api/email-accounts] Unable to update sender name:", error);
    return NextResponse.json({ error: "Unable to update the sender name." }, { status: 500 });
  }
}