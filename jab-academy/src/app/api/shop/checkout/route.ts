import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkoutSchema } from "@/lib/validation";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
      { status: 422 }
    );
  }

  const { fullName, email, items } = parsed.data;
  const totalUsd = items.reduce((sum, item) => sum + item.priceUsd * item.quantity, 0);

  const order = await prisma.order.create({
    data: {
      fullName,
      email,
      itemsJson: JSON.stringify(items),
      totalUsd,
      status: "processing_demo",
    },
  });

  return NextResponse.json(
    {
      orderId: order.id,
      totalUsd,
      message:
        "Order confirmed. This is a demo checkout — no real payment is processed in this environment.",
    },
    { status: 201 }
  );
}
