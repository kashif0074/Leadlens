import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { db } from "@/lib/db";
import { generateCampaignEmails } from "@/lib/grok";
import { personalizeText } from "@/lib/campaigns";
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
  const submittedLeads = Array.isArray(body.selectedLeads) ? body.selectedLeads : [];
  const requestedLeadIds = Array.isArray(body.selectedLeadIds)
    ? body.selectedLeadIds
    : submittedLeads.map((lead) => lead.id);
  const leadById = new Map(submittedLeads.map((lead) => [lead.id, lead]));
  const selectedLeads = requestedLeadIds.map((id) => leadById.get(id)).filter((lead): lead is Lead => Boolean(lead));
  const selectedLeadIds = requestedLeadIds;

  if (!prompt || prompt.length < 10) {
    return NextResponse.json(
      { error: "Please describe your campaign offer in more detail (at least 10 characters)." },
      { status: 400 },
    );
  }
  if (!selectedLeads.length) {
    return NextResponse.json({ error: "Select at least one lead before generating emails." }, { status: 400 });
  }
  if (new Set(selectedLeadIds).size !== selectedLeadIds.length || selectedLeads.length !== selectedLeadIds.length) {
    return NextResponse.json({ error: "Selected lead IDs must be unique and match the submitted leads." }, { status: 400 });
  }

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), 50_000);

  try {
    const current = body.currentSequence ?? [];
    let sequence: Campaign["sequence"] = [];

    // If regeneration instruction provided or sequence is empty, attempt AI generation with fallback
    if (body.instruction || !current.length) {
      try {
        const generated = await generateCampaignEmails(prompt, [selectedLeads[0]], body.instruction, abortController.signal);
        sequence = generated.map((email, index) => {
          const existing = current[index];
          return existing?.manuallyEdited && !body.instruction?.toLowerCase().includes("replace manually")
            ? existing
            : { ...email, manuallyEdited: false };
        });
      } catch (aiError) {
        console.warn("[API /api/campaigns/generate] AI generation error, using fallback sequence:", aiError);
        sequence = current.length === 3 ? current : [
          {
            step: 1,
            delayDays: 0,
            subject: "A question about {{company}}",
            body: `Hi {{first_name}},\n\nI'm reaching out about ${prompt} given your {{job_title}} role at {{company}}. Would a brief conversation be useful?\n\nRegards,`,
            manuallyEdited: false,
          },
          {
            step: 2,
            delayDays: 3,
            subject: "One more thought for {{company}}",
            body: `Hi {{first_name}},\n\nOne more note about ${prompt}. If this is relevant to your work at {{company}}, would you be open to a short conversation?\n\nRegards,`,
            manuallyEdited: false,
          },
          {
            step: 3,
            delayDays: 5,
            subject: "Should I close the loop, {{first_name}}?",
            body: `Hi {{first_name}},\n\nIs ${prompt} a priority for your team at {{company}}? If not, no problem; I won't follow up again.\n\nRegards,`,
            manuallyEdited: false,
          },
        ];
      }
    } else {
      sequence = current;
    }

    // Build personalized emails for each lead
    const personalizedEmails: Record<string, { step: number; delayDays: number; subject: string; body: string; manuallyEdited?: boolean }[]> = {};
    for (const lead of selectedLeads) {
      personalizedEmails[lead.id] = sequence.map((email) => ({
        step: email.step,
        delayDays: email.delayDays,
        subject: personalizeText(email.subject, lead),
        body: personalizeText(email.body, lead),
        manuallyEdited: email.manuallyEdited ?? false,
      }));
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