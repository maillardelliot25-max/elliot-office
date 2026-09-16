import { prisma } from "@/lib/prisma";
import { parsePackage } from "@/lib/parse";
import { formatTTD } from "@/lib/pricing";
import { createPackage, togglePackageActive } from "./actions";

export default async function PackagesAdminPage() {
  const beaches = await prisma.beach.findMany({
    include: { packages: { orderBy: { sortOrder: "asc" } } },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Packages</h1>
      <p className="mt-1 text-sm text-slate-500">
        Per-beach pricing tiers. Toggle a package off to hide it from the
        booking flow without deleting it.
      </p>

      {beaches.map((beach) => (
        <div key={beach.id} className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="font-semibold text-slate-900">{beach.name}</h2>
          <div className="mt-3 space-y-2">
            {beach.packages.map((pkgRaw) => {
              const pkg = parsePackage(pkgRaw);
              return (
                <div
                  key={pkg.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-100 p-3"
                >
                  <div>
                    <p className="font-medium text-slate-900">{pkg.name}</p>
                    <p className="text-sm text-slate-500">
                      {formatTTD(pkg.price)} {pkg.pricingModel === "PER_PERSON" ? "/ person" : "flat"}
                    </p>
                  </div>
                  <form action={togglePackageActive.bind(null, pkg.id)}>
                    <button
                      className={
                        "rounded-full px-3 py-1 text-xs font-medium " +
                        (pkg.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500")
                      }
                    >
                      {pkg.isActive ? "Active" : "Hidden"}
                    </button>
                  </form>
                </div>
              );
            })}
            {beach.packages.length === 0 && (
              <p className="text-sm text-slate-400">No packages yet.</p>
            )}
          </div>

          <form action={createPackage} className="mt-4 grid grid-cols-1 gap-2 rounded-md bg-slate-50 p-3 sm:grid-cols-2">
            <input type="hidden" name="beachId" value={beach.id} />
            <label className="flex flex-col gap-1 text-xs text-slate-600">
              Name
              <input name="name" required className="rounded border border-slate-300 px-2 py-1.5 text-sm" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-600">
              Price (TTD)
              <input
                type="number"
                name="price"
                step="0.01"
                min={0}
                required
                className="rounded border border-slate-300 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-600">
              Pricing model
              <select name="pricingModel" className="rounded border border-slate-300 px-2 py-1.5 text-sm">
                <option value="PER_PERSON">Per person</option>
                <option value="FLAT">Flat rate</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-600">
              Sort order
              <input
                type="number"
                name="sortOrder"
                defaultValue={0}
                className="rounded border border-slate-300 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-600 sm:col-span-2">
              Description
              <input name="description" className="rounded border border-slate-300 px-2 py-1.5 text-sm" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-600 sm:col-span-2">
              Includes (one per line)
              <textarea
                name="includes"
                rows={3}
                className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                placeholder={"Beach chair per person\nUmbrella"}
              />
            </label>
            <button className="mt-1 w-fit rounded-full bg-sky-600 px-4 py-1.5 text-sm font-semibold text-white sm:col-span-2">
              Add package to {beach.name}
            </button>
          </form>
        </div>
      ))}
    </div>
  );
}
