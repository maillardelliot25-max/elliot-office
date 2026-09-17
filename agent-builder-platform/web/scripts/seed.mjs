import "dotenv/config";
import { getSupabase, TABLES } from "../lib/supabase.js";
import { getArchetype } from "../lib/archetypes.js";

const supabase = getSupabase();

async function upsertTenant(slug, name, brandName, isOperator) {
  const { data: existing, error: lookupError } = await supabase
    .from(TABLES.tenants)
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (existing) return existing;

  const { data, error } = await supabase
    .from(TABLES.tenants)
    .insert({ slug, name, brand_name: brandName, is_operator: isOperator })
    .select()
    .single();
  if (error) throw error;
  return data;
}

const operator = await upsertTenant("operator", "Operator", "Agent Builder Platform", true);
await upsertTenant("demo-reseller", "Demo Reseller", "Island Ops Agency", false);

const { data: existingClient, error: clientLookupError } = await supabase
  .from(TABLES.clients)
  .select("*")
  .eq("tenant_id", operator.id)
  .eq("business_name", "Sample Business")
  .maybeSingle();
if (clientLookupError) throw clientLookupError;

if (!existingClient) {
  const { data: client, error: clientError } = await supabase
    .from(TABLES.clients)
    .insert({
      tenant_id: operator.id,
      business_name: "Sample Business",
      vertical: "generic",
      brand_voice: "friendly, concise, no jargon",
    })
    .select()
    .single();
  if (clientError) throw clientError;

  const archetype = getArchetype("trend-brief");
  const config = {
    watchTopics: "competitor promotions, industry pricing changes, relevant local events",
    deliveryEmail: "owner@example.com",
    frequency: "weekly",
  };

  const { error: agentError } = await supabase.from(TABLES.agentInstances).insert({
    client_id: client.id,
    archetype: "trend-brief",
    config,
    status: "live",
    price_usd_month: archetype.priceUsdMonth,
    cost_ceiling_usd: 0.5,
  });
  if (agentError) throw agentError;

  console.log("Seeded operator tenant with a demo trend-brief client.");
} else {
  console.log("Demo client already exists — nothing to seed.");
}

const { data: tenants } = await supabase.from(TABLES.tenants).select("slug, brand_name");
console.log("Tenants:", tenants);
