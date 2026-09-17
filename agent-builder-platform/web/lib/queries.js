import { getDb } from "./db.js";
import { getArchetype } from "./archetypes.js";

export function getDashboardData(tenantSlug) {
  const db = getDb();
  const tenants = tenantSlug
    ? db.prepare("SELECT * FROM tenants WHERE slug = ?").all(tenantSlug)
    : db.prepare("SELECT * FROM tenants ORDER BY created_at ASC").all();

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthStartIso = monthStart.toISOString();

  return tenants.map((tenant) => {
    const clients = db
      .prepare("SELECT * FROM clients WHERE tenant_id = ? ORDER BY created_at ASC")
      .all(tenant.id);

    const clientRows = clients.map((client) => {
      const agents = db
        .prepare("SELECT * FROM agent_instances WHERE client_id = ? ORDER BY created_at ASC")
        .all(client.id);

      const agentRows = agents.map((agent) => {
        const archetype = getArchetype(agent.archetype);
        const monthCost = db
          .prepare(
            "SELECT COALESCE(SUM(cost_usd),0) as total FROM agent_runs WHERE agent_instance_id = ? AND created_at >= ?"
          )
          .get(agent.id, monthStartIso).total;
        const lastRun = db
          .prepare("SELECT * FROM agent_runs WHERE agent_instance_id = ? ORDER BY created_at DESC LIMIT 1")
          .get(agent.id);

        return {
          ...agent,
          archetypeName: archetype?.name ?? agent.archetype,
          implemented: archetype?.implemented ?? false,
          monthCost,
          lastRun,
        };
      });

      return { ...client, agents: agentRows };
    });

    return { ...tenant, clients: clientRows };
  });
}

export function getAgentDetail(id) {
  const db = getDb();
  const agent = db.prepare("SELECT * FROM agent_instances WHERE id = ?").get(id);
  if (!agent) return null;
  const client = db.prepare("SELECT * FROM clients WHERE id = ?").get(agent.client_id);
  const tenant = db.prepare("SELECT * FROM tenants WHERE id = ?").get(client.tenant_id);
  const runs = db
    .prepare("SELECT * FROM agent_runs WHERE agent_instance_id = ? ORDER BY created_at DESC")
    .all(agent.id);
  return { agent, client, tenant, runs };
}

export function getUnresolvedQueue() {
  const db = getDb();
  return db.prepare("SELECT * FROM intake_queue WHERE resolved = 0 ORDER BY created_at DESC").all();
}

export function getUnresolvedQueueCount() {
  const db = getDb();
  return db.prepare("SELECT COUNT(*) as c FROM intake_queue WHERE resolved = 0").get().c;
}
