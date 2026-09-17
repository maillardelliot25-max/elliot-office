import { previewTrendBrief, runTrendBrief } from "./trendBrief.js";
import { previewNotImplemented, runNotImplemented } from "./notImplemented.js";

const REGISTRY = {
  "trend-brief": { preview: previewTrendBrief, run: runTrendBrief },
};

export function getAgentEngine(archetypeId) {
  return REGISTRY[archetypeId] ?? { preview: previewNotImplemented, run: runNotImplemented };
}
