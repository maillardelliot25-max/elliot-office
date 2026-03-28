/**
 * AI Empire – Reports Module (dashboards/reports.js)
 * Purpose: Generate, format, and distribute empire performance reports.
 * Supports: Daily digest, weekly summary, monthly P&L, agent-specific reports.
 * Output formats: JSON, CSV, plain text (for Slack/email).
 */

'use strict';

const { v4: uuid } = require('uuid');

class ReportsEngine {
  /**
   * @param {object} empireState - Shared empire state
   * @param {object} logger      - Winston logger
   * @param {object} io          - Socket.IO instance
   */
  constructor(empireState, logger, io) {
    this.state  = empireState;
    this.logger = logger;
    this.io     = io;
    this.reports = []; // Stored report history
  }

  /* ===================== REPORT GENERATORS ===================== */

  /**
   * Generate the daily digest report.
   * @returns {object} Report object
   */
  generateDailyDigest() {
    const agents       = Object.values(this.state.agents || {});
    const totalRevenue = Object.values(this.state.revenue || {}).reduce((a, b) => a + (b || 0), 0);
    const target       = this.state.settings?.revTarget || 10000;

    const report = {
      id:          uuid(),
      type:        'daily-digest',
      date:        new Date().toLocaleDateString(),
      generatedAt: new Date().toISOString(),
      metrics: {
        totalRevenue:  totalRevenue.toFixed(2),
        revenueToday:  (this.state.revenueToday || 0).toFixed(2),
        tasksCompleted:this.state.tasksCompleted || 0,
        activeAgents:  agents.filter(a => a.status === 'online').length,
        totalAgents:   agents.length,
        selfHeals:     this.state.selfHeals || 0,
        learningCycles:this.state.learningCycles || 0,
        targetProgress: totalRevenue > 0 ? ((totalRevenue / target) * 100).toFixed(1) : '0.0',
      },
      agentSummary: agents.map(a => ({
        name:        a.name,
        status:      a.status,
        revenue:     (a.revenue || 0).toFixed(2),
        tasksToday:  a.tasksToday || 0,
        successRate: a.successRate || 0,
        errors:      a.errors || 0,
      })),
      revenueBreakdown: {
        linkedin:       (this.state.revenue?.linkedin       || 0).toFixed(2),
        social_media:   (this.state.revenue?.social_media   || 0).toFixed(2),
        freelance:      (this.state.revenue?.freelance       || 0).toFixed(2),
        ai_development: (this.state.revenue?.ai_development || 0).toFixed(2),
      },
      alerts:      (this.state.alerts || []).slice(0, 5).map(a => ({ title: a.title, severity: a.severity })),
      healEvents:  (this.state.healLog || []).slice(-5),
    };

    this.storeReport(report);
    this.log('info', `Daily digest generated: $${report.metrics.totalRevenue} revenue`);
    return report;
  }

  /**
   * Generate a weekly performance summary.
   * @returns {object} Report object
   */
  generateWeeklySummary() {
    const daily = this.generateDailyDigest();
    const agents = Object.values(this.state.agents || {});

    const topAgent = agents.sort((a, b) => (b.revenue || 0) - (a.revenue || 0))[0];
    const totalRevenue = parseFloat(daily.metrics.totalRevenue);
    const target       = this.state.settings?.revTarget || 10000;

    const report = {
      ...daily,
      type:       'weekly-summary',
      highlights: [
        `Total Revenue: $${totalRevenue.toFixed(2)} (${((totalRevenue / target) * 100).toFixed(1)}% of $${target} target)`,
        topAgent ? `Top Agent: ${topAgent.name} – $${(topAgent.revenue || 0).toFixed(2)}` : 'No agent data',
        `Self-Healing Events: ${this.state.selfHeals || 0}`,
        `Learning Cycles: ${this.state.learningCycles || 0}`,
        `Tasks Completed: ${this.state.tasksCompleted || 0}`,
      ],
      recommendations: this.generateRecommendations(totalRevenue, target, agents),
      projectedMonthly: (totalRevenue / 7 * 30).toFixed(2),
      projectedAnnual:  (totalRevenue / 7 * 365).toFixed(2),
    };

    this.storeReport(report);
    this.log('info', 'Weekly summary generated.');
    return report;
  }

  /**
   * Generate an agent-specific performance report.
   * @param {string} agentId - Agent ID to report on
   * @returns {object} Agent report
   */
  generateAgentReport(agentId) {
    const agent = this.state.agents?.[agentId];
    if (!agent) return { error: `Agent ${agentId} not found` };

    const logs = (this.state.agentLogs?.[agentId] || []).slice(-20);

    const report = {
      id:           uuid(),
      type:         'agent-report',
      agentId,
      agentName:    agent.name,
      date:         new Date().toLocaleDateString(),
      generatedAt:  new Date().toISOString(),
      status:       agent.status,
      performance: {
        revenue:     (agent.revenue     || 0).toFixed(2),
        tasksToday:  agent.tasksToday   || 0,
        successRate: agent.successRate  || 0,
        errors:      agent.errors       || 0,
        lastActive:  agent.lastActive ? new Date(agent.lastActive).toLocaleString() : 'never',
      },
      recentLogs: logs,
      healthStatus: agent.errors >= 5 ? 'critical' : agent.errors >= 2 ? 'warning' : 'healthy',
    };

    this.log('info', `Agent report generated: ${agentId}`);
    return report;
  }

  /* ===================== TEXT FORMATTING ===================== */

  /**
   * Format a daily digest as Slack-friendly plain text.
   * @param {object} report - Report object from generateDailyDigest()
   * @returns {string}
   */
  formatSlackDigest(report) {
    const m = report.metrics;
    return [
      `*🏆 AI Empire Daily Digest – ${report.date}*`,
      ``,
      `*Revenue:* $${m.totalRevenue} | Today: $${m.revenueToday} | Target: ${m.targetProgress}%`,
      `*Agents:* ${m.activeAgents}/${m.totalAgents} online | Tasks: ${m.tasksCompleted}`,
      `*Self-Heals:* ${m.selfHeals} | Learning Cycles: ${m.learningCycles}`,
      ``,
      `*Revenue Breakdown:*`,
      `💼 LinkedIn: $${report.revenueBreakdown.linkedin}`,
      `📱 Social: $${report.revenueBreakdown.social_media}`,
      `🛠️ Freelance: $${report.revenueBreakdown.freelance}`,
      `🧬 AI Dev: $${report.revenueBreakdown.ai_development}`,
      ``,
      report.alerts?.length > 0 ? `*⚠️ Alerts: ${report.alerts.map(a => a.title).join(', ')}*` : `*✅ No active alerts*`,
    ].join('\n');
  }

  /**
   * Format a report as plain text email body.
   */
  formatEmailBody(report) {
    return `AI Empire Report – ${report.date}\n${'='.repeat(50)}\n\n${this.formatSlackDigest(report).replace(/\*/g, '').replace(/`/g, '')}`;
  }

  /* ===================== CSV EXPORT ===================== */

  exportRevenueCSV() {
    const rows = [
      ['Agent', 'Revenue', 'Tasks Today', 'Success Rate', 'Status'],
      ...Object.values(this.state.agents || {}).map(a => [
        a.name,
        (a.revenue || 0).toFixed(2),
        a.tasksToday || 0,
        `${a.successRate || 0}%`,
        a.status,
      ]),
    ];
    return rows.map(r => r.join(',')).join('\n');
  }

  /* ===================== STORAGE ===================== */

  storeReport(report) {
    this.reports.unshift(report);
    if (this.reports.length > 100) this.reports.pop();
  }

  getRecentReports(limit = 10) {
    return this.reports.slice(0, limit);
  }

  /* ===================== HELPERS ===================== */

  generateRecommendations(revenue, target, agents) {
    const recs = [];
    if (revenue < target * 0.25)  recs.push('Revenue critically below target. Increase LinkedIn outreach to 25 connections/day.');
    if (revenue < target * 0.50)  recs.push('Revenue below 50% target. Double down on Upwork bids this week.');
    if (revenue >= target * 0.80) recs.push('On track for target! Consider raising service prices by 10-15%.');
    const errorAgents = agents.filter(a => (a.errors || 0) >= 3);
    if (errorAgents.length > 0)   recs.push(`${errorAgents.length} agent(s) showing errors. Review logs and restart if needed.`);
    if (recs.length === 0)         recs.push('Empire performing well. Focus on scaling the highest-revenue streams.');
    return recs;
  }

  log(level, msg) {
    if (this.logger?.log) this.logger.log(level, `[Reports] ${msg}`);
    else console.log(`[${level.toUpperCase()}] [Reports] ${msg}`);
  }
}

module.exports = { ReportsEngine };
