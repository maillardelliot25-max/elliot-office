import Link from "next/link";
import { getDashboardData, getUnresolvedQueueCount } from "../../lib/queries.js";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }) {
  const params = await searchParams;
  const tenantSlug = params?.tenant;
  const tenants = await getDashboardData(tenantSlug);

  if (tenantSlug && tenants.length === 0) {
    return (
      <>
        <h1>Not found</h1>
        <p className="subtitle">No tenant with slug "{tenantSlug}".</p>
      </>
    );
  }

  const queueCount = tenantSlug ? 0 : await getUnresolvedQueueCount();

  return (
    <>
      <h1>{tenantSlug ? tenants[0].brand_name : "Operator dashboard"}</h1>
      <p className="subtitle">
        {tenantSlug ? `Reseller view — ${tenantSlug}` : "All tenants and clients"}
        {queueCount > 0 && (
          <>
            {" "}
            · <Link href="/queue">{queueCount} unclassified request{queueCount === 1 ? "" : "s"} to review</Link>
          </>
        )}
      </p>

      {tenants.length === 0 && <p className="muted">No tenants yet — create an agent to get started.</p>}

      {tenants.map((tenant) => (
        <div key={tenant.id} className="card">
          <h2>
            {tenant.brand_name}{" "}
            {!tenantSlug && (
              <span className="muted">
                ({tenant.slug}) · <Link href={`/dashboard?tenant=${tenant.slug}`}>reseller view</Link>
              </span>
            )}
          </h2>

          {tenant.clients.length === 0 && <p className="muted">No clients yet.</p>}

          {tenant.clients.map((client) => (
            <div key={client.id} style={{ marginBottom: 20 }}>
              <strong>{client.business_name}</strong>
              {client.vertical ? ` — ${client.vertical}` : ""}
              <table>
                <thead>
                  <tr>
                    <th>Agent</th>
                    <th>Status</th>
                    <th>Price/mo</th>
                    <th>Cost this month</th>
                    <th>Last run</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {client.agents.map((agent) => (
                    <tr key={agent.id}>
                      <td>
                        {agent.archetypeName}
                        {!agent.implemented && (
                          <span className="badge not-implemented" style={{ marginLeft: 6 }}>
                            not implemented
                          </span>
                        )}
                      </td>
                      <td>
                        <span className={`badge ${agent.status}`}>{agent.status}</span>
                      </td>
                      <td>${Number(agent.price_usd_month).toFixed(2)}</td>
                      <td>${Number(agent.monthCost).toFixed(4)}</td>
                      <td className="muted">
                        {agent.lastRun ? new Date(agent.lastRun.created_at).toLocaleString() : "never"}
                      </td>
                      <td>
                        <Link href={`/agents/${agent.id}`}>Open</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}
