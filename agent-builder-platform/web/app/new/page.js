"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const STEP_INTAKE = "intake";
const STEP_SLOTS = "slots";
const STEP_PREVIEW = "preview";

export default function NewAgentPage() {
  const router = useRouter();
  const [step, setStep] = useState(STEP_INTAKE);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const [businessDescription, setBusinessDescription] = useState("");
  const [request, setRequest] = useState("");
  const [classification, setClassification] = useState(null);

  const [businessName, setBusinessName] = useState("");
  const [vertical, setVertical] = useState("");
  const [brandVoice, setBrandVoice] = useState("");
  const [tenantSlug, setTenantSlug] = useState("operator");
  const [tenantName, setTenantName] = useState("Operator");
  const [slotValues, setSlotValues] = useState({});
  const [costCeilingUsd, setCostCeilingUsd] = useState("0.50");

  const [preview, setPreview] = useState(null);

  async function handleClassify(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/intake/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessDescription, request }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Classification failed");
      setClassification(data);
      const defaults = {};
      for (const slot of data.slots) defaults[slot.key] = slot.default ?? "";
      setSlotValues(defaults);
      if (data.archetype) setStep(STEP_SLOTS);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handlePreview(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/intake/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          archetype: classification.archetype,
          businessName,
          brandVoice,
          config: slotValues,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Preview failed");
      setPreview(data);
      setStep(STEP_PREVIEW);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleActivate() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/intake/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantSlug,
          tenantName,
          businessName,
          vertical,
          brandVoice,
          archetype: classification.archetype,
          config: slotValues,
          costCeilingUsd: parseFloat(costCeilingUsd),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Activation failed");
      router.push(`/agents/${data.agentId}`);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <>
      <h1>New agent</h1>
      <p className="subtitle">Two inputs — no canvas, no config screen.</p>
      {error && <div className="error">{error}</div>}

      {step === STEP_INTAKE && (
        <form className="card" onSubmit={handleClassify}>
          <label htmlFor="businessDescription">What is the business?</label>
          <textarea
            id="businessDescription"
            value={businessDescription}
            onChange={(e) => setBusinessDescription(e.target.value)}
            placeholder="I run a bar in Arouca doing Carnival fetes and private events."
            required
          />
          <label htmlFor="request">What do you want handled?</label>
          <textarea
            id="request"
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            placeholder="Watch for competitor promotions and send me a weekly brief."
            required
          />
          <button type="submit" disabled={loading}>
            {loading ? "Analyzing…" : "Analyze"}
          </button>
        </form>
      )}

      {step === STEP_INTAKE && classification && !classification.archetype && (
        <div className="card">
          <h2>Couldn't confidently match this</h2>
          <p className="muted">
            Flagged for review in the operator queue. Closest candidates:
          </p>
          <ul>
            {classification.candidates.map((c) => (
              <li key={c.archetype}>{c.name} (score {c.score})</li>
            ))}
          </ul>
        </div>
      )}

      {step === STEP_SLOTS && classification && (
        <form className="card" onSubmit={handlePreview}>
          <h2>
            Matched: {classification.archetypeName}{" "}
            <span className="muted">
              ({Math.round(classification.confidence * 100)}% confidence, {classification.engine})
            </span>
          </h2>
          <p className="muted">{classification.description}</p>
          {!classification.implemented && (
            <p className="muted">
              Note: this archetype's execution engine isn't built yet — you can still
              activate it, but "Run now" will show a not-implemented stub.
            </p>
          )}

          <div className="grid-2">
            <div>
              <label>Business name</label>
              <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} required />
            </div>
            <div>
              <label>Vertical (optional)</label>
              <input value={vertical} onChange={(e) => setVertical(e.target.value)} />
            </div>
          </div>

          <label>Brand voice (optional)</label>
          <input value={brandVoice} onChange={(e) => setBrandVoice(e.target.value)} placeholder="friendly, concise, no jargon" />

          <div className="grid-2">
            <div>
              <label>Reseller tenant slug</label>
              <input value={tenantSlug} onChange={(e) => setTenantSlug(e.target.value)} />
            </div>
            <div>
              <label>Reseller display name</label>
              <input value={tenantName} onChange={(e) => setTenantName(e.target.value)} />
            </div>
          </div>

          {classification.slots.map((slot) => (
            <SlotField
              key={slot.key}
              slot={slot}
              value={slotValues[slot.key] ?? ""}
              onChange={(v) => setSlotValues((s) => ({ ...s, [slot.key]: v }))}
            />
          ))}

          <label>Per-run cost ceiling (USD)</label>
          <input value={costCeilingUsd} onChange={(e) => setCostCeilingUsd(e.target.value)} />

          <button type="submit" disabled={loading}>
            {loading ? "Generating preview…" : "Preview"}
          </button>
        </form>
      )}

      {step === STEP_PREVIEW && preview && (
        <div className="card">
          <h2>Preview ({preview.engine})</h2>
          <p className="muted">
            Estimated run cost: ${preview.costUsd.toFixed(4)} — nothing has been saved or sent yet.
          </p>
          <pre className="brief">{preview.text}</pre>
          <div className="row">
            <button onClick={handleActivate} disabled={loading}>
              {loading ? "Activating…" : "Activate"}
            </button>
            <button className="secondary" onClick={() => setStep(STEP_SLOTS)} disabled={loading}>
              Back
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function SlotField({ slot, value, onChange }) {
  if (slot.type === "select") {
    return (
      <>
        <label>{slot.label}</label>
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          {slot.options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </>
    );
  }
  return (
    <>
      <label>{slot.label}</label>
      <input
        type={slot.type === "email" ? "email" : slot.type === "number" ? "number" : slot.type === "date" ? "date" : "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </>
  );
}
