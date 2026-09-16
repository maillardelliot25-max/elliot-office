"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { generateZoneGrid } from "@/lib/zoneGrid";

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function createBeach(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  if (!name) return;

  const slugInput = String(formData.get("slug") || "").trim();
  const slug = slugify(slugInput || name);
  const mapWidth = Number(formData.get("mapWidth")) || 1000;
  const mapHeight = Number(formData.get("mapHeight")) || 600;

  await prisma.beach.create({
    data: {
      name,
      slug,
      region: String(formData.get("region") || "").trim(),
      description: String(formData.get("description") || "").trim() || null,
      parkingInfo: String(formData.get("parkingInfo") || "").trim() || null,
      vendorInfo: String(formData.get("vendorInfo") || "").trim() || null,
      mapWidth,
      mapHeight,
    },
  });

  revalidatePath("/admin/beaches");
  redirect("/admin/beaches");
}

export async function toggleBeachActive(beachId: string) {
  const beach = await prisma.beach.findUniqueOrThrow({ where: { id: beachId } });
  await prisma.beach.update({ where: { id: beachId }, data: { isActive: !beach.isActive } });
  revalidatePath("/admin/beaches");
  redirect("/admin/beaches");
}

export async function generateZonesForBeach(beachId: string, formData: FormData) {
  const beach = await prisma.beach.findUniqueOrThrow({ where: { id: beachId } });
  const existing = await prisma.zone.count({ where: { beachId } });
  if (existing > 0) return; // don't clobber a beach that already has zones

  const rows = Math.max(1, Math.min(30, Number(formData.get("rows")) || 6));
  const cols = Math.max(1, Math.min(30, Number(formData.get("cols")) || 14));

  const zones = generateZoneGrid({
    mapWidth: beach.mapWidth,
    mapHeight: beach.mapHeight,
    rows,
    cols,
  });

  await prisma.zone.createMany({
    data: zones.map((z) => ({
      beachId,
      label: z.label,
      section: z.section,
      amenities: JSON.stringify(z.amenities),
      polygon: JSON.stringify(z.polygon),
      centroidX: z.centroidX,
      centroidY: z.centroidY,
      capacity: z.capacity,
    })),
  });

  revalidatePath("/admin/beaches");
  redirect("/admin/beaches");
}
