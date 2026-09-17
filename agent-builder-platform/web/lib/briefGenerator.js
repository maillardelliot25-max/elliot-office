import { estimateCostUsd } from "./costCeiling.js";

const MODEL = "claude-sonnet-5";

// Runs fully offline by default (no API key, no cost). Set ANTHROPIC_API_KEY
// to opt into real Claude-generated briefs instead.
export async function generateBrief({ businessName, brandVoice, findings }) {
  if (process.env.ANTHROPIC_API_KEY) {
    return generateWithClaude({ businessName, brandVoice, findings });
  }
  return generateLocally({ businessName, findings });
}

function formatFindings(findings) {
  return findings.map((f) => `- [${f.topic}] ${f.summary}`).join("\n");
}

async function generateWithClaude({ businessName, brandVoice, findings }) {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const systemPrompt =
    `You are the "trend brief" agent for ${businessName}. Brand voice: ${brandVoice || "friendly, concise, no jargon"}.\n` +
    "Write a short brief (under 300 words) summarizing the findings you're given, organized under " +
    "each watch topic. Call out anything that needs the owner's attention this week. Plain text, " +
    "no markdown headers — this goes straight into an email body.";

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: "user", content: formatFindings(findings) }],
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

function generateLocally({ businessName, findings }) {
  const body = findings
    .map((f) => `${capitalize(f.topic)}: ${f.summary}`)
    .join("\n\n");

  const text = `Hi — here's ${businessName}'s trend brief.\n\n${body}\n\nThat's everything worth flagging right now.`;

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
