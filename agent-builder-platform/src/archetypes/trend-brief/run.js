import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchTrendData } from "../../lib/dataSource.js";
import { generateBrief } from "../../lib/briefGenerator.js";
import { deliverBrief } from "../../lib/emailDelivery.js";
import { assertWithinCeiling } from "../../lib/costCeiling.js";
import { logRun } from "../../lib/runLog.js";
import { buildSystemPrompt } from "./systemPrompt.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function runTrendBriefAgent() {
  const client = JSON.parse(
    await readFile(path.resolve(__dirname, "../../config/client.json"), "utf8")
  );
  const ceilingUsd = Number(process.env.TREND_BRIEF_COST_CEILING_USD) || 0.5;

  const findings = await fetchTrendData(client);

  const { text, usage, costUsd, engine } = await generateBrief({
    client,
    findings,
    systemPrompt: buildSystemPrompt(client),
  });

  assertWithinCeiling(costUsd, ceilingUsd);

  const subject = `Trend brief for ${client.businessName} — ${new Date().toLocaleDateString()}`;
  const delivery = await deliverBrief({ client, subject, body: text });

  const run = await logRun({
    archetype: "trend-brief",
    clientId: client.clientId,
    engine,
    usage,
    costUsd,
    delivery,
  });

  return { client, findings, brief: text, delivery, run };
}
