import { NextRequest, NextResponse } from "next/server";
import { sendDueFollowUps } from "@/lib/sendDueFollowUps";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    let targetCampaignId: string | undefined = undefined;

    try {
      const body = await request.json();
      if (body && typeof body.campaignId === "string") {
        targetCampaignId = body.campaignId;
      }
    } catch {
      // Body is optional
    }

    // Process due follow-ups
    const summary = await sendDueFollowUps(targetCampaignId);

    return NextResponse.json({
      success: true,
      summary,
    });
  } catch (error) {
    console.error("[Follow-ups API] Error executing follow-ups:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to execute follow-ups scheduler.",
      },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
