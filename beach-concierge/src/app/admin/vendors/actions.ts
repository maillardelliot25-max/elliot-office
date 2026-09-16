"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export async function createVendor(formData: FormData) {
  const beachId = String(formData.get("beachId") || "");
  const name = String(formData.get("name") || "").trim();
  const role = String(formData.get("role") || "").trim();
  const supplies = String(formData.get("supplies") || "").trim();
  if (!beachId || !name || !role || !supplies) return;

  await prisma.vendor.create({
    data: {
      beachId,
      name,
      role,
      supplies,
      contact: String(formData.get("contact") || "").trim() || null,
    },
  });

  revalidatePath("/admin/vendors");
  redirect("/admin/vendors");
}

export async function deleteVendor(vendorId: string) {
  await prisma.vendor.delete({ where: { id: vendorId } });
  revalidatePath("/admin/vendors");
  redirect("/admin/vendors");
}
