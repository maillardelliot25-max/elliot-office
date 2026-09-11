"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";

const cohortOptions = ["November 2026", "January 2027", "March 2027", "May 2027"];
const disciplineOptions = [
  "Jab Molassie",
  "Blue Devil (Paramin Tradition)",
  "Red Devil",
  "Mud Jab",
  "Rope Jab (Jab Jab)",
  "All 5 Pillars (Full Track)",
];
const experienceOptions = [
  "Complete beginner",
  "Community mas experience",
  "Trained dancer / performer",
  "Professional Soca artiste / actor",
];

type Step = 1 | 2 | 3;

export default function EnrollPage() {
  const [step, setStep] = useState<Step>(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    country: "",
    discipline: disciplineOptions[5],
    cohortMonth: cohortOptions[0],
    experienceLevel: experienceOptions[0],
    waiverSignedName: "",
    waiverAccepted: false,
    notes: "",
  });

  const update = (key: keyof typeof form, value: string | boolean) =>
    setForm((f) => ({ ...f, [key]: value }));

  const canContinueStep1 =
    form.fullName.trim().length > 1 &&
    /\S+@\S+\.\S+/.test(form.email) &&
    form.phone.trim().length > 4 &&
    form.country.trim().length > 1;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Something went wrong. Please try again.");
      }
      setSuccess(data.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-jab-black flex items-center justify-center px-6 pt-24">
        <div className="max-w-md text-center card-surface rounded-3xl p-10">
          <div className="text-5xl mb-4">🔥</div>
          <h1 className="font-display text-2xl font-bold mb-3">You&apos;re Enrolled</h1>
          <p className="text-white/70">{success}</p>
          <Link href="/academy" className="btn-primary mt-8 inline-flex">
            View Curriculum
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-jab-black pt-32 pb-24">
      <div className="mx-auto max-w-2xl px-6">
        <p className="section-eyebrow mb-4">Student Enrollment</p>
        <h1 className="font-display text-4xl font-extrabold tracking-tight mb-3">
          Enroll in the 1-Month Academy
        </h1>
        <p className="text-white/60 mb-10">
          $1,200 USD, all-inclusive. Three quick steps: your details, discipline &amp;
          cohort, then your liability waiver.
        </p>

        <div className="flex items-center gap-2 mb-10">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-1.5 flex-1 rounded-full ${
                s <= step ? "bg-gradient-to-r from-jab-amber to-jab-red" : "bg-white/10"
              }`}
            />
          ))}
        </div>

        <form onSubmit={handleSubmit} className="card-surface rounded-3xl p-8 sm:p-10">
          {step === 1 && (
            <div className="space-y-5">
              <h2 className="font-display text-xl font-bold mb-2">Your Details</h2>
              <Field label="Full name">
                <input
                  required
                  value={form.fullName}
                  onChange={(e) => update("fullName", e.target.value)}
                  className="input"
                  placeholder="Jane Alexander"
                />
              </Field>
              <Field label="Email">
                <input
                  required
                  type="email"
                  value={form.email}
                  onChange={(e) => update("email", e.target.value)}
                  className="input"
                  placeholder="you@example.com"
                />
              </Field>
              <div className="grid sm:grid-cols-2 gap-5">
                <Field label="Phone">
                  <input
                    required
                    value={form.phone}
                    onChange={(e) => update("phone", e.target.value)}
                    className="input"
                    placeholder="+1 868 555 0100"
                  />
                </Field>
                <Field label="Country">
                  <input
                    required
                    value={form.country}
                    onChange={(e) => update("country", e.target.value)}
                    className="input"
                    placeholder="Trinidad & Tobago"
                  />
                </Field>
              </div>
              <button
                type="button"
                disabled={!canContinueStep1}
                onClick={() => setStep(2)}
                className="btn-primary w-full mt-4 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Continue
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <h2 className="font-display text-xl font-bold mb-2">Discipline &amp; Cohort</h2>
              <Field label="Which discipline are you enrolling in?">
                <select
                  value={form.discipline}
                  onChange={(e) => update("discipline", e.target.value)}
                  className="input"
                >
                  {disciplineOptions.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </Field>
              <Field label="Cohort start month">
                <select
                  value={form.cohortMonth}
                  onChange={(e) => update("cohortMonth", e.target.value)}
                  className="input"
                >
                  {cohortOptions.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </Field>
              <Field label="Experience level">
                <select
                  value={form.experienceLevel}
                  onChange={(e) => update("experienceLevel", e.target.value)}
                  className="input"
                >
                  {experienceOptions.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </Field>
              <Field label="Anything we should know? (optional)">
                <textarea
                  value={form.notes}
                  onChange={(e) => update("notes", e.target.value)}
                  className="input min-h-[90px]"
                  placeholder="Injuries, dietary needs, prior performance experience…"
                />
              </Field>
              <div className="flex gap-3 mt-4">
                <button type="button" onClick={() => setStep(1)} className="btn-secondary flex-1">
                  Back
                </button>
                <button type="button" onClick={() => setStep(3)} className="btn-primary flex-1">
                  Continue
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <h2 className="font-display text-xl font-bold mb-2">
                Liability Waiver &amp; Tuition
              </h2>
              <div className="rounded-2xl bg-white/5 border border-white/10 p-5 text-sm text-white/70 leading-relaxed max-h-48 overflow-y-auto">
                I acknowledge that Jab performance training involves fire-adjacent
                activity, physical exertion, and use of traditional materials. I confirm
                I am participating voluntarily, will follow all HSE safety instruction
                from Academy staff, and release The International Trinidadian Jab &amp;
                Performance Academy, King Aaron, and Elliot Maillard from liability for
                injury arising from ordinary training risks, except where caused by
                Academy negligence. I understand this program includes fire-adjacent
                activity and requires strict adherence to safety protocol at all times.
              </div>
              <Field label="Type your full legal name to sign">
                <input
                  required
                  value={form.waiverSignedName}
                  onChange={(e) => update("waiverSignedName", e.target.value)}
                  className="input"
                  placeholder="Full legal name"
                />
              </Field>
              <label className="flex items-start gap-3 text-sm text-white/70">
                <input
                  type="checkbox"
                  required
                  checked={form.waiverAccepted}
                  onChange={(e) => update("waiverAccepted", e.target.checked)}
                  className="mt-1 h-4 w-4 accent-jab-red"
                />
                I have read and accept the liability waiver above.
              </label>

              <div className="rounded-2xl border border-jab-amber/30 bg-jab-amber/5 p-5 text-sm text-white/70">
                <div className="flex items-center justify-between mb-1">
                  <span>All-inclusive tuition</span>
                  <span className="font-display font-bold text-lg">$1,200 USD</span>
                </div>
                <p className="text-xs text-white/40">
                  Demo checkout — no real payment is processed in this environment.
                  Production deployment connects this step to a live payment processor.
                </p>
              </div>

              {error && <p className="text-jab-red text-sm">{error}</p>}

              <div className="flex gap-3 mt-4">
                <button type="button" onClick={() => setStep(2)} className="btn-secondary flex-1">
                  Back
                </button>
                <button
                  type="submit"
                  disabled={submitting || !form.waiverAccepted || !form.waiverSignedName}
                  className="btn-primary flex-1 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {submitting ? "Processing…" : "Confirm & Pay $1,200"}
                </button>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm text-white/60 mb-2">{label}</span>
      {children}
    </label>
  );
}
