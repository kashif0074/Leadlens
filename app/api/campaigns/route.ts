import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { db } from "@/lib/db";
import { mapStoredCampaign } from "@/lib/campaigns";
import "@/lib/scheduler";

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
      include: {
        emailDeliveries: {
          orderBy: { createdAt: "asc" },
          take: 1,
          select: { subject: true, recipient: true },
        },
      },
    });

    return NextResponse.json({
      campaigns: campaigns.map((campaign) => {
        const mapped = mapStoredCampaign(campaign);
        if (!/^(?:(?:csv|direct|outbound)\s+)?(?:campaign|outreach)\b/i.test(campaign.name.trim())) {
          return mapped;
        }

        const companies = Array.from(new Set((mapped.selectedLeads ?? []).map((lead) => lead.company.trim())))
          .filter((company) => company && company.toLowerCase() !== "enterprise");
        const companySummary = companies.slice(0, 3).join(", ") + (companies.length > 3 ? " and more" : "");
        const contactSummary = (mapped.selectedLeads ?? [])
          .slice(0, 3)
          .map((lead) => (/^Lead \d+$/i.test(lead.name.trim()) ? lead.email : lead.name || lead.email))
          .filter(Boolean)
          .join(", ");
        const delivery = campaign.emailDeliveries[0];
        const prompt = campaign.prompt.trim();
        const specificPrompt = /^(?:direct outbound message from inbox|outreach campaign for \d+ imported prospects)/i.test(prompt)
          ? ""
          : prompt;
        const displayName = companySummary || contactSummary || delivery?.subject.trim() || delivery?.recipient || specificPrompt;

        return displayName ? { ...mapped, displayName } : mapped;
      }),
    });
  } catch (error) {
    console.error("[API /api/campaigns] Error loading campaigns:", error);
    return NextResponse.json({ error: "Unable to load saved campaigns." }, { status: 500 });
  }
}