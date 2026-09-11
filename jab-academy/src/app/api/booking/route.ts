import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { bookingSchema } from "@/lib/validation";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = bookingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
      { status: 422 }
    );
  }

  const data = parsed.data;

  const booking = await prisma.booking.create({
    data: {
      organization: data.organization,
      contactName: data.contactName,
      email: data.email,
      phone: data.phone || null,
      eventType: data.eventType,
      eventDate: data.eventDate ? new Date(data.eventDate) : null,
      location: data.location,
      talentRequested: data.talentRequested,
      performerCount: data.performerCount,
      budgetRange: data.budgetRange || null,
      message: data.message,
    },
  });

  return NextResponse.json(
    {
      id: booking.id,
      message:
        "Booking request received. Our talent agency team will respond within 2 business days.",
    },
    { status: 201 }
  );
}
