import { notFound } from "next/navigation";
import { getAgentDetail } from "../../../lib/queries.js";
import AgentActions from "./AgentActions.js";

export const dynamic = "force-dynamic";

export default async function AgentDetailPage({ params }) {
  const { id } = await params;
  const detail = await getAgentDetail(id);
  if (!detail) notFound();

  const { agent, client, tenant, runs } = detail;
  const config = agent.config;

  return (
    <>
      <h1>{client.business_name} — {agent.archetype}</h1>
      <p className="subtitle">
        {tenant.brand_name} · <span className={`badge ${agent.status}`}>{agent.status}</span>
      </p>

      <div className="card">
        <h2>Config</h2>
        <pre className="brief">{JSON.stringify(config, null, 2)}</pre>
        <p className="muted">
          Price: ${Number(agent.price_usd_month).toFixed(2)}/mo · Cost ceiling: ${Number(agent.cost_ceiling_usd).toFixed(2)}/run
        </p>
        <AgentActions agentId={agent.id} status={agent.status} />
      </div>

      <div className="card">
        <h2>Run history</h2>
        {runs.length === 0 && <p className="muted">No runs yet.</p>}
        {runs.map((run) => {
          const delivery = run.delivery || {};
          return (
            <div key={run.id} style={{ marginBottom: 16, borderBottom: "1px solid var(--panel-border)", paddingBottom: 16 }}>
              <p className="muted">
                {new Date(run.created_at).toLocaleString()} · engine: {run.engine} · cost: ${Number(run.cost_usd).toFixed(4)}
                {delivery.dryRun && " · dry-run"}
                {delivery.delivered && " · delivered"}
              </p>
              {run.brief && <pre className="brief">{run.brief}</pre>}
              {delivery.note && <p className="muted">{delivery.note}</p>}
              {delivery.error && <p className="error">{delivery.error}</p>}
            </div>
          );
        })}
      </div>
    </>
  );
}
