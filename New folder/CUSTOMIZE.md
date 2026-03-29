# 🎨 Maillard AI — Customize Features

**Everything is modular. Change features without breaking anything.**

---

## **1. Change Your Name/Brand**

**File:** `AI_Empire/config/profile.json`

```json
{
  "owner": {
    "name": "YOUR_NAME",           ← Change this
    "email": "your@email.com",
    "brand": "Your Brand Name",    ← Change this
    "calendly": "https://calendly.com/yoururl"
  },
  ...
}
```

**Then restart server:** Close `RUN_FOREVER.bat` and restart.

---

## **2. Change Service Prices**

**File:** `AI_Empire/agents/virtual_consultant/persona_data.json`

```json
{
  "services": [
    {
      "name": "AI Chatbot",
      "price": 750         ← Change to your price
    },
    {
      "name": "Business Automation",
      "price": 1500        ← Change this
    }
  ]
}
```

**Save** → Restart server → Prices updated.

---

## **3. Change Fiverr/Upwork Gig Titles**

**File:** `AI_Empire/setup/ELLIOT_SETUP_GUIDE.md`

Look for the "5 Fiverr Gigs" section and update titles, prices, descriptions.

Then copy-paste into Fiverr/Upwork directly.

---

## **4. Change Revenue Streams**

**File:** `AI_Empire/backend/server.js` (line ~87)

```javascript
revenue: {
  linkedin: 0,
  social_media: 0,
  freelance: 0,
  ai_development: 0,
  consulting: 0,          ← Add/remove streams here
  digital_products: 0,
  saas: 0,
  manual: 0
}
```

Then restart server.

---

## **5. Change Agent Names/Roles**

**File:** `AI_Empire/frontend/agent-office.js` (line ~10)

```javascript
const AgentOffice = {
  agents: [
    {
      id: 'linkedin',
      name: 'Alex',                     ← Change name
      role: '🎯 LinkedIn Scout',       ← Change role
      color: '#0A66C2'                 ← Change color (hex)
    },
    // More agents...
  ]
}
```

Save → Refresh browser → Changes appear.

---

## **6. Change Dashboard Colors**

**File:** `AI_Empire/frontend/styles.css` (top of file)

```css
:root {
  --accent: #4ECDC4;        ← Main color
  --surface-1: #0f0f1e;     ← Background
  --text-primary: #ffffff;  ← Text color
  /* ... more colors ... */
}
```

Save → Refresh browser → All colors update.

---

## **7. Add a New Agent**

**Step 1:** Create folder `AI_Empire/agents/my_agent/`

**Step 2:** Create `agent.js`:

```javascript
'use strict';

const AGENT_ID = 'my_agent';
const AGENT_NAME = 'My Custom Agent';

async function runCycle(logger, io, EmpireState) {
  logger.info(`[${AGENT_NAME}] Running cycle...`);
  // Your logic here
}

function start(logger, io, EmpireState) {
  logger.info(`[${AGENT_NAME}] Started`);
  runCycle(logger, io, EmpireState);
  return setInterval(() => runCycle(logger, io, EmpireState), 60000);
}

module.exports = { start, AGENT_ID, AGENT_NAME };
```

**Step 3:** Add to `AI_Empire/backend/server.js`:

```javascript
// Around line 85 in EmpireState.agents:
my_agent: { id:'my_agent', name:'My Agent', status:'idle', tasksToday:0, revenue:0, ... },

// Around line 195 in bootSubsystems():
const myAgent = require('../agents/my_agent/agent');
myAgent.start(EmpireState, logger, io);
```

**Step 4:** Restart server.

---

## **8. Change Login Credentials**

**File:** `AI_Empire/backend/auth.js` (line ~20)

```javascript
const DEFAULT_ADMIN = {
  email: 'admin@empire.ai',      ← Change email
  password: 'empire2024',         ← Change password (will be hashed)
};
```

**Warning:** Write down new password! (Can't recover it)

Restart server → New login works.

---

## **9. Change Port (from 3000 to something else)**

**File:** `AI_Empire/backend/server.js` (line ~266)

```javascript
const PORT = process.env.PORT || 3000;  ← Change to 4000, 5000, etc.
```

**Also update:** `.claude/launch.json` (if using preview)

Restart server → Runs on new port.

---

## **10. Add New Dashboard View**

**File:** `AI_Empire/frontend/index.html`

1. Add nav item in sidebar:
```html
<li class="nav-item" data-view="my-view" onclick="navigateTo('my-view')">
  <span class="nav-icon">📊</span><span class="nav-label">My View</span>
</li>
```

2. Add view section:
```html
<section id="view-my-view" class="view">
  <div class="view-header">
    <h1>My Custom View</h1>
  </div>
  <!-- Your content here -->
</section>
```

3. Refresh browser → New view appears.

---

## **11. Change Welcome/Tutorial Messages**

**File:** `AI_Empire/frontend/index.html` (search for "Tutorial")

Find the tutorial steps and edit text:

```javascript
{
  icon: '🏠',
  title: 'Your New Title',
  body: `<p>Your custom message here</p>`,
},
```

Save → Refresh → Tutorial updated.

---

## **12. Disable/Enable Agents**

**Don't want email outreach? Remove it:**

**File:** `AI_Empire/backend/server.js` (line ~200, bootSubsystems)

Comment out or delete:
```javascript
// const emailAgent = require('../agents/email_outreach/agent');
// emailAgent.start(logger, io, EmpireState);
```

Restart server → Agent no longer runs.

---

## **Common Changes (Quick Copy-Paste)**

### **Change your email:**
- `AI_Empire/config/profile.json` → `owner.email`

### **Change your LinkedIn URL:**
- `AI_Empire/config/profile.json` → `social.linkedin`

### **Disable Autopilot (agents don't run):**
- Click ✈️ **Autopilot** in dashboard → Click "Pause Autopilot"

### **Clear all data (fresh start):**
- Delete: `AI_Empire/logs/`
- Restart server → All logs cleared

### **Backup everything:**
- Copy entire `AI_Empire/` folder to USB/Google Drive

---

## **Need Help?**

Every change is **backward compatible** — you can't break anything.

If something goes wrong:
1. Close `RUN_FOREVER.bat`
2. Restore the file from backup
3. Restart server

**All features are live and modular. Change anything, restart, and it works.**
