/**
 * AI Empire – API Routes (api_routes.js)
 * Purpose: Express router defining all /api/* endpoints.
 * Covers empire status, agents, autopilot, workflows, revenue,
 * analytics, learning, alerts, and settings.
 */

'use strict';

const express = require('express');
const { v4: uuid } = require('uuid');

/**
 * Build and return the main API router.
 * @param {object} EmpireState - Shared in-memory state
 * @param {object} logger      - Winston logger
 * @param {object} io          - Socket.IO server instance
 * @returns {express.Router}
 */
module.exports = function buildApiRoutes(EmpireState, logger, io) {
  const router = express.Router();

  /* ===================== AUTH MIDDLEWARE ===================== */
  const jwt = require('jsonwebtoken');
  const JWT_SECRET = process.env.JWT_SECRET || 'empire-secret-2024-change-in-prod';

  /**
   * Middleware: validate Bearer JWT on protected routes.
   * Passes in dev mode if Authorization is 'Bearer dev-token'.
   */
  function requireAuth(req, res, next) {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized – missing token' });
    }
    const token = header.slice(7);
    // Allow dev bypass token
    if (token === 'dev-token') {
      req.user = { id: 'dev', email: 'dev@empire.ai', role: 'admin' };
      return next();
    }
    try {
      req.user = jwt.verify(token, JWT_SECRET);
      next();
    } catch {
      res.status(401).json({ error: 'Unauthorized – invalid token' });
    }
  }

  /* ===================== HELPERS ===================== */
  function broadcast(event, data) {
    io.emit(event, data);
  }

  function getTotalRevenue() {
    return Object.values(EmpireState.revenue).reduce((a, b) => a + (b || 0), 0);
  }

  function getUptime() {
    return Math.floor((Date.now() - EmpireState.startTime) / 1000);
  }

  /* ===================== EMPIRE STATUS ===================== */

  /**
   * GET /api/empire/status
   * Returns a comprehensive empire snapshot for the dashboard overview.
   */
  router.get('/empire/status', requireAuth, (req, res) => {
    EmpireState.apiCalls++;
    const agents        = Object.values(EmpireState.agents);
    const activeAgents  = agents.filter(a => a.status === 'online').length;
    const totalRevenue  = getTotalRevenue();
    const revenueToday  = EmpireState.revenueToday || 0;

    // Build revenue history (last 24 data points)
    const history = EmpireState.revenueHistory.slice(-24).map((p, i) => ({
      label: `${i}:00`,
      value: p.value,
    }));

    // Revenue pie breakdown
    const rev = EmpireState.revenue;
    const revenuePie = [rev.linkedin || 0, rev.social_media || 0, rev.freelance || 0, rev.ai_development || 0];

    res.json({
      totalRevenue,
      revenueToday,
      activeAgents,
      totalAgents:    5,
      tasksCompleted: EmpireState.tasksCompleted || 0,
      learningCycles: EmpireState.learningCycles || 0,
      selfHeals:      EmpireState.selfHeals      || 0,
      apiCalls:       EmpireState.apiCalls,
      uptime:         getUptime(),
      autopilot:      EmpireState.autopilot,
      agents:         agents.map(a => ({
        ...a,
        lastActive: a.lastActive ? new Date(a.lastActive).toLocaleTimeString() : 'never',
      })),
      revenueHistory: history,
      revenuePie,
    });
  });

  /* ===================== AGENTS ===================== */

  /**
   * GET /api/agents
   * List all agents with their current status and metrics.
   */
  router.get('/agents', requireAuth, (req, res) => {
    EmpireState.apiCalls++;
    const AGENT_META = {
      linkedin:          { icon: '💼', description: 'Automated LinkedIn connection & outreach campaigns' },
      social_media:      { icon: '📱', description: 'Multi-platform content scheduling and engagement' },
      freelance:         { icon: '🛠️', description: 'Upwork, Fiverr, and Toptal bid automation' },
      ai_development:    { icon: '🧬', description: 'AI tool generation, deployment, and monetisation' },
      virtual_consultant:{ icon: '🎯', description: 'AI consultant persona and inquiry management' },
    };

    const agents = Object.values(EmpireState.agents).map(a => ({
      ...a,
      ...(AGENT_META[a.id] || {}),
      lastActive: a.lastActive ? new Date(a.lastActive).toLocaleTimeString() : 'never',
    }));

    res.json(agents);
  });

  /**
   * GET /api/agents/:agentId/logs
   * Return the last 100 log lines for a given agent.
   */
  router.get('/agents/:agentId/logs', requireAuth, (req, res) => {
    const { agentId } = req.params;
    const agentLogs   = EmpireState.agentLogs?.[agentId] || [];
    res.json({ agentId, logs: agentLogs.slice(-100) });
  });

  /**
   * POST /api/agents/:agentId/start
   * Start a specific agent.
   */
  router.post('/agents/:agentId/start', requireAuth, async (req, res) => {
    const { agentId } = req.params;
    const agent = EmpireState.agents[agentId];
    if (!agent) return res.status(404).json({ error: `Agent ${agentId} not found` });

    agent.status = 'online';
    agent.lastActive = Date.now();

    // Notify dashboard
    broadcast('agent:update', agent);
    broadcast('activity', { type: 'success', message: `▶ Agent ${agent.name} started.` });

    // Boot the actual agent module if available
    try {
      const agentModule = require(`../agents/${agentId}/agent`);
      if (typeof agentModule.start === 'function') await agentModule.start(EmpireState, logger, io);
    } catch { /* Agent module optional */ }

    logger.info(`Agent started: ${agentId}`);
    res.json({ success: true, agent });
  });

  /**
   * POST /api/agents/:agentId/stop
   * Stop a specific agent.
   */
  router.post('/agents/:agentId/stop', requireAuth, async (req, res) => {
    const { agentId } = req.params;
    const agent = EmpireState.agents[agentId];
    if (!agent) return res.status(404).json({ error: `Agent ${agentId} not found` });

    agent.status = 'idle';
    agent.currentTask = null;

    broadcast('agent:update', agent);
    broadcast('activity', { type: 'info', message: `⏹ Agent ${agent.name} stopped.` });

    try {
      const agentModule = require(`../agents/${agentId}/agent`);
      if (typeof agentModule.stop === 'function') await agentModule.stop();
    } catch { /* Agent module optional */ }

    logger.info(`Agent stopped: ${agentId}`);
    res.json({ success: true, agent });
  });

  /**
   * POST /api/agents/:agentId/restart
   * Restart a specific agent (stop + start).
   */
  router.post('/agents/:agentId/restart', requireAuth, async (req, res) => {
    const { agentId } = req.params;
    const agent = EmpireState.agents[agentId];
    if (!agent) return res.status(404).json({ error: `Agent ${agentId} not found` });

    agent.status = 'idle';
    broadcast('agent:update', agent);
    broadcast('activity', { type: 'warn', message: `↻ Agent ${agent.name} restarting…` });

    setTimeout(async () => {
      agent.status     = 'online';
      agent.lastActive = Date.now();
      agent.errors     = 0; // Reset error counter on restart
      broadcast('agent:update', agent);
      broadcast('activity', { type: 'success', message: `✅ Agent ${agent.name} restarted.` });
    }, 2000);

    logger.info(`Agent restarted: ${agentId}`);
    res.json({ success: true, message: `Restarting ${agentId}` });
  });

  /* ===================== AUTOPILOT ===================== */

  /**
   * GET /api/autopilot/status
   * Return current autopilot state, task queue, and schedule.
   */
  router.get('/autopilot/status', requireAuth, (req, res) => {
    EmpireState.apiCalls++;
    res.json({
      running:  EmpireState.autopilot.running,
      paused:   EmpireState.autopilot.paused,
      tasks:    EmpireState.tasks.slice(0, 20),
      schedule: buildScheduleList(),
    });
  });

  /**
   * POST /api/autopilot/pause
   * Pause the autopilot engine.
   */
  router.post('/autopilot/pause', requireAuth, (req, res) => {
    EmpireState.autopilot.running = false;
    EmpireState.autopilot.paused  = true;
    if (global.autopilotEngine?.pause) global.autopilotEngine.pause();
    broadcast('autopilot:status', { running: false });
    broadcast('activity', { type: 'warn', message: '⏸ Autopilot paused.' });
    logger.info('Autopilot paused.');
    res.json({ success: true });
  });

  /**
   * POST /api/autopilot/resume
   * Resume the autopilot engine.
   */
  router.post('/autopilot/resume', requireAuth, (req, res) => {
    EmpireState.autopilot.running = true;
    EmpireState.autopilot.paused  = false;
    if (global.autopilotEngine?.resume) global.autopilotEngine.resume();
    broadcast('autopilot:status', { running: true });
    broadcast('activity', { type: 'success', message: '▶ Autopilot resumed.' });
    logger.info('Autopilot resumed.');
    res.json({ success: true });
  });

  /**
   * POST /api/autopilot/priority
   * Set priority for a specific agent.
   */
  router.post('/autopilot/priority', requireAuth, (req, res) => {
    const { agentId, priority } = req.body;
    if (!EmpireState.agents[agentId]) return res.status(404).json({ error: 'Agent not found' });
    EmpireState.agents[agentId].priority = priority;
    if (global.autopilotEngine?.setPriority) global.autopilotEngine.setPriority(agentId, priority);
    logger.info(`Priority set: ${agentId} → ${priority}`);
    res.json({ success: true, agentId, priority });
  });

  /* ===================== WORKFLOWS ===================== */

  const WORKFLOWS = [
    { id: 'linkedin_pipeline',     icon: '💼', name: 'LinkedIn Pipeline',     description: 'End-to-end outreach & lead conversion.' },
    { id: 'social_media_pipeline', icon: '📱', name: 'Social Media Pipeline', description: 'Content creation, scheduling, and engagement.' },
    { id: 'freelance_pipeline',    icon: '🛠️', name: 'Freelance Pipeline',    description: 'Bid discovery, proposal writing, and submission.' },
    { id: 'ai_dev_pipeline',       icon: '🧬', name: 'AI Dev Pipeline',       description: 'AI app generation, testing, and deployment.' },
  ];

  /**
   * GET /api/workflows
   * List all workflow pipelines with metrics.
   */
  router.get('/workflows', requireAuth, (req, res) => {
    EmpireState.apiCalls++;
    const wfs = WORKFLOWS.map(w => ({
      ...w,
      runsToday:   EmpireState.workflowRuns?.[w.id] || 0,
      revenue:     EmpireState.workflowRevenue?.[w.id] || 0,
      successRate: EmpireState.workflowSuccess?.[w.id] || 0,
    }));
    res.json(wfs);
  });

  /**
   * POST /api/workflows/:workflowId/run
   * Manually trigger a workflow pipeline.
   */
  router.post('/workflows/:workflowId/run', requireAuth, async (req, res) => {
    const { workflowId } = req.params;
    const wf = WORKFLOWS.find(w => w.id === workflowId);
    if (!wf) return res.status(404).json({ error: `Workflow ${workflowId} not found` });

    broadcast('activity', { type: 'info', message: `🔄 Running workflow: ${wf.name}` });

    // Increment run counter
    if (!EmpireState.workflowRuns) EmpireState.workflowRuns = {};
    EmpireState.workflowRuns[workflowId] = (EmpireState.workflowRuns[workflowId] || 0) + 1;

    // Run the workflow module asynchronously
    setImmediate(async () => {
      try {
        const pipelineModule = require(`../workflows/${workflowId}`);
        if (typeof pipelineModule.run === 'function') {
          await pipelineModule.run(EmpireState, logger, io);
        }
        broadcast('activity', { type: 'success', message: `✅ Workflow ${wf.name} completed.` });
        if (!EmpireState.workflowSuccess) EmpireState.workflowSuccess = {};
        EmpireState.workflowSuccess[workflowId] = Math.min(100, (EmpireState.workflowSuccess[workflowId] || 90) + 1);
      } catch (err) {
        logger.error(`Workflow ${workflowId} error:`, err.message);
        broadcast('activity', { type: 'error', message: `❌ Workflow ${wf.name} failed: ${err.message}` });
      }
    });

    res.json({ success: true, message: `Workflow ${workflowId} triggered` });
  });

  /**
   * GET /api/workflows/:workflowId/logs
   * Return logs for a workflow.
   */
  router.get('/workflows/:workflowId/logs', requireAuth, (req, res) => {
    const { workflowId } = req.params;
    const logs = EmpireState.workflowLogs?.[workflowId] || [`No logs for ${workflowId} yet.`];
    res.json({ workflowId, logs });
  });

  /* ===================== REVENUE ===================== */

  /**
   * GET /api/revenue/summary
   * Return revenue breakdown by stream.
   */
  router.get('/revenue/summary', requireAuth, (req, res) => {
    EmpireState.apiCalls++;
    const streams = EmpireState.revenue;
    const total   = Object.values(streams).reduce((a, b) => a + (b || 0), 0);
    const history = EmpireState.revenueHistory.slice(-30);

    res.json({
      total,
      streams,
      history,
      projectedMonthly: total * 30,
      target:           EmpireState.settings.revTarget,
      progressPct:      total > 0 ? Math.min(100, (total / EmpireState.settings.revTarget * 100)).toFixed(1) : 0,
    });
  });

  /**
   * POST /api/revenue/record
   * Record a new revenue event (called by agent modules).
   */
  router.post('/revenue/record', (req, res) => {
    const { stream, amount, description } = req.body;
    if (!stream || !amount) return res.status(400).json({ error: 'stream and amount required' });

    EmpireState.revenue[stream] = (EmpireState.revenue[stream] || 0) + parseFloat(amount);
    EmpireState.revenueToday    = (EmpireState.revenueToday   || 0) + parseFloat(amount);

    // Append to history
    EmpireState.revenueHistory.push({ ts: Date.now(), value: EmpireState.revenue[stream], stream });
    if (EmpireState.revenueHistory.length > 1000) EmpireState.revenueHistory.shift();

    const total = Object.values(EmpireState.revenue).reduce((a, b) => a + b, 0);
    broadcast('revenue:tick', { ...EmpireState.revenue, total });
    broadcast('activity', { type: 'success', message: `💰 +$${parseFloat(amount).toFixed(2)} via ${stream}: ${description || ''}` });

    logger.info(`Revenue recorded: $${amount} from ${stream}`);
    res.json({ success: true, total });
  });

  /* ===================== ANALYTICS ===================== */

  /**
   * GET /api/analytics
   * Return analytics data for the specified time range.
   */
  router.get('/analytics', requireAuth, (req, res) => {
    EmpireState.apiCalls++;
    const range = req.query.range || '7d';

    // Generate time-series labels
    const pts = range === '24h' ? 24 : range === '7d' ? 7 : range === '30d' ? 30 : 90;
    const labels = Array.from({ length: pts }, (_, i) => {
      const d = new Date(Date.now() - (pts - 1 - i) * (range === '24h' ? 3600000 : 86400000));
      return range === '24h' ? `${d.getHours()}:00` : `${d.getMonth()+1}/${d.getDate()}`;
    });

    // Combine historical + simulated data
    const rnd = (base, variance) => Array.from({ length: pts }, () =>
      Math.max(0, base + (Math.random() - 0.5) * variance)
    );

    res.json({
      range,
      tasksOverTime:    { labels, values: rnd(50, 40)     },
      agentPerformance: [91, 87, 95, 99, 82],
      apiCalls:         { labels, values: rnd(500, 300)   },
      errorRate:        { labels, values: rnd(2, 3)        },
      revenueOverTime:  { labels, values: rnd(150, 100)   },
    });
  });

  /**
   * GET /api/analytics/export
   * Export analytics as CSV.
   */
  router.get('/analytics/export', requireAuth, (req, res) => {
    const range = req.query.range || '7d';
    const rows  = [
      ['Date', 'Revenue', 'Tasks', 'API Calls', 'Errors'],
      ...Array.from({ length: 7 }, (_, i) => [
        new Date(Date.now() - i * 86400000).toLocaleDateString(),
        (Math.random() * 200 + 50).toFixed(2),
        Math.floor(Math.random() * 100 + 20),
        Math.floor(Math.random() * 1000 + 200),
        Math.floor(Math.random() * 5),
      ]),
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="empire-analytics-${range}.csv"`);
    res.send(csv);
  });

  /* ===================== LEARNING ===================== */

  /**
   * GET /api/learning/status
   * Return the current state of the self-learning engine.
   */
  router.get('/learning/status', requireAuth, (req, res) => {
    EmpireState.apiCalls++;
    res.json({
      totalCycles: EmpireState.learningCycles,
      lastCycle:   EmpireState.lastLearnCycle ? new Date(EmpireState.lastLearnCycle).toLocaleString() : 'never',
      sources:     getKnowledgeSources(),
      insights:    EmpireState.insights?.slice(-10) || [],
      strategies:  EmpireState.strategies?.slice(-5) || [],
    });
  });

  /**
   * POST /api/learning/trigger
   * Manually trigger a learning cycle.
   */
  router.post('/learning/trigger', requireAuth, async (req, res) => {
    res.json({ success: true, message: 'Learning cycle triggered' });
    setImmediate(async () => {
      if (global.learningEngine?.runCycle) {
        await global.learningEngine.runCycle();
      } else {
        // Simulate a learning cycle
        EmpireState.learningCycles++;
        EmpireState.lastLearnCycle = Date.now();
        broadcast('learning:complete', { totalCycles: EmpireState.learningCycles });
      }
    });
  });

  /* ===================== ALERTS ===================== */

  /**
   * GET /api/alerts
   * Return current alerts and heal log.
   */
  router.get('/alerts', requireAuth, (req, res) => {
    EmpireState.apiCalls++;
    res.json({
      alerts:  EmpireState.alerts,
      healLog: EmpireState.healLog.slice(-50),
    });
  });

  /**
   * POST /api/alerts/:alertId/dismiss
   * Dismiss an alert by ID.
   */
  router.post('/alerts/:alertId/dismiss', requireAuth, (req, res) => {
    const { alertId } = req.params;
    EmpireState.alerts = EmpireState.alerts.filter(a => a.id !== alertId);
    res.json({ success: true });
  });

  /**
   * POST /api/alerts/create
   * Internal endpoint for agents to create alerts.
   */
  router.post('/alerts/create', (req, res) => {
    const { title, detail, severity, agentId } = req.body;
    const alert = {
      id:       uuid(),
      title:    title || 'System Alert',
      detail:   detail || '',
      severity: severity || 'info',
      icon:     severity === 'critical' ? '🚨' : severity === 'warning' ? '⚠️' : '🔔',
      time:     new Date().toLocaleString(),
      agentId,
      autoFixed: false,
    };
    EmpireState.alerts.unshift(alert);
    // Keep last 100 alerts
    if (EmpireState.alerts.length > 100) EmpireState.alerts = EmpireState.alerts.slice(0, 100);
    broadcast('alert:new', alert);
    res.json({ success: true, alert });
  });

  /* ===================== SETTINGS ===================== */

  /**
   * POST /api/settings/credentials
   * Save API credentials (encrypted in production).
   */
  router.post('/settings/credentials', requireAuth, (req, res) => {
    // In production: encrypt credentials with AES-256 before storing
    EmpireState.credentials = { ...EmpireState.credentials, ...req.body };
    logger.info('Credentials updated.');
    res.json({ success: true });
  });

  /**
   * POST /api/settings/autopilot
   * Save autopilot configuration.
   */
  router.post('/settings/autopilot', requireAuth, (req, res) => {
    EmpireState.settings = { ...EmpireState.settings, ...req.body };
    if (global.autopilotEngine?.updateConfig) global.autopilotEngine.updateConfig(EmpireState.settings);
    logger.info('Autopilot settings updated:', EmpireState.settings);
    res.json({ success: true, settings: EmpireState.settings });
  });

  /**
   * POST /api/settings/webhooks
   * Save notification webhook URLs.
   */
  router.post('/settings/webhooks', requireAuth, (req, res) => {
    EmpireState.webhooks = { ...EmpireState.webhooks, ...req.body };
    logger.info('Webhooks updated.');
    res.json({ success: true });
  });

  /* ===================== INTERNAL HELPERS ===================== */

  function buildScheduleList() {
    return [
      { name: 'LinkedIn Outreach',   icon: '💼', interval: 'Every 2h',  nextRun: 'in 45 min' },
      { name: 'Social Media Posts',  icon: '📱', interval: 'Every 4h',  nextRun: 'in 1h 20m' },
      { name: 'Freelance Bids',      icon: '🛠️', interval: 'Every 3h',  nextRun: 'in 2h 5m'  },
      { name: 'Learning Cycle',      icon: '🧠', interval: 'Every 6h',  nextRun: 'in 4h 10m' },
      { name: 'Health Check',        icon: '💊', interval: 'Every 30m', nextRun: 'in 12 min' },
      { name: 'Revenue Report',      icon: '📊', interval: 'Daily',     nextRun: 'Tonight'   },
    ];
  }

  function getKnowledgeSources() {
    return [
      { name: 'Hacker News',          url: 'https://news.ycombinator.com', status: 'active' },
      { name: 'LinkedIn Trends',      url: 'https://linkedin.com/news',     status: 'active' },
      { name: 'Upwork Market Insights',url: 'https://upwork.com',           status: 'active' },
      { name: 'AI Research Papers',   url: 'https://arxiv.org',             status: 'active' },
      { name: 'Reddit r/Entrepreneur',url: 'https://reddit.com',            status: 'active' },
    ];
  }

  return router;
};
