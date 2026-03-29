# JARVIS — Quick Reference Card

## 🚦 **Status Commands**

```bash
# Health check
curl https://your-jarvis-url/health

# Full system status
curl https://your-jarvis-url/status

# Search your memory
curl https://your-jarvis-url/memory/search?q=deploy%20blog

# View repair history
curl https://your-jarvis-url/healer/log
```

---

## 📝 **Manual Task Submission**

```bash
curl -X POST https://your-jarvis-url/task/manual \
  -H "Content-Type: application/json" \
  -d '{"channel": "internal", "content": "Your task here"}'
```

---

## 🔧 **One-Time Setup**

### Create Vapi Assistant (after deploy)
```bash
curl -X POST https://your-jarvis-url/vapi/setup
```
Copy the returned `VAPI_ASSISTANT_ID` into your .env

---

## 📱 **Communication Channels**

| Channel | Initiate | Jarvis Initiates | Priority |
|---------|----------|-----------------|----------|
| **WhatsApp** | Send message | ✅ | P1 (primary) |
| **Voice Call** | Call your number | ✅ (Vapi) | P2 |
| **Gmail** | Send email | ✅ | P3 |
| **LinkedIn** | Send message | ✅ | P4 |

---

## ⚙️ **Default Behaviors**

```
IDLE_POLL_SECONDS=15
  → Jarvis checks for new tasks every 15s

Rate Limit Hit?
  → Auto-backs off exponentially (2s, 4s, 8s, ...)

Token Expired?
  → Auto-refreshes

Build Fails?
  → Fetches logs, attempts auto-fix

Can't Fix It?
  → Sends one-line WhatsApp to you
```

---

## 📊 **Common Tasks**

### **"Check my email"**
```
→ Polls Gmail unread
→ Reads most important (sender, subject, body)
→ Marks as read
→ Reports back
```

### **"Deploy my website"**
```
→ Pulls repo from GitHub
→ Runs: npm install && npm build
→ Pushes to main branch
→ Vercel auto-deploys (5s)
→ Tests endpoint
→ Returns live URL
```

### **"What did I spend this week?"**
```
→ Queries Plaid transactions (7 days)
→ Categorizes: meals, transport, tools, etc.
→ Generates summary by category
→ Highlights largest expense
→ Returns formatted report
```

### **"Schedule a meeting for Friday 2pm"**
```
→ Checks your Google Calendar
→ Finds available slot
→ Sends invite to attendees
→ Confirms via WhatsApp
```

---

## 🔐 **Security**

✅ All secrets in .env (never in code)
✅ OAuth2 for all APIs (not stored passwords)
✅ All external APIs use HTTPS
✅ Tokens auto-refresh before expiry
✅ ReAct reasoning prevents accidental actions

---

## ⚠️ **Failure Modes (What's Safe)**

Jarvis will **NOT**:
- ❌ Spend money (no Stripe/Paypal access)
- ❌ Delete data without confirmation
- ❌ Make business-critical decisions solo
- ❌ Access data outside your explicit scopes

Jarvis **WILL**:
- ✅ Ask you before major actions
- ✅ Log everything to `logs/jarvis.log`
- ✅ Self-heal all transient errors
- ✅ Escalate when genuinely stuck

---

## 📈 **Optimization Tips**

### **To Speed Up Email Processing**
Edit `.env`:
```env
IDLE_POLL_SECONDS=5  # Check every 5s instead of 15s
```

### **To Reduce API Costs**
Use Haiku model in ReAct for simple tasks:
```python
# In react_agent.py, line 12
self.llm = ChatAnthropic(model="claude-haiku-4-5", ...)
```

### **To Improve Memory Recall**
Add more context in Pinecone:
```python
# In memory/memory.py, line 150
top_k=10  # Retrieve top 10 instead of 5
```

---

## 🐛 **Troubleshooting**

| Issue | Cause | Fix |
|-------|-------|-----|
| "Master loop not initialized" | Missing credentials | Check startup logs, fill .env |
| WhatsApp no response | Webhook not configured | Set in Meta dashboard: `https://your-url/whatsapp/webhook` |
| Email not reading | Token expired | Will auto-refresh, or manually update GMAIL_REFRESH_TOKEN |
| Vercel deploy fails | Build error | Check `curl /healer/log` for auto-repair attempts |
| Memory searches slow | Index not ready | Wait 2 minutes after first deployment |

---

## 📞 **Emergency Commands**

### **Disable a channel temporarily**
```bash
# In .env, comment out the token
# WHATSAPP_ACCESS_TOKEN=...  # disabled
# Restart Jarvis
```

### **View all environment variables in use**
```bash
curl https://your-jarvis-url/status
```

### **Check logs in real-time**
```bash
# On Railway
railway logs -f

# Local
tail -f logs/jarvis.log
```

### **Force restart**
```bash
# Railway dashboard → Deployments → Restart

# Local: Ctrl+C then
python main.py
```

---

## 🎯 **What Jarvis Does Best**

1. **Email triage** — Can read 100 emails, rank by importance
2. **Code deployment** — Git push → GitHub → Vercel → live (no human needed)
3. **Expense categorization** — Real-time transaction breakdown
4. **Meeting scheduling** — Find times, send invites, handle conflicts
5. **LinkedIn outreach** — Draft messages, handle replies
6. **Financial summaries** — Weekly P&L, budget alerts

---

## 📚 **Full Documentation**

| File | Purpose |
|------|---------|
| `docs/ARCHITECTURE.md` | How Jarvis thinks + tech stack |
| `docs/DEPLOYMENT.md` | Step-by-step setup guide |
| `CREDENTIALS.md` | Exact credentials needed |
| `README_FINAL.md` | Overall vision + features |
| **This file** | Quick reference |

---

## 🚀 **Next 7 Days**

**Day 1**: Deploy to Railway
**Day 2**: Test WhatsApp + Gmail
**Day 3**: Enable voice calls
**Day 4**: Enable GitHub deployments
**Day 5**: Test autonomous code deploy
**Day 6**: Add more integrations (Plaid, LinkedIn)
**Day 7**: Hands off — Jarvis is running

---

## 💬 **Example Conversations**

### **You:**
"Summarize my inbox and tell me what needs urgent attention"

### **Jarvis:**
```
📧 9 unread emails.

🔴 URGENT:
- From: CEO | Subject: Quarterly Review Due
- From: Client | Subject: Critical Bug in Production

🟡 MEDIUM:
- From: Team | Subject: Sprint Review Tomorrow
- From: HR | Subject: Benefits Open Enrollment

🟢 LOW:
- Newsletters (6)
```

---

**That's everything. Jarvis is a self-sufficient system. Treat it like a colleague.**

**The only question left: What will you have Jarvis do first?**
