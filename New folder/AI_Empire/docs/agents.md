# AI Empire – Agent Documentation

Detailed documentation for all five autonomous revenue agents.

---

## 1. LinkedIn Outreach Agent

**File:** `agents/linkedin_outreach/agent.js`
**Revenue:** Consulting deals ($2,000–$10,000 per deal)
**Cycle:** Every 2 hours during business hours

### How It Works

1. **Prospect Discovery**: Searches LinkedIn for target job titles (CEO, Founder, VP Sales, etc.)
2. **Connection Requests**: Sends personalised connection requests (max 25/day)
3. **Outreach Messages**: On acceptance, sends tailored outreach messages
4. **Follow-up Sequence**: 3 automated follow-ups over 6–14 days
5. **Lead Qualification**: Identifies interested prospects for discovery calls
6. **Revenue Closure**: Books discovery calls → sends proposals → closes deals

### Configuration

Edit `agents/linkedin_outreach/agent.js` → `CONFIG` object:

```js
const CONFIG = {
  maxConnectionsPerDay: 25,    // LinkedIn weekly limit ~100
  followUpDelayHours:   48,    // Wait 48h before follow-up
  maxFollowUps:         3,     // Max follow-ups per prospect
  avgDealValue:         2500,  // Average consulting deal ($)
  closeRatePct:         8,     // % of accepted connections that convert
};
```

### LinkedIn API Setup

1. Create a LinkedIn Developer App at [linkedin.com/developers](https://linkedin.com/developers)
2. Request access to: `r_liteprofile`, `r_emailaddress`, `w_member_social`
3. Add your `Client ID` and `Client Secret` in Dashboard → Settings → API Credentials
4. The system will handle OAuth token refresh automatically

### Self-Learning

The agent tracks connection acceptance rates and reply rates per message template. If acceptance rate drops >5% over a 6-cycle window, it regenerates message templates (using OpenAI if configured, otherwise rotates built-in templates).

### Self-Healing

- Errors ≥ 5 in one cycle → agent pauses for 10 minutes, resets error count, resumes
- Rate limit detected → backs off for 60 minutes before retrying
- All healing events are logged to the Alerts dashboard

---

## 2. Social Media Agent

**File:** `agents/social_media/agent.js`
**Revenue:** Affiliate commissions + sponsored posts ($100–$500/month)
**Cycle:** Every 4 hours

### Platforms Supported

| Platform | Posts/Day | Character Limit |
|----------|-----------|-----------------|
| Twitter/X | 6 | 280 |
| Instagram | 3 | 2,200 |
| Facebook | 3 | 5,000 |
| TikTok | 2 | 2,200 |
| LinkedIn Page | 2 | 3,000 |

### Content Niches

- AI & Automation
- Online Business
- Productivity Hacks
- Make Money Online
- Tech Tutorials
- Entrepreneurship

### Revenue Model

1. **Affiliate Marketing**: Posts include affiliate links to AI tools (15–30% commission)
2. **Sponsored Posts**: As followers grow, brands pay for promotional posts
3. **Product Sales**: Links to digital products (courses, templates, tools)

### API Setup

- **Twitter/X**: Get Bearer Token from [developer.twitter.com](https://developer.twitter.com)
- **Instagram**: Requires Facebook Business Account + Graph API
- **LinkedIn**: Uses LinkedIn Page API (different from profile API)
- **Buffer/Hootsuite**: Optional scheduling API for multi-platform posting

### Self-Learning

Tracks engagement rates per content type and platform. If Twitter gets 2x higher engagement than Facebook for a given niche, it increases Twitter posting frequency for that niche.

---

## 3. Freelance Services Agent

**File:** `agents/freelance_services/agent.js`
**Revenue:** Project fees + retainers ($500–$5,000/project)
**Cycle:** Every 3 hours

### Platforms

| Platform | Bid Type | Daily Limit |
|----------|----------|-------------|
| Upwork | Connects-based | 20 bids |
| Freelancer | Credits-based | 15 bids |
| Toptal | Application | 5/day |
| Fiverr | Gig orders | N/A (inbound) |

### Service Packages

| Package | Price Range | Avg Delivery |
|---------|-------------|--------------|
| AI Chatbot Setup | $750 | 8 hours |
| LinkedIn Automation | $1,200 | 12 hours |
| Business Process Automation | $3,500 | 35 hours |
| Custom AI Integration | $5,000 | 40 hours |
| Social Media Automation | $600 | 8 hours |

### Proposal Generation

Uses OpenAI (if configured) to generate personalised proposals based on:
- Job title and description
- Client's company size and industry
- Required tech stack
- Budget range

Falls back to template-based proposals without OpenAI.

### Win Rate Optimisation

Target win rate: **15%**. If win rate drops below 10% over 10+ bids:
1. Agent analyses losing proposals
2. Adjusts bid amount (typically lower by 10%)
3. Rewrites proposal opening paragraph
4. Tracks next 10 bids to measure improvement

---

## 4. AI Development Agent

**File:** `agents/ai_development/agent.js`
**Revenue:** SaaS subscriptions + LTD sales ($29–$299/month)
**Cycle:** Every 6 hours

### App Templates (Built-in)

| App | Price | LTD | Build Time |
|-----|-------|-----|-----------|
| AI Writing Assistant | $29/mo | $79 | 20 hours |
| AI Email Responder | $49/mo | $129 | 16 hours |
| AI Cold Outreach Tool | $99/mo | $249 | 30 hours |
| AI Contract Generator | $59/mo | $149 | 18 hours |
| AI Social Media Manager | $79/mo | $199 | 25 hours |
| AI Invoice & Billing Bot | $39/mo | $99 | 15 hours |

### Launch Strategy

1. Build app (2–4 cycles)
2. Deploy to Vercel + Railway
3. Launch on Product Hunt
4. Submit to AppSumo for LTD campaign
5. List on Gumroad for ongoing LTD sales
6. Grow MRR through content marketing

### Revenue Projections (Per App)

- Launch week: $500–$2,000 (LTD + initial subs)
- Month 1: $500–$1,500 MRR
- Month 3: $1,500–$5,000 MRR (with growth)
- Year 1: $10,000–$50,000 total per app

---

## 5. Virtual Consultant (Persona)

**File:** `agents/virtual_consultant/persona_data.json`
**Revenue:** Consulting packages ($997–$9,997)
**Mode:** On-demand (responds to inbound inquiries)

### Persona

**Name:** Alex Morgan
**Title:** Senior AI Automation Consultant
**Company:** Morgan AI Solutions
**Credentials:** Ex-Google Cloud, Stanford MSc, 100+ clients served

### Service Packages

| Package | Price | Delivery |
|---------|-------|----------|
| AI Starter | $997 | 7 days |
| AI Growth | $2,997 | 21 days |
| AI Empire | $9,997 | 60 days |
| Monthly Retainer | $1,997/mo | Ongoing |

### Integration

The Virtual Consultant persona is used by:
- LinkedIn Outreach Agent (persona for outreach messages)
- Email responses via Consultant Inbox
- Proposal generation
- Discovery call scripts

---

## Adding a Custom Agent

1. Create folder: `agents/your_agent_name/`
2. Create `agents/your_agent_name/agent.js` with these exports:
   ```js
   module.exports = {
     start: async (empireState, logger, io) => { ... },
     stop:  async () => { ... },
     getStatus: () => ({ id, name, running, metrics }),
     runCycle: async () => { ... },
   };
   ```
3. Register in `backend/server.js` → `agentModules` object
4. Add agent entry in `EmpireState.agents`
5. The autopilot engine will automatically discover and manage it

---

## Agent Communication Protocol

Agents communicate with the system via:

1. **EmpireState** (in-memory): Direct mutation of shared state object
2. **Socket.IO broadcasts**: `broadcast('event', data)` for real-time updates
3. **REST API calls**: `POST /api/revenue/record` to log revenue events
4. **Alert API**: `POST /api/alerts/create` to raise alerts

### Standard Events

| Event | Payload | Description |
|-------|---------|-------------|
| `agent:update` | Agent object | Agent status changed |
| `revenue:tick` | Revenue map | Revenue updated |
| `activity` | `{type, message}` | Activity feed entry |
| `alert:new` | Alert object | New alert raised |
| `heal:event` | `{agent, action, result}` | Self-healing occurred |
| `learning:complete` | `{totalCycles}` | Learning cycle done |
