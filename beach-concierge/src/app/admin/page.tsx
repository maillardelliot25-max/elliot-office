import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { todayISO } from "@/lib/date";

export default async function AdminHome() {
  const today = todayISO();
  const [beachCount, upcomingCount, pendingPaymentCount] = await Promise.all([
    prisma.beach.count(),
    prisma.booking.count({ where: { date: { gte: today }, status: { not: "CANCELLED" } } }),
    prisma.booking.count({ where: { paymentStatus: "UNPAID", status: { not: "CANCELLED" } } }),
  ]);

  const cards = [
    { label: "Active beaches", value: beachCount, href: "/admin/beaches" },
    { label: "Upcoming bookings", value: upcomingCount, href: "/admin/manifest" },
    { label: "Awaiting payment", value: pendingPaymentCount, href: "/admin/manifest" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Ops dashboard</h1>
      <p className="mt-1 text-sm text-slate-500">
        Run the day, manage beaches, and keep packages/add-ons up to date.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className="rounded-xl border border-slate-200 bg-white p-5 hover:border-sky-300"
          >
            <p className="text-3xl font-bold text-slate-900">{card.value}</p>
            <p className="text-sm text-slate-500">{card.label}</p>
          </Link>
        ))}
      </div>

      <div className="mt-8 rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
        <h2 className="font-semibold text-slate-900">Today: {today}</h2>
        <p className="mt-1">
          Head to <Link className="text-sky-700 underline" href={`/admin/manifest?date=${today}`}>
            today&apos;s manifest
          </Link>{" "}
          or <Link className="text-sky-700 underline" href={`/admin/prep?date=${today}`}>
            prep checklist
          </Link>.
        </p>
      </div>
    </div>
  );
}
