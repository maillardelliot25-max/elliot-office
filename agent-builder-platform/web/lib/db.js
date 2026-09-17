import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../data");
const DB_PATH = path.join(DATA_DIR, "app.sqlite");

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS tenants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    brand_name TEXT NOT NULL,
    is_operator INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id),
    business_name TEXT NOT NULL,
    vertical TEXT,
    brand_voice TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS agent_instances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL REFERENCES clients(id),
    archetype TEXT NOT NULL,
    config TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'live',
    price_usd_month REAL NOT NULL,
    cost_ceiling_usd REAL NOT NULL DEFAULT 0.5,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS agent_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_instance_id INTEGER NOT NULL REFERENCES agent_instances(id),
    engine TEXT NOT NULL,
    brief TEXT,
    usage TEXT,
    cost_usd REAL NOT NULL,
    delivery TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS intake_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_description TEXT NOT NULL,
    request TEXT NOT NULL,
    top_candidates TEXT,
    resolved INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
`;

// Cached on globalThis so Next's dev-mode module reloading doesn't reopen
// the file on every request.
function open() {
  if (globalThis.__agentBuilderDb) return globalThis.__agentBuilderDb;
  mkdirSync(DATA_DIR, { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
  globalThis.__agentBuilderDb = db;
  return db;
}

export function getDb() {
  return open();
}

export function nowIso() {
  return new Date().toISOString();
}
