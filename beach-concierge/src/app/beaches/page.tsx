import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function BeachesPage() {
  const beaches = await prisma.beach.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-bold text-slate-900">Choose a beach</h1>
      <p className="mt-1 text-slate-600">
        More beaches are added regularly — each one has its own zone map and
        packages.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {beaches.map((beach) => (
          <Link
            key={beach.id}
            href={`/book/${beach.slug}`}
            className="rounded-xl border border-slate-200 bg-white p-5 transition hover:border-sky-400 hover:shadow-md"
          >
            <h2 className="text-lg font-semibold text-slate-900">{beach.name}</h2>
            <p className="text-sm text-slate-500">{beach.region}</p>
            <p className="mt-2 text-sm text-slate-600">{beach.description}</p>
            <span className="mt-4 inline-block text-sm font-medium text-sky-700">
              Book this beach →
            </span>
          </Link>
        ))}
        {beaches.length === 0 && (
          <p className="text-slate-500">No beaches are open for booking yet.</p>
        )}
      </div>
    </div>
  );
}
