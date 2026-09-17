import Anthropic from "@anthropic-ai/sdk";
import { estimateCostUsd } from "./costCeiling.js";

const MODEL = "claude-sonnet-5";

export async function generateBrief({ systemPrompt, userPrompt }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return mockGenerate({ systemPrompt, userPrompt });
  }

  const client = new Anthropic({ apiKey });
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
    mocked: false,
    usage: response.usage,
    costUsd: estimateCostUsd(response.usage),
  };
}

// Lets the pipeline run end-to-end with no API key configured, per Phase 1's
// "build against mocked data first" scope. Swap in a real ANTHROPIC_API_KEY
// to exercise the live path above.
function mockGenerate({ userPrompt }) {
  const usage = { input_tokens: 0, output_tokens: 0 };
  return {
    text: `[MOCK OUTPUT — no ANTHROPIC_API_KEY set]\n\nThis stands in for a Claude-generated brief. Findings that would have been summarized:\n${userPrompt}`,
    mocked: true,
    usage,
    costUsd: 0,
  };
}
