import { NextResponse } from "next/server";
import { getArchetype } from "../../../../lib/archetypes.js";
import { getSupabase, TABLES } from "../../../../lib/supabase.js";

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

  const supabase = getSupabase();
  const slug = (tenantSlug || "operator").trim() || "operator";

  let { data: tenant, error: tenantLookupError } = await supabase
    .from(TABLES.tenants)
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (tenantLookupError) throw tenantLookupError;

  if (!tenant) {
    const { data: inserted, error: tenantInsertError } = await supabase
      .from(TABLES.tenants)
      .insert({
        slug,
        name: tenantName || slug,
        brand_name: tenantName || slug,
        is_operator: slug === "operator",
      })
      .select()
      .single();
    if (tenantInsertError) throw tenantInsertError;
    tenant = inserted;
  }

  const { data: client, error: clientError } = await supabase
    .from(TABLES.clients)
    .insert({
      tenant_id: tenant.id,
      business_name: businessName,
      vertical: vertical || null,
      brand_voice: brandVoice || null,
    })
    .select()
    .single();
  if (clientError) throw clientError;

  const { data: agent, error: agentError } = await supabase
    .from(TABLES.agentInstances)
    .insert({
      client_id: client.id,
      archetype,
      config: config || {},
      status: "live",
      price_usd_month: archetypeDef.priceUsdMonth,
      cost_ceiling_usd: Number(costCeilingUsd) || 0.5,
    })
    .select()
    .single();
  if (agentError) throw agentError;

  return NextResponse.json({ agentId: agent.id });
}
