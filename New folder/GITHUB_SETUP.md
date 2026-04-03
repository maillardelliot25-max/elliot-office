# GitHub Setup Instructions

## Quick Steps to Deploy

### 1. Create 4 New Repos on GitHub.com

Go to https://github.com/new for each:

#### Repo 1: portfolio
- **Name**: `portfolio`
- **Description**: Full-stack developer portfolio - 10 production apps
- **Visibility**: Public
- **Initialize**: No (we'll push existing)

#### Repo 2: aria-stack
- **Name**: `aria-stack`
- **Description**: ARIA Stack: Autonomous revenue via LinkedIn, social media, freelance
- **Visibility**: Public
- **Initialize**: No

#### Repo 3: vela-stack
- **Name**: `vela-stack`
- **Description**: VELA Stack: Technical services via AI dev, email, consulting
- **Visibility**: Public
- **Initialize**: No

#### Repo 4: tempa-stack
- **Name**: `tempa-stack`
- **Description**: TEMPA Stack: Extensible agent framework
- **Visibility**: Public
- **Initialize**: No

---

### 2. Push Code to Each Repo

Once repos are created (you should get a GitHub page with setup instructions):

#### Push Portfolio
```bash
cd portfolio-website
git remote add origin https://github.com/maillardelliot25-max/portfolio.git
git branch -M main
git push -u origin main
```

#### Push ARIA Stack
```bash
cd aria-stack
git remote add origin https://github.com/maillardelliot25-max/aria-stack.git
git branch -M main
git push -u origin main
```

#### Push VELA Stack
```bash
cd vela-stack
git remote add origin https://github.com/maillardelliot25-max/vela-stack.git
git branch -M main
git push -u origin main
```

#### Push TEMPA Stack
```bash
cd tempa-stack
git remote add origin https://github.com/maillardelliot25-max/tempa-stack.git
git branch -M main
git push -u origin main
```

---

### 3. Enable GitHub Pages for Portfolio

1. Go to: https://github.com/maillardelliot25-max/portfolio
2. Click **Settings** → **Pages**
3. Set **Source**: `Deploy from a branch`
4. Set **Branch**: `main` / `/ (root)`
5. Click **Save**
6. Wait 1-2 minutes for deployment
7. Visit: https://maillardelliot25-max.github.io/portfolio

---

### 4. Verify All Project Links

Go to your live portfolio and click each project:
- ✅ Maillard AI Dashboard
- ✅ Spanish Translator
- ✅ German Translator
- ✅ Dutch Translator
- ✅ Portfolio Dashboard
- ✅ API Docs
- ✅ SaaS Metrics

All should load with no 404 errors.

---

### 5. Verify Responsive Design

Test on different devices:
```bash
# Mobile (375px width)
Open portfolio in DevTools → Ctrl+Shift+M → Mobile view

# Tablet (768px width)
Resize to 768px

# Desktop (1280px+)
Full screen
```

All projects should display correctly.

---

## Backend Testing (After GitHub Setup)

### Local Deployment Test

```bash
# Terminal 1: ARIA Stack
cd aria-stack
cp .env.example .env          # Configure with your API keys
npm start                      # Start server on port 4001

# Terminal 2: ARIA Agents
cd aria-stack
npm run agents                 # Start agents

# Terminal 3: VELA Stack
cd vela-stack
cp .env.example .env          # Configure
npm start                      # Start on port 4002

# Terminal 4: VELA Agents
cd vela-stack
npm run agents

# Terminal 5: Monitor
npm run dev                    # Main app on port 5000 (already running from earlier)
```

### Verify Revenue Tracking

1. Open http://localhost:5000 (Maillard AI Dashboard)
2. Should show revenue updating from all 6 agents
3. Click "Execute Task" buttons to simulate agent work
4. Revenue should increase
5. Refresh page - revenue should persist (localStorage)

---

## Status Checklist

- [ ] portfolio repo created
- [ ] aria-stack repo created
- [ ] vela-stack repo created
- [ ] tempa-stack repo created
- [ ] Code pushed to all repos
- [ ] GitHub Pages enabled for portfolio
- [ ] Portfolio accessible at github.io URL
- [ ] All 7 projects load without 404s
- [ ] Responsive design verified
- [ ] ARIA stack deploys locally
- [ ] VELA stack deploys locally
- [ ] Agents start without errors
- [ ] Revenue tracking works
- [ ] localStorage persistence verified

---

**Next**: Once repos are created and code is pushed, we can verify everything works together and go live!

