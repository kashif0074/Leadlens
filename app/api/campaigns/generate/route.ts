import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { db } from "@/lib/db";
import { generateCampaignEmails } from "@/lib/grok";
import type { Campaign, Lead } from "@/types";

export const runtime = "nodejs";

type RequestBody = {
  prompt?: string;
  name?: string;
  selectedLeadIds?: string[];
  selectedLeads?: Lead[];
  campaignId?: string;
  instruction?: string;
  currentSequence?: Campaign["sequence"];
  preview?: boolean;
};

function errorResponse(error: unknown) {
  const status =
    typeof error === "object" && error && "status" in error && typeof error.status === "number"
      ? error.status
      : 500;
  const message = error instanceof Error ? error.message : "Campaign generation failed.";
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized. Please sign in to create campaigns." }, { status: 401 });
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const prompt = body.prompt?.trim();
  const selectedLeads = Array.isArray(body.selectedLeads) ? body.selectedLeads : [];
  const selectedLeadIds = Array.isArray(body.selectedLeadIds)
    ? body.selectedLeadIds
    : selectedLeads.map((lead) => lead.id);

  if (!prompt || prompt.length < 10) {
    return NextResponse.json(
      { error: "Please describe your campaign offer in more detail (at least 10 characters)." },
      { status: 400 },
    );
  }
  if (!selectedLeads.length) {
    return NextResponse.json({ error: "Select at least one lead before generating emails." }, { status: 400 });
  }

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), 50_000);

  try {
    // Generate the campaign email sequence using Groq with the primary lead context
    const primaryLead = selectedLeads[0];
    const generated = await generateCampaignEmails(
      prompt,
      [primaryLead],
      body.instruction,
      abortController.signal,
    );

    const current = body.currentSequence ?? [];
    const sequence = generated.map((email, index) => {
      const existing = current[index];
      return existing?.manuallyEdited && !body.instruction?.toLowerCase().includes("replace manually")
        ? existing
        : { ...email, manuallyEdited: false };
    });

    // Populate personalization mapping for all selected leads
    const personalizedEmails: Record<string, typeof sequence> = {};
    for (const lead of selectedLeads) {
      personalizedEmails[lead.id] = sequence;
    }

    const name = body.name?.trim() || prompt.replace(/\s+/g, " ").slice(0, 48) || "Outbound campaign";

    const data = {
      name,
      prompt,
      selectedLeadIds,
      selectedLeads: selectedLeads as unknown as object,
      emails: sequence as unknown as object,
      personalizedEmails: personalizedEmails as unknown as object,
      userId: session.user.id,
    };

    if (body.preview) {
      return NextResponse.json({
        campaign: {
          id: body.campaignId,
          name,
          prompt,
          selectedLeadIds,
          selectedLeads,
          sequence,
          personalizedEmails,
        },
      });
    }

    if (body.campaignId) {
      const existing = await db.campaign.findUnique({
        where: { id: body.campaignId },
        select: { id: true, userId: true },
      });
      if (!existing) {
        return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
      }
      if (existing.userId !== session.user.id) {
        return NextResponse.json({ error: "Forbidden. You do not own this campaign." }, { status: 403 });
      }
    }

    const campaign = body.campaignId
      ? await db.campaign.update({
          where: { id: body.campaignId },
          data,
        })
      : await db.campaign.create({ data });

    return NextResponse.json({
      campaign: {
        ...campaign,
        prompt,
        sequence,
        personalizedEmails,
      },
    });
  } catch (error) {
    console.error("[API /api/campaigns/generate] Generation error:", error);
    return errorResponse(error);
  } finally {
    clearTimeout(timeout);
  }
}

export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized. Please sign in." }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      campaignId?: string;
      sequence?: Campaign["sequence"];
      personalizedEmails?: Campaign["personalizedEmails"];
      selectedLeadIds?: string[];
      connectedEmail?: string;
      provider?: string;
      status?: string;
    };

    if (!body.campaignId) {
      return NextResponse.json({ error: "A campaign ID is required." }, { status: 400 });
    }

    if (body.sequence && (!Array.isArray(body.sequence) || body.sequence.length !== 3)) {
      return NextResponse.json({ error: "Email sequence must contain three emails." }, { status: 400 });
    }

    const existing = await db.campaign.findUnique({
      where: { id: body.campaignId },
      select: { id: true, userId: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    }

    if (existing.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden. You do not have access to this campaign." }, { status: 403 });
    }

    const campaign = await db.campaign.update({
      where: { id: body.campaignId },
      data: {
        ...(body.sequence ? { emails: body.sequence as unknown as object } : {}),
        ...(body.personalizedEmails ? { personalizedEmails: body.personalizedEmails as unknown as object } : {}),
        ...(body.selectedLeadIds ? { selectedLeadIds: body.selectedLeadIds } : {}),
        ...(body.connectedEmail !== undefined ? { connectedEmail: body.connectedEmail } : {}),
        ...(body.provider !== undefined ? { provider: body.provider } : {}),
        ...(body.status ? { status: body.status } : {}),
        userId: session.user.id,
      },
    });

    return NextResponse.json({ campaign });
  } catch (error) {
    console.error("[API /api/campaigns/generate PATCH] Update error:", error);
    return errorResponse(error);
  }
}