import { estimateCostUsd } from "./costCeiling.js";

const MODEL = "claude-sonnet-5";

// Runs fully offline by default (no API key, no cost). Set ANTHROPIC_API_KEY
// to opt into real Claude-generated briefs instead — everything else in the
// pipeline (data source, delivery, logging) stays the same either way.
export async function generateBrief({ client, findings, systemPrompt }) {
  if (process.env.ANTHROPIC_API_KEY) {
    return generateWithClaude({ systemPrompt, userPrompt: formatFindings(findings) });
  }
  return generateLocally({ client, findings });
}

function formatFindings(findings) {
  return findings.map((f) => `- [${f.topic}] ${f.summary}`).join("\n");
}

async function generateWithClaude({ systemPrompt, userPrompt }) {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");

  return {
    text,
    engine: "claude",
    usage: response.usage,
    costUsd: estimateCostUsd(response.usage),
  };
}

function generateLocally({ client, findings }) {
  const body = findings
    .map((f) => `${capitalize(f.topic)}: ${f.summary}`)
    .join("\n\n");

  const text = `Hi — here's ${client.businessName}'s trend brief.\n\n${body}\n\nThat's everything worth flagging right now.`;

  return {
    text,
    engine: "local-template",
    usage: { input_tokens: 0, output_tokens: 0 },
    costUsd: 0,
  };
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
