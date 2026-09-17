// Synthetic example findings for fully offline/no-API-key use. Swap for a
// real search/scrape/API integration when one is wired up — the rest of the
// pipeline only depends on the {topic, source, summary} shape returned here.
const EXAMPLE_FINDINGS = {
  "competitor promotions": [
    "A nearby competitor is running a 2-for-1 happy hour every Thursday from 5-7pm.",
    "A local competitor dropped their entry price by 15% for the rest of the month.",
  ],
  "industry pricing changes": [
    "Suppliers in the area have raised wholesale prices roughly 4% since last quarter.",
    "A comparable business nearby raised its standard rate by $5 this month.",
  ],
  "relevant local events": [
    "A neighborhood festival is scheduled for next weekend and expected to draw extra foot traffic.",
    "A public holiday next week typically brings a spike in walk-in customers.",
  ],
};

const GENERIC_FINDINGS = [
  "No notable activity turned up for this topic this week.",
  "Nothing new to report on this topic — worth checking again next week.",
];

export async function fetchTrendData(watchTopics) {
  return watchTopics.map((topic, i) => {
    const pool = EXAMPLE_FINDINGS[topic.toLowerCase()] ?? GENERIC_FINDINGS;
    return {
      topic,
      source: "synthetic-example-data",
      summary: pool[i % pool.length],
    };
  });
}
