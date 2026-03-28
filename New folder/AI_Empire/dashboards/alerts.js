/**
 * AI Empire – Alerts & Notification Module (dashboards/alerts.js)
 * Purpose: Centralised alert management, escalation logic,
 * and multi-channel notification delivery (Slack, Discord, Email).
 * Integrates with the self-healing engine to auto-resolve issues.
 */

'use strict';

const { v4: uuid } = require('uuid');
const axios = require('axios');

class AlertsManager {
  /**
   * @param {object} empireState - Shared empire state
   * @param {object} logger      - Winston logger
   * @param {object} io          - Socket.IO instance
   */
  constructor(empireState, logger, io) {
    this.state   = empireState;
    this.logger  = logger;
    this.io      = io;
    this.rules   = this.buildDefaultRules();
    this.checkTimer = null;
  }

  /* ===================== LIFECYCLE ===================== */

  start() {
    // Run alert checks every 5 minutes
    this.checkTimer = setInterval(() => this.runAllChecks(), 5 * 60 * 1000);
    setTimeout(() => this.runAllChecks(), 10000); // First check after 10s
    this.log('info', 'Alerts Manager started.');
  }

  stop() {
    clearInterval(this.checkTimer);
    this.log('info', 'Alerts Manager stopped.');
  }

  /* ===================== ALERT RULES ===================== */

  buildDefaultRules() {
    return [
      {
        id:        'agent-offline',
        name:      'Agent Offline',
        severity:  'critical',
        check:     (state) => {
          const offline = Object.values(state.agents || {}).filter(a => a.status === 'error');
          return offline.length > 0 ? offline.map(a => `${a.name} is in error state`) : null;
        },
        autoFix:   async (state) => {
          // Attempt to restart error agents
          for (const agent of Object.values(state.agents || {}).filter(a => a.status === 'error')) {
            agent.status  = 'online';
            agent.errors  = 0;
            state.selfHeals = (state.selfHeals || 0) + 1;
          }
          return 'Auto-restarted error agents';
        },
      },
      {
        id:        'revenue-zero',
        name:      'No Revenue Activity',
        severity:  'warning',
        check:     (state) => {
          const total = Object.values(state.revenue || {}).reduce((a, b) => a + (b || 0), 0);
          return total === 0 && (state.tasksCompleted || 0) > 10 ? ['No revenue recorded despite task activity'] : null;
        },
        autoFix:   null, // Requires human intervention
      },
      {
        id:        'high-error-rate',
        name:      'High Error Rate',
        severity:  'warning',
        check:     (state) => {
          const agents     = Object.values(state.agents || {});
          const highErrors = agents.filter(a => (a.errors || 0) >= 3);
          return highErrors.length > 0 ? highErrors.map(a => `${a.name}: ${a.errors} errors`) : null;
        },
        autoFix:   async (state) => {
          for (const agent of Object.values(state.agents || {}).filter(a => (a.errors || 0) >= 3)) {
            agent.errors = 0;
          }
          return 'Reset error counters';
        },
      },
      {
        id:        'autopilot-paused',
        name:      'Autopilot Paused',
        severity:  'info',
        check:     (state) => {
          return state.autopilot?.paused ? ['Autopilot is currently paused'] : null;
        },
        autoFix:   null,
      },
      {
        id:        'revenue-below-target',
        name:      'Revenue Below Target',
        severity:  'warning',
        check:     (state) => {
          const total  = Object.values(state.revenue || {}).reduce((a, b) => a + (b || 0), 0);
          const target = state.settings?.revTarget || 10000;
          return total < target * 0.10 && (state.tasksCompleted || 0) > 50
            ? [`Revenue at ${((total / target) * 100).toFixed(1)}% of $${target} target`]
            : null;
        },
        autoFix:   async (state) => {
          // Boost LinkedIn priority
          if (global.autopilotEngine?.setPriority) {
            global.autopilotEngine.setPriority('linkedin', 10);
          }
          return 'Boosted LinkedIn priority to max';
        },
      },
      {
        id:        'learning-overdue',
        name:      'Learning Cycle Overdue',
        severity:  'info',
        check:     (state) => {
          const lastCycle = state.lastLearnCycle;
          if (!lastCycle) return ['No learning cycle has run yet'];
          const hoursSince = (Date.now() - lastCycle) / 3600000;
          return hoursSince > 12 ? [`Last learning cycle was ${hoursSince.toFixed(1)} hours ago`] : null;
        },
        autoFix:   async () => {
          if (global.learningEngine?.runCycle) await global.learningEngine.runCycle();
          return 'Triggered learning cycle';
        },
      },
    ];
  }

  /* ===================== ALERT CHECKS ===================== */

  /**
   * Run all alert rules and create/resolve alerts as needed.
   */
  async runAllChecks() {
    if (!this.state) return;

    for (const rule of this.rules) {
      try {
        const issues = rule.check(this.state);
        if (issues && issues.length > 0) {
          // Check if this alert already exists (avoid duplicates)
          const existing = this.state.alerts?.find(a => a.ruleId === rule.id && !a.dismissed);
          if (!existing) {
            await this.createAlert(rule, issues);
          }
        } else {
          // Auto-resolve if no longer triggered
          if (this.state.alerts) {
            this.state.alerts = this.state.alerts.map(a =>
              a.ruleId === rule.id && a.severity !== 'critical' ? { ...a, dismissed: true } : a
            );
          }
        }
      } catch (err) {
        this.log('warn', `Rule check failed: ${rule.name} – ${err.message}`);
      }
    }
  }

  /**
   * Create a new alert and optionally trigger auto-fix.
   */
  async createAlert(rule, issues) {
    const alert = {
      id:         uuid(),
      ruleId:     rule.id,
      title:      rule.name,
      detail:     issues.join(' | '),
      severity:   rule.severity,
      icon:       rule.severity === 'critical' ? '🚨' : rule.severity === 'warning' ? '⚠️' : '🔔',
      time:       new Date().toLocaleString(),
      autoFixed:  false,
      dismissed:  false,
    };

    // Attempt auto-fix
    if (rule.autoFix) {
      try {
        const fixResult = await rule.autoFix(this.state);
        alert.autoFixed = true;
        alert.detail   += ` | Auto-fixed: ${fixResult}`;
        this.state.selfHeals = (this.state.selfHeals || 0) + 1;
        this.log('info', `Auto-fixed alert: ${rule.name} – ${fixResult}`);
      } catch (err) {
        this.log('warn', `Auto-fix failed for ${rule.name}: ${err.message}`);
      }
    }

    // Add to state
    if (!this.state.alerts) this.state.alerts = [];
    this.state.alerts.unshift(alert);
    if (this.state.alerts.length > 100) this.state.alerts.pop();

    // Broadcast to dashboard
    this.broadcast('alert:new', alert);

    // Send external notifications for critical alerts
    if (alert.severity === 'critical' || (alert.severity === 'warning' && !alert.autoFixed)) {
      await this.sendNotifications(alert);
    }

    this.log('warn', `Alert created: [${alert.severity}] ${alert.title} – ${alert.detail}`);
    return alert;
  }

  /* ===================== MANUAL ALERT CREATION ===================== */

  /**
   * Create a custom alert (called by agents or external systems).
   */
  async createCustomAlert({ title, detail, severity = 'info', agentId = null }) {
    const alert = {
      id:        uuid(),
      ruleId:    'custom',
      title:     title || 'System Alert',
      detail:    detail || '',
      severity,
      icon:      severity === 'critical' ? '🚨' : severity === 'warning' ? '⚠️' : '🔔',
      time:      new Date().toLocaleString(),
      autoFixed: false,
      dismissed: false,
      agentId,
    };

    if (!this.state.alerts) this.state.alerts = [];
    this.state.alerts.unshift(alert);
    this.broadcast('alert:new', alert);

    if (severity === 'critical') await this.sendNotifications(alert);
    return alert;
  }

  /* ===================== NOTIFICATIONS ===================== */

  /**
   * Send alert notification via configured channels.
   */
  async sendNotifications(alert) {
    const webhooks = this.state.webhooks || {};

    await Promise.allSettled([
      this.notifySlack(webhooks.slack, alert),
      this.notifyDiscord(webhooks.discord, alert),
    ]);
  }

  async notifySlack(webhookUrl, alert) {
    if (!webhookUrl) return;
    try {
      await axios.post(webhookUrl, {
        text: `*AI Empire Alert*\n*[${alert.severity.toUpperCase()}]* ${alert.title}\n${alert.detail}\n_${alert.time}_`,
        attachments: [{
          color: alert.severity === 'critical' ? 'danger' : alert.severity === 'warning' ? 'warning' : 'good',
        }],
      }, { timeout: 5000 });
      this.log('info', `Slack notification sent for: ${alert.title}`);
    } catch (err) {
      this.log('warn', `Slack notification failed: ${err.message}`);
    }
  }

  async notifyDiscord(webhookUrl, alert) {
    if (!webhookUrl) return;
    try {
      const colors = { critical: 0xFF5252, warning: 0xFFC107, info: 0x448AFF };
      await axios.post(webhookUrl, {
        embeds: [{
          title:       `AI Empire Alert: ${alert.title}`,
          description: alert.detail,
          color:       colors[alert.severity] || colors.info,
          footer:      { text: alert.time },
        }],
      }, { timeout: 5000 });
      this.log('info', `Discord notification sent for: ${alert.title}`);
    } catch (err) {
      this.log('warn', `Discord notification failed: ${err.message}`);
    }
  }

  /* ===================== DISMISS & MANAGE ===================== */

  dismissAlert(alertId) {
    if (this.state.alerts) {
      const alert = this.state.alerts.find(a => a.id === alertId);
      if (alert) alert.dismissed = true;
    }
  }

  getActiveAlerts() {
    return (this.state.alerts || []).filter(a => !a.dismissed);
  }

  getAlertHistory(limit = 50) {
    return (this.state.alerts || []).slice(0, limit);
  }

  /* ===================== HELPERS ===================== */

  log(level, msg) {
    if (this.logger?.log) this.logger.log(level, `[AlertsManager] ${msg}`);
    else console.log(`[${level.toUpperCase()}] [AlertsManager] ${msg}`);
  }

  broadcast(event, data) {
    if (this.io?.emit) this.io.emit(event, data);
    else if (global.empireBroadcast) global.empireBroadcast(event, data);
  }
}

module.exports = { AlertsManager };
