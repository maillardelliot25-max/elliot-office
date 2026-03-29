# JARVIS — Architecture & Tech Stack (2026)

## **The Master Loop: How Jarvis Stays "Alive"**

```
┌───────────────────────────────────────────────────────────────────┐
│                      MASTER LOOP (Eternal)                        │
│                                                                   │
│  while True:                                                      │
│    1. LISTEN    ← voice, WhatsApp, email, scheduler              │
│    2. RECALL    ← vector DB (past context + preferences)         │
│    3. REASON    ← ReAct (think before acting)                    │
│    4. ACT       ← dispatch to integrations (deploy, email, etc)  │
│    5. VERIFY    ← check if all steps succeeded                   │
│    6. HEAL      ← self-repair on failures (no humans unless bad) │
│    7. RESPOND   ← deliver result to correct channel              │
│    8. LEARN     ← store interaction, extract patterns            │
│                                                                   │
│  [sleep 15s if idle, restart immediately if new task]           │
└───────────────────────────────────────────────────────────────────┘
```

### State Machine (LangGraph)

**Node → Conditional Routing → Node → ...**

- **Entry**: LISTEN (always starts here)
- **Critical Path**: LISTEN → RECALL → REASON → ACT → VERIFY
- **Healing Path**: VERIFY (failed) → HEAL → RESPOND → LEARN
- **Normal Exit**: RESPOND → LEARN → END (restart)

### ReAct Pattern (Reason + Act)

```json
{
  "thoughts": "User wants to deploy a new app. I need to: create repo, push files, deploy to Vercel.",
  "plan": [
    "Step 1: Create GitHub repo named 'my-app'",
    "Step 2: Write file 'index.html' with basic template",
    "Step 3: Deploy to Vercel via GitHub integration",
    "Step 4: Verify deployment URL is live"
  ],
  "requires_clarification": false
}
```

**Key**: Jarvis **plans before acting**. No hallucinated steps.

---

## **Tech Stack Breakdown**

### 1. **Orchestration: LangGraph**
- State machine framework
- Async-first (handles 1000s of concurrent subtasks)
- Integrates with LangChain ecosystem

### 2. **LLM: Claude Opus 4.6**
- Reasoning capability (explains every decision)
- Low cost ($15 / 1M input tokens)
- Anthropic's latest (2026)

### 3. **Embeddings & Memory: Pinecone + OpenAI text-embedding-3-small**
- Vector database (semantic search)
- Stores all interactions (~$29/month for starter)
- 1536-dim embeddings = high recall accuracy

### 4. **Voice: Vapi.ai**
- Low-latency ASR (Deepgram Nova-2)
- TTS (11Labs Adam)
- Phone integration (PSTN)
- Webhook-driven

### 5. **Messaging: Meta Cloud API (WhatsApp)**
- Free tier: 1000 messages/month
- Bidirectional (inbound + outbound)
- Secure OAuth2

### 6. **Email: Google Gmail API**
- OAuth2 (user permission required once)
- Full read/write/label/archive
- Free tier: unlimited

### 7. **Deployment: GitHub + Vercel**
- GitHub: code storage + webhooks
- Vercel: serverless functions + auto-deploy on push
- Free tier: unlimited projects

### 8. **Finance: Plaid**
- Real-time transactions
- Bank-grade security
- Sandbox free, production costs scale

### 9. **Server: FastAPI + Railway.app**
- Python async (native `asyncio`)
- Railway.app: $5-20/month, auto-scaling
- PostgreSQL optional

---

## **Core Modules**

### `core/master_loop.py` (900 lines)
The brain. Implements the eternal state machine.
Coordinates all integrations. Handles errors gracefully.

### `core/react_agent.py` (150 lines)
ReAct reasoning engine. Every task gets a step-by-step plan.
No blind execution.

### `memory/memory.py` (200 lines)
Vector DB abstraction. Semantic search + learning.
Stores every interaction for continuous improvement.

### `integrations/` (each ~200-400 lines)
- **voice.py**: Vapi webhooks
- **whatsapp.py**: Meta Cloud API
- **gmail.py**: Google OAuth2
- **linkedin.py**: LinkedIn API
- **bookkeeping.py**: Plaid transactions
- **github_deployer.py**: Full Deploy pipeline (repo → test → deploy)

### `autopilot/self_healer.py` (400 lines)
Self-repair engine. Diagnoses & fixes failures autonomously.
**Error playbook**: 50+ known error patterns + auto-repair strategies.

### `main.py` (250 lines)
FastAPI server. Webhooks + management endpoints.
Health checks, manual task submission, memory search.

---

## **How It Works End-to-End: Example**

### **Scenario: User sends WhatsApp**

```
User: "Deploy my blog to production"
```

**Flow:**

1. **LISTEN** → Webhook receives WhatsApp message, queues it
2. **RECALL** → Searches memory: "past blog deployments?" → Finds 3 similar tasks
   - Learned preference: "Always use Vercel"
   - Learned: "Test before deploy"
3. **REASON** (ReAct) →
   ```json
   {
     "plan": [
       "Step 1: Pull latest blog repo from GitHub",
       "Step 2: Run build command",
       "Step 3: Push to GitHub main branch",
       "Step 4: Vercel auto-deploys (5s)",
       "Step 5: Test homepage responds",
       "Step 6: Report URL to WhatsApp"
     ]
   }
   ```
4. **ACT** → Executes each step
   - Step 1: Clones repo
   - Step 2: Runs `npm build` ✓
   - Step 3: Pushes to GitHub ✓
   - Step 4: Vercel deploys ✓
   - Step 5: Pings deployed URL ✓
5. **VERIFY** → All steps passed ✓
6. **RESPOND** → Sends to WhatsApp:
   ```
   ✅ Blog deployed!
   URL: https://my-blog.vercel.app
   Deployed at 2026-03-28 14:23 UTC
   ```
7. **LEARN** → Extracts preferences:
   - "User prefers fast feedback"
   - "Success metric: live URL"

---

## **Self-Healing Example**

### **Scenario: GitHub API returns 401 (token expired)**

1. ACT fails with 401
2. VERIFY detects failure
3. HEAL detects pattern: "401" → strategy: `refresh_auth_token`
4. HEAL automatically:
   - Refreshes GitHub token using stored refresh credentials
   - Retries the failed push
   - Success ✓
5. User is **not notified** (silent recovery)

### **Scenario: Deployment build fails (200 lines of output)**

1. ACT fails with build error
2. VERIFY detects failure
3. HEAL:
   - Fetches Vercel build logs
   - Asks LLM: "Why did this build fail?"
   - LLM suggests: "Missing React dependency"
   - HEAL auto-patches `package.json`
   - Retries deploy
   - Success ✓

### **Scenario: Network timeout (can't fix itself)**

1. ACT times out
2. VERIFY detects failure
3. HEAL:
   - Tries retry with exponential backoff (2s, 4s, 8s)
   - All retries timeout
   - Escalates to user:
     ```
     🚨 JARVIS ALERT
     Could not deploy. Network may be down.
     Please check: https://...
     ```

---

## **Why This Architecture?**

### ✅ **Autonomous**
- No "waiting for Slack approval"
- Self-decides when to act vs. escalate

### ✅ **Learnable**
- Vector DB remembers preferences
- Improves with every task

### ✅ **Resilient**
- 50+ self-repair strategies
- Humans only for true exceptions

### ✅ **Safe**
- ReAct pattern = explicit reasoning
- Every action is justified
- No hallucinated steps

### ✅ **Cost-Effective**
- Claude Opus 4.6: $15 / 1M tokens (~50¢ per complex task)
- Pinecone: $29/month starter
- Railway: $0.50-5/day
- Total: ~$100-150/month for full autonomy

---

## **Limitations & Trade-offs**

### What Jarvis Can Do
✅ Send emails, texts, WhatsApp
✅ Deploy code (GitHub → Vercel)
✅ Read & categorize transactions
✅ Schedule meetings
✅ Post to LinkedIn
✅ Generate reports

### What Requires Human Approval
❌ Spending money (payments, refunds)
❌ Deleting sensitive data
❌ Making major business decisions
❌ Anything with legal implications

---

## **Roadmap**

### Phase 1 (Done)
- Master loop ✓
- ReAct reasoning ✓
- Vector DB memory ✓
- Voice integration ✓
- Multi-channel messaging ✓

### Phase 2 (Planned)
- Long-term budget forecasting
- Autonomous customer service (handle support emails)
- Smart scheduling (find meeting times)
- Email drafting with learned tone

### Phase 3 (Future)
- Agent collaboration (Jarvis talks to other AIs)
- Token streaming (real-time updates)
- Fine-tuned Claude for your specific domain

---

**This is not a chatbot. This is a working AI colleague.**
