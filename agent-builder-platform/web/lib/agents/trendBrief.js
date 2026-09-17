import { fetchTrendData } from "../dataSource.js";
import { generateBrief } from "../briefGenerator.js";
import { deliverBrief } from "../emailDelivery.js";
import { assertWithinCeiling } from "../costCeiling.js";

export async function previewTrendBrief({ businessName, brandVoice, config }) {
  const watchTopics = parseWatchTopics(config.watchTopics);
  const findings = await fetchTrendData(watchTopics);
  const { text, engine, usage, costUsd } = await generateBrief({ businessName, brandVoice, findings });
  return { text, engine, usage, costUsd };
}

export async function runTrendBrief({ client, agentInstance }) {
  const config = JSON.parse(agentInstance.config);
  const watchTopics = parseWatchTopics(config.watchTopics);
  const findings = await fetchTrendData(watchTopics);

  const { text, engine, usage, costUsd } = await generateBrief({
    businessName: client.business_name,
    brandVoice: client.brand_voice,
    findings,
  });

  assertWithinCeiling(costUsd, agentInstance.cost_ceiling_usd);

  const subject = `Trend brief for ${client.business_name} — ${new Date().toLocaleDateString()}`;
  const delivery = await deliverBrief({
    toEmail: config.deliveryEmail,
    subject,
    body: text,
    clientId: client.id,
  });

  return { text, engine, usage, costUsd, delivery };
}

function parseWatchTopics(raw) {
  if (Array.isArray(raw)) return raw;
  return String(raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
