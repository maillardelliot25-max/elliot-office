import { NextResponse } from "next/server";
import { getSupabase, TABLES } from "../../../../../lib/supabase.js";

export const runtime = "nodejs";

export async function POST(req, { params }) {
  const { id } = await params;
  const { status } = await req.json();

  if (!["live", "paused"].includes(status)) {
    return NextResponse.json({ error: "status must be 'live' or 'paused'" }, { status: 400 });
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from(TABLES.agentInstances)
    .update({ status })
    .eq("id", id)
    .select();
  if (error) throw error;
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
