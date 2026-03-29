# JARVIS — FREE EDITION

**Fully autonomous personal AI. Zero cost forever.**

---

## 🎯 **What Is This?**

An AI agent that:
- ✅ Reads your texts (WhatsApp)
- ✅ Reads your email
- ✅ Deploys code automatically
- ✅ Learns from every interaction
- ✅ Self-repairs on errors
- ✅ Runs forever, 24/7

**No API bills. No subscriptions. Zero dollars.**

All the logic runs locally or on free tier hosting.

---

## 🚀 **Quick Start (15 Min)**

### **Step 1: Install Ollama (Your AI Brain)**

```bash
# macOS: brew install ollama
# Ubuntu: wget https://ollama.ai/install.sh && bash install.sh
# Windows: Download from https://ollama.ai/download/windows

ollama pull mistral  # Download the model (~4GB)
ollama serve  # Start server
```

### **Step 2: Clone & Setup Jarvis**

```bash
git clone https://github.com/[your-account]/jarvis.git
cd Jarvis
pip install -r requirements-free.txt
cp .env.example .env
```

### **Step 3: Add Your Credentials (5 min)**

Edit `.env`:

```env
OWNER_NAME="Your Name"
OWNER_WHATSAPP_NUMBER="12125551234"
WHATSAPP_PHONE_NUMBER_ID="..."  # from Meta dashboard
WHATSAPP_ACCESS_TOKEN="..."      # from Meta dashboard
GITHUB_TOKEN="ghp_..."  # optional, for deployments
```

See `CREDENTIALS_FREE.md` for exact steps.

### **Step 4: Run Jarvis**

```bash
# Terminal 1 (already running):
ollama serve

# Terminal 2:
python main.py
```

Jarvis is online.

### **Step 5: Test**

Send yourself a WhatsApp message.

Jarvis replies.

Done.

---

## 📊 **What's Included**

### **Core**
- Master loop (eternal state machine)
- ReAct reasoning (think before acting)
- Local vector memory (learns your style)
- Self-healing (auto-repairs mistakes)

### **Integrations**
- WhatsApp (inbound + outbound)
- Gmail (read + send)
- GitHub (deploy code autonomously)
- Vercel (deploy to live)

### **Stack**
- **LLM**: Mistral 7B (via Ollama) — $0
- **Embeddings**: Sentence-Transformers — $0
- **Vector DB**: Chroma — $0
- **Messaging**: Meta Cloud API — $0
- **Email**: Google Gmail — $0
- **Code**: GitHub — $0

**Total cost: $0**

---

## 💬 **How to Use It**

### **Ask It Stuff**

Send WhatsApp:
```
"Deploy my website"
"Read my emails"
"Summary of today"
```

Jarvis does it.

### **Real Examples**

| You | Jarvis |
|-----|--------|
| "Deploy my blog" | Pulls repo → builds → pushes to GitHub → Vercel deploys → reports URL |
| "Check email" | Reads unread → prioritizes → sends summary |
| "What's my next meeting?" | Reads Gmail for calendar invite |

---

## 🔄 **The Loop**

Every task flows through:

```
LISTEN → RECALL (memory) → REASON (plan) → ACT → VERIFY → RESPOND → LEARN
```

**Each step runs locally.** No external APIs except WhatsApp/Gmail (which are free).

---

## 📁 **File Structure**

```
Jarvis/
├── core/master_loop_free.py    [Free edition brain]
├── core/memory_free.py         [Local vector DB]
├── integrations/               [WhatsApp, Gmail, GitHub, etc]
├── main.py                     [FastAPI server]
├── requirements-free.txt
├── .env.example
├── CREDENTIALS_FREE.md         [← Read this first]
├── docs/DEPLOYMENT_FREE.md     [← Then this]
└── README_FINAL.md
```

---

## ❓ **FAQ**

**Q: Why is it free?**
A: No paid APIs. Ollama runs locally on your machine. Chroma is embedded. You pay $0.

**Q: How do I run it 24/7?**
A: Cheapest: Keep a laptop on. Or: $3-5/mo VPS (DigitalOcean). Or: Use Railway/Render free tier.

**Q: What about voice calls?**
A: No free option. Vapi is paid. Use WhatsApp instead.

**Q: Can I upgrade later?**
A: Yes. Replace Ollama with Claude API, Chroma with Pinecone, add Vapi for voice. Same code.

**Q: Is my data private?**
A: 100% stays local (Chroma runs on your machine). Only WhatsApp + Gmail hit external APIs (encrypted).

**Q: How fast is it?**
A: Ollama Mistral is ~3-5 seconds per response. Faster than you think.

---

## 🛠️ **Next Steps**

1. **Read** → `CREDENTIALS_FREE.md` (what you need)
2. **Install** → Ollama + requirements
3. **Configure** → Fill in .env
4. **Run** → `python main.py`
5. **Test** → WhatsApp Jarvis

---

## 📚 **Full Docs**

Start with:
- `CREDENTIALS_FREE.md` — What you need (10 min)
- `docs/DEPLOYMENT_FREE.md` — How to set up (15 min)
- `docs/ARCHITECTURE.md` — How it works (deep dive)

---

**You now own a personal AI with zero monthly costs.**

**That's it.**

**Deployed. Free. Forever.**
