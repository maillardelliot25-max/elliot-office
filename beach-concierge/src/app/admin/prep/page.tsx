import { prisma } from "@/lib/prisma";
import { todayISO, formatDateLong } from "@/lib/date";

export default async function PrepChecklistPage({
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
  const chairsNeeded = bookings
    .filter((b) => b.package.pricingModel === "PER_PERSON")
    .reduce((sum, b) => sum + b.partySize, 0);
  const cabanaSetups = bookings.filter((b) => b.package.pricingModel === "FLAT").length;
  const setupsDone = bookings.filter((b) => b.setupComplete).length;

  const guestsByPackage = new Map<string, number>();
  for (const b of bookings) {
    guestsByPackage.set(b.package.name, (guestsByPackage.get(b.package.name) ?? 0) + b.partySize);
  }

  const foodTotals = new Map<string, number>();
  const drinkOrders: { zone: string; beach: string; client: string; items: string[] }[] = [];
  const extraTotals = new Map<string, number>();

  for (const b of bookings) {
    const drinkItems: string[] = [];
    for (const a of b.addOns) {
      if (a.addOn.category === "FOOD") {
        foodTotals.set(a.addOn.name, (foodTotals.get(a.addOn.name) ?? 0) + a.quantity);
      } else if (a.addOn.category === "DRINK_RELAY") {
        drinkItems.push(`${a.addOn.name} x${a.quantity}`);
      } else {
        extraTotals.set(a.addOn.name, (extraTotals.get(a.addOn.name) ?? 0) + a.quantity);
      }
    }
    if (drinkItems.length > 0) {
      drinkOrders.push({ zone: b.zone.label, beach: b.beach.name, client: b.clientName, items: drinkItems });
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Prep checklist</h1>
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

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Zones to set up" value={bookings.length} />
        <StatCard label="Set up already" value={`${setupsDone} / ${bookings.length}`} />
        <StatCard label="Total guests" value={totalGuests} />
        <StatCard label="Chairs needed" value={chairsNeeded} />
      </div>

      <Section title="Package-bundled food (per guest count)">
        {guestsByPackage.size === 0 ? (
          <Empty />
        ) : (
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
            {Array.from(guestsByPackage.entries()).map(([name, guests]) => (
              <li key={name}>
                {name}: food for {guests} guests
              </li>
            ))}
          </ul>
        )}
        {cabanaSetups > 0 && (
          <p className="mt-2 text-sm text-slate-500">
            Includes {cabanaSetups} flat-rate cabana setup(s) — furniture, not per-person chairs.
          </p>
        )}
      </Section>

      <Section title="Extra food add-ons">
        {foodTotals.size === 0 ? (
          <Empty />
        ) : (
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
            {Array.from(foodTotals.entries()).map(([name, qty]) => (
              <li key={name}>
                {name}: {qty}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Drink orders to relay to the partner bar (by zone)">
        {drinkOrders.length === 0 ? (
          <Empty />
        ) : (
          <ul className="space-y-2 text-sm text-slate-700">
            {drinkOrders.map((o, i) => (
              <li key={i} className="rounded-md border border-slate-200 p-2">
                <span className="font-medium text-slate-900">
                  {o.beach} · Zone {o.zone}
                </span>{" "}
                ({o.client}): {o.items.join(", ")}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Extras">
        {extraTotals.size === 0 ? (
          <Empty />
        ) : (
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
            {Array.from(extraTotals.entries()).map(([name, qty]) => (
              <li key={name}>
                {name}: {qty}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-2 font-semibold text-slate-900">{title}</h2>
      {children}
    </div>
  );
}

function Empty() {
  return <p className="text-sm text-slate-400">Nothing needed for this date.</p>;
}
