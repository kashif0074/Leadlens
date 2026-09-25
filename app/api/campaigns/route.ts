import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { db } from "@/lib/db";
import { mapStoredCampaign } from "@/lib/campaigns";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized. Please sign in." }, { status: 401 });
    }

    const campaigns = await db.campaign.findMany({
      where: { userId: session.user.id },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json({
      campaigns: campaigns.map((campaign) => mapStoredCampaign(campaign)),
    });
  } catch (error) {
    console.error("[API /api/campaigns] Error loading campaigns:", error);
    return NextResponse.json({ error: "Unable to load saved campaigns." }, { status: 500 });
  }
}
