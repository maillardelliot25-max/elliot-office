import { notFound } from "next/navigation";
import { getAgentDetail } from "../../../lib/queries.js";
import AgentActions from "./AgentActions.js";

export default async function AgentDetailPage({ params }) {
  const { id } = await params;
  const detail = getAgentDetail(id);
  if (!detail) notFound();

  const { agent, client, tenant, runs } = detail;
  const config = JSON.parse(agent.config);

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
          Price: ${agent.price_usd_month.toFixed(2)}/mo · Cost ceiling: ${agent.cost_ceiling_usd.toFixed(2)}/run
        </p>
        <AgentActions agentId={agent.id} status={agent.status} />
      </div>

      <div className="card">
        <h2>Run history</h2>
        {runs.length === 0 && <p className="muted">No runs yet.</p>}
        {runs.map((run) => {
          const delivery = JSON.parse(run.delivery || "{}");
          return (
            <div key={run.id} style={{ marginBottom: 16, borderBottom: "1px solid var(--panel-border)", paddingBottom: 16 }}>
              <p className="muted">
                {new Date(run.created_at).toLocaleString()} · engine: {run.engine} · cost: ${run.cost_usd.toFixed(4)}
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
