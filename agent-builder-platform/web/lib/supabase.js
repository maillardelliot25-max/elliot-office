import { createClient } from "@supabase/supabase-js";

// Table names are prefixed (abp_*) because this app's tables live inside a
// shared Supabase project alongside other apps' tables.
export const TABLES = {
  tenants: "abp_tenants",
  clients: "abp_clients",
  agentInstances: "abp_agent_instances",
  agentRuns: "abp_agent_runs",
  intakeQueue: "abp_intake_queue",
};

let client;

export function getSupabase() {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY must be set — see .env.example.");
  }
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}
