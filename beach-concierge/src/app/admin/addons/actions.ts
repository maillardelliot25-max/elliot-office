"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AddOnCategory } from "@/generated/prisma/client";

export async function createAddOn(formData: FormData) {
  const beachId = String(formData.get("beachId") || "");
  const name = String(formData.get("name") || "").trim();
  if (!beachId || !name) return;

  const categoryRaw = String(formData.get("category") || "FOOD");
  const category: AddOnCategory = (
    ["FOOD", "DRINK_RELAY", "EXTRAS"] as const
  ).includes(categoryRaw as AddOnCategory)
    ? (categoryRaw as AddOnCategory)
    : "FOOD";

  await prisma.addOn.create({
    data: {
      beachId,
      category,
      name,
      description: String(formData.get("description") || "").trim() || null,
      price: Number(formData.get("price")) || 0,
      unit: String(formData.get("unit") || "item").trim() || "item",
      sortOrder: Number(formData.get("sortOrder")) || 0,
    },
  });

  revalidatePath("/admin/addons");
  redirect("/admin/addons");
}

export async function toggleAddOnActive(addOnId: string) {
  const addOn = await prisma.addOn.findUniqueOrThrow({ where: { id: addOnId } });
  await prisma.addOn.update({ where: { id: addOnId }, data: { isActive: !addOn.isActive } });
  revalidatePath("/admin/addons");
  redirect("/admin/addons");
}
