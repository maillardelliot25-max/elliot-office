import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createBooking, ZoneUnavailableError } from "@/lib/booking";

const bookingSchema = z.object({
  beachId: z.string().min(1),
  zoneId: z.string().min(1),
  packageId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  clientName: z.string().trim().min(2).max(120),
  clientPhone: z.string().trim().min(7).max(30),
  clientEmail: z.string().trim().email().max(160).optional().or(z.literal("")),
  partySize: z.number().int().min(1).max(60),
  notes: z.string().trim().max(500).optional(),
  paymentPlan: z.enum(["full", "deposit"]),
  addOns: z
    .array(
      z.object({
        addOnId: z.string().min(1),
        name: z.string(),
        unitPrice: z.number().nonnegative(),
        quantity: z.number().int().min(0).max(50),
      })
    )
    .max(50),
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = bookingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid booking payload", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  try {
    const booking = await createBooking({
      ...parsed.data,
      clientEmail: parsed.data.clientEmail || undefined,
    });
    return NextResponse.json({ bookingId: booking.id }, { status: 201 });
  } catch (err) {
    if (err instanceof ZoneUnavailableError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error(err);
    return NextResponse.json(
      { error: "Something went wrong creating the booking." },
      { status: 500 }
    );
  }
}
