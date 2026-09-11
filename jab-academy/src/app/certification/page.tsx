"use client";

import { useState, FormEvent } from "react";

type CertResult = {
  certId: string;
  fullName: string;
  discipline: string;
  fireSafetyLevel: string;
  issueDate: string;
  expiryDate: string;
  status: string;
  issuedBy: string;
};

export default function CertificationPage() {
  const [certId, setCertId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CertResult | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (e: FormEvent) => {
    e.preventDefault();
    if (!certId.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setNotFound(false);
    try {
      const res = await fetch(`/api/certifications/verify?certId=${encodeURIComponent(certId.trim())}`);
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (!res.ok) throw new Error("Something went wrong. Please try again.");
      const data = await res.json();
      setResult(data.certification);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-jab-black pt-32 pb-24">
      <div className="mx-auto max-w-2xl px-6">
        <p className="section-eyebrow mb-4">International Certification &amp; Safety Registry</p>
        <h1 className="font-display text-4xl font-extrabold tracking-tight mb-3">
          Verify a Fire &amp; Jab Performance Credential
        </h1>
        <p className="text-white/60 mb-10">
          Enter a performer&apos;s certification ID to instantly confirm they meet
          international fire safety, liability, and HSE standards — signed by King Aaron.
        </p>

        <form onSubmit={handleSearch} className="flex gap-3 mb-4">
          <input
            value={certId}
            onChange={(e) => setCertId(e.target.value)}
            className="input"
            placeholder="e.g. ITJPA-2026-00003"
          />
          <button
            type="submit"
            disabled={loading}
            className="btn-primary shrink-0 disabled:opacity-40"
          >
            {loading ? "Searching…" : "Verify"}
          </button>
        </form>
        <p className="text-xs text-white/40 mb-10">
          Try a demo ID: ITJPA-2026-00001 through ITJPA-2026-00005
        </p>

        {error && <p className="text-jab-red text-sm mb-6">{error}</p>}

        {notFound && (
          <div className="card-surface rounded-3xl p-8 border-jab-red/40">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl">⚠️</span>
              <h2 className="font-display text-xl font-bold">No Record Found</h2>
            </div>
            <p className="text-white/60 text-sm">
              This ID does not match any credential in our registry. Double-check the ID or
              contact the Academy at bookings@jabacademy.tt to confirm.
            </p>
          </div>
        )}

        {result && (
          <div
            className={`card-surface rounded-3xl p-8 border-2 ${
              result.status === "active" ? "border-jab-gold/50" : "border-jab-red/50"
            }`}
          >
            <div className="flex items-center justify-between mb-6">
              <span
                className={`text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full ${
                  result.status === "active"
                    ? "bg-jab-gold/20 text-jab-gold"
                    : "bg-jab-red/20 text-jab-red"
                }`}
              >
                {result.status === "active" ? "✓ Active Credential" : "✕ Expired / Revoked"}
              </span>
              <span className="text-xs text-white/40 font-mono">{result.certId}</span>
            </div>

            <h2 className="font-display text-2xl font-bold mb-1">{result.fullName}</h2>
            <p className="text-jab-gold text-sm font-semibold mb-6">{result.discipline}</p>

            <dl className="grid sm:grid-cols-2 gap-5 text-sm">
              <div>
                <dt className="text-white/40 mb-1">Fire Safety Level</dt>
                <dd className="text-white/85">{result.fireSafetyLevel}</dd>
              </div>
              <div>
                <dt className="text-white/40 mb-1">Issued By</dt>
                <dd className="text-white/85">{result.issuedBy}</dd>
              </div>
              <div>
                <dt className="text-white/40 mb-1">Issue Date</dt>
                <dd className="text-white/85">
                  {new Date(result.issueDate).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </dd>
              </div>
              <div>
                <dt className="text-white/40 mb-1">Expiry Date</dt>
                <dd className="text-white/85">
                  {new Date(result.expiryDate).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </dd>
              </div>
            </dl>
          </div>
        )}
      </div>
    </div>
  );
}
