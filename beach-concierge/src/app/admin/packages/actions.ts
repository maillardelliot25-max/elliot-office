"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export async function createPackage(formData: FormData) {
  const beachId = String(formData.get("beachId") || "");
  const name = String(formData.get("name") || "").trim();
  if (!beachId || !name) return;

  const includes = String(formData.get("includes") || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  await prisma.package.create({
    data: {
      beachId,
      name,
      description: String(formData.get("description") || "").trim() || null,
      pricingModel: formData.get("pricingModel") === "FLAT" ? "FLAT" : "PER_PERSON",
      price: Number(formData.get("price")) || 0,
      includes: JSON.stringify(includes),
      sortOrder: Number(formData.get("sortOrder")) || 0,
    },
  });

  revalidatePath("/admin/packages");
  redirect("/admin/packages");
}

export async function togglePackageActive(packageId: string) {
  const pkg = await prisma.package.findUniqueOrThrow({ where: { id: packageId } });
  await prisma.package.update({ where: { id: packageId }, data: { isActive: !pkg.isActive } });
  revalidatePath("/admin/packages");
  redirect("/admin/packages");
}
