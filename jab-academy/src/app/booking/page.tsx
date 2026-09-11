"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";

const eventTypes = [
  "Soca Music Video",
  "Carnival / Mas Band",
  "Corporate Show / Activation",
  "International Festival Tour",
  "Theater Production",
  "Private Event",
];

const talentOptions = [
  "King Aaron (Master Instructor)",
  "Certified Graduate Troupe",
  "Jab Molassie Performer(s)",
  "Blue Devil Performer(s)",
  "Red Devil Performer(s)",
  "Rope Jab / Jab Jab Performer(s)",
];

const budgetRanges = [
  "Under $2,000 USD",
  "$2,000 – $5,000 USD",
  "$5,000 – $15,000 USD",
  "$15,000+ USD",
  "Let's discuss",
];

export default function BookingPage() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [form, setForm] = useState({
    organization: "",
    contactName: "",
    email: "",
    phone: "",
    eventType: eventTypes[0],
    eventDate: "",
    location: "",
    talentRequested: talentOptions[0],
    performerCount: 1,
    budgetRange: budgetRanges[0],
    message: "",
  });

  const update = (key: keyof typeof form, value: string | number) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong. Please try again.");
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
          <div className="text-5xl mb-4">📩</div>
          <h1 className="font-display text-2xl font-bold mb-3">Request Sent</h1>
          <p className="text-white/70">{success}</p>
          <Link href="/" className="btn-primary mt-8 inline-flex">
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-jab-black pt-32 pb-24">
      <div className="mx-auto max-w-2xl px-6">
        <p className="section-eyebrow mb-4">Talent Agency Booking Portal</p>
        <h1 className="font-display text-4xl font-extrabold tracking-tight mb-3">
          Book Certified Talent
        </h1>
        <p className="text-white/60 mb-10">
          For international video directors, festival promoters, and Soca artistes hiring
          King Aaron or certified graduate troupes.
        </p>

        <form onSubmit={handleSubmit} className="card-surface rounded-3xl p-8 sm:p-10 space-y-5">
          <div className="grid sm:grid-cols-2 gap-5">
            <Field label="Organization / production name">
              <input
                required
                value={form.organization}
                onChange={(e) => update("organization", e.target.value)}
                className="input"
                placeholder="e.g. Sunset Soca Productions"
              />
            </Field>
            <Field label="Contact name">
              <input
                required
                value={form.contactName}
                onChange={(e) => update("contactName", e.target.value)}
                className="input"
              />
            </Field>
          </div>

          <div className="grid sm:grid-cols-2 gap-5">
            <Field label="Email">
              <input
                required
                type="email"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                className="input"
              />
            </Field>
            <Field label="Phone (optional)">
              <input
                value={form.phone}
                onChange={(e) => update("phone", e.target.value)}
                className="input"
              />
            </Field>
          </div>

          <Field label="Event type">
            <select
              value={form.eventType}
              onChange={(e) => update("eventType", e.target.value)}
              className="input"
            >
              {eventTypes.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </Field>

          <div className="grid sm:grid-cols-2 gap-5">
            <Field label="Event date (optional)">
              <input
                type="date"
                value={form.eventDate}
                onChange={(e) => update("eventDate", e.target.value)}
                className="input"
              />
            </Field>
            <Field label="Location">
              <input
                required
                value={form.location}
                onChange={(e) => update("location", e.target.value)}
                className="input"
                placeholder="City, Country"
              />
            </Field>
          </div>

          <Field label="Talent requested">
            <select
              value={form.talentRequested}
              onChange={(e) => update("talentRequested", e.target.value)}
              className="input"
            >
              {talentOptions.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </Field>

          <div className="grid sm:grid-cols-2 gap-5">
            <Field label="Number of performers">
              <input
                type="number"
                min={1}
                max={200}
                value={form.performerCount}
                onChange={(e) => update("performerCount", Number(e.target.value))}
                className="input"
              />
            </Field>
            <Field label="Budget range">
              <select
                value={form.budgetRange}
                onChange={(e) => update("budgetRange", e.target.value)}
                className="input"
              >
                {budgetRanges.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Tell us about the engagement">
            <textarea
              required
              minLength={10}
              value={form.message}
              onChange={(e) => update("message", e.target.value)}
              className="input min-h-[120px]"
              placeholder="Concept, run-of-show, wardrobe needs, fire-performance requirements…"
            />
          </Field>

          {error && <p className="text-jab-red text-sm">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="btn-primary w-full disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? "Sending…" : "Submit Booking Request"}
          </button>
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
