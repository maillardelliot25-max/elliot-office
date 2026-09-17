"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AgentActions({ agentId, status }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/agents/${agentId}/run`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Run failed");
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function toggleStatus() {
    setLoading(true);
    setError(null);
    try {
      const newStatus = status === "live" ? "paused" : "live";
      const res = await fetch(`/api/agents/${agentId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Status update failed");
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {error && <div className="error">{error}</div>}
      <div className="row">
        <button onClick={run} disabled={loading || status !== "live"}>
          {loading ? "Working…" : "Run now"}
        </button>
        <button className="secondary" onClick={toggleStatus} disabled={loading}>
          {status === "live" ? "Pause" : "Resume"}
        </button>
      </div>
    </div>
  );
}
