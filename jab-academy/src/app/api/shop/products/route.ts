import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fallbackProducts } from "@/lib/data";

export async function GET() {
  try {
    const products = await prisma.product.findMany({ orderBy: { category: "asc" } });
    if (products.length === 0) {
      return NextResponse.json({ products: fallbackProducts });
    }
    return NextResponse.json({ products });
  } catch {
    return NextResponse.json({ products: fallbackProducts });
  }
}
