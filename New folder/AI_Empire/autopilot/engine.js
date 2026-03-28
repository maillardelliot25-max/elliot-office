/**
 * AI Empire – Autopilot Engine (autopilot/engine.js)
 * Purpose: Central orchestration brain for all agents and workflows.
 * Responsibilities:
 *   - Task queue management with priority scheduling
 *   - Adaptive agent assignment based on performance and revenue
 *   - System health monitoring with self-healing triggers
 *   - Revenue target tracking and agent rebalancing
 *   - Continuous performance optimisation loop
 *
 * This is the "God Mode" core that keeps everything running autonomously.
 */

'use strict';

const { v4: uuid } = require('uuid');

class AutopilotEngine {
  /**
   * @param {object} empireState - Shared empire state object
   * @param {object} logger      - Winston logger
   * @param {object} io          - Socket.IO instance
   */
  constructor(empireState, logger, io) {
    this.state       = empireState;
    this.logger      = logger;
    this.io          = io;

    this.running     = false;
    this.paused      = false;
    this.taskQueue   = [];
    this.priorities  = {
      linkedin:          5,
      social_media:      5,
      freelance:         5,
      ai_development:    5,
      virtual_consultant:5,
    };
    this.healthCheckTimer  = null;
    this.optimiserTimer    = null;
    this.rebalanceTimer    = null;
    this.cycleCount        = 0;

    // Performance tracking
    this.performanceWindow = []; // Rolling 24h performance records
    this.revenueTrend      = [];
  }

  /* ===================== LIFECYCLE ===================== */

  /** Start the autopilot engine. */
  start() {
    if (this.running) { this.log('info', 'Already running.'); return; }

    this.running = true;
    this.state.autopilot.running = true;
    this.log('info', '🚀 Autopilot Engine starting…');

    // Boot agents
    this.bootAllAgents();

    // Schedule recurring tasks
    this.scheduleHealthChecks();
    this.scheduleOptimiser();
    this.scheduleRebalancer();

    // Initial task queue population
    this.populateTaskQueue();

    this.log('info', '✅ Autopilot Engine fully operational.');
    this.broadcast('activity', { type: 'success', message: '✈️ Autopilot Engine online – all systems nominal.' });
  }

  /** Pause the autopilot (agents continue, queue processing stops). */
  pause() {
    this.paused = true;
    this.state.autopilot.paused  = true;
    this.state.autopilot.running = false;
    this.log('info', 'Autopilot paused.');
  }

  /** Resume the autopilot. */
  resume() {
    this.paused = false;
    this.state.autopilot.paused  = false;
    this.state.autopilot.running = true;
    this.processQueue();
    this.log('info', 'Autopilot resumed.');
  }

  /** Gracefully shut down. */
  stop() {
    this.running = false;
    this.paused  = false;
    clearInterval(this.healthCheckTimer);
    clearInterval(this.optimiserTimer);
    clearInterval(this.rebalanceTimer);
    this.log('info', 'Autopilot Engine stopped.');
  }

  /** Update configuration at runtime. */
  updateConfig(config) {
    if (config.taskInterval) this.taskIntervalMs = config.taskInterval * 60 * 1000;
    if (config.maxAgents)    this.maxConcurrent  = config.maxAgents;
    this.log('info', 'Configuration updated:', config);
  }

  /** Set priority for a specific agent (1-10). */
  setPriority(agentId, priority) {
    this.priorities[agentId] = Math.max(1, Math.min(10, priority));
    this.log('info', `Priority set: ${agentId} → ${priority}`);
    this.reorderQueue();
  }

  /* ===================== AGENT BOOT ===================== */

  /** Boot all agent modules. */
  bootAllAgents() {
    const agentModules = {
      linkedin:          '../agents/linkedin_outreach/agent',
      social_media:      '../agents/social_media/agent',
      freelance:         '../agents/freelance_services/agent',
      ai_development:    '../agents/ai_development/agent',
    };

    for (const [agentId, modulePath] of Object.entries(agentModules)) {
      try {
        const agent = require(modulePath);
        if (typeof agent.start === 'function') {
          agent.start(this.state, this.logger, this.io);
          this.log('info', `Agent booted: ${agentId}`);
        }
      } catch (err) {
        this.log('warn', `Could not boot agent ${agentId}: ${err.message}`);
      }
    }
  }

  /* ===================== TASK QUEUE ===================== */

  /** Populate the task queue with initial tasks for all agents. */
  populateTaskQueue() {
    const initialTasks = [
      { id: uuid(), name: 'LinkedIn Morning Outreach',   agent: 'linkedin',          priority: 8, type: 'outreach',    eta: '5 min',   status: 'queued' },
      { id: uuid(), name: 'Social Media Post Batch',     agent: 'social_media',      priority: 7, type: 'content',     eta: '10 min',  status: 'queued' },
      { id: uuid(), name: 'Upwork Bid Scan',             agent: 'freelance',         priority: 8, type: 'bids',        eta: '8 min',   status: 'queued' },
      { id: uuid(), name: 'AI App Dev Cycle',            agent: 'ai_development',    priority: 6, type: 'development', eta: '20 min',  status: 'queued' },
      { id: uuid(), name: 'Consultant Inbox Check',      agent: 'virtual_consultant',priority: 7, type: 'consulting',  eta: '3 min',   status: 'queued' },
      { id: uuid(), name: 'Learning Cycle',              agent: 'engine',            priority: 4, type: 'learning',    eta: '15 min',  status: 'scheduled' },
      { id: uuid(), name: 'Revenue Report Generation',   agent: 'analytics',         priority: 3, type: 'reporting',   eta: '1 hr',    status: 'scheduled' },
      { id: uuid(), name: 'System Health Check',         agent: 'engine',            priority: 9, type: 'health',      eta: '1 min',   status: 'queued' },
    ];

    this.taskQueue = initialTasks;
    this.state.tasks = this.taskQueue;
    this.log('info', `Task queue populated with ${this.taskQueue.length} tasks.`);
  }

  /**
   * Add a new task to the queue.
   * @param {object} task - { name, agent, priority, type }
   */
  enqueue(task) {
    const fullTask = {
      id:        uuid(),
      status:    'queued',
      createdAt: Date.now(),
      eta:       'soon',
      ...task,
    };
    this.taskQueue.push(fullTask);
    this.reorderQueue();
    this.state.tasks = this.taskQueue;
    this.log('debug', `Task enqueued: ${task.name}`);
    return fullTask.id;
  }

  /** Remove a task by ID (on completion or cancellation). */
  dequeue(taskId) {
    this.taskQueue = this.taskQueue.filter(t => t.id !== taskId);
    this.state.tasks = this.taskQueue;
  }

  /** Sort queue by priority (highest first), then by creation time. */
  reorderQueue() {
    this.taskQueue.sort((a, b) => {
      const pa = (this.priorities[a.agent] || 5) * (a.priority || 5);
      const pb = (this.priorities[b.agent] || 5) * (b.priority || 5);
      return pb - pa;
    });
  }

  /** Process the next batch of queued tasks. */
  async processQueue() {
    if (this.paused || !this.running) return;

    const queued = this.taskQueue.filter(t => t.status === 'queued').slice(0, 3);
    for (const task of queued) {
      task.status = 'running';
      this.log('debug', `Running task: ${task.name} (agent: ${task.agent})`);

      // Simulate task execution (real agents handle their own cycles)
      setTimeout(() => {
        task.status = 'completed';
        task.completedAt = Date.now();
        this.state.tasksCompleted = (this.state.tasksCompleted || 0) + 1;
        this.dequeue(task.id);

        // Re-enqueue recurring tasks
        if (['outreach', 'content', 'bids', 'development'].includes(task.type)) {
          setTimeout(() => {
            this.enqueue({ ...task, id: undefined, status: 'queued', completedAt: undefined });
          }, 2 * 60 * 60 * 1000); // Re-queue after 2 hours
        }
      }, Math.random() * 30000 + 10000); // Tasks take 10-40 seconds
    }
  }

  /* ===================== HEALTH CHECKS ===================== */

  /** Schedule recurring health checks every 30 minutes. */
  scheduleHealthChecks() {
    this.healthCheckTimer = setInterval(() => {
      this.performHealthCheck();
    }, 30 * 60 * 1000);

    // Run immediately
    setTimeout(() => this.performHealthCheck(), 5000);
  }

  /**
   * Check the health of all agents and the system.
   * Triggers self-healing if issues are detected.
   */
  async performHealthCheck() {
    this.log('info', 'Running system health check…');
    this.cycleCount++;

    const agents    = Object.values(this.state.agents);
    const issues    = [];
    let   healthPct = 100;

    for (const agent of agents) {
      // Check if agent is stuck (no activity for > 4 hours)
      const stuckThreshold = 4 * 60 * 60 * 1000;
      const timeSinceActive = agent.lastActive ? Date.now() - agent.lastActive : Infinity;

      if (agent.status === 'online' && timeSinceActive > stuckThreshold) {
        issues.push({ type: 'stuck_agent', agentId: agent.id, agentName: agent.name });
        healthPct -= 15;
      }

      // Check error count
      if ((agent.errors || 0) >= 3) {
        issues.push({ type: 'error_threshold', agentId: agent.id, agentName: agent.name });
        healthPct -= 10;
      }
    }

    // Check revenue trend (if declining for 3+ consecutive checks)
    const totalRevenue = Object.values(this.state.revenue).reduce((a, b) => a + (b || 0), 0);
    this.revenueTrend.push({ ts: Date.now(), total: totalRevenue });
    if (this.revenueTrend.length > 10) this.revenueTrend.shift();

    if (this.revenueTrend.length >= 3) {
      const last3  = this.revenueTrend.slice(-3).map(r => r.total);
      const declining = last3[2] < last3[1] && last3[1] < last3[0];
      if (declining) {
        issues.push({ type: 'revenue_declining', detail: 'Revenue trend is downward for 3+ periods' });
        healthPct -= 5;
      }
    }

    // Update health display
    healthPct = Math.max(0, healthPct);
    this.updateHealthDisplay(healthPct);

    // Self-heal detected issues
    if (issues.length > 0) {
      this.log('warn', `Health check found ${issues.length} issues. Triggering self-heal.`);
      await this.selfHeal(issues);
    } else {
      this.log('info', `Health check passed. System health: ${healthPct}%`);
    }
  }

  /** Update the health badge in the frontend via socket. */
  updateHealthDisplay(pct) {
    const status = pct >= 80 ? 'good' : pct >= 50 ? 'warn' : 'bad';
    this.broadcast('system:health', { pct, status });
    // Update DOM element indirectly via empire state
    this.state.healthPct = pct;
  }

  /* ===================== SELF-HEALING ===================== */

  /**
   * Automatically resolve detected issues.
   * @param {Array} issues - Array of detected issue objects
   */
  async selfHeal(issues) {
    for (const issue of issues) {
      this.log('info', `Healing issue: ${issue.type}`, issue);
      this.state.selfHeals = (this.state.selfHeals || 0) + 1;

      switch (issue.type) {
        case 'stuck_agent':
          await this.restartAgent(issue.agentId);
          break;

        case 'error_threshold':
          await this.resetAgentErrors(issue.agentId);
          break;

        case 'revenue_declining':
          await this.boostrevenueActivities();
          break;

        default:
          this.log('warn', `Unknown issue type: ${issue.type}`);
      }

      // Log the heal event
      const healEvent = {
        ts:     new Date().toLocaleTimeString(),
        agent:  issue.agentId || 'engine',
        action: issue.type,
        result: 'Auto-resolved',
      };
      this.state.healLog = this.state.healLog || [];
      this.state.healLog.push(healEvent);
      if (this.state.healLog.length > 100) this.state.healLog.shift();

      this.broadcast('heal:event', healEvent);
    }
  }

  async restartAgent(agentId) {
    const agent = this.state.agents[agentId];
    if (!agent) return;

    this.log('info', `Restarting agent: ${agentId}`);
    agent.status = 'idle';
    this.broadcast('agent:update', agent);

    setTimeout(async () => {
      try {
        const agentModule = require(`../agents/${agentId}/agent`);
        if (typeof agentModule.start === 'function') {
          await agentModule.start(this.state, this.logger, this.io);
        }
      } catch { /* Module optional */ }
      agent.status     = 'online';
      agent.errors     = 0;
      agent.lastActive = Date.now();
      this.broadcast('agent:update', agent);
      this.broadcast('activity', { type: 'success', message: `💊 Agent ${agent.name} self-healed and restarted.` });
    }, 5000);
  }

  async resetAgentErrors(agentId) {
    const agent = this.state.agents[agentId];
    if (agent) {
      agent.errors = 0;
      this.log('info', `Error counter reset for agent: ${agentId}`);
    }
  }

  async boostrevenueActivities() {
    this.log('info', 'Boosting revenue activities – increasing outreach priority.');
    this.priorities.linkedin  = Math.min(10, (this.priorities.linkedin  || 5) + 2);
    this.priorities.freelance = Math.min(10, (this.priorities.freelance || 5) + 2);
    this.reorderQueue();
    this.broadcast('activity', { type: 'warn', message: '📈 Revenue declining – boosting outreach priority.' });
  }

  /* ===================== PERFORMANCE OPTIMISER ===================== */

  /** Schedule the performance optimiser to run every 6 hours. */
  scheduleOptimiser() {
    this.optimiserTimer = setInterval(() => {
      this.optimisePerformance();
    }, 6 * 60 * 60 * 1000);

    setTimeout(() => this.optimisePerformance(), 10000);
  }

  /**
   * Analyse agent performance and rebalance priorities for maximum revenue.
   */
  async optimisePerformance() {
    this.log('info', 'Running performance optimisation cycle…');

    const agents   = Object.values(this.state.agents);
    const revenues = {};

    // Calculate revenue per agent
    for (const agent of agents) {
      revenues[agent.id] = agent.revenue || 0;
    }

    // Sort agents by revenue contribution
    const sortedByRevenue = Object.entries(revenues).sort(([,a],[,b]) => b - a);

    // Allocate priority proportional to revenue (top earner gets highest priority)
    sortedByRevenue.forEach(([agentId], idx) => {
      const newPriority = 10 - (idx * 1.5);
      this.priorities[agentId] = Math.max(3, Math.round(newPriority));
    });

    this.reorderQueue();

    // Record performance snapshot
    this.performanceWindow.push({
      ts:       Date.now(),
      revenues: { ...revenues },
      priorities: { ...this.priorities },
    });
    if (this.performanceWindow.length > 24) this.performanceWindow.shift();

    // Check if we're on track for revenue target
    const totalRevenue = sortedByRevenue.reduce((a, [,v]) => a + v, 0);
    const target       = this.state.settings?.revTarget || 10000;
    const progressPct  = (totalRevenue / target * 100).toFixed(1);

    this.log('info', `Revenue progress: $${totalRevenue.toFixed(2)} / $${target} (${progressPct}%)`);
    this.broadcast('activity', { type: 'info', message: `📊 Performance optimised. Revenue: $${totalRevenue.toFixed(2)} (${progressPct}% of target)` });
  }

  /* ===================== REVENUE REBALANCER ===================== */

  /** Schedule revenue rebalancing every 2 hours. */
  scheduleRebalancer() {
    this.rebalanceTimer = setInterval(() => {
      this.rebalanceRevenue();
    }, 2 * 60 * 60 * 1000);
  }

  /**
   * Dynamically rebalance agent resources based on revenue performance.
   * If one stream is underperforming, shift resources to stronger streams.
   */
  rebalanceRevenue() {
    const streams = this.state.revenue;
    const total   = Object.values(streams).reduce((a, b) => a + (b || 0), 0);

    if (total === 0) return;

    // Identify underperforming streams (< 10% of total)
    const underperforming = Object.entries(streams)
      .filter(([, v]) => v / total < 0.10)
      .map(([k]) => k);

    if (underperforming.length > 0) {
      this.log('info', `Rebalancing: underperforming streams: ${underperforming.join(', ')}`);

      // Lower priority of underperforming agents temporarily
      for (const stream of underperforming) {
        if (this.priorities[stream]) this.priorities[stream] = Math.max(2, this.priorities[stream] - 1);
      }

      this.reorderQueue();
    }
  }

  /* ===================== HELPERS ===================== */

  log(level, message, meta = {}) {
    if (this.logger?.log) this.logger.log(level, `[AutopilotEngine] ${message}`, meta);
    else console.log(`[${level.toUpperCase()}] [AutopilotEngine] ${message}`);
  }

  broadcast(event, data) {
    if (this.io?.emit) this.io.emit(event, data);
    else if (global.empireBroadcast) global.empireBroadcast(event, data);
  }

  /** Get a summary of the engine's current state. */
  getSummary() {
    return {
      running:    this.running,
      paused:     this.paused,
      cycleCount: this.cycleCount,
      queueSize:  this.taskQueue.length,
      priorities: this.priorities,
      healthPct:  this.state.healthPct || 100,
    };
  }
}

module.exports = { AutopilotEngine };
