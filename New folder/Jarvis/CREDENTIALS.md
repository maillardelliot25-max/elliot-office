# JARVIS — Minimalist Go-Live Checklist

## 📋 **Exactly What You Need to Give Me**

Fill in this form. That's it. Everything else is automated.

---

## **TIER 1: CRITICAL (Required to Start)**

```
OWNER_NAME: [Your name]
OWNER_EMAIL: [Your email]
OWNER_WHATSAPP_NUMBER: [Your WhatsApp number, e.g., 12125551234 (no +)]
OWNER_PHONE: [Your phone, E.164 format, e.g., +12125551234]
```

---

## **TIER 2: AI MODELS (Required for Core Logic)**

```
ANTHROPIC_API_KEY: [from https://console.anthropic.com/]
    ↳ How: Log in → API Keys → Create new key → paste here

OPENAI_API_KEY: [from https://platform.openai.com/api-keys]
    ↳ How: Log in → API Keys → Create new secret key → paste here
```

**Cost**: ~$1-3/month (you control spend limits)

---

## **TIER 3: MEMORY (Vector DB)**

```
PINECONE_API_KEY: [from https://www.pinecone.io]
    ↳ How: Sign up → Dashboard → Copy API Key → paste here
    ↳ Cost: $0 (free tier) or $29/month starter
```

---

## **TIER 4: YOUR COMMUNICATIONS (Pick at Least One)**

### **Option A: WhatsApp (Recommended First)**

```
WHATSAPP_PHONE_NUMBER_ID: [from Meta Dashboard]
WHATSAPP_ACCESS_TOKEN: [from Meta Dashboard]
WHATSAPP_VERIFY_TOKEN: [create any string, e.g., "jarvis-2026"]

↳ How to get:
  1. Go to https://developers.facebook.com
  2. Create Business App → Add WhatsApp
  3. In WhatsApp > Getting Started, copy Phone Number ID + Access Token
  4. Setup webhook: https://your-jarvis-url/whatsapp/webhook
```

**Cost**: $0 (free tier: 1000 msg/month)

### **Option B: Gmail (Also Recommended)**

```
GMAIL_CLIENT_ID: [from Google Cloud Console]
GMAIL_CLIENT_SECRET: [from Google Cloud Console]
GMAIL_REFRESH_TOKEN: [obtained via OAuth flow]

↳ How to get:
  1. Go to https://console.cloud.google.com
  2. Create new project
  3. Enable Gmail API
  4. Create OAuth credentials (Desktop app)
  5. Run local Jarvis to get consent URL → click → copy refresh token
```

**Cost**: $0 (free tier)

### **Option C: Phone Voice (Vapi)**

```
VAPI_API_KEY: [from https://vapi.ai]
VAPI_PHONE_NUMBER_ID: [from Vapi Dashboard]
VAPI_ASSISTANT_ID: [leave blank — auto-created by /vapi/setup]

↳ How to get:
  1. Sign up at https://vapi.ai
  2. Get API Key → Paste here
  3. Add phone number (you choose country code)
  4. After deploy, call POST /vapi/setup (auto-creates assistant)
```

**Cost**: ~$5-50/month (per minute, very cheap)

---

## **TIER 5: CODE DEPLOYMENT (Optional but Recommended)**

### **GitHub (Required to Deploy)**

```
GITHUB_TOKEN: [from https://github.com/settings/tokens]
GITHUB_USERNAME: [your GitHub username]

↳ How to get:
  1. Go to https://github.com/settings/tokens
  2. Create Personal Access Token (classic)
  3. Scopes: repo, workflow, admin:repo_hook
  4. Copy token → Paste here
```

**Cost**: $0 (free tier)

### **Vercel (Required to Host Deployed Apps)**

```
VERCEL_TOKEN: [from https://vercel.com/account/tokens]

↳ How to get:
  1. Sign up at https://vercel.com
  2. Go to https://vercel.com/account/tokens
  3. Create token with scope: full
  4. Copy → Paste here
```

**Cost**: $0 (free tier)

---

## **TIER 6: BOOKKEEPING (Optional — Only if You Want Financial Tracking)**

```
PLAID_CLIENT_ID: [from https://plaid.com]
PLAID_SECRET: [from Plaid Dashboard]
PLAID_ACCESS_TOKEN: [obtained via Plaid Link flow in frontend]

↳ How to get:
  1. Sign up at https://plaid.com
  2. Get Client ID + Secret from dashboard
  3. Use Plaid Link (in frontend) to connect your bank
  4. Paste the access token here
```

**Cost**: $0 (sandbox mode) or pay-as-you-go for production

---

## **TIER 7: LINKEDIN (Optional — Only if You Do Outreach)**

```
LINKEDIN_CLIENT_ID: [from LinkedIn Developer Dashboard]
LINKEDIN_CLIENT_SECRET: [from LinkedIn Developer Dashboard]
LINKEDIN_ACCESS_TOKEN: [obtained via OAuth flow]

↳ How to get:
  1. Go to https://www.linkedin.com/developers/apps
  2. Create new app
  3. Request "Sign In with LinkedIn" permissions
  4. Use OAuth to get access token
```

**Cost**: $0

---

## **📦 Deployment Platform (Pick One)**

### **Option 1: Railway.app (Easiest)**

```
Just connect your GitHub repo.
Railway auto-deploys. No extra setup.
Cost: $5-20/month depending on usage
```

### **Option 2: Vercel (If You Want FaaS)**

```
vercel deploy
Cost: Included in free tier for most use cases
```

### **Option 3: Docker + Any Cloud**

```
docker build -t jarvis .
docker push your-account/jarvis
Deploy to: AWS ECS, GCP Cloud Run, Azure Container Instances
```

---

## **✅ Minimum to Go Live**

You can launch with **JUST**:

1. ✅ `ANTHROPIC_API_KEY`
2. ✅ `OPENAI_API_KEY`
3. ✅ `OWNER_WHATSAPP_NUMBER`
4. ✅ `WHATSAPP_ACCESS_TOKEN`
5. ✅ `WHATSAPP_PHONE_NUMBER_ID`
6. ✅ `PINECONE_API_KEY`

**Everything else is optional.**

Jarvis will work, learn, and help you. Integrations can be added anytime.

---

## **📝 Submission Template**

```
TIER 1 — OWNER IDENTITY
├─ OWNER_NAME: [________]
├─ OWNER_EMAIL: [________]
├─ OWNER_WHATSAPP_NUMBER: [________]
└─ OWNER_PHONE: [________]

TIER 2 — AI MODELS
├─ ANTHROPIC_API_KEY: [________]
└─ OPENAI_API_KEY: [________]

TIER 3 — MEMORY
└─ PINECONE_API_KEY: [________]

TIER 4 — COMMUNICATIONS
├─ WhatsApp:
│  ├─ WHATSAPP_PHONE_NUMBER_ID: [________]
│  ├─ WHATSAPP_ACCESS_TOKEN: [________]
│  └─ WHATSAPP_VERIFY_TOKEN: [optional — I'll auto-generate]
├─ Gmail: [optional]
└─ Voice (Vapi): [optional]

TIER 5 — DEPLOYMENT
├─ GITHUB_TOKEN: [optional]
├─ GITHUB_USERNAME: [optional]
└─ VERCEL_TOKEN: [optional]

TIER 6 — BOOKKEEPING
└─ Plaid tokens: [optional]

TIER 7 — LINKEDIN
└─ LinkedIn tokens: [optional]
```

---

## **⏱️ Time to Get Each**

| Credential | Time | Difficulty |
|--|--|--|
| Anthropic API | 2 min | ⭐ Easy |
| OpenAI API | 2 min | ⭐ Easy |
| Pinecone | 5 min | ⭐ Easy |
| WhatsApp | 15 min | ⭐⭐ Medium |
| Gmail | 10 min | ⭐⭐ Medium |
| GitHub | 5 min | ⭐⭐ Medium |
| Vercel | 3 min | ⭐ Easy |
| Vapi | 10 min | ⭐⭐ Medium |
| **TOTAL** | **~50 min** | **⭐⭐ Medium** |

---

## **🚀 Next Steps**

1. **Gather credentials above** (start with Tier 1-3)
2. **Send them to me** → I deploy to Railway
3. **Test manually** → Send WhatsApp message to Jarvis
4. **Add more integrations** as needed

---

## **Questions on Getting a Specific Credential?**

See `DEPLOYMENT.md` for detailed setup guides for each integration.

---

**That's it. You now control a personal AI.**
