import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatTTD } from "@/lib/pricing";
import { formatDateLong } from "@/lib/date";
import { BOOKING_STATUS_LABELS, PAYMENT_STATUS_LABELS } from "@/lib/labels";

export default async function ConfirmationPage({
  params,
}: {
  params: Promise<{ beachSlug: string; bookingId: string }>;
}) {
  const { beachSlug, bookingId } = await params;

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      beach: true,
      zone: true,
      package: true,
      addOns: { include: { addOn: true } },
    },
  });

  if (!booking || booking.beach.slug !== beachSlug) notFound();

  const amountDue = booking.depositAmount - booking.amountPaid;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
        <h1 className="text-xl font-bold text-emerald-900">Booking received!</h1>
        <p className="mt-1 text-sm text-emerald-800">
          We&apos;ve reserved zone {booking.zone.label} at {booking.beach.name} for{" "}
          {formatDateLong(booking.date)}. It&apos;s <strong>{BOOKING_STATUS_LABELS[booking.status]}</strong> until
          payment is confirmed.
        </p>
      </div>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-700">
        <h2 className="font-semibold text-slate-900">Booking reference</h2>
        <p className="font-mono text-slate-600">{booking.id}</p>

        <h2 className="mt-4 font-semibold text-slate-900">Details</h2>
        <ul className="mt-1 space-y-1">
          <li>{booking.package.name} · Party of {booking.partySize}</li>
          <li>Client: {booking.clientName} ({booking.clientPhone})</li>
          {booking.addOns.length > 0 && (
            <li>
              Add-ons: {booking.addOns.map((a) => `${a.addOn.name} x${a.quantity}`).join(", ")}
            </li>
          )}
        </ul>

        <h2 className="mt-4 font-semibold text-slate-900">Payment</h2>
        <p>Total: {formatTTD(booking.totalPrice)}</p>
        <p>
          Status: {PAYMENT_STATUS_LABELS[booking.paymentStatus]} — amount due now:{" "}
          <strong>{formatTTD(Math.max(amountDue, 0))}</strong>
        </p>
      </div>

      <div className="mt-6 rounded-xl border border-sky-200 bg-sky-50 p-5 text-sm text-sky-900">
        <h2 className="font-semibold">Pay by bank transfer</h2>
        <p className="mt-1">
          Online card payment is coming soon. For now, confirm your booking with
          a bank transfer using the details below, and quote your booking
          reference above.
        </p>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt className="text-sky-700">Bank</dt>
          <dd>Island Trust Bank (example — update in Admin)</dd>
          <dt className="text-sky-700">Account name</dt>
          <dd>Beach Day Concierge Ltd</dd>
          <dt className="text-sky-700">Account number</dt>
          <dd>0000-000-000</dd>
          <dt className="text-sky-700">Reference</dt>
          <dd className="font-mono">{booking.id.slice(0, 10)}</dd>
        </dl>
        <p className="mt-3 text-xs text-sky-700">
          Our team will mark your booking as paid once the transfer is confirmed.
        </p>
      </div>

      <Link href="/beaches" className="mt-6 inline-block text-sm font-medium text-sky-700">
        ← Book another day
      </Link>
    </div>
  );
}
