# JARVIS — FREE EDITION CREDENTIALS CHECKLIST

## ✅ **What You Actually Need (Minimal)**

That's it. Just these 4 things. Takes **10 minutes total.**

---

## **Tier 1: YOUR INFO (Not Credentials, Just Config)**

```
OWNER_NAME:             Your name (e.g., "John")
OWNER_EMAIL:            Your email
OWNER_WHATSAPP_NUMBER:  Your WhatsApp # (e.g., 12125551234 — no +)
```

**Time: 1 minute**

---

## **Tier 2: WHATSAPP (Free Tier)**

Go to: https://developers.facebook.com/

1. Create Business App
2. Add WhatsApp product
3. Click: WhatsApp → Getting Started → Create Business Account
4. In dashboard, copy:

```
WHATSAPP_PHONE_NUMBER_ID:    "..."
WHATSAPP_ACCESS_TOKEN:       "..."
WHATSAPP_VERIFY_TOKEN:       "jarvis-free" (create any string)
```

**Time: 5 minutes**
**Cost: $0 (free tier: 1000 msgs/month)**

---

## **Tier 3: GITHUB (Optional but Recommended)**

Go to: https://github.com/settings/tokens

1. Click: Personal Access Tokens → Tokens (classic)
2. New token → Scopes: `repo`, `workflow`
3. Copy the token (only shown once!)

```
GITHUB_TOKEN:       "ghp_..."
GITHUB_USERNAME:    "your-github-handle"
```

**Time: 3 minutes**
**Cost: $0**

---

## **Tier 4: GMAIL (Optional)**

Go to: https://console.cloud.google.com

1. Create new project
2. Enable: Gmail API
3. Create OAuth credentials (Desktop)
4. Run local script to get refresh token:

```python
from google.auth.oauthlib.flow import Flow
flow = Flow.from_client_secrets_file('credentials.json',
    scopes=['https://www.googleapis.com/auth/gmail.modify'])
creds = flow.run_local_server(port=8080)
print(creds.refresh_token)
```

5. Copy output:

```
GMAIL_REFRESH_TOKEN:    "1//..."
```

**Time: 5 minutes**
**Cost: $0**

---

## **That's It**

Literally that. Nothing else needed.

| Item | Required? | Time | Cost |
|------|-----------|------|------|
| Ollama (LLM) | ✅ | Installed locally | $0 |
| Chroma (DB) | ✅ | Auto-embedded | $0 |
| WhatsApp | ✅ | 5 min | $0 |
| GitHub | ⚠️ Optional | 3 min | $0 |
| Gmail | ⚠️ Optional | 5 min | $0 |
| **TOTAL** | | **~13 min** | **$0** |

---

## **Free Edition vs Paid Edition**

| Feature | Free | Paid |
|---------|------|------|
| **LLM** | Ollama (local) | Claude Opus (API) |
| **Memory** | Chroma (local) | Pinecone (cloud) |
| **Voice** | ❌ None | ✅ Vapi |
| **Bookkeeping** | ❌ None | ✅ Plaid |
| **Speed** | Slower (local) | Faster (API) |
| **Privacy** | 100% local | Sent to APIs |
| **Cost/month** | $0 | $50-150 |

---

## **Setup Template**

Copy this exactly into `.env`:

```env
# Owner Info
OWNER_NAME="Your Name"
OWNER_EMAIL="your@email.com"
OWNER_WHATSAPP_NUMBER="12125551234"

# Free LLM (Ollama - runs locally)
OLLAMA_BASE_URL="http://localhost:11434"

# WhatsApp (Required)
WHATSAPP_PHONE_NUMBER_ID="123456789..."
WHATSAPP_ACCESS_TOKEN="EAAo..."
WHATSAPP_VERIFY_TOKEN="jarvis-free"

# GitHub (Optional)
GITHUB_TOKEN="ghp_..."
GITHUB_USERNAME="your-username"

# Gmail (Optional)
GMAIL_REFRESH_TOKEN="1//..."

# Server
PORT=8000
IDLE_POLL_SECONDS=15
```

**Done.**

---

## **Next: Run It**

```bash
pip install -r requirements-free.txt
ollama serve  # Terminal 1
python main.py  # Terminal 2
```

Send WhatsApp to your official number.

Jarvis replies.

Done. Free. Forever.

---

**That's all you need.**
