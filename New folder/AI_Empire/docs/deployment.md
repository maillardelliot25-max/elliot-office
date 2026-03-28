# AI Empire – Deployment Guide

Complete instructions for deploying AI Empire to production cloud environments.

---

## Option 1: Railway (Recommended – Easiest)

Railway auto-detects Node.js apps and provides free PostgreSQL + Redis.

### Steps

1. Push your repo to GitHub
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Select your repo → Railway will auto-detect `package.json`
4. Add environment variables in the Railway dashboard:
   ```
   PORT=3000
   NODE_ENV=production
   JWT_SECRET=<generate a 64-char random string>
   MONGO_URI=<your MongoDB Atlas URI>
   OPENAI_API_KEY=sk-...
   ```
5. Railway provides a public URL automatically (e.g. `https://ai-empire.up.railway.app`)

**MongoDB on Railway:**
- Add a MongoDB plugin in the Railway dashboard
- It auto-injects `MONGO_URL` into your environment

---

## Option 2: DigitalOcean App Platform

1. Create a DigitalOcean account → App Platform → Create App
2. Connect GitHub → Select repo
3. Configuration:
   - **Run Command**: `npm start`
   - **HTTP Port**: `3000`
   - **Instance Size**: Basic ($5/month) is sufficient to start
4. Add environment variables in the app settings
5. Deploy → DigitalOcean assigns a `.ondigitalocean.app` URL

---

## Option 3: AWS EC2 (Full Control)

### Server Setup

```bash
# 1. Launch Ubuntu 22.04 EC2 instance (t3.micro for free tier)
# 2. SSH into your instance

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 (process manager)
sudo npm install -g pm2

# Clone your repo
git clone https://github.com/yourusername/ai-empire.git
cd ai-empire/AI_Empire

# Install dependencies
npm install --production

# Create .env file
nano .env
# (paste your environment variables)

# Start with PM2
pm2 start backend/server.js --name "ai-empire"
pm2 save
pm2 startup
```

### Nginx Reverse Proxy

```bash
sudo apt install nginx -y

sudo nano /etc/nginx/sites-available/ai-empire
```

Paste:
```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/ai-empire /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### SSL with Certbot

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d yourdomain.com
```

---

## Option 4: Docker (Any Cloud)

### Dockerfile

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3000
CMD ["node", "backend/server.js"]
```

### docker-compose.yml

```yaml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - JWT_SECRET=${JWT_SECRET}
      - MONGO_URI=mongodb://mongo:27017/ai_empire
      - OPENAI_API_KEY=${OPENAI_API_KEY}
    depends_on:
      - mongo
    restart: always

  mongo:
    image: mongo:7
    volumes:
      - mongo_data:/data/db
    restart: always

volumes:
  mongo_data:
```

```bash
# Deploy
docker-compose up -d

# View logs
docker-compose logs -f app
```

---

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default: 3000) |
| `NODE_ENV` | No | `production` or `development` |
| `JWT_SECRET` | **YES** | Secret for JWT signing (64+ char random string) |
| `REFRESH_SECRET` | No | Refresh token secret (defaults to JWT_SECRET) |
| `MONGO_URI` | No | MongoDB connection string (runs in-memory without it) |
| `OPENAI_API_KEY` | No | Enables AI message generation (sk-…) |
| `LINKEDIN_CLIENT_ID` | No | LinkedIn OAuth app client ID |
| `LINKEDIN_CLIENT_SECRET` | No | LinkedIn OAuth app secret |
| `TWITTER_BEARER_TOKEN` | No | Twitter API v2 Bearer Token |
| `UPWORK_API_KEY` | No | Upwork API access token |
| `FRONTEND_URL` | No | Frontend URL for CORS (default: *) |
| `TZ` | No | Timezone for cron jobs (e.g. `America/New_York`) |
| `LOG_LEVEL` | No | `debug`, `info`, `warn`, `error` (default: info) |

---

## MongoDB Atlas (Cloud Database)

1. Create free account at [mongodb.com/atlas](https://mongodb.com/atlas)
2. Create a free M0 cluster
3. Create a database user
4. Whitelist your server IP (or `0.0.0.0/0` for all)
5. Get the connection string → paste as `MONGO_URI`

---

## Monitoring

### PM2 Built-in Monitor

```bash
pm2 monit          # Real-time CPU/memory
pm2 logs           # Live log stream
pm2 status         # Process list
```

### Health Check Endpoint

```
GET /health
```

Returns JSON with agent statuses, uptime, and revenue snapshot. Use this with any uptime monitor (UptimeRobot, Better Uptime, Pingdom).

---

## Scaling

The server is stateless-friendly. For horizontal scaling:

1. Move `EmpireState` to Redis (replace in-memory `Map` with `ioredis`)
2. Use Socket.IO Redis adapter for multi-instance socket sync
3. Run multiple Node.js instances behind Nginx with upstream load balancing
4. Use MongoDB Atlas auto-scaling for database

---

## Backup

```bash
# Backup MongoDB
mongodump --uri="$MONGO_URI" --out=/backups/$(date +%Y%m%d)

# Schedule daily backup via cron
0 3 * * * mongodump --uri="$MONGO_URI" --out=/backups/$(date +\%Y\%m\%d)
```
