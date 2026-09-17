import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.resolve(__dirname, "../../logs");
const LOG_FILE = path.join(LOG_DIR, "agent_runs.jsonl");

export async function logRun(entry) {
  await mkdir(LOG_DIR, { recursive: true });
  const record = { timestamp: new Date().toISOString(), ...entry };
  await appendFile(LOG_FILE, JSON.stringify(record) + "\n", "utf8");
  return record;
}
