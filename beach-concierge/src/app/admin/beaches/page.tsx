import { prisma } from "@/lib/prisma";
import { createBeach, toggleBeachActive, generateZonesForBeach } from "./actions";

export default async function BeachesAdminPage() {
  const beaches = await prisma.beach.findMany({
    include: { _count: { select: { zones: true, packages: true, addOns: true, bookings: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Beaches & zones</h1>
      <p className="mt-1 text-sm text-slate-500">
        Launching a new beach is a data change: add it here, generate its zone
        grid, then add packages and add-ons — no code changes required.
      </p>

      <div className="mt-6 space-y-4">
        {beaches.map((beach) => (
          <div key={beach.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-semibold text-slate-900">
                  {beach.name}{" "}
                  <span className="text-xs font-normal text-slate-400">/{beach.slug}</span>
                </h2>
                <p className="text-sm text-slate-500">{beach.region}</p>
              </div>
              <form action={toggleBeachActive.bind(null, beach.id)}>
                <button
                  className={
                    "rounded-full px-3 py-1 text-xs font-medium " +
                    (beach.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500")
                  }
                >
                  {beach.isActive ? "Active — bookable" : "Inactive"}
                </button>
              </form>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              {beach._count.zones} zones · {beach._count.packages} packages ·{" "}
              {beach._count.addOns} add-ons · {beach._count.bookings} bookings
            </p>

            {beach._count.zones === 0 && (
              <form
                action={generateZonesForBeach.bind(null, beach.id)}
                className="mt-3 flex flex-wrap items-end gap-2 rounded-md bg-slate-50 p-3"
              >
                <p className="w-full text-xs text-slate-500">
                  No zones yet — generate a curved grid to get started (you can
                  fine-tune individual zones later).
                </p>
                <label className="flex flex-col text-xs text-slate-600">
                  Rows
                  <input
                    type="number"
                    name="rows"
                    defaultValue={6}
                    min={1}
                    max={30}
                    className="w-16 rounded border border-slate-300 px-2 py-1"
                  />
                </label>
                <label className="flex flex-col text-xs text-slate-600">
                  Columns
                  <input
                    type="number"
                    name="cols"
                    defaultValue={14}
                    min={1}
                    max={30}
                    className="w-16 rounded border border-slate-300 px-2 py-1"
                  />
                </label>
                <button className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white">
                  Generate zone grid
                </button>
              </form>
            )}
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 font-semibold text-slate-900">Add a beach</h2>
        <form action={createBeach} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm text-slate-700">
            Name
            <input name="name" required className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <label className="flex flex-col gap-1 text-sm text-slate-700">
            Slug (optional, auto from name)
            <input name="slug" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <label className="flex flex-col gap-1 text-sm text-slate-700">
            Region
            <input name="region" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <div className="flex gap-3">
            <label className="flex flex-1 flex-col gap-1 text-sm text-slate-700">
              Map width
              <input
                type="number"
                name="mapWidth"
                defaultValue={1000}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-sm text-slate-700">
              Map height
              <input
                type="number"
                name="mapHeight"
                defaultValue={600}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-sm text-slate-700 sm:col-span-2">
            Description
            <textarea name="description" rows={2} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <label className="flex flex-col gap-1 text-sm text-slate-700">
            Parking info
            <input name="parkingInfo" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <label className="flex flex-col gap-1 text-sm text-slate-700">
            Vendor row info
            <input name="vendorInfo" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <button className="mt-2 w-fit rounded-full bg-sky-600 px-5 py-2 text-sm font-semibold text-white sm:col-span-2">
            Add beach
          </button>
        </form>
      </div>
    </div>
  );
}
