# JARVIS — FREE Edition Deployment Guide

## 🎯 **Zero Cost Breakdown**

| Component | Free Option | Cost |
|-----------|-------------|------|
| **LLM** | Ollama (self-hosted Mistral) | $0 |
| **Embeddings** | Sentence-Transformers (local) | $0 |
| **Vector DB** | Chroma (embedded, local) | $0 |
| **WhatsApp** | Meta Cloud API (free tier) | $0 |
| **Gmail** | Google API (free) | $0 |
| **GitHub** | Free tier | $0 |
| **Hosting** | Railway/Render free, or self-hosted | $0 |
| **TOTAL** | | **$0** |

---

## 📦 **Part 1: Install Ollama (LOCAL LLM)**

Ollama lets you run LLMs locally on your machine. Free. No API keys.

### **Step 1: Download Ollama**

```bash
# macOS
brew install ollama

# Ubuntu/Debian
wget https://ollama.ai/install.sh && bash install.sh

# Windows (via WSL2)
# Download: https://ollama.ai/download/windows
```

### **Step 2: Run Ollama Server**

```bash
# Start the Ollama server (runs in background)
ollama serve
```

This starts a local LLM server on `http://localhost:11434`

### **Step 3: Pull a Free Model**

```bash
# Download Mistral 7B (fast, good quality, ~4GB)
ollama pull mistral

# Or use a smaller model:
# ollama pull neural-chat  # smaller, faster
```

**That's it.** Ollama now runs models locally.

---

## 🗄️ **Part 2: Chroma Vector DB (LOCAL MEMORY)**

Chroma is embedded in the code. No setup needed. It auto-creates `jarvis_memory/` directory.

Just works. Free. Local.

---

## 🚀 **Part 3: Deploy Jarvis**

### **Option A: Railway.com (Recommended — Still Free)**

**Why?** Free tier, easy deploy, auto-scales.

```bash
# 1. Sign up at https://railway.app
# 2. Create new project → Deploy from GitHub
# 3. Connect your Jarvis repo
# 4. Railway auto-detects Dockerfile

# Add environment variables in Railway dashboard:
OWNER_WHATSAPP_NUMBER=12125551234
WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_ACCESS_TOKEN=...
GMAIL_REFRESH_TOKEN=... (optional)
GITHUB_TOKEN=... (optional)
```

**But wait**: Railway needs an Ollama instance. Two options:

**Option A1: Run Ollama Locally + Connect to Railway**
```bash
# On your machine:
ollama serve

# In Railway Jarvis, use:
OLLAMA_BASE_URL=http://your-local-ip:11434
```

**Option A2: Deploy Ollama to Railway Too**
Create a second Railway service just for Ollama.

### **Option B: Render.com (Truly Free, No Credit Card)**

Render has a genuinely free tier (no time limits, just slower).

```bash
# 1. Sign up at https://render.com (no CC needed)
# 2. Create new Web Service
# 3. Connect GitHub repo
# 4. Use Dockerfile
```

Same issue: Render needs to reach Ollama.

### **Option C: Self-Hosted (Best for Fully Free)**

Run everything on your machine or a cheap $5/mo VPS.

```bash
# On your machine:
git clone https://github.com/your-account/jarvis.git
cd Jarvis
pip install -r requirements-free.txt

# Terminal 1: Start Ollama
ollama serve

# Terminal 2: Start Jarvis
python main.py
```

This runs 24/7 on your machine. Fully free.

---

## 🧠 **Part 4: Configure for Free Edition**

### **Copy environment template:**

```bash
cp .env.example .env
```

### **Edit `.env` (MINIMAL for free):**

```env
# Owner
OWNER_NAME="Your Name"
OWNER_WHATSAPP_NUMBER="12125551234"  # your WhatsApp (no +)
OWNER_EMAIL="your@email.com"

# WhatsApp (Meta Cloud API free tier)
WHATSAPP_PHONE_NUMBER_ID="..."       # from Meta dashboard
WHATSAPP_ACCESS_TOKEN="..."          # from Meta dashboard
WHATSAPP_VERIFY_TOKEN="jarvis-free"

# Gmail (oauth2, free)
GMAIL_REFRESH_TOKEN="1//..."  # only if you want email integration

# GitHub (optional, free)
GITHUB_TOKEN="ghp_..."
GITHUB_USERNAME="your-username"

# Ollama (runs locally, FREE)
OLLAMA_BASE_URL="http://localhost:11434"

# Port
PORT=8000
```

That's it. Everything else is optional.

---

## 📞 **Part 5: Get WhatsApp Working (5 min setup)**

### **1. Create Meta Business App**

Go to: https://developers.facebook.com/

1. Create new app (type: Business)
2. Add "WhatsApp" product
3. Click: WhatsApp > Getting Started
4. Create a Business Account (or use existing)

### **2. Get Credentials**

Dashboard shows:
- **Phone Number ID** (copy)
- **Access Token** (copy, expires in 24h by default)

### **3. Verify Webhook**

Meta needs to verify your webhook.

```
Webhook URL: https://your-jarvis-url/whatsapp/webhook
Verify Token: jarvis-free
```

Enter these in Meta dashboard under **Webhook Configuration**.

### **4. Test**

Send yourself a WhatsApp message to your official number.

Jarvis should receive it.

---

## 📧 **Part 6: Gmail Setup (Optional but Easy)**

### **Enable Gmail API:**

1. Go to https://console.cloud.google.com
2. Create new project: "Jarvis"
3. **Enable APIs**:
   - Gmail API
   - Google+ API
4. **Create OAuth credentials** (Desktop app)
5. Authorized redirect: `http://localhost:8000/auth/google/callback`

### **Get Refresh Token (one-time):**

Run this locally:
```python
from google.auth.oauthlib.flow import Flow

flow = Flow.from_client_secrets_file(
    'credentials.json',
    scopes=['https://www.googleapis.com/auth/gmail.modify']
)
creds = flow.run_local_server(port=8080)
print(creds.refresh_token)  # Copy this into .env
```

---

## ✅ **Quick Start (All Together)**

```bash
# 1. Clone
git clone https://github.com/your-account/jarvis.git
cd Jarvis

# 2. Install
pip install -r requirements-free.txt

# 3. Setup .env
cp .env.example .env
# Edit with your credentials (see above)

# 4. Start Ollama (terminal 1)
ollama serve

# 5. Start Jarvis (terminal 2)
python main.py

# 6. Test
curl http://localhost:8000/health
```

Jarvis is online at `http://localhost:8000`

---

## 🌍 **Expose to Public (So Webhooks Work)**

If running locally, use a tunnel:

```bash
# Option 1: ngrok (free tier)
brew install ngrok
ngrok http 8000
# Get URL: https://xxx.ngrok.io

# Option 2: Cloudflare Tunnel (free, permanent)
brew install cloudflare-warp
warp-cli tunnel run --url http://localhost:8000
```

Update Meta/Google webhook URLs with your public URL.

---

## 📊 **What Works in Free Edition**

✅ Read WhatsApp messages
✅ Send WhatsApp replies
✅ Read Gmail
✅ Deploy code to GitHub
✅ Trigger Vercel deploys
✅ Full ReAct reasoning (local Ollama)
✅ Memory learning (local Chroma)
✅ Self-healing

❌ Voice calls (no free option)
❌ Real-time transactions (Plaid is paid)
❌ LinkedIn outreach (requires OAuth setup)

---

## 💾 **Running 24/7 on a Budget**

### **Option 1: Cheap VPS ($3-5/mo)**

Services: Linode, DigitalOcean, Hetzner

```bash
# On VPS:
ssh root@your-vps-ip
git clone ...
pip install -r requirements-free.txt
tmux new -s jarvis
python main.py
# Ctrl+B then D to detach
```

Watch from home via ngrok or expose port 8000.

### **Option 2: Old Laptop**

Plug in a Raspberry Pi or old laptop. Run 24/7. Use ngrok for tunneling.

### **Option 3: Your Machine + Screen (macOS/Linux)**

```bash
screen -S jarvis
python main.py
# Ctrl+A then D to detach
```

Runs even if you close terminal.

---

## 🧪 **Test Everything**

```bash
# Health check
curl http://localhost:8000/health

# Memory stats
curl http://localhost:8000/memory/stats

# Submit manual task
curl -X POST http://localhost:8000/task/manual \
  -H "Content-Type: application/json" \
  -d '{"channel": "internal", "content": "Test task"}'

# Check logs
tail -f logs/jarvis.log
```

---

## ❓ **Troubleshooting**

| Issue | Cause | Fix |
|-------|-------|-----|
| "Connection refused" to Ollama | Ollama not running | Run `ollama serve` |
| WhatsApp no incoming messages | Webhook not configured | Set webhook URL in Meta dashboard |
| "Token expired" error | Gmail token expired | Get new refresh token (1-day validity) |
| Memory search slow | Chroma indexing | Wait 30s on first run |
| Deployment fails | GitHub token missing | Add `GITHUB_TOKEN=...` to .env |

---

## 📈 **Next Steps**

1. ✅ Install Ollama
2. ✅ Download a model (Mistral)
3. ✅ Set up WhatsApp
4. ✅ Optional: Add Gmail
5. ✅ Deploy Jarvis locally
6. ✅ Test via WhatsApp
7. ✅ Leave running 24/7

---

## 🎁 **Free Tools Used**

- **Ollama** — Local LLMs (open source)
- **Chroma** — Vector DB (open source)
- **Sentence-Transformers** — Embeddings (open source)
- **LangGraph** — Orchestration (Apache 2.0)
- **FastAPI** — Web server (MIT)
- **Railway/Render** — Hosting (free tier)
- **Meta WhatsApp API** — Messaging (1000 free msgs/month)
- **Google Gmail API** — Email (free)
- **GitHub** — Code (free)

**Everything is free and open source.**

---

**You now have a fully autonomous AI. Zero dollars spent. 🚀**
