import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { parseZone, parsePackage, parseAddOn } from "@/lib/parse";
import { BookingWizard } from "@/components/BookingWizard";

export default async function BookBeachPage({
  params,
}: {
  params: Promise<{ beachSlug: string }>;
}) {
  const { beachSlug } = await params;

  const beach = await prisma.beach.findUnique({
    where: { slug: beachSlug },
    include: {
      zones: { orderBy: { label: "asc" } },
      packages: { where: { isActive: true }, orderBy: { sortOrder: "asc" } },
      addOns: { where: { isActive: true }, orderBy: { sortOrder: "asc" } },
    },
  });

  if (!beach || !beach.isActive) notFound();

  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-slate-200 bg-white px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <h1 className="text-2xl font-bold text-slate-900">Book {beach.name}</h1>
          <p className="text-sm text-slate-500">{beach.region}</p>
        </div>
      </div>
      <BookingWizard
        beach={{
          id: beach.id,
          slug: beach.slug,
          name: beach.name,
          mapWidth: beach.mapWidth,
          mapHeight: beach.mapHeight,
          mapImageUrl: beach.mapImageUrl,
        }}
        zones={beach.zones.map(parseZone)}
        packages={beach.packages.map(parsePackage)}
        addOns={beach.addOns.map(parseAddOn)}
      />
    </div>
  );
}
