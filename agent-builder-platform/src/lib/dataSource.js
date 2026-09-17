// Mocked stand-in for the "one real data source" Phase 1 calls for.
// Swap this for a real web-search/social API (e.g. Brave Search, SerpAPI)
// without touching the rest of the pipeline — callers only depend on the
// shape returned here.
export async function fetchTrendData(client) {
  return client.watchTopics.map((topic, i) => ({
    topic,
    source: "mock-data-source",
    summary: `Placeholder finding for "${topic}" — replace fetchTrendData() with a real search/scrape call.`,
    url: `https://example.com/mock-finding-${i + 1}`,
  }));
}
