"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

async function refresh() {
  revalidatePath("/admin/manifest");
  revalidatePath("/admin/prep");
  revalidatePath("/admin");
}

export async function toggleSetupComplete(bookingId: string) {
  const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
  await prisma.booking.update({
    where: { id: bookingId },
    data: { setupComplete: !booking.setupComplete },
  });
  await refresh();
}

export async function toggleFoodDelivered(bookingId: string) {
  const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
  await prisma.booking.update({
    where: { id: bookingId },
    data: { foodDelivered: !booking.foodDelivered },
  });
  await refresh();
}

export async function markDepositPaid(bookingId: string) {
  const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
  await prisma.booking.update({
    where: { id: bookingId },
    data: {
      paymentStatus: "DEPOSIT_PAID",
      amountPaid: booking.depositAmount,
      status: booking.status === "PENDING" ? "CONFIRMED" : booking.status,
    },
  });
  await refresh();
}

export async function markPaidInFull(bookingId: string) {
  const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
  await prisma.booking.update({
    where: { id: bookingId },
    data: {
      paymentStatus: "PAID",
      amountPaid: booking.totalPrice,
      status: booking.status === "PENDING" ? "CONFIRMED" : booking.status,
    },
  });
  await refresh();
}

export async function cancelBooking(bookingId: string) {
  await prisma.booking.update({ where: { id: bookingId }, data: { status: "CANCELLED" } });
  await refresh();
}
