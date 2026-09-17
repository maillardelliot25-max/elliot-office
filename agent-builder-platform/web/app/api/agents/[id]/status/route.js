import { NextResponse } from "next/server";
import { getDb } from "../../../../../lib/db.js";

export const runtime = "nodejs";

export async function POST(req, { params }) {
  const { id } = await params;
  const { status } = await req.json();

  if (!["live", "paused"].includes(status)) {
    return NextResponse.json({ error: "status must be 'live' or 'paused'" }, { status: 400 });
  }

  const db = getDb();
  const result = db.prepare("UPDATE agent_instances SET status = ? WHERE id = ?").run(status, id);
  if (result.changes === 0) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
