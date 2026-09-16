"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import type { ParsedZone, ParsedPackage, ParsedAddOn } from "@/lib/parse";
import { ZoneMap } from "@/components/ZoneMap";
import { computeTotals, formatTTD, type AddOnSelection } from "@/lib/pricing";
import { ADDON_CATEGORY_LABELS } from "@/lib/labels";
import { nextSaturdayISO, todayISO, formatDateLong } from "@/lib/date";

const STEPS = ["Date & zone", "Package", "Add-ons", "Your details", "Review & pay"] as const;

export function BookingWizard({
  beach,
  zones,
  packages,
  addOns,
}: {
  beach: { id: string; slug: string; name: string; mapWidth: number; mapHeight: number; mapImageUrl: string | null };
  zones: ParsedZone[];
  packages: ParsedPackage[];
  addOns: ParsedAddOn[];
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);

  const [date, setDate] = useState(nextSaturdayISO());
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [bookedZoneIds, setBookedZoneIds] = useState<string[]>([]);
  const [loadingAvailability, setLoadingAvailability] = useState(false);

  const [packageId, setPackageId] = useState<string | null>(packages[0]?.id ?? null);
  const [addOnQty, setAddOnQty] = useState<Record<string, number>>({});

  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [partySize, setPartySize] = useState(2);
  const [notes, setNotes] = useState("");
  const [paymentPlan, setPaymentPlan] = useState<"full" | "deposit">("deposit");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading flag for an async fetch this effect owns
    setLoadingAvailability(true);
    fetch(`/api/availability?beachId=${beach.id}&date=${date}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setBookedZoneIds(data.bookedZoneIds ?? []);
      })
      .finally(() => {
        if (!cancelled) setLoadingAvailability(false);
      });
    return () => {
      cancelled = true;
    };
  }, [beach.id, date]);

  // If the zone we had selected became taken (e.g. after changing the date),
  // treat it as unselected without a separate effect/render round-trip.
  const effectiveZoneId = zoneId && bookedZoneIds.includes(zoneId) ? null : zoneId;

  const selectedZone = zones.find((z) => z.id === effectiveZoneId) ?? null;
  const selectedPackage = packages.find((p) => p.id === packageId) ?? null;

  const addOnSelections: AddOnSelection[] = useMemo(
    () =>
      addOns
        .filter((a) => (addOnQty[a.id] ?? 0) > 0)
        .map((a) => ({
          addOnId: a.id,
          name: a.name,
          unitPrice: a.price,
          quantity: addOnQty[a.id] ?? 0,
        })),
    [addOns, addOnQty]
  );

  const { lines, total, deposit } = computeTotals(selectedPackage, partySize, addOnSelections);
  const amountDue = paymentPlan === "deposit" ? deposit : total;

  const canProceed = [
    !!effectiveZoneId,
    !!packageId,
    true,
    clientName.trim().length >= 2 && clientPhone.trim().length >= 7 && partySize >= 1,
    true,
  ][step];

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          beachId: beach.id,
          zoneId: effectiveZoneId,
          packageId,
          date,
          clientName: clientName.trim(),
          clientPhone: clientPhone.trim(),
          clientEmail: clientEmail.trim() || undefined,
          partySize,
          notes: notes.trim() || undefined,
          paymentPlan,
          addOns: addOnSelections,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error ?? "Something went wrong.");
        if (res.status === 409) {
          setStep(0);
          setZoneId(null);
        }
        return;
      }
      router.push(`/book/${beach.slug}/confirmation/${data.bookingId}`);
    } catch {
      setSubmitError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <ol className="mb-8 flex flex-wrap gap-2 text-sm">
        {STEPS.map((label, i) => (
          <li key={label}>
            <button
              type="button"
              disabled={i > step}
              onClick={() => i < step && setStep(i)}
              className={clsx(
                "rounded-full px-3 py-1 font-medium",
                i === step && "bg-sky-600 text-white",
                i < step && "cursor-pointer bg-sky-100 text-sky-700",
                i > step && "cursor-not-allowed bg-slate-100 text-slate-400"
              )}
            >
              {i + 1}. {label}
            </button>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
              Date
              <input
                type="date"
                value={date}
                min={todayISO()}
                onChange={(e) => setDate(e.target.value)}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <p className="text-sm text-slate-500">{formatDateLong(date)}</p>
            {loadingAvailability && <p className="text-sm text-slate-400">Checking availability…</p>}
          </div>

          <ZoneMap
            mapWidth={beach.mapWidth}
            mapHeight={beach.mapHeight}
            mapImageUrl={beach.mapImageUrl}
            zones={zones}
            bookedZoneIds={bookedZoneIds}
            selectedZoneId={effectiveZoneId}
            onSelectZone={setZoneId}
          />

          {selectedZone && (
            <p className="text-sm text-emerald-700">
              Zone {selectedZone.label} selected — fits up to {selectedZone.capacity} people.
            </p>
          )}
        </section>
      )}

      {step === 1 && (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {packages.map((pkg) => (
            <button
              key={pkg.id}
              type="button"
              onClick={() => setPackageId(pkg.id)}
              className={clsx(
                "flex flex-col rounded-xl border p-5 text-left transition",
                packageId === pkg.id
                  ? "border-sky-600 ring-2 ring-sky-200"
                  : "border-slate-200 hover:border-sky-300"
              )}
            >
              <h3 className="font-semibold text-slate-900">{pkg.name}</h3>
              <p className="mt-1 text-sm text-slate-500">{pkg.description}</p>
              <p className="mt-3 text-lg font-bold text-slate-900">
                {formatTTD(pkg.price)}
                <span className="text-xs font-normal text-slate-500">
                  {pkg.pricingModel === "PER_PERSON" ? " / person" : " flat"}
                </span>
              </p>
              <ul className="mt-3 space-y-1 text-sm text-slate-600">
                {pkg.includes.map((line) => (
                  <li key={line}>• {line}</li>
                ))}
              </ul>
            </button>
          ))}
        </section>
      )}

      {step === 2 && (
        <section className="flex flex-col gap-6">
          {(["FOOD", "DRINK_RELAY", "EXTRAS"] as const).map((category) => {
            const items = addOns.filter((a) => a.category === category);
            if (items.length === 0) return null;
            return (
              <div key={category}>
                <h3 className="mb-2 font-semibold text-slate-900">
                  {ADDON_CATEGORY_LABELS[category]}
                </h3>
                {category === "DRINK_RELAY" && (
                  <p className="mb-2 text-xs text-slate-500">
                    We don&apos;t sell alcohol directly — these orders are relayed to
                    the partner bar and delivered to your zone.
                  </p>
                )}
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {items.map((item) => {
                    const qty = addOnQty[item.id] ?? 0;
                    return (
                      <div
                        key={item.id}
                        className="flex items-center justify-between rounded-lg border border-slate-200 p-3"
                      >
                        <div>
                          <p className="text-sm font-medium text-slate-900">{item.name}</p>
                          <p className="text-xs text-slate-500">{item.description}</p>
                          <p className="text-xs text-slate-600">
                            {formatTTD(item.price)} / {item.unit}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setAddOnQty((q) => ({ ...q, [item.id]: Math.max(0, qty - 1) }))
                            }
                            className="h-7 w-7 rounded-full border border-slate-300 text-slate-600"
                          >
                            −
                          </button>
                          <span className="w-4 text-center text-sm">{qty}</span>
                          <button
                            type="button"
                            onClick={() => setAddOnQty((q) => ({ ...q, [item.id]: qty + 1 }))}
                            className="h-7 w-7 rounded-full border border-slate-300 text-slate-600"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {step === 3 && (
        <section className="grid max-w-lg grid-cols-1 gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            Full name
            <input
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="Alicia Ramnarine"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            Phone number
            <input
              value={clientPhone}
              onChange={(e) => setClientPhone(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="868-555-0100"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            Email (optional)
            <input
              type="email"
              value={clientEmail}
              onChange={(e) => setClientEmail(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="alicia@example.com"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            Party size
            <input
              type="number"
              min={1}
              max={selectedZone?.capacity ?? 60}
              value={partySize}
              onChange={(e) => setPartySize(Number(e.target.value) || 1)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            {selectedZone && (
              <span className="text-xs text-slate-500">
                Zone {selectedZone.label} fits up to {selectedZone.capacity} people.
              </span>
            )}
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            Notes for our team (optional)
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="Celebrating a birthday, need shade for a toddler, etc."
            />
          </label>
        </section>
      )}

      {step === 4 && (
        <section className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4 text-sm text-slate-700">
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <h3 className="mb-2 font-semibold text-slate-900">Trip details</h3>
              <p>{beach.name} — {formatDateLong(date)}</p>
              <p>Zone {selectedZone?.label} ({selectedZone && selectedZone.capacity}-person capacity)</p>
              <p>{clientName} · {clientPhone} · Party of {partySize}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <h3 className="mb-2 font-semibold text-slate-900">Payment</h3>
              <div className="flex gap-3">
                {(["deposit", "full"] as const).map((plan) => (
                  <button
                    key={plan}
                    type="button"
                    onClick={() => setPaymentPlan(plan)}
                    className={clsx(
                      "flex-1 rounded-lg border px-3 py-2 text-left",
                      paymentPlan === plan ? "border-sky-600 ring-2 ring-sky-200" : "border-slate-200"
                    )}
                  >
                    <p className="font-medium">{plan === "deposit" ? "30% deposit" : "Pay in full"}</p>
                    <p className="text-xs text-slate-500">
                      {plan === "deposit" ? formatTTD(deposit) : formatTTD(total)} due now
                    </p>
                  </button>
                ))}
              </div>
              <p className="mt-3 text-xs text-slate-500">
                Payment is confirmed by bank transfer: we&apos;ll show your transfer
                details and reference on the next screen. Online card payment
                (WiPay) is coming soon.
              </p>
            </div>
            {submitError && (
              <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{submitError}</p>
            )}
          </div>

          <div className="h-fit rounded-lg border border-slate-200 bg-white p-4">
            <h3 className="mb-2 font-semibold text-slate-900">Price summary</h3>
            <ul className="space-y-1 text-sm text-slate-700">
              {lines.map((line) => (
                <li key={line.label} className="flex justify-between">
                  <span>{line.label}</span>
                  <span>{formatTTD(line.amount)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex justify-between border-t border-slate-200 pt-2 font-semibold text-slate-900">
              <span>Total</span>
              <span>{formatTTD(total)}</span>
            </div>
            <div className="mt-1 flex justify-between text-sm text-sky-700">
              <span>Due now ({paymentPlan})</span>
              <span>{formatTTD(amountDue)}</span>
            </div>
            <button
              type="button"
              disabled={submitting}
              onClick={handleSubmit}
              className="mt-4 w-full rounded-full bg-sky-600 py-2.5 font-semibold text-white transition hover:bg-sky-700 disabled:opacity-50"
            >
              {submitting ? "Booking…" : "Confirm booking"}
            </button>
          </div>
        </section>
      )}

      <div className="mt-8 flex justify-between">
        <button
          type="button"
          disabled={step === 0}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          className="rounded-full border border-slate-300 px-5 py-2 text-sm font-medium text-slate-700 disabled:opacity-40"
        >
          Back
        </button>
        {step < STEPS.length - 1 && (
          <button
            type="button"
            disabled={!canProceed}
            onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
            className="rounded-full bg-sky-600 px-6 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            Continue
          </button>
        )}
      </div>
    </div>
  );
}
