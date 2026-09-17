import { listArchetypes } from "./archetypes.js";

const CONFIDENCE_THRESHOLD = 0.5;

// Runs fully offline by default: keyword overlap against each archetype's
// catalog entry. Set ANTHROPIC_API_KEY to upgrade to a real LLM classifying
// against the same catalog — same output shape either way.
export async function classifyIntake({ businessDescription, request }) {
  if (process.env.ANTHROPIC_API_KEY) {
    return classifyWithClaude({ businessDescription, request });
  }
  return classifyLocally({ businessDescription, request });
}

function classifyLocally({ businessDescription, request }) {
  const text = `${businessDescription} ${request}`.toLowerCase();
  const scored = listArchetypes()
    .map((a) => {
      const hits = a.keywords.filter((k) => text.includes(k)).length;
      return { archetype: a.id, name: a.name, score: hits };
    })
    .sort((a, b) => b.score - a.score);

  const top = scored[0];
  const confidence = top && top.score > 0 ? Math.min(1, top.score / 2) : 0;

  return {
    archetype: confidence >= CONFIDENCE_THRESHOLD ? top.archetype : null,
    confidence,
    candidates: scored.slice(0, 3),
    engine: "local-keyword",
  };
}

async function classifyWithClaude({ businessDescription, request }) {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const catalog = listArchetypes()
    .map((a) => `${a.id}: ${a.description}`)
    .join("\n");

  const response = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 256,
    system:
      "You classify a small business owner's two-input request onto the closest archetype in a fixed catalog. " +
      "Reply with ONLY a JSON object: {\"archetype\": \"<id or null>\", \"confidence\": <0-1>}. " +
      "Use null if nothing in the catalog is a confident match.\n\nCatalog:\n" + catalog,
    messages: [
      { role: "user", content: `Business: ${businessDescription}\nWants handled: ${request}` },
    ],
  });

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { archetype: null, confidence: 0 };
  }

  return {
    archetype: parsed.archetype ?? null,
    confidence: parsed.confidence ?? 0,
    candidates: [],
    engine: "claude",
  };
}
