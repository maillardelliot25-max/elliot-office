import { NextResponse } from "next/server";
import { classifyIntake } from "../../../../lib/classifier.js";
import { getArchetype } from "../../../../lib/archetypes.js";
import { getDb, nowIso } from "../../../../lib/db.js";

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
    const db = getDb();
    db.prepare(
      "INSERT INTO intake_queue (business_description, request, top_candidates, created_at) VALUES (?, ?, ?, ?)"
    ).run(businessDescription, request, JSON.stringify(result.candidates), nowIso());
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
