/**
 * AI Empire – Main Backend Server (server.js)
 * Purpose: Express/Socket.IO server that powers the entire AI Empire.
 * Handles REST API, real-time events, static file serving,
 * and boots all subsystems (agents, autopilot, scheduler).
 */

'use strict';

require('dotenv').config();
const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');
const path       = require('path');
const winston    = require('winston');
const { v4: uuid } = require('uuid');

/* ===================== LOGGER ===================== */
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const metaStr = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
      return `[${timestamp}] ${level}: ${message}${metaStr}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/empire.log',  level: 'info'  }),
    new winston.transports.File({ filename: 'logs/errors.log',  level: 'error' }),
  ],
});

// Ensure logs directory exists
const fs = require('fs');
if (!fs.existsSync('logs')) fs.mkdirSync('logs');

/* ===================== APP SETUP ===================== */
const app    = express();
const server = http.createServer(app);

// Socket.IO with CORS
const io = new Server(server, {
  cors: {
    origin:      process.env.FRONTEND_URL || '*',
    methods:     ['GET', 'POST'],
    credentials: true,
  },
  path: '/socket.io',
});

// Make io available to route handlers
app.set('io', io);

/* ===================== MIDDLEWARE ===================== */
app.use(cors({
  origin:      process.env.FRONTEND_URL || '*',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logger middleware
app.use((req, _res, next) => {
  logger.info(`${req.method} ${req.path}`, { ip: req.ip, ua: req.headers['user-agent']?.substring(0, 60) });
  next();
});

// Serve frontend static files
app.use(express.static(path.join(__dirname, '../frontend')));

/* ===================== IN-MEMORY EMPIRE STATE ===================== */
// Central state store – in production, replace with MongoDB via database.js
const EmpireState = {
  startTime:      Date.now(),
  agents: {
    linkedin:          { id:'linkedin',          name:'LinkedIn Outreach',  status:'idle', tasksToday:0, revenue:0,    successRate:0,  errors:0, lastActive:null },
    social_media:      { id:'social_media',      name:'Social Media',       status:'idle', tasksToday:0, revenue:0,    successRate:0,  errors:0, lastActive:null },
    freelance:         { id:'freelance',         name:'Freelance Services', status:'idle', tasksToday:0, revenue:0,    successRate:0,  errors:0, lastActive:null },
    ai_development:    { id:'ai_development',    name:'AI Development',     status:'idle', tasksToday:0, revenue:0,    successRate:0,  errors:0, lastActive:null },
    virtual_consultant:{ id:'virtual_consultant',name:'Virtual Consultant', status:'idle', tasksToday:0, revenue:0,    successRate:0,  errors:0, lastActive:null },
    maintenance_bot:   { id:'maintenance_bot',   name:'Maintenance Bot',   status:'idle', tasksToday:0, revenue:0,    successRate:0,  errors:0, lastActive:null },
  },
  revenue: { linkedin: 0, social_media: 0, freelance: 0, ai_development: 0, consulting: 0, digital_products: 0, saas: 0, manual: 0 },
  revenueHistory: [],  // { ts, value }
  tasks: [],
  alerts: [],
  healLog: [],
  learningCycles: 0,
  selfHeals: 0,
  apiCalls: 0,
  autopilot: { running: false, paused: false },
  settings: {
    taskInterval: 5,
    maxAgents:    5,
    revTarget:    10000,
    healRetries:  3,
  },
  credentials: {},
  webhooks: {},
};

/* ===================== ROUTE IMPORTS ===================== */
const apiRoutes     = require('./api_routes');
const authRoutes    = require('./auth');
const webhookRoutes = require('./webhooks');

// Mount routes
app.use('/api/auth',         authRoutes(EmpireState, logger, io));
app.use('/api',              apiRoutes(EmpireState, logger, io));
// Webhook routes — no auth required (verified via signatures)
app.use('/webhooks',         webhookRoutes(EmpireState, logger, io));
// Manual revenue entry — also accessible via /api/revenue/manual
app.use('/api/revenue',      webhookRoutes(EmpireState, logger, io));

/* ===================== SPA FALLBACK ===================== */
// Serve index.html for all non-API routes (SPA client-side routing)
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

/* ===================== SOCKET.IO ===================== */
io.on('connection', (socket) => {
  logger.info('Socket connected', { id: socket.id });

  socket.on('subscribe', ({ channels = [] }) => {
    channels.forEach(ch => socket.join(ch));
    logger.debug('Socket subscribed to channels', { id: socket.id, channels });
  });

  socket.on('disconnect', () => {
    logger.info('Socket disconnected', { id: socket.id });
  });
});

// Helper: broadcast to all connected clients
function broadcast(event, data) {
  io.emit(event, data);
}

// Export broadcast for use in subsystems
global.empireBroadcast = broadcast;
global.empireState     = EmpireState;
global.empireLogger    = logger;

/* ===================== SUBSYSTEM BOOT ===================== */
async function bootSubsystems() {
  logger.info('=== AI Empire Booting ===');

  // Boot autopilot engine
  try {
    const { AutopilotEngine } = require('../autopilot/engine');
    const autopilot = new AutopilotEngine(EmpireState, logger, io);
    autopilot.start();
    global.autopilotEngine = autopilot;
    logger.info('[Boot] Autopilot engine started.');
  } catch (err) {
    logger.error('[Boot] Autopilot engine failed to start:', err.message);
  }

  // Boot scheduler
  try {
    const { Scheduler } = require('../autopilot/scheduler');
    const scheduler = new Scheduler(EmpireState, logger, io);
    scheduler.start();
    global.scheduler = scheduler;
    logger.info('[Boot] Scheduler started.');
  } catch (err) {
    logger.error('[Boot] Scheduler failed to start:', err.message);
  }

  // Boot learning engine
  try {
    const { LearningEngine } = require('../autopilot/learning');
    const learning = new LearningEngine(EmpireState, logger, io);
    learning.start();
    global.learningEngine = learning;
    logger.info('[Boot] Learning engine started.');
  } catch (err) {
    logger.error('[Boot] Learning engine failed to start:', err.message);
  }

  // Boot maintenance bot
  try {
    const maintenanceBot = require('../agents/maintenance_bot/agent');
    maintenanceBot.start(EmpireState, logger, io);
    global.maintenanceBot = maintenanceBot;
    logger.info('[Boot] Maintenance Bot started.');
  } catch (err) {
    logger.error('[Boot] Maintenance Bot failed to start:', err.message);
  }

  logger.info('=== AI Empire Running ===');
  EmpireState.autopilot.running = true;

  // Broadcast boot event to connected clients
  setTimeout(() => {
    broadcast('activity', {
      type:    'success',
      message: '⚡ AI Empire fully booted – all systems operational.',
    });
  }, 2000);
}

/* ===================== HEALTH CHECK ENDPOINT ===================== */
app.get('/health', (_req, res) => {
  const uptime   = Math.floor((Date.now() - EmpireState.startTime) / 1000);
  const agentStatuses = Object.values(EmpireState.agents).map(a => ({ id: a.id, status: a.status }));
  res.json({
    status:   'healthy',
    uptime,
    agents:   agentStatuses,
    revenue:  EmpireState.revenue,
    autopilot:EmpireState.autopilot,
    ts:       new Date().toISOString(),
  });
});

/* ===================== ERROR HANDLERS ===================== */
// 404 handler for API routes
app.use('/api', (req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// Global error handler
app.use((err, req, res, _next) => {
  logger.error('Unhandled error:', { message: err.message, stack: err.stack, path: req.path });
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// Handle uncaught exceptions and unhandled rejections – log and attempt recovery
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', { message: err.message, stack: err.stack });
  // Self-heal: increment heal counter and notify dashboard
  EmpireState.selfHeals++;
  broadcast('heal:event', { agent: 'server', action: 'uncaught-exception', result: `Recovered: ${err.message}` });
  // Do NOT exit – keep the empire running
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection:', { reason: String(reason) });
  EmpireState.selfHeals++;
  broadcast('heal:event', { agent: 'server', action: 'unhandled-rejection', result: `Recovered: ${String(reason)}` });
});

/* ===================== GRACEFUL SHUTDOWN ===================== */
async function shutdown(signal) {
  logger.info(`Received ${signal} – shutting down gracefully…`);
  server.close(() => {
    logger.info('HTTP server closed.');
    process.exit(0);
  });
  // Force exit after 10s if graceful shutdown hangs
  setTimeout(() => process.exit(1), 10000);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

/* ===================== START SERVER ===================== */
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, async () => {
  logger.info(`AI Empire Server listening on http://${HOST}:${PORT}`);
  await bootSubsystems();
});

module.exports = { app, server, io, EmpireState, logger };
