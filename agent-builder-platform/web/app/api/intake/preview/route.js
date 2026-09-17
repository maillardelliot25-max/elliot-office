import { NextResponse } from "next/server";
import { getAgentEngine } from "../../../../lib/agents/index.js";
import { getArchetype } from "../../../../lib/archetypes.js";

export const runtime = "nodejs";

export async function POST(req) {
  const { archetype, businessName, brandVoice, config } = await req.json();

  if (!archetype || !getArchetype(archetype)) {
    return NextResponse.json({ error: "Unknown archetype" }, { status: 400 });
  }
  if (!businessName?.trim()) {
    return NextResponse.json({ error: "businessName is required" }, { status: 400 });
  }

  const engine = getAgentEngine(archetype);
  const result = await engine.preview({ businessName, brandVoice, config: config || {} });

  return NextResponse.json(result);
}
