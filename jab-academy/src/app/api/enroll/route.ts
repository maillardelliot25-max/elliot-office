import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enrollmentSchema } from "@/lib/validation";

const TUITION_USD = 1200;

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = enrollmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
      { status: 422 }
    );
  }

  const data = parsed.data;

  const enrollment = await prisma.enrollment.create({
    data: {
      fullName: data.fullName,
      email: data.email,
      phone: data.phone,
      country: data.country,
      discipline: data.discipline,
      cohortMonth: data.cohortMonth,
      experienceLevel: data.experienceLevel,
      waiverSignedName: data.waiverSignedName,
      waiverAccepted: data.waiverAccepted,
      tuitionStatus: "paid_demo",
      amountUsd: TUITION_USD,
      notes: data.notes || null,
    },
  });

  return NextResponse.json(
    {
      id: enrollment.id,
      message:
        "Enrollment confirmed. A welcome packet with cohort details will be sent to your email.",
    },
    { status: 201 }
  );
}
