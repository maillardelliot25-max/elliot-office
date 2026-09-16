import { prisma } from "@/lib/prisma";
import { createVendor, deleteVendor } from "./actions";

export default async function VendorsAdminPage() {
  const beaches = await prisma.beach.findMany({
    include: { vendors: true },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Vendors & partners</h1>
      <p className="mt-1 text-sm text-slate-500">
        Third parties we coordinate with per beach — like the partner bar. We
        never stock, sell, or hold inventory for what they supply.
      </p>

      {beaches.map((beach) => (
        <div key={beach.id} className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="font-semibold text-slate-900">{beach.name}</h2>
          <div className="mt-3 space-y-2">
            {beach.vendors.map((vendor) => (
              <div
                key={vendor.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-100 p-3"
              >
                <div>
                  <p className="font-medium text-slate-900">
                    {vendor.name} <span className="text-xs font-normal text-slate-400">({vendor.role})</span>
                  </p>
                  <p className="text-sm text-slate-500">{vendor.supplies}</p>
                  {vendor.contact && <p className="text-xs text-slate-400">{vendor.contact}</p>}
                </div>
                <form action={deleteVendor.bind(null, vendor.id)}>
                  <button className="text-xs text-red-600 underline">Remove</button>
                </form>
              </div>
            ))}
            {beach.vendors.length === 0 && (
              <p className="text-sm text-slate-400">No vendors added yet.</p>
            )}
          </div>

          <form action={createVendor} className="mt-4 grid grid-cols-1 gap-2 rounded-md bg-slate-50 p-3 sm:grid-cols-2">
            <input type="hidden" name="beachId" value={beach.id} />
            <label className="flex flex-col gap-1 text-xs text-slate-600">
              Name
              <input name="name" required className="rounded border border-slate-300 px-2 py-1.5 text-sm" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-600">
              Role
              <input
                name="role"
                required
                placeholder="Partner bar"
                className="rounded border border-slate-300 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-600 sm:col-span-2">
              What they supply
              <input name="supplies" required className="rounded border border-slate-300 px-2 py-1.5 text-sm" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-600">
              Contact
              <input name="contact" className="rounded border border-slate-300 px-2 py-1.5 text-sm" />
            </label>
            <button className="mt-1 w-fit self-end rounded-full bg-sky-600 px-4 py-1.5 text-sm font-semibold text-white">
              Add vendor
            </button>
          </form>
        </div>
      ))}
    </div>
  );
}
