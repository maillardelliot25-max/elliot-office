import { NextRequest, NextResponse } from "next/server";
import { getBookedZoneIds } from "@/lib/booking";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: NextRequest) {
  const beachId = request.nextUrl.searchParams.get("beachId");
  const date = request.nextUrl.searchParams.get("date");

  if (!beachId || !date || !DATE_RE.test(date)) {
    return NextResponse.json(
      { error: "beachId and a yyyy-mm-dd date are required" },
      { status: 400 }
    );
  }

  const bookedZoneIds = await getBookedZoneIds(beachId, date);
  return NextResponse.json({ bookedZoneIds: Array.from(bookedZoneIds) });
}
