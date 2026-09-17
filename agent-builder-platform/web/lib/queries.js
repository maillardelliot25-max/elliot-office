import { getSupabase, TABLES } from "./supabase.js";
import { getArchetype } from "./archetypes.js";

export async function getDashboardData(tenantSlug) {
  const supabase = getSupabase();

  const tenantsQuery = supabase.from(TABLES.tenants).select("*").order("created_at", { ascending: true });
  const { data: tenants, error: tenantsError } = tenantSlug
    ? await supabase.from(TABLES.tenants).select("*").eq("slug", tenantSlug)
    : await tenantsQuery;
  if (tenantsError) throw tenantsError;

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthStartIso = monthStart.toISOString();

  const result = [];
  for (const tenant of tenants) {
    const { data: clients, error: clientsError } = await supabase
      .from(TABLES.clients)
      .select("*")
      .eq("tenant_id", tenant.id)
      .order("created_at", { ascending: true });
    if (clientsError) throw clientsError;

    const clientRows = [];
    for (const client of clients) {
      const { data: agents, error: agentsError } = await supabase
        .from(TABLES.agentInstances)
        .select("*")
        .eq("client_id", client.id)
        .order("created_at", { ascending: true });
      if (agentsError) throw agentsError;

      const agentRows = [];
      for (const agent of agents) {
        const archetype = getArchetype(agent.archetype);

        const { data: monthRuns, error: monthRunsError } = await supabase
          .from(TABLES.agentRuns)
          .select("cost_usd")
          .eq("agent_instance_id", agent.id)
          .gte("created_at", monthStartIso);
        if (monthRunsError) throw monthRunsError;
        const monthCost = (monthRuns || []).reduce((sum, r) => sum + Number(r.cost_usd), 0);

        const { data: lastRuns, error: lastRunError } = await supabase
          .from(TABLES.agentRuns)
          .select("*")
          .eq("agent_instance_id", agent.id)
          .order("created_at", { ascending: false })
          .limit(1);
        if (lastRunError) throw lastRunError;

        agentRows.push({
          ...agent,
          archetypeName: archetype?.name ?? agent.archetype,
          implemented: archetype?.implemented ?? false,
          monthCost,
          lastRun: lastRuns?.[0] ?? null,
        });
      }

      clientRows.push({ ...client, agents: agentRows });
    }

    result.push({ ...tenant, clients: clientRows });
  }

  return result;
}

export async function getAgentDetail(id) {
  const supabase = getSupabase();

  const { data: agent, error: agentError } = await supabase
    .from(TABLES.agentInstances)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (agentError) throw agentError;
  if (!agent) return null;

  const { data: client, error: clientError } = await supabase
    .from(TABLES.clients)
    .select("*")
    .eq("id", agent.client_id)
    .single();
  if (clientError) throw clientError;

  const { data: tenant, error: tenantError } = await supabase
    .from(TABLES.tenants)
    .select("*")
    .eq("id", client.tenant_id)
    .single();
  if (tenantError) throw tenantError;

  const { data: runs, error: runsError } = await supabase
    .from(TABLES.agentRuns)
    .select("*")
    .eq("agent_instance_id", agent.id)
    .order("created_at", { ascending: false });
  if (runsError) throw runsError;

  return { agent, client, tenant, runs: runs || [] };
}

export async function getUnresolvedQueue() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from(TABLES.intakeQueue)
    .select("*")
    .eq("resolved", false)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getUnresolvedQueueCount() {
  const supabase = getSupabase();
  const { count, error } = await supabase
    .from(TABLES.intakeQueue)
    .select("*", { count: "exact", head: true })
    .eq("resolved", false);
  if (error) throw error;
  return count || 0;
}
