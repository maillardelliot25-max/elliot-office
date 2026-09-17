import { getUnresolvedQueue } from "../../lib/queries.js";

export default async function QueuePage() {
  const rows = getUnresolvedQueue();

  return (
    <>
      <h1>Unclassified queue</h1>
      <p className="subtitle">
        Requests the classifier couldn't confidently match to a catalog archetype — this is
        how the catalog grows (build roadmap Phase 2-3), per the spec's operator dashboard.
      </p>

      {rows.length === 0 && <p className="muted">Nothing pending.</p>}

      {rows.map((row) => {
        const candidates = JSON.parse(row.top_candidates || "[]");
        return (
          <div key={row.id} className="card">
            <p><strong>Business:</strong> {row.business_description}</p>
            <p><strong>Wants handled:</strong> {row.request}</p>
            <p className="muted">
              Closest candidates: {candidates.length ? candidates.map((c) => `${c.name} (${c.score})`).join(", ") : "none"}
            </p>
            <p className="muted">{new Date(row.created_at).toLocaleString()}</p>
          </div>
        );
      })}
    </>
  );
}
