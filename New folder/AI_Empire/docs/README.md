# AI Empire – God Mode Command Center

> **Fully autonomous, self-maintaining, self-healing AI revenue empire.**
> Zero supervision required. Learns continuously. Scales automatically.

---

## What Is AI Empire?

AI Empire is a full-stack autonomous system that operates 24/7 to generate revenue across multiple streams without human intervention. It consists of five AI agents, four workflow pipelines, an autopilot engine, a self-learning system, and a real-time dashboard.

**Revenue streams it automates:**
- LinkedIn outreach → consulting deals ($2,000–$10,000/deal)
- Social media → affiliate + sponsored income ($100–$500/month)
- Freelance platforms → project bids and retainers ($500–$5,000/project)
- AI SaaS apps → subscriptions + lifetime deals ($29–$299/user/month)

---

## Architecture Overview

```
AI_Empire/
├── frontend/          ← Real-time SPA dashboard (Vanilla JS + Chart.js)
├── backend/           ← Express + Socket.IO API server
├── agents/            ← 5 autonomous revenue agents
├── autopilot/         ← Engine + Scheduler + Learning
├── workflows/         ← 4 revenue pipelines
├── dashboards/        ← Analytics + Reports + Alerts
└── docs/              ← This documentation
```

### How It Works

```
[Scheduler] → triggers → [Agents]
                              ↓
[Agents] → report to → [Empire State]
                              ↓
[Autopilot Engine] → analyses → [Revenue Data]
                              ↓
[Learning Engine] → updates → [Agent Strategies]
                              ↓
[Dashboard] ← Socket.IO ← [Live Updates]
```

---

## Quick Start

### Prerequisites

- Node.js ≥ 18.0.0
- npm or yarn
- MongoDB (optional – falls back to in-memory mode)

### Installation

```bash
cd AI_Empire
npm install
```

### Configuration

Copy the environment template and fill in your credentials:

```bash
cp .env.example .env
```

Edit `.env`:

```
PORT=3000
JWT_SECRET=your-secret-here-change-this
MONGO_URI=mongodb://localhost:27017/ai_empire

# Optional – enables real API integrations
OPENAI_API_KEY=sk-...
LINKEDIN_CLIENT_ID=...
LINKEDIN_CLIENT_SECRET=...
TWITTER_BEARER_TOKEN=...
UPWORK_API_KEY=...
```

### Start the Server

```bash
# Production
npm start

# Development (with auto-reload)
npm run dev
```

### Access the Dashboard

Open `http://localhost:3000` in your browser.

**Default credentials:**
- Email: `admin@empire.ai`
- Password: `empire2024`

**Change immediately after first login** via Settings → API Credentials.

---

## Agent Overview

| Agent | Platform | Revenue Model | Cycle |
|-------|----------|---------------|-------|
| LinkedIn Outreach | LinkedIn | Consulting deals ($2K–$10K) | Every 2h |
| Social Media | Twitter, Instagram, TikTok, LinkedIn | Affiliate + Sponsored | Every 4h |
| Freelance Services | Upwork, Fiverr, Freelancer | Project bids + retainers | Every 3h |
| AI Development | ProductHunt, AppSumo, Gumroad | SaaS subscriptions + LTD | Every 6h |
| Virtual Consultant | Email/LinkedIn/calls | Consulting packages | On-demand |

---

## Self-Healing System

The empire auto-recovers from:
- **Agent crashes** – restarts the agent after 5 minutes
- **Rate limit hits** – backs off and retries with exponential delay
- **API errors** – falls back to simulation mode, alerts are raised
- **Revenue decline** – automatically boosts top-performing agents
- **Stale sessions** – JWT tokens auto-refresh before expiry

All healing events are logged and visible in the **Alerts** dashboard tab.

---

## Revenue Targets

Set your monthly revenue target in **Settings → Autopilot Configuration**.

The autopilot engine will:
1. Track daily progress toward the target
2. Rebalance agent priorities based on performance
3. Alert you if you're falling behind
4. Auto-boost the highest-performing streams

---

## Adding API Keys (For Real Revenue)

The system works in **simulation mode** without API keys (perfect for testing).

To enable real outreach and revenue generation:

1. **LinkedIn**: Create a LinkedIn Developer App → get Client ID + Secret
2. **OpenAI**: Get an API key at platform.openai.com (enables AI message generation)
3. **Twitter/X**: Get a Bearer Token from developer.twitter.com
4. **Upwork**: Apply for API access at developers.upwork.com

Enter all keys in the dashboard under **Settings → API Credentials**.

---

## Deployment

See `docs/deployment.md` for full cloud deployment instructions (AWS, GCP, DigitalOcean, Railway).

---

## License

MIT License. Build, modify, and monetise freely.
