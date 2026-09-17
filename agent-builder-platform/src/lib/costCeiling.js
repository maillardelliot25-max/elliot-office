// Approximate Claude Sonnet pricing per million tokens (USD). Check current
// rates before relying on this for real billing — it exists to catch a
// runaway run, not to be an invoice.
const PRICE_PER_MTOK_INPUT = 3;
const PRICE_PER_MTOK_OUTPUT = 15;

export function estimateCostUsd(usage) {
  const inputCost = (usage.input_tokens / 1_000_000) * PRICE_PER_MTOK_INPUT;
  const outputCost = (usage.output_tokens / 1_000_000) * PRICE_PER_MTOK_OUTPUT;
  return inputCost + outputCost;
}

export function assertWithinCeiling(costUsd, ceilingUsd) {
  if (costUsd > ceilingUsd) {
    throw new Error(
      `Run cost $${costUsd.toFixed(4)} exceeds the per-run ceiling of $${ceilingUsd.toFixed(2)} — aborting before delivery.`
    );
  }
}
