import "server-only";
import { prisma } from "@/lib/prisma";
import { BookingStatus } from "@/generated/prisma/client";
import { computeTotals, DEPOSIT_RATE, type AddOnSelection } from "@/lib/pricing";
import { parsePackage } from "@/lib/parse";

/** Any booking in one of these states is holding the zone for that date. */
const ACTIVE_STATUSES: BookingStatus[] = [
  BookingStatus.PENDING,
  BookingStatus.CONFIRMED,
  BookingStatus.COMPLETED,
];

export async function getBookedZoneIds(
  beachId: string,
  date: string
): Promise<Set<string>> {
  const bookings = await prisma.booking.findMany({
    where: { beachId, date, status: { in: ACTIVE_STATUSES } },
    select: { zoneId: true },
  });
  return new Set(bookings.map((b) => b.zoneId));
}

export interface CreateBookingInput {
  beachId: string;
  zoneId: string;
  packageId: string;
  date: string;
  clientName: string;
  clientPhone: string;
  clientEmail?: string;
  partySize: number;
  addOns: AddOnSelection[];
  paymentPlan: "full" | "deposit";
  notes?: string;
}

export class ZoneUnavailableError extends Error {
  constructor(label: string) {
    super(`Zone ${label} is no longer available on this date.`);
    this.name = "ZoneUnavailableError";
  }
}

/**
 * Creates a booking, re-checking zone availability inside the transaction so
 * two clients racing to book the same zone/date can't both succeed.
 */
export async function createBooking(input: CreateBookingInput) {
  return prisma.$transaction(async (tx) => {
    const [zone, pkg] = await Promise.all([
      tx.zone.findUniqueOrThrow({ where: { id: input.zoneId } }),
      tx.package.findUniqueOrThrow({ where: { id: input.packageId } }),
    ]);

    const clash = await tx.booking.findFirst({
      where: {
        zoneId: input.zoneId,
        date: input.date,
        status: { in: ACTIVE_STATUSES },
      },
      select: { id: true },
    });
    if (clash) throw new ZoneUnavailableError(zone.label);

    const { total, deposit } = computeTotals(
      parsePackage(pkg),
      input.partySize,
      input.addOns
    );
    const depositAmount =
      input.paymentPlan === "deposit" ? deposit : total;

    const booking = await tx.booking.create({
      data: {
        beachId: input.beachId,
        zoneId: input.zoneId,
        packageId: input.packageId,
        date: input.date,
        clientName: input.clientName,
        clientPhone: input.clientPhone,
        clientEmail: input.clientEmail || null,
        partySize: input.partySize,
        totalPrice: total,
        depositAmount,
        notes: input.notes || null,
        paymentMethod: "bank_transfer",
        addOns: {
          create: input.addOns
            .filter((a) => a.quantity > 0)
            .map((a) => ({
              addOnId: a.addOnId,
              quantity: a.quantity,
              unitPrice: a.unitPrice,
            })),
        },
      },
      include: { addOns: { include: { addOn: true } }, zone: true, package: true, beach: true },
    });

    return booking;
  });
}

export { DEPOSIT_RATE };
