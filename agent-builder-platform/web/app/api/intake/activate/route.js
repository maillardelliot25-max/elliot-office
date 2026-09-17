import { NextResponse } from "next/server";
import { getArchetype } from "../../../../lib/archetypes.js";
import { getDb, nowIso } from "../../../../lib/db.js";

export const runtime = "nodejs";

export async function POST(req) {
  const {
    tenantSlug,
    tenantName,
    businessName,
    vertical,
    brandVoice,
    archetype,
    config,
    costCeilingUsd,
  } = await req.json();

  const archetypeDef = getArchetype(archetype);
  if (!archetypeDef) {
    return NextResponse.json({ error: "Unknown archetype" }, { status: 400 });
  }
  if (!businessName?.trim()) {
    return NextResponse.json({ error: "businessName is required" }, { status: 400 });
  }

  const db = getDb();
  const slug = (tenantSlug || "operator").trim() || "operator";

  let tenant = db.prepare("SELECT * FROM tenants WHERE slug = ?").get(slug);
  if (!tenant) {
    db.prepare(
      "INSERT INTO tenants (slug, name, brand_name, is_operator, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run(slug, tenantName || slug, tenantName || slug, slug === "operator" ? 1 : 0, nowIso());
    tenant = db.prepare("SELECT * FROM tenants WHERE slug = ?").get(slug);
  }

  const clientInsert = db
    .prepare(
      "INSERT INTO clients (tenant_id, business_name, vertical, brand_voice, created_at) VALUES (?, ?, ?, ?, ?)"
    )
    .run(tenant.id, businessName, vertical || null, brandVoice || null, nowIso());

  const agentInsert = db
    .prepare(
      "INSERT INTO agent_instances (client_id, archetype, config, status, price_usd_month, cost_ceiling_usd, created_at) VALUES (?, ?, ?, 'live', ?, ?, ?)"
    )
    .run(
      clientInsert.lastInsertRowid,
      archetype,
      JSON.stringify(config || {}),
      archetypeDef.priceUsdMonth,
      Number(costCeilingUsd) || 0.5,
      nowIso()
    );

  return NextResponse.json({ agentId: agentInsert.lastInsertRowid });
}
