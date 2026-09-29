import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized. Please sign in." }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { campaignId?: string; email?: string; emailAccountId?: string; provider?: string };
    const email = body.email?.trim().toLowerCase();
    if (!body.campaignId || !email || !body.emailAccountId || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "A campaign, connected Gmail account, and valid email are required." }, { status: 400 });
    }

    const campaign = await db.campaign.findUnique({
      where: { id: body.campaignId },
      select: { id: true, userId: true },
    });
    if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    if (campaign.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden. You do not own this campaign." }, { status: 403 });
    }

    const account = await db.emailAccount.findFirst({
      where: { id: body.emailAccountId, userId: session.user.id, email },
      select: { id: true, email: true },
    });
    if (!account) {
      return NextResponse.json({ error: "Connect this Gmail account before adding it to the campaign." }, { status: 400 });
    }

    const providerName = body.provider?.trim() || "Google Workspace / Gmail";

    await db.campaign.update({
      where: { id: campaign.id },
      data: { connectedEmail: account.email, provider: providerName },
    });

    return NextResponse.json({ connectedEmail: account.email, provider: providerName });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to verify the sending inbox.";
    console.error("[API /api/campaigns/connect] Unable to save Gmail account:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}