import { NextResponse } from "next/server";
import { getDb, nowIso } from "../../../../../lib/db.js";
import { getAgentEngine } from "../../../../../lib/agents/index.js";

export const runtime = "nodejs";

export async function POST(req, { params }) {
  const { id } = await params;
  const db = getDb();
  const agent = db.prepare("SELECT * FROM agent_instances WHERE id = ?").get(id);
  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }
  if (agent.status !== "live") {
    return NextResponse.json({ error: "Agent is paused — resume it before running" }, { status: 409 });
  }

  const client = db.prepare("SELECT * FROM clients WHERE id = ?").get(agent.client_id);
  const engine = getAgentEngine(agent.archetype);

  let result;
  try {
    result = await engine.run({ client, agentInstance: agent });
  } catch (err) {
    db.prepare(
      "INSERT INTO agent_runs (agent_instance_id, engine, brief, usage, cost_usd, delivery, created_at) VALUES (?, 'error', ?, '{}', 0, ?, ?)"
    ).run(agent.id, err.message, JSON.stringify({ error: err.message }), nowIso());
    return NextResponse.json({ error: err.message }, { status: 422 });
  }

  db.prepare(
    "INSERT INTO agent_runs (agent_instance_id, engine, brief, usage, cost_usd, delivery, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(
    agent.id,
    result.engine,
    result.text,
    JSON.stringify(result.usage || {}),
    result.costUsd || 0,
    JSON.stringify(result.delivery || {}),
    nowIso()
  );

  return NextResponse.json({ ok: true });
}
