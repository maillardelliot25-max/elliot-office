import { prisma } from "@/lib/prisma";
import { parseAddOn } from "@/lib/parse";
import { formatTTD } from "@/lib/pricing";
import { ADDON_CATEGORY_LABELS } from "@/lib/labels";
import { createAddOn, toggleAddOnActive } from "./actions";

export default async function AddOnsAdminPage() {
  const beaches = await prisma.beach.findMany({
    include: { addOns: { orderBy: [{ category: "asc" }, { sortOrder: "asc" }] } },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Add-ons</h1>
      <p className="mt-1 text-sm text-slate-500">
        Food, drink-relay, and extras menu items, per beach. Drink-relay items
        are always fulfilled by the partner bar, never sold directly.
      </p>

      {beaches.map((beach) => (
        <div key={beach.id} className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="font-semibold text-slate-900">{beach.name}</h2>
          <div className="mt-3 space-y-2">
            {beach.addOns.map((addOnRaw) => {
              const addOn = parseAddOn(addOnRaw);
              return (
                <div
                  key={addOn.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-100 p-3"
                >
                  <div>
                    <p className="font-medium text-slate-900">
                      {addOn.name}{" "}
                      <span className="text-xs font-normal text-slate-400">
                        ({ADDON_CATEGORY_LABELS[addOn.category]})
                      </span>
                    </p>
                    <p className="text-sm text-slate-500">
                      {formatTTD(addOn.price)} / {addOn.unit}
                    </p>
                  </div>
                  <form action={toggleAddOnActive.bind(null, addOn.id)}>
                    <button
                      className={
                        "rounded-full px-3 py-1 text-xs font-medium " +
                        (addOn.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500")
                      }
                    >
                      {addOn.isActive ? "Active" : "Hidden"}
                    </button>
                  </form>
                </div>
              );
            })}
            {beach.addOns.length === 0 && (
              <p className="text-sm text-slate-400">No add-ons yet.</p>
            )}
          </div>

          <form action={createAddOn} className="mt-4 grid grid-cols-1 gap-2 rounded-md bg-slate-50 p-3 sm:grid-cols-2">
            <input type="hidden" name="beachId" value={beach.id} />
            <label className="flex flex-col gap-1 text-xs text-slate-600">
              Name
              <input name="name" required className="rounded border border-slate-300 px-2 py-1.5 text-sm" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-600">
              Category
              <select name="category" className="rounded border border-slate-300 px-2 py-1.5 text-sm">
                <option value="FOOD">Food</option>
                <option value="DRINK_RELAY">Drink relay</option>
                <option value="EXTRAS">Extras</option>
              </select>
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
              Unit
              <input
                name="unit"
                defaultValue="item"
                className="rounded border border-slate-300 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-600 sm:col-span-2">
              Description
              <input name="description" className="rounded border border-slate-300 px-2 py-1.5 text-sm" />
            </label>
            <button className="mt-1 w-fit rounded-full bg-sky-600 px-4 py-1.5 text-sm font-semibold text-white sm:col-span-2">
              Add add-on to {beach.name}
            </button>
          </form>
        </div>
      ))}
    </div>
  );
}
