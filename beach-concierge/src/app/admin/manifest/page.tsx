import { prisma } from "@/lib/prisma";
import { todayISO, formatDateLong } from "@/lib/date";
import { formatTTD } from "@/lib/pricing";
import { BOOKING_STATUS_LABELS, PAYMENT_STATUS_LABELS } from "@/lib/labels";
import {
  toggleSetupComplete,
  toggleFoodDelivered,
  markDepositPaid,
  markPaidInFull,
  cancelBooking,
} from "./actions";

export default async function ManifestPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date } = await searchParams;
  const selectedDate = date || todayISO();

  const bookings = await prisma.booking.findMany({
    where: { date: selectedDate, status: { not: "CANCELLED" } },
    include: { beach: true, zone: true, package: true, addOns: { include: { addOn: true } } },
    orderBy: [{ beach: { name: "asc" } }, { zone: { label: "asc" } }],
  });

  const totalGuests = bookings.reduce((sum, b) => sum + b.partySize, 0);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Daily manifest</h1>
          <p className="text-sm text-slate-500">{formatDateLong(selectedDate)}</p>
        </div>
        <form className="flex items-center gap-2">
          <input
            type="date"
            name="date"
            defaultValue={selectedDate}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
          <button className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white">
            Go
          </button>
        </form>
      </div>

      <p className="mt-3 text-sm text-slate-600">
        {bookings.length} bookings · {totalGuests} guests total
      </p>

      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Beach / Zone</th>
              <th className="px-3 py-2">Client</th>
              <th className="px-3 py-2">Package</th>
              <th className="px-3 py-2">Add-ons</th>
              <th className="px-3 py-2">Party</th>
              <th className="px-3 py-2">Payment</th>
              <th className="px-3 py-2">Day-of</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {bookings.map((b) => (
              <tr key={b.id} className="border-b border-slate-100 align-top">
                <td className="px-3 py-2">
                  <p className="font-medium text-slate-900">{b.beach.name}</p>
                  <p className="text-slate-500">Zone {b.zone.label}</p>
                </td>
                <td className="px-3 py-2">
                  <p className="font-medium text-slate-900">{b.clientName}</p>
                  <p className="text-slate-500">{b.clientPhone}</p>
                </td>
                <td className="px-3 py-2">{b.package.name}</td>
                <td className="px-3 py-2 text-slate-600">
                  {b.addOns.length === 0
                    ? "—"
                    : b.addOns.map((a) => `${a.addOn.name} x${a.quantity}`).join(", ")}
                </td>
                <td className="px-3 py-2">{b.partySize}</td>
                <td className="px-3 py-2">
                  <p>{PAYMENT_STATUS_LABELS[b.paymentStatus]}</p>
                  <p className="text-slate-500">{formatTTD(b.totalPrice)} total</p>
                  {b.paymentStatus !== "PAID" && (
                    <div className="mt-1 flex gap-2">
                      {b.paymentStatus === "UNPAID" && (
                        <form action={markDepositPaid.bind(null, b.id)}>
                          <button className="text-xs font-medium text-sky-700 underline">
                            Mark deposit paid
                          </button>
                        </form>
                      )}
                      <form action={markPaidInFull.bind(null, b.id)}>
                        <button className="text-xs font-medium text-emerald-700 underline">
                          Mark paid in full
                        </button>
                      </form>
                    </div>
                  )}
                </td>
                <td className="px-3 py-2">
                  <form action={toggleSetupComplete.bind(null, b.id)}>
                    <button
                      className={
                        "mb-1 block rounded px-2 py-0.5 text-xs font-medium " +
                        (b.setupComplete
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-100 text-slate-500")
                      }
                    >
                      {b.setupComplete ? "✓ Set up" : "Set up pending"}
                    </button>
                  </form>
                  <form action={toggleFoodDelivered.bind(null, b.id)}>
                    <button
                      className={
                        "block rounded px-2 py-0.5 text-xs font-medium " +
                        (b.foodDelivered
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-100 text-slate-500")
                      }
                    >
                      {b.foodDelivered ? "✓ Food delivered" : "Food pending"}
                    </button>
                  </form>
                  <p className="mt-1 text-slate-400">{BOOKING_STATUS_LABELS[b.status]}</p>
                </td>
                <td className="px-3 py-2">
                  <form action={cancelBooking.bind(null, b.id)}>
                    <button className="text-xs text-red-600 underline">Cancel</button>
                  </form>
                </td>
              </tr>
            ))}
            {bookings.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-slate-400">
                  No bookings for this date.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
