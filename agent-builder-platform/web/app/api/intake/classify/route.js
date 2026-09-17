import { NextResponse } from "next/server";
import { classifyIntake } from "../../../../lib/classifier.js";
import { getArchetype } from "../../../../lib/archetypes.js";
import { getSupabase, TABLES } from "../../../../lib/supabase.js";

export const runtime = "nodejs";

export async function POST(req) {
  const { businessDescription, request } = await req.json();

  if (!businessDescription?.trim() || !request?.trim()) {
    return NextResponse.json(
      { error: "businessDescription and request are both required" },
      { status: 400 }
    );
  }

  const result = await classifyIntake({ businessDescription, request });

  if (!result.archetype) {
    const supabase = getSupabase();
    const { error } = await supabase.from(TABLES.intakeQueue).insert({
      business_description: businessDescription,
      request,
      top_candidates: result.candidates,
    });
    if (error) throw error;
  }

  const archetype = result.archetype ? getArchetype(result.archetype) : null;

  return NextResponse.json({
    archetype: archetype?.id ?? null,
    archetypeName: archetype?.name ?? null,
    description: archetype?.description ?? null,
    confidence: result.confidence,
    candidates: result.candidates,
    slots: archetype?.slots ?? [],
    implemented: archetype?.implemented ?? false,
    priceUsdMonth: archetype?.priceUsdMonth ?? null,
    engine: result.engine,
  });
}
