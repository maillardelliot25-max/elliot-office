// The fixed catalog from the build spec. Each archetype is a sellable
// outcome, not an open-ended agent — that's what keeps quality predictable.
// `implemented: true` means a real execution engine exists in
// lib/agents/<id>.js; the rest ship as recognizable, priced offerings whose
// execution is future work (see the build roadmap's Phase 4).
export const ARCHETYPES = {
  "trend-brief": {
    id: "trend-brief",
    name: "Trend brief",
    description: "Daily/weekly scan + summary of what's happening around your business.",
    keywords: [
      "trend", "brief", "competitor", "news", "watch", "monitor", "summary",
      "digest", "report on", "keep me posted", "keep an eye", "roundup",
    ],
    priceUsdMonth: 75,
    slots: [
      { key: "watchTopics", label: "What should it watch for? (comma-separated)", type: "list",
        default: "competitor promotions, industry pricing changes, relevant local events" },
      { key: "deliveryEmail", label: "Send the brief to which email?", type: "email" },
      { key: "frequency", label: "How often?", type: "select", options: ["daily", "weekly"], default: "weekly" },
    ],
    implemented: true,
  },
  "social-poster": {
    id: "social-poster",
    name: "Social poster",
    description: "Generates and schedules posts from trend + brand voice.",
    keywords: ["post", "instagram", "facebook", "social media", "content calendar", "schedule posts"],
    priceUsdMonth: 100,
    slots: [
      { key: "platform", label: "Which platform?", type: "select", options: ["Instagram", "Facebook"], default: "Instagram" },
      { key: "postsPerWeek", label: "Posts per week?", type: "number", default: 3 },
    ],
    implemented: false,
  },
  "booking-responder": {
    id: "booking-responder",
    name: "Booking responder",
    description: "Answers DMs/inbox questions about hours, pricing, availability.",
    keywords: ["booking", "dm", "inbox", "availability", "reservations", "respond to messages", "answer questions"],
    priceUsdMonth: 90,
    slots: [
      { key: "channel", label: "Which channel?", type: "select", options: ["Instagram", "WhatsApp"], default: "WhatsApp" },
    ],
    implemented: false,
  },
  "review-watcher": {
    id: "review-watcher",
    name: "Review watcher",
    description: "Monitors Google/Facebook reviews, drafts responses, flags urgent ones.",
    keywords: ["review", "google reviews", "reputation", "rating", "feedback"],
    priceUsdMonth: 80,
    slots: [],
    implemented: false,
  },
  "competitor-tracker": {
    id: "competitor-tracker",
    name: "Competitor tracker",
    description: "Watches named competitors' public posts, flags new promos/pricing.",
    keywords: ["competitor", "rival", "track competitor", "what competitors are doing"],
    priceUsdMonth: 85,
    slots: [
      { key: "competitors", label: "Which competitors? (comma-separated)", type: "list", default: "" },
    ],
    implemented: false,
  },
  "inbox-triager": {
    id: "inbox-triager",
    name: "Inbox triager",
    description: "Sorts and drafts replies to a shared business inbox.",
    keywords: ["email inbox", "sort emails", "triage", "gmail", "shared inbox"],
    priceUsdMonth: 95,
    slots: [],
    implemented: false,
  },
  "event-promoter": {
    id: "event-promoter",
    name: "Event promoter",
    description: "Builds a countdown content sequence for a specific date (fete, launch).",
    keywords: ["event", "fete", "launch", "countdown", "promote an event"],
    priceUsdMonth: 90,
    slots: [
      { key: "eventName", label: "Event name", type: "text", default: "" },
      { key: "eventDate", label: "Event date", type: "date", default: "" },
    ],
    implemented: false,
  },
};

export function listArchetypes() {
  return Object.values(ARCHETYPES);
}

export function getArchetype(id) {
  return ARCHETYPES[id] ?? null;
}
