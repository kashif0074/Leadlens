import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { discoverCompaniesFromPrompt } from "@/lib/leads";

export const runtime = "nodejs";
export const maxDuration = 60; // Allow sufficient execution window on Node

export async function POST(req: NextRequest) {
  try {
    let body: { prompt?: string; userId?: string; limit?: number };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
    }

    const prompt = body.prompt?.trim();
    if (!prompt || prompt.length < 6) {
      return NextResponse.json(
        { error: "Please enter a valid campaign brief describing your target audience and location." },
        { status: 400 },
      );
    }

    // Identify user if signed in
    const session = await getServerSession(authOptions);
    const effectiveUserId = session?.user?.id || body.userId || null;

    const maxLeads = typeof body.limit === "number" && body.limit > 0 ? Math.min(body.limit, 20) : 8;

    const result = await discoverCompaniesFromPrompt(prompt, effectiveUserId, maxLeads);

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("[API /api/discover] Error executing lead discovery pipeline:", error);
    const message = error instanceof Error ? error.message : "Lead discovery pipeline encountered an error.";
    const status =
      typeof error === "object" && error && "status" in error && typeof (error as any).status === "number"
        ? (error as any).status
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}