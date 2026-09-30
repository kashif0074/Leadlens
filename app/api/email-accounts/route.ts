import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  try {
    const accounts = await db.emailAccount.findMany({
      where: { userId: session.user.id },
      select: { id: true, email: true, displayName: true, status: true, createdAt: true },
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

export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const accountId = request.nextUrl.searchParams.get("accountId")?.trim() ?? "";
  if (!accountId) return NextResponse.json({ error: "A Gmail account is required." }, { status: 400 });

  try {
    const account = await db.emailAccount.findFirst({
      where: { id: accountId, userId: session.user.id },
      select: { id: true, sendLockUntil: true },
    });
    if (!account) return NextResponse.json({ error: "Gmail account not found." }, { status: 404 });
    if (account.sendLockUntil && account.sendLockUntil > new Date()) {
      return NextResponse.json({ error: "This Gmail account is sending a campaign. Disconnect it after sending finishes." }, { status: 409 });
    }

    await db.$transaction([
      db.campaign.updateMany({
        where: { userId: session.user.id, emailAccountId: account.id },
        data: { emailAccountId: null, connectedEmail: null, provider: null },
      }),
      db.emailAccount.delete({ where: { id: account.id } }),
    ]);
    return NextResponse.json({ disconnected: true });
  } catch (error) {
    console.error("[API /api/email-accounts] Unable to disconnect Gmail account:", error);
    return NextResponse.json({ error: "Unable to disconnect the Gmail account." }, { status: 500 });
  }
}