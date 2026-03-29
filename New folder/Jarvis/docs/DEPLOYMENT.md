# JARVIS — Deployment & Operations Guide

## Quick Summary

**Jarvis** is a self-evolving personal operating system. Once deployed, it:
- Monitors WhatsApp, Gmail, and voice calls 24/7
- Reasons before acting (ReAct pattern)
- Learns from every interaction (vector database)
- Self-heals on errors (no human debugging)
- Deploys code autonomously (GitHub → Vercel)

---

## Architecture at a Glance

```
┌─────────────────────────────────────────────────────────────┐
│                    JARVIS MASTER LOOP                       │
│  (Eternal async state machine — LangGraph)                  │
└─────────────────────────────────────────────────────────────┘
       ↓
  ┌────────────────────────────────────────────────────┐
  │ LISTEN         → RECALL       → REASON   → ACT     │
  │ (voice, SMS,   (vector DB)    (ReAct)   (deploy,  │
  │  email, etc)                           send, etc)  │
  └────────────────────────────────────────────────────┘
       ↓            ↓
  ┌──────────┐  ┌──────────────┐
  │ VERIFY   │→ │ HEAL (self-  │
  │ RESPOND  │  │ repair)      │
  │ LEARN    │  └──────────────┘
  └──────────┘
```

### Tech Stack (2026-standard)

| Layer          | Technology         | Why                              |
|----------------|--------------------|----------------------------------|
| **Agent**      | LangGraph          | State management + routing      |
| **LLM**        | Claude Opus 4.6    | Best reasoning + cost-effective |
| **Memory**     | Pinecone (vectors) | Low-latency semantic recall     |
| **Voice**      | Vapi.ai            | Low-latency ASR/TTS            |
| **Messaging**  | Meta Cloud API     | WhatsApp (free tier)           |
| **Email**      | Google Gmail API   | OAuth2, full read/write        |
| **Deploy**     | GitHub + Vercel    | Autonomous CI/CD               |
| **Finance**    | Plaid              | Real-time transactions         |
| **Server**     | FastAPI + Railway  | Python async, simple scaling   |

---

## Phase 1: Local Testing (Your Machine)

### 1. Clone & Setup

```bash
git clone https://github.com/your-account/jarvis.git
cd Jarvis
cp .env.example .env
```

### 2. Fill .env (Minimal to Start)

At minimum, you need:
- `ANTHROPIC_API_KEY` — Get from https://console.anthropic.com/
- `OPENAI_API_KEY` — Get from https://platform.openai.com/
- `OWNER_WHATSAPP_NUMBER` — Your number (e.g., "12125551234")

### 3. Install & Run

```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
python main.py
```

Visit: http://localhost:8000/docs

### 4. Test Manual Task

```bash
curl -X POST http://localhost:8000/task/manual \
  -H "Content-Type: application/json" \
  -d '{"channel": "internal", "content": "What is 2+2?"}'
```

Check logs/jarvis.log for the result.

---

## Phase 2: Add Integrations (One at a Time)

### Integration 1: WhatsApp (Recommended First)

**Why first?** It's the easiest alert/feedback channel.

#### Setup:

1. Go to https://developers.facebook.com
2. Create a new app (type: Business)
3. Add "WhatsApp" product
4. Create a Business Account
5. In Dashboard, go to **WhatsApp > Getting Started**
6. Get:
   - Phone Number ID
   - Access Token
   - Verify Token (create any string)

#### In .env:
```env
WHATSAPP_PHONE_NUMBER_ID="120385716587645"
WHATSAPP_ACCESS_TOKEN="EAAe4..."
WHATSAPP_VERIFY_TOKEN="jarvis-verify-2026"
OWNER_WHATSAPP_NUMBER="12125551234"
```

#### Test:
```bash
curl -X POST http://localhost:8000/whatsapp/send \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello from Jarvis!"}'
```

You should receive the message on WhatsApp.

---

### Integration 2: Gmail

#### Setup (OAuth2):

1. Go to https://console.cloud.google.com
2. Create new project: "Jarvis"
3. **Enable APIs**:
   - Gmail API
   - Google+ API
4. **Create credentials**:
   - Type: OAuth 2.0 Desktop App
   - Authorized JavaScript origins: `http://localhost:8000`
   - Authorized redirect URIs: `http://localhost:8000/auth/google/callback`
5. Download JSON, extract:
   - `client_id`
   - `client_secret`

#### In .env:
```env
GMAIL_CLIENT_ID="123456.apps.googleusercontent.com"
GMAIL_CLIENT_SECRET="GOCSP..."
```

#### Get Access Token (one-time):

Run this script locally:
```python
from google.auth.oauthlib.flow import Flow
flow = Flow.from_client_secrets_file(
    'credentials.json',
    scopes=['https://www.googleapis.com/auth/gmail.modify']
)
flow.run_local_server(port=8080)
# Copy the refresh token from the response
```

Add to .env:
```env
GMAIL_REFRESH_TOKEN="1//..."
```

#### Test:
Jarvis will now read your unread emails automatically.

---

### Integration 3: Voice (Vapi)

#### Setup:

1. Go to https://vapi.ai
2. Sign up
3. Get API Key from dashboard
4. Add a phone number (you choose prefix: +1, etc.)

#### Initial Setup Call:

```bash
curl -X POST http://localhost:8000/vapi/setup \
  -H "Content-Type: application/json"
```

This will return:
```json
{
  "assistant_id": "asst_123...",
  "save_this_in_env": "VAPI_ASSISTANT_ID=asst_123..."
}
```

Add to .env.

#### Test: Call Me

```bash
curl -X POST http://localhost:8000/vapi/call-me \
  -H "Content-Type: application/json" \
  -d '{"reason": "Testing voice integration"}'
```

Your phone will ring. Jarvis answers.

---

### Integration 4: Bookkeeping (Plaid)

#### Setup:

1. Go to https://plaid.com
2. Sign up
3. Get Client ID + Secret from dashboard
4. In your Jarvis app, implement **Plaid Link** (frontend code — outside scope here)

User connects their bank via Plaid Link → you get `ACCESS_TOKEN` → add to .env.

#### In .env:
```env
PLAID_CLIENT_ID="..."
PLAID_SECRET="..."
PLAID_ACCESS_TOKEN="access-sandbox-..."
```

#### Test:
```bash
curl http://localhost:8000/task/manual \
  -d '{"content": "Show me my weekly spending"}'
```

---

## Phase 3: Deploy to Production

### Option A: Railway.app (Recommended — Easiest)

1. Log in to https://railway.app
2. Create new project → import from GitHub
3. Connect your Jarvis repo
4. Railway auto-deploys on every push
5. Add environment variables (copy from .env):
   - Go to **Variables** tab
   - Paste your .env contents
6. Wait for deploy to finish
7. Your URL: `https://jarvis-abc123.railway.app`

#### Configure Webhooks:

- **WhatsApp**: In Meta dashboard, set webhook URL: `https://jarvis-abc123.railway.app/whatsapp/webhook`
- **Vapi**: In Vapi dashboard, set callback URL: `https://jarvis-abc123.railway.app/voice/webhook`
- **Gmail**: Uses OAuth (no webhook needed)

### Option B: Vercel (If you want to)

```bash
npm install -g vercel
vercel env add  # Add all env vars
vercel deploy
```

### Option C: Docker (Any Cloud)

```bash
# Build
docker build -t jarvis .

# Run locally
docker run -p 8000:8000 --env-file .env jarvis

# Push to registry (e.g., Docker Hub)
docker tag jarvis your-account/jarvis:latest
docker push your-account/jarvis:latest
```

---

## Phase 4: Ongoing Maintenance

### Health Checks

```bash
curl https://your-jarvis-url.railway.app/health
```

Should return:
```json
{"status": "online", "master_loop": "running"}
```

### View Memory Stats

```bash
curl https://your-jarvis-url.railway.app/memory/stats
```

### View Repair Log (Self-Healing History)

```bash
curl https://your-jarvis-url.railway.app/healer/log
```

### Monitor Logs

Railway dashboard → Logs tab → stream in real-time

---

## Troubleshooting

### "Master loop not initialized"

**Cause**: Missing credentials in .env
**Fix**: Check error message in startup logs. Fill missing vars.

### WhatsApp messages not coming in

**Cause**: Webhook URL not set or verify token mismatch
**Fix**:
1. Set webhook in Meta dashboard to: `https://your-url/whatsapp/webhook`
2. Verify token in dashboard matches `.env` `WHATSAPP_VERIFY_TOKEN`

### "Invalid API key" errors in logs

**Cause**: Copied secret incorrectly
**Fix**: Re-generate the key and update .env

### Voice not working

**Cause**: VAPI_ASSISTANT_ID not set
**Fix**: Run `/vapi/setup` once, then add returned ID to .env

---

## Credential Checklist (Go-Live Checklist)

Before going live, you must have:

- [ ] `ANTHROPIC_API_KEY` (Claude)
- [ ] `OPENAI_API_KEY` (embeddings)
- [ ] `PINECONE_API_KEY` (memory)
- [ ] `OWNER_WHATSAPP_NUMBER` (your number)
- [ ] `WHATSAPP_ACCESS_TOKEN` (Meta Cloud API)
- [ ] `GMAIL_REFRESH_TOKEN` (Gmail OAuth)
- [ ] `VAPI_API_KEY` (voice)
- [ ] `GITHUB_TOKEN` (deployments)
- [ ] `VERCEL_TOKEN` (deployment platform)

**Optional** (add as needed):
- [ ] LinkedIn tokens (outreach)
- [ ] Plaid tokens (bookkeeping)

---

## Advanced: Self-Healing Example

If Jarvis encounters a 401 (expired token):

1. **Detect** → Error contains "401"
2. **Match** → Maps to `refresh_auth_token` strategy
3. **Execute** → Auto-refreshes Gmail tokens
4. **Retry** → Re-runs the failed step
5. **Report** → Logs to repair history

**No human intervention needed.**

---

## Scaling

Jarvis can handle ~1000 msg/day on a single Railway instance.

To scale:
- Enable Redis for task queues (`.env`: add `REDIS_URL`)
- Run multiple instances (Railway supports this)
- LangGraph scales with async task distribution

---

## Questions or Issues?

1. Check logs: `logs/jarvis.log`
2. Search memory: `curl /memory/search?q=...`
3. View repair history: `curl /healer/log`
4. Read the code: `core/master_loop.py` is the source of truth

---

## Next Steps

1. ✅ Deploy to Railway
2. ✅ Add WhatsApp + Gmail
3. ✅ Enable voice
4. ✅ Test autonomous deployment (GitHub → Vercel)
5. 📊 Monitor for 1 week, tune parameters
6. 🚀 Launch: Tell Jarvis your first big task!

---

**Welcome to the future. You now have an AI that works for you — not the other way around.**
