import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const certId = req.nextUrl.searchParams.get("certId")?.trim();
  if (!certId) {
    return NextResponse.json({ error: "certId query parameter is required" }, { status: 400 });
  }

  const record = await prisma.certification.findUnique({
    where: { certId: certId.toUpperCase() },
  });

  if (!record) {
    return NextResponse.json({ found: false }, { status: 404 });
  }

  const now = new Date();
  const status = record.expiryDate < now ? "expired" : record.status;

  return NextResponse.json({
    found: true,
    certification: {
      certId: record.certId,
      fullName: record.fullName,
      discipline: record.discipline,
      fireSafetyLevel: record.fireSafetyLevel,
      issueDate: record.issueDate,
      expiryDate: record.expiryDate,
      status,
      issuedBy: record.issuedBy,
    },
  });
}
