# JARVIS — COMPLETE SETUP GUIDE
# Elliot Maillard | Step by Step

---

## WHAT YOU'RE GETTING

A personal AI that works like Gemini but better — powered by Claude:

| Feature | How |
|---------|-----|
| Talk to it | Telegram (instant, zero restrictions) |
| See your screen | Send a screenshot → Claude describes it |
| Generate images | Nano Banana 2 (Google's latest model) |
| Generate videos | Veo 3.1 (Google's best video model) |
| Deploy code | GitHub + Vercel, auto |
| Fix itself | Reads + rewrites its own code |
| Remember everything | Local vector memory (Chroma) |
| Brain | Claude claude-sonnet-4-6 (Anthropic) |

---

## WHAT YOU NEED (4 Keys Total)

| Key | Required | Free? | Time |
|-----|----------|-------|------|
| Telegram Bot Token | YES | Always free | 2 min |
| Telegram Chat ID | YES | Always free | 1 min |
| Anthropic API Key (Claude) | YES | ~$3-5/month | 3 min |
| Google API Key (Nanobanana) | YES | $300 free credit | 3 min |
| GitHub Token | Recommended | Always free | 2 min |

**Total: ~11 minutes**

---

## STEP 1 — TELEGRAM BOT (2 min)

This is how you talk to Jarvis.

1. Open **Telegram** on your phone or desktop
2. Search: `@BotFather`
3. Tap → **START**
4. Type: `/newbot`
5. Enter name: `Jarvis`
6. Enter username: `maillard_jarvis_bot` *(must end in _bot, must be unique)*
7. BotFather replies with your token:

```
7123456789:AAExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

📋 **Save this. It's your `TELEGRAM_BOT_TOKEN`.**

---

## STEP 2 — YOUR TELEGRAM CHAT ID (1 min)

1. Go to your new bot in Telegram
2. Tap **START** (or type "hello")
3. Open this URL in any browser *(replace YOUR_TOKEN)*:

```
https://api.telegram.org/botYOUR_TOKEN/getUpdates
```

4. In the response, find this section:
```json
"from": {
  "id": 123456789,
  ...
}
```

📋 **That number is your `TELEGRAM_CHAT_ID`.**

---

## STEP 3 — CLAUDE API KEY (3 min)

Claude is Jarvis's brain. Powers all reasoning, image analysis, and code repair.

1. Go to: **https://console.anthropic.com**
2. Sign up with your email
3. Left sidebar → **API Keys**
4. Click **+ Create Key**
5. Name it: `Jarvis`
6. Copy the key: `sk-ant-api03-...`

📋 **Save this. It's your `ANTHROPIC_API_KEY`.**

**Cost**: ~$0.003 per message. Most users spend under $5/month.

---

## STEP 4 — GOOGLE API KEY (Nanobanana + Veo) (3 min)

One key unlocks **all** of these:
- **Nano Banana 2** — latest image generation model (gemini-3.1-flash-image-preview)
- **Veo 3.1** — best video generation model in the world

1. Go to: **https://aistudio.google.com**
2. Sign in with Google
3. Click **"Get API key"** in the left sidebar
4. Click **"Create API key"**
5. Select or create a Google Cloud project
6. Copy the key: `AIzaSy...`

📋 **Save this. It's your `GOOGLE_API_KEY`.**

**Free tier**: 50 image requests/day. New Google Cloud accounts get **$300 free credit** automatically.

> Note: If you see a "billing required" error for images, enable billing on your Google Cloud project — your $300 free credit will cover it (no actual charge until credit runs out).

---

## STEP 5 — GITHUB TOKEN (2 min)

For automatic code deployment.

1. Go to: **https://github.com/settings/tokens**
2. Click **Generate new token (classic)**
3. Note: `Jarvis deployment`
4. Expiration: `No expiration`
5. Check these boxes:
   - ✅ `repo` (all)
   - ✅ `workflow`
6. Click **Generate token**
7. Copy: `ghp_...`

📋 **Save this. It's your `GITHUB_TOKEN`.**

---

## STEP 6 — CREATE YOUR .env FILE

1. In the `Jarvis` folder, find `.env.example`
2. Make a copy named `.env`
3. Fill it in:

```env
# YOU
OWNER_NAME=Elliot
OWNER_EMAIL=your@email.com
OWNER_WHATSAPP_NUMBER=3386333

# TELEGRAM
TELEGRAM_BOT_TOKEN=7123456789:AAExxxxxxxxx    ← from Step 1
TELEGRAM_CHAT_ID=123456789                    ← from Step 2

# CLAUDE (brain)
ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxx        ← from Step 3

# GOOGLE (nanobanana + veo)
GOOGLE_API_KEY=AIzaSyxxxxxxxxxxxxxxxxx         ← from Step 4

# GITHUB
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxx            ← from Step 5
GITHUB_USERNAME=your-github-username

# WHATSAPP (already saved, add token when Meta unlocks)
WHATSAPP_PHONE_NUMBER_ID=880684635006473
WHATSAPP_ACCESS_TOKEN=                         ← add later

# SERVER
PORT=8000
IDLE_POLL_SECONDS=10
```

---

## STEP 7 — INSTALL DEPENDENCIES

Open terminal in the `Jarvis` folder and run:

```bash
pip install -r requirements-free.txt
```

This installs:
- `anthropic` — Claude SDK
- `google-genai` — Nanobanana + Veo SDK
- `langgraph` — orchestration
- `chromadb` — local memory
- `Pillow` — screen capture
- `fastapi` — web server
- `httpx` — HTTP
- Everything else

---

## STEP 8 — RUN JARVIS

```bash
python main_free.py
```

You'll see:
```
🟢 JARVIS FREE EDITION STARTING
✓ Owner: Elliot
✓ Brain: Claude claude-sonnet-4-6
✓ Telegram: connected
✓ Nanobanana: Nano Banana 2 + Veo 3.1
[Jarvis sends you a Telegram message: "🟢 Jarvis online"]
```

---

## STEP 9 — TEST IT

Send your Telegram bot these messages one at a time:

**Test 1 — Basic chat:**
```
Hello Jarvis, are you online?
```
Jarvis should reply.

**Test 2 — Status:**
```
/status
```
Shows brain, memory, channels.

**Test 3 — Screen vision:**
Take a screenshot of anything. Send it to the bot.
Jarvis describes what it sees.

**Test 4 — Image generation:**
```
Create an image of a futuristic city at night with neon lights
```
Jarvis generates it with Nano Banana 2, sends it back.

**Test 5 — Video generation:**
```
Generate a video of ocean waves at sunset
```
Jarvis generates it with Veo 3.1, sends back the MP4.
*(Takes 1-3 minutes, costs ~$6 for 8 seconds)*

**Test 6 — Code deploy:**
```
Deploy my latest code to GitHub
```

**Test 7 — Self-repair:**
```
/fix
```
Jarvis scans its own logs, fixes any bugs it finds.

---

## COMMANDS REFERENCE

| Send to Telegram | What Jarvis Does |
|-----------------|-----------------|
| Any message | Responds intelligently (Claude) |
| Send a photo | Analyzes image content |
| `/status` | System status report |
| `/fix` | Scans logs + repairs own bugs |
| `/update do X` | Rewrites its own code |
| `create image of X` | Generates image (Nano Banana 2) |
| `create video of X` | Generates video (Veo 3.1) |
| `edit this image: [+ photo] do X` | Edits image you sent |
| `deploy my code` | GitHub auto-deploy |
| `read my emails` | Gmail summary |

---

## KEEP JARVIS RUNNING 24/7

### Option A — Background on Windows (simplest)

Open terminal, run:
```bash
pip install pm2
pm2 start main_free.py --name jarvis --interpreter python
pm2 save
pm2 startup
```

Jarvis now runs even when you close the terminal and auto-restarts on reboot.

### Option B — Railway.com (cloud, free tier)

1. Push Jarvis to a GitHub repo
2. Go to **https://railway.app**
3. New Project → Deploy from GitHub → select your repo
4. In Railway dashboard: Settings → Environment Variables
5. Copy all your `.env` values in
6. Deploy

Runs 24/7 in the cloud, free tier.

---

## NANOBANANA — WHAT YOU NEED TO KNOW

**Nanobanana** is Google's nickname for their Gemini image generation.

| Model | ID | Speed | Quality | Cost |
|-------|----|-------|---------|------|
| Nano Banana 2 (latest) | `gemini-3.1-flash-image-preview` | Fast | Excellent | ~$0.045/image |
| Nano Banana Pro | `gemini-3-pro-image-preview` | Slow | Best | ~$0.134/image |
| Nano Banana | `gemini-2.5-flash-image` | Fastest | Good | ~$0.039/image |

Jarvis uses **Nano Banana 2** by default (best balance).

Say `"high quality"` or `"pro quality"` in your prompt to use Nano Banana Pro.

**Video** uses **Veo 3.1** (`veo-3.0-generate-preview`) — $0.75/second of video.

---

## WHATSAPP — FIX (WHEN READY)

Your Phone Number ID is already saved: `880684635006473`

When Meta unlocks your account:

**Method 1 (Easy) — Grab the temp token from dashboard:**
1. https://developers.facebook.com/apps → your app
2. Left menu: WhatsApp → **Getting Started**
3. Scroll to "Step 2" — there's a token starting `EAA...`
4. Click **Copy**
5. Add to `.env`: `WHATSAPP_ACCESS_TOKEN=EAAxxxx`

Token lasts 24 hours. For permanent: Business Settings → System Users → Generate Token.

**Method 2 — Wait:** Meta auto-unlocks new accounts within 24-48h.

---

## ARCHITECTURE (HOW IT WORKS)

```
You (Telegram)
    ↓
[LISTEN] — polls every 10 seconds
    ↓
[RECALL] — loads relevant memories from Chroma
    ↓
[REASON] — Claude plans the steps
    ↓
[ACT] — executes each step:
    • text → brain (Claude)
    • image request → Nanobanana 2
    • video request → Veo 3.1
    • screenshot → Claude Vision
    • code deploy → GitHub
    • self-fix → reads/rewrites own code
    ↓
[VERIFY] — checks for failures
    ↓
[HEAL] — if failure, auto-repairs
    ↓
[RESPOND] — sends result back to you
    ↓
[LEARN] — stores interaction in memory
    ↓
[repeat forever]
```

Every task is handled this way. Fully autonomous.

---

## TROUBLESHOOTING

| Problem | Cause | Fix |
|---------|-------|-----|
| Bot doesn't respond | Wrong Chat ID | Redo Step 2 |
| "No ANTHROPIC_API_KEY" | Key not in .env | Add `ANTHROPIC_API_KEY=...` |
| "No GOOGLE_API_KEY" | Key not in .env | Add `GOOGLE_API_KEY=...` |
| Image fails with 403 | Billing not enabled | Enable billing in Google Cloud Console (free credit covers it) |
| Video hangs | Veo takes 1-3 min | Wait — it's normal |
| Port in use | Another process | Change `PORT=8001` in .env |
| Memory errors | chromadb first run | Delete `./jarvis_memory` folder and restart |

---

## CHECKLIST

- [ ] Step 1: Telegram Bot Token
- [ ] Step 2: Telegram Chat ID
- [ ] Step 3: Claude API Key (console.anthropic.com)
- [ ] Step 4: Google API Key (aistudio.google.com)
- [ ] Step 5: GitHub Token (optional)
- [ ] Step 6: Filled in .env file
- [ ] Step 7: pip install -r requirements-free.txt
- [ ] Step 8: python main_free.py
- [ ] Step 9: Tested with Telegram message
- [ ] Working! ✅

---

**15 minutes. Then Jarvis runs forever.**
