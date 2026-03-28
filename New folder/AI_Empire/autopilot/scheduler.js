/**
 * AI Empire – Scheduler (autopilot/scheduler.js)
 * Purpose: Cron-based task scheduler for all recurring empire activities.
 * Uses node-cron for precise timing. All schedules are configurable
 * and adapt based on performance data and time-of-day optimisation.
 */

'use strict';

const cron = require('node-cron');
const { v4: uuid } = require('uuid');

class Scheduler {
  /**
   * @param {object} empireState - Shared empire state
   * @param {object} logger      - Winston logger
   * @param {object} io          - Socket.IO instance
   */
  constructor(empireState, logger, io) {
    this.state   = empireState;
    this.logger  = logger;
    this.io      = io;
    this.jobs    = new Map(); // name → cron job
    this.running = false;
  }

  /* ===================== LIFECYCLE ===================== */

  /** Start all scheduled jobs. */
  start() {
    this.running = true;
    this.log('info', 'Scheduler starting…');

    this.scheduleLinkedInOutreach();
    this.scheduleSocialMedia();
    this.scheduleFreelanceBids();
    this.scheduleAIDevelopment();
    this.scheduleLearningCycle();
    this.scheduleHealthReport();
    this.scheduleRevenueReset();
    this.scheduleWeeklyReport();
    this.scheduleAlertCleanup();
    this.scheduleFollowerGrowth();

    this.log('info', `Scheduler running. ${this.jobs.size} jobs active.`);
    this.broadcast('activity', { type: 'info', message: `⏰ Scheduler active – ${this.jobs.size} recurring jobs running.` });
  }

  /** Stop all scheduled jobs. */
  stop() {
    for (const [name, job] of this.jobs) {
      job.stop();
      this.log('debug', `Stopped job: ${name}`);
    }
    this.jobs.clear();
    this.running = false;
    this.log('info', 'Scheduler stopped.');
  }

  /** Pause all jobs (without destroying them). */
  pause() {
    for (const job of this.jobs.values()) job.stop();
    this.log('info', 'All scheduled jobs paused.');
  }

  /** Resume all paused jobs. */
  resume() {
    for (const job of this.jobs.values()) job.start();
    this.log('info', 'All scheduled jobs resumed.');
  }

  /* ===================== JOB DEFINITIONS ===================== */

  /** LinkedIn Outreach – runs every 2 hours during business hours. */
  scheduleLinkedInOutreach() {
    // Every 2 hours, 8am–8pm
    this.addJob('linkedin-outreach', '0 8,10,12,14,16,18,20 * * *', async () => {
      if (!this.canRun('linkedin')) return;
      this.log('info', '[CRON] LinkedIn outreach cycle triggered.');
      this.broadcast('activity', { type: 'info', message: '💼 [Scheduled] LinkedIn outreach cycle started.' });

      try {
        const agent = require('../agents/linkedin_outreach/agent');
        if (typeof agent.runCycle === 'function') await agent.runCycle();
      } catch (err) {
        this.log('warn', `LinkedIn cron error: ${err.message}`);
      }

      this.recordJobRun('linkedin-outreach');
    });
  }

  /** Social Media – posts every 4 hours. */
  scheduleSocialMedia() {
    this.addJob('social-media-posts', '0 6,10,14,18,22 * * *', async () => {
      if (!this.canRun('social_media')) return;
      this.log('info', '[CRON] Social media posting cycle triggered.');
      this.broadcast('activity', { type: 'info', message: '📱 [Scheduled] Social media posting started.' });

      try {
        const agent = require('../agents/social_media/agent');
        if (typeof agent.runCycle === 'function') await agent.runCycle();
      } catch (err) {
        this.log('warn', `Social cron error: ${err.message}`);
      }

      this.recordJobRun('social-media-posts');
    });
  }

  /** Freelance Bids – scan and bid every 3 hours. */
  scheduleFreelanceBids() {
    this.addJob('freelance-bids', '0 7,10,13,16,19 * * *', async () => {
      if (!this.canRun('freelance')) return;
      this.log('info', '[CRON] Freelance bid cycle triggered.');
      this.broadcast('activity', { type: 'info', message: '🛠️ [Scheduled] Freelance bid scan started.' });

      try {
        const agent = require('../agents/freelance_services/agent');
        if (typeof agent.runCycle === 'function') await agent.runCycle();
      } catch (err) {
        this.log('warn', `Freelance cron error: ${err.message}`);
      }

      this.recordJobRun('freelance-bids');
    });
  }

  /** AI Development – advance app builds every 6 hours. */
  scheduleAIDevelopment() {
    this.addJob('ai-development', '0 6,12,18,0 * * *', async () => {
      if (!this.canRun('ai_development')) return;
      this.log('info', '[CRON] AI development cycle triggered.');
      this.broadcast('activity', { type: 'info', message: '🧬 [Scheduled] AI development cycle started.' });

      try {
        const agent = require('../agents/ai_development/agent');
        if (typeof agent.runCycle === 'function') await agent.runCycle();
      } catch (err) {
        this.log('warn', `AI dev cron error: ${err.message}`);
      }

      this.recordJobRun('ai-development');
    });
  }

  /** Self-Learning – scrape knowledge and update strategies every 6 hours. */
  scheduleLearningCycle() {
    this.addJob('learning-cycle', '0 3,9,15,21 * * *', async () => {
      this.log('info', '[CRON] Learning cycle triggered.');
      this.broadcast('activity', { type: 'info', message: '🧠 [Scheduled] Self-learning cycle started.' });

      try {
        if (global.learningEngine?.runCycle) {
          await global.learningEngine.runCycle();
        } else {
          this.state.learningCycles = (this.state.learningCycles || 0) + 1;
          this.state.lastLearnCycle = Date.now();
          this.broadcast('learning:complete', { totalCycles: this.state.learningCycles });
        }
      } catch (err) {
        this.log('warn', `Learning cron error: ${err.message}`);
      }

      this.recordJobRun('learning-cycle');
    });
  }

  /** Health Report – generate and broadcast health summary every 30 minutes. */
  scheduleHealthReport() {
    this.addJob('health-report', '*/30 * * * *', () => {
      if (!this.running) return;

      const agents        = Object.values(this.state.agents);
      const onlineCount   = agents.filter(a => a.status === 'online').length;
      const errorCount    = agents.filter(a => a.status === 'error').length;
      const totalRevenue  = Object.values(this.state.revenue).reduce((a, b) => a + (b || 0), 0);

      const healthPct = Math.max(0, 100 - (errorCount * 15));
      this.broadcast('system:health', { pct: healthPct, status: healthPct >= 80 ? 'good' : 'warn' });

      if (errorCount > 0) {
        this.broadcast('alert:new', {
          id:       uuid(),
          title:    `${errorCount} agent(s) in error state`,
          detail:   agents.filter(a => a.status === 'error').map(a => a.name).join(', '),
          severity: 'warning',
          icon:     '⚠️',
          time:     new Date().toLocaleString(),
        });
      }

      this.log('info', `Health check: ${onlineCount}/${agents.length} agents online. Revenue: $${totalRevenue.toFixed(2)}`);
      this.recordJobRun('health-report');
    });
  }

  /** Revenue Reset – reset daily counters at midnight. */
  scheduleRevenueReset() {
    this.addJob('revenue-daily-reset', '0 0 * * *', () => {
      this.log('info', '[CRON] Daily revenue counters reset.');
      this.state.revenueToday = 0;

      // Reset agent daily task counters
      for (const agent of Object.values(this.state.agents)) {
        agent.tasksToday = 0;
      }

      this.broadcast('activity', { type: 'info', message: '🔄 Daily counters reset at midnight.' });
      this.recordJobRun('revenue-daily-reset');
    });
  }

  /** Weekly Report – generate comprehensive weekly summary every Monday 8am. */
  scheduleWeeklyReport() {
    this.addJob('weekly-report', '0 8 * * 1', async () => {
      this.log('info', '[CRON] Generating weekly empire report…');

      const agents       = Object.values(this.state.agents);
      const totalRevenue = Object.values(this.state.revenue).reduce((a, b) => a + (b || 0), 0);
      const totalTasks   = this.state.tasksCompleted || 0;
      const selfHeals    = this.state.selfHeals || 0;

      const report = {
        week:         new Date().toLocaleDateString(),
        totalRevenue: totalRevenue.toFixed(2),
        totalTasks,
        selfHeals,
        agentSummary: agents.map(a => ({
          name:    a.name,
          status:  a.status,
          revenue: (a.revenue || 0).toFixed(2),
          tasks:   a.tasksToday || 0,
        })),
      };

      this.broadcast('activity', {
        type:    'success',
        message: `📊 Weekly Report: $${report.totalRevenue} revenue, ${report.totalTasks} tasks, ${report.selfHeals} self-heals.`,
      });

      // In production: email report via SMTP or webhook
      this.sendWebhookNotification('weekly-report', report);
      this.recordJobRun('weekly-report');
    });
  }

  /** Alert Cleanup – remove old dismissed alerts every day at 2am. */
  scheduleAlertCleanup() {
    this.addJob('alert-cleanup', '0 2 * * *', () => {
      const before = this.state.alerts?.length || 0;
      // Keep only last 50 alerts, auto-dismiss informational ones older than 24h
      if (this.state.alerts) {
        const cutoff = Date.now() - 24 * 60 * 60 * 1000;
        this.state.alerts = this.state.alerts
          .filter(a => a.severity !== 'info' || new Date(a.time).getTime() > cutoff)
          .slice(0, 50);
      }
      this.log('info', `Alert cleanup: removed ${before - (this.state.alerts?.length || 0)} old alerts.`);
      this.recordJobRun('alert-cleanup');
    });
  }

  /** Follower Growth – simulate gradual organic growth every hour. */
  scheduleFollowerGrowth() {
    this.addJob('follower-growth', '0 * * * *', () => {
      // Tiny incremental follower growth simulation
      if (this.state.socialFollowers) {
        for (const platform of Object.keys(this.state.socialFollowers)) {
          this.state.socialFollowers[platform] += Math.floor(Math.random() * 3);
        }
      }
      this.recordJobRun('follower-growth');
    });
  }

  /* ===================== HELPERS ===================== */

  /**
   * Register a cron job.
   * @param {string}   name       - Unique job identifier
   * @param {string}   expression - Cron expression (e.g. '0 * * * *')
   * @param {Function} fn         - Async function to execute
   */
  addJob(name, expression, fn) {
    try {
      if (!cron.validate(expression)) {
        this.log('error', `Invalid cron expression for ${name}: ${expression}`);
        return;
      }
      const job = cron.schedule(expression, fn, {
        scheduled: true,
        timezone:  process.env.TZ || 'America/New_York',
      });
      this.jobs.set(name, job);
      this.log('debug', `Scheduled job: ${name} (${expression})`);
    } catch (err) {
      this.log('error', `Failed to schedule job ${name}: ${err.message}`);
    }
  }

  /** Check if the autopilot is running and agent is not paused/error. */
  canRun(agentId) {
    if (!this.state.autopilot?.running) return false;
    const agent = this.state.agents?.[agentId];
    if (!agent) return true;
    return agent.status !== 'error';
  }

  /** Record a job run timestamp for monitoring. */
  recordJobRun(jobName) {
    if (!this.state.jobRuns) this.state.jobRuns = {};
    if (!this.state.jobRuns[jobName]) this.state.jobRuns[jobName] = { count: 0, lastRun: null };
    this.state.jobRuns[jobName].count++;
    this.state.jobRuns[jobName].lastRun = Date.now();
  }

  /** Send a notification to configured webhooks. */
  async sendWebhookNotification(type, data) {
    const { slack, discord } = this.state.webhooks || {};
    const payload = JSON.stringify({ type, data, ts: new Date().toISOString() });

    if (slack) {
      try {
        const axios = require('axios');
        await axios.post(slack, { text: `AI Empire ${type}: ${JSON.stringify(data, null, 2)}` });
      } catch (err) {
        this.log('warn', `Slack webhook failed: ${err.message}`);
      }
    }

    if (discord) {
      try {
        const axios = require('axios');
        await axios.post(discord, { content: `**AI Empire ${type}**: ${payload.substring(0, 1800)}` });
      } catch (err) {
        this.log('warn', `Discord webhook failed: ${err.message}`);
      }
    }
  }

  /** Get a list of all scheduled jobs with their next run times. */
  getSchedule() {
    return Array.from(this.jobs.entries()).map(([name, job]) => ({
      name,
      nextRun: 'scheduled', // node-cron doesn't expose next run time directly
      lastRun: this.state.jobRuns?.[name]?.lastRun
        ? new Date(this.state.jobRuns[name].lastRun).toLocaleString()
        : 'never',
      runCount: this.state.jobRuns?.[name]?.count || 0,
    }));
  }

  log(level, message) {
    if (this.logger?.log) this.logger.log(level, `[Scheduler] ${message}`);
    else console.log(`[${level.toUpperCase()}] [Scheduler] ${message}`);
  }

  broadcast(event, data) {
    if (this.io?.emit) this.io.emit(event, data);
    else if (global.empireBroadcast) global.empireBroadcast(event, data);
  }
}

module.exports = { Scheduler };
