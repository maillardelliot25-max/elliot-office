// Placeholder engine for catalog archetypes that don't have a real execution
// path built yet (build roadmap Phase 4). Keeps the intake/dashboard/run UI
// honest instead of silently doing nothing.
export async function previewNotImplemented() {
  return {
    text: "No preview yet — this archetype's execution engine hasn't been built (see the build roadmap's Phase 4).",
    engine: "not-implemented",
    usage: { input_tokens: 0, output_tokens: 0 },
    costUsd: 0,
  };
}

export async function runNotImplemented() {
  return {
    text: null,
    engine: "not-implemented",
    usage: { input_tokens: 0, output_tokens: 0 },
    costUsd: 0,
    delivery: {
      delivered: false,
      dryRun: true,
      note: "Execution engine not implemented for this archetype yet.",
    },
  };
}
