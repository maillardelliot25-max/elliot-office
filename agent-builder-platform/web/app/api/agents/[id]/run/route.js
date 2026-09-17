import { NextResponse } from "next/server";
import { getSupabase, TABLES } from "../../../../../lib/supabase.js";
import { getAgentEngine } from "../../../../../lib/agents/index.js";

export const runtime = "nodejs";

export async function POST(req, { params }) {
  const { id } = await params;
  const supabase = getSupabase();

  const { data: agent, error: agentError } = await supabase
    .from(TABLES.agentInstances)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (agentError) throw agentError;
  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }
  if (agent.status !== "live") {
    return NextResponse.json({ error: "Agent is paused — resume it before running" }, { status: 409 });
  }

  const { data: client, error: clientError } = await supabase
    .from(TABLES.clients)
    .select("*")
    .eq("id", agent.client_id)
    .single();
  if (clientError) throw clientError;

  const engine = getAgentEngine(agent.archetype);

  let result;
  try {
    result = await engine.run({ client, agentInstance: agent });
  } catch (err) {
    await supabase.from(TABLES.agentRuns).insert({
      agent_instance_id: agent.id,
      engine: "error",
      brief: err.message,
      usage: {},
      cost_usd: 0,
      delivery: { error: err.message },
    });
    return NextResponse.json({ error: err.message }, { status: 422 });
  }

  const { error: runInsertError } = await supabase.from(TABLES.agentRuns).insert({
    agent_instance_id: agent.id,
    engine: result.engine,
    brief: result.text,
    usage: result.usage || {},
    cost_usd: result.costUsd || 0,
    delivery: result.delivery || {},
  });
  if (runInsertError) throw runInsertError;

  return NextResponse.json({ ok: true });
}
