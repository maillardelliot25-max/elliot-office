import { getDb, nowIso } from "../lib/db.js";
import { getArchetype } from "../lib/archetypes.js";

const db = getDb();

function upsertTenant(slug, name, brandName, isOperator) {
  let tenant = db.prepare("SELECT * FROM tenants WHERE slug = ?").get(slug);
  if (tenant) return tenant;
  db.prepare(
    "INSERT INTO tenants (slug, name, brand_name, is_operator, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(slug, name, brandName, isOperator ? 1 : 0, nowIso());
  return db.prepare("SELECT * FROM tenants WHERE slug = ?").get(slug);
}

const operator = upsertTenant("operator", "Operator", "Agent Builder Platform", true);
upsertTenant("demo-reseller", "Demo Reseller", "Island Ops Agency", false);

const existingClient = db
  .prepare("SELECT * FROM clients WHERE tenant_id = ? AND business_name = ?")
  .get(operator.id, "Sample Business");

if (!existingClient) {
  const client = db
    .prepare(
      "INSERT INTO clients (tenant_id, business_name, vertical, brand_voice, created_at) VALUES (?, ?, ?, ?, ?)"
    )
    .run(operator.id, "Sample Business", "generic", "friendly, concise, no jargon", nowIso());

  const archetype = getArchetype("trend-brief");
  const config = {
    watchTopics: "competitor promotions, industry pricing changes, relevant local events",
    deliveryEmail: "owner@example.com",
    frequency: "weekly",
  };

  db.prepare(
    "INSERT INTO agent_instances (client_id, archetype, config, status, price_usd_month, cost_ceiling_usd, created_at) VALUES (?, 'trend-brief', ?, 'live', ?, ?, ?)"
  ).run(client.lastInsertRowid, JSON.stringify(config), archetype.priceUsdMonth, 0.5, nowIso());

  console.log("Seeded operator tenant with a demo trend-brief client.");
} else {
  console.log("Demo client already exists — nothing to seed.");
}

console.log("Tenants:", db.prepare("SELECT slug, brand_name FROM tenants").all());
