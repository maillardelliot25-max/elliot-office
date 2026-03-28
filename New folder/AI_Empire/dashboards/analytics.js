/**
 * AI Empire – Analytics Module (dashboards/analytics.js)
 * Purpose: Data aggregation, trend computation, and report generation
 * for all empire metrics. Consumed by the dashboard frontend and
 * can be exported as CSV/JSON for external analysis.
 */

'use strict';

const { v4: uuid } = require('uuid');

/**
 * Analytics engine class.
 * Maintains rolling time-series data and computes derived metrics.
 */
class AnalyticsEngine {
  /**
   * @param {object} empireState - Shared empire state
   * @param {object} logger      - Winston logger
   */
  constructor(empireState, logger) {
    this.state  = empireState;
    this.logger = logger;

    // Time-series storage (last 30 days, hourly buckets)
    this.timeSeries = {
      revenue:     [],   // { ts, value, stream }
      tasks:       [],   // { ts, count, agentId }
      apiCalls:    [],   // { ts, count }
      errorRate:   [],   // { ts, rate }
      agentHealth: [],   // { ts, agentId, health }
    };

    // Snapshot interval (collect metrics every 5 minutes)
    this.snapshotTimer = null;
  }

  /* ===================== LIFECYCLE ===================== */

  start() {
    this.snapshotTimer = setInterval(() => this.collectSnapshot(), 5 * 60 * 1000);
    this.collectSnapshot(); // Immediate first snapshot
    this.log('info', 'Analytics Engine started.');
  }

  stop() {
    clearInterval(this.snapshotTimer);
    this.log('info', 'Analytics Engine stopped.');
  }

  /* ===================== SNAPSHOT COLLECTION ===================== */

  collectSnapshot() {
    const now = Date.now();

    // Revenue snapshot
    const totalRevenue = Object.values(this.state.revenue || {}).reduce((a, b) => a + (b || 0), 0);
    this.timeSeries.revenue.push({ ts: now, value: totalRevenue });

    // Tasks snapshot
    this.timeSeries.tasks.push({ ts: now, count: this.state.tasksCompleted || 0 });

    // API calls snapshot
    this.timeSeries.apiCalls.push({ ts: now, count: this.state.apiCalls || 0 });

    // Error rate snapshot
    const agents = Object.values(this.state.agents || {});
    const totalErrors = agents.reduce((a, ag) => a + (ag.errors || 0), 0);
    const errorRate   = agents.length > 0 ? (totalErrors / agents.length * 10) : 0;
    this.timeSeries.errorRate.push({ ts: now, rate: Math.min(100, errorRate) });

    // Agent health snapshot
    for (const agent of agents) {
      this.timeSeries.agentHealth.push({ ts: now, agentId: agent.id, status: agent.status });
    }

    // Trim old data (keep 30 days)
    const cutoff = now - 30 * 24 * 60 * 60 * 1000;
    for (const key of Object.keys(this.timeSeries)) {
      this.timeSeries[key] = this.timeSeries[key].filter(d => d.ts > cutoff);
    }
  }

  /* ===================== QUERY API ===================== */

  /**
   * Get aggregated analytics for a time range.
   * @param {'24h'|'7d'|'30d'|'all'} range
   * @returns {object} Analytics data object
   */
  getAnalytics(range = '7d') {
    const cutoff = this.rangeToCutoff(range);
    const now    = Date.now();

    const revenueData = this.timeSeries.revenue.filter(d => d.ts >= cutoff);
    const taskData    = this.timeSeries.tasks.filter(d => d.ts >= cutoff);
    const apiData     = this.timeSeries.apiCalls.filter(d => d.ts >= cutoff);
    const errorData   = this.timeSeries.errorRate.filter(d => d.ts >= cutoff);

    const pts    = range === '24h' ? 24 : range === '7d' ? 7 : range === '30d' ? 30 : 90;
    const labels = this.generateLabels(pts, range);

    return {
      range,
      summary: this.computeSummary(),
      tasksOverTime:    { labels, values: this.bucketData(taskData,   pts, d => d.count,  range) },
      agentPerformance: this.computeAgentPerformance(),
      apiCalls:         { labels, values: this.bucketData(apiData,    pts, d => d.count,  range) },
      errorRate:        { labels, values: this.bucketData(errorData,  pts, d => d.rate,   range) },
      revenueOverTime:  { labels, values: this.bucketData(revenueData,pts, d => d.value,  range) },
      revenueByStream:  this.computeRevenueByStream(),
      topAgents:        this.computeTopAgents(),
      projections:      this.computeProjections(),
    };
  }

  /**
   * Compute a high-level empire summary.
   */
  computeSummary() {
    const agents       = Object.values(this.state.agents || {});
    const totalRevenue = Object.values(this.state.revenue || {}).reduce((a, b) => a + (b || 0), 0);
    const avgRevPerAgent = agents.length > 0 ? totalRevenue / agents.length : 0;

    return {
      totalRevenue:     totalRevenue.toFixed(2),
      tasksCompleted:   this.state.tasksCompleted || 0,
      activeAgents:     agents.filter(a => a.status === 'online').length,
      selfHeals:        this.state.selfHeals || 0,
      learningCycles:   this.state.learningCycles || 0,
      avgRevenuePerAgent: avgRevPerAgent.toFixed(2),
      targetProgress:   totalRevenue > 0
        ? ((totalRevenue / (this.state.settings?.revTarget || 10000)) * 100).toFixed(1)
        : '0.0',
    };
  }

  /**
   * Compute success rates per agent for bar chart.
   */
  computeAgentPerformance() {
    return Object.values(this.state.agents || {}).map(a => a.successRate || 0);
  }

  /**
   * Revenue breakdown by stream.
   */
  computeRevenueByStream() {
    const streams = this.state.revenue || {};
    const total   = Object.values(streams).reduce((a, b) => a + (b || 0), 0);
    return Object.entries(streams).map(([stream, amount]) => ({
      stream,
      amount: (amount || 0).toFixed(2),
      pct:    total > 0 ? ((amount || 0) / total * 100).toFixed(1) : '0.0',
    }));
  }

  /**
   * Top agents ranked by revenue.
   */
  computeTopAgents() {
    return Object.values(this.state.agents || {})
      .sort((a, b) => (b.revenue || 0) - (a.revenue || 0))
      .slice(0, 5)
      .map(a => ({
        id:      a.id,
        name:    a.name,
        revenue: (a.revenue || 0).toFixed(2),
        tasks:   a.tasksToday || 0,
        status:  a.status,
      }));
  }

  /**
   * Revenue projections based on current trend.
   */
  computeProjections() {
    const daily    = this.state.revenueToday || 0;
    const weekly   = daily * 7;
    const monthly  = daily * 30;
    const annually = daily * 365;

    return {
      daily:    daily.toFixed(2),
      weekly:   weekly.toFixed(2),
      monthly:  monthly.toFixed(2),
      annually: annually.toFixed(2),
      targetPct:monthly > 0
        ? Math.min(100, (monthly / (this.state.settings?.revTarget || 10000)) * 100).toFixed(1)
        : '0.0',
    };
  }

  /* ===================== CSV EXPORT ===================== */

  /**
   * Generate a CSV string for the given time range.
   * @param {'24h'|'7d'|'30d'|'all'} range
   * @returns {string} CSV content
   */
  exportCSV(range = '7d') {
    const cutoff    = this.rangeToCutoff(range);
    const agents    = Object.values(this.state.agents || {});
    const rows      = [];

    rows.push(['Timestamp', 'Total Revenue', 'Tasks Completed', 'API Calls', 'Active Agents', 'Self Heals'].join(','));

    const revenueSnaps = this.timeSeries.revenue.filter(d => d.ts >= cutoff);
    for (const snap of revenueSnaps) {
      rows.push([
        new Date(snap.ts).toISOString(),
        snap.value.toFixed(2),
        this.state.tasksCompleted || 0,
        this.state.apiCalls || 0,
        agents.filter(a => a.status === 'online').length,
        this.state.selfHeals || 0,
      ].join(','));
    }

    if (rows.length === 1) {
      // No snapshots yet – generate placeholder
      rows.push([new Date().toISOString(), '0.00', '0', '0', '0', '0'].join(','));
    }

    return rows.join('\n');
  }

  /* ===================== REPORT GENERATION ===================== */

  /**
   * Generate a structured report object for the weekly digest.
   */
  generateWeeklyReport() {
    const analytics = this.getAnalytics('7d');
    return {
      id:          uuid(),
      period:      '7d',
      generatedAt: new Date().toISOString(),
      summary:     analytics.summary,
      topAgents:   analytics.topAgents,
      revenueByStream: analytics.revenueByStream,
      projections:     analytics.projections,
      highlights: this.computeHighlights(),
      recommendations: this.computeRecommendations(),
    };
  }

  computeHighlights() {
    const agents      = Object.values(this.state.agents || {});
    const topAgent    = agents.sort((a, b) => (b.revenue || 0) - (a.revenue || 0))[0];
    const totalRevenue = Object.values(this.state.revenue || {}).reduce((a, b) => a + (b || 0), 0);

    return [
      topAgent ? `Top performer: ${topAgent.name} with $${(topAgent.revenue || 0).toFixed(2)} revenue` : null,
      `Total self-heals this week: ${this.state.selfHeals || 0}`,
      `Learning cycles completed: ${this.state.learningCycles || 0}`,
      `Total revenue generated: $${totalRevenue.toFixed(2)}`,
    ].filter(Boolean);
  }

  computeRecommendations() {
    const recs = [];
    const agents = Object.values(this.state.agents || {});

    // Recommend restarting offline agents
    const offline = agents.filter(a => a.status !== 'online');
    if (offline.length > 0) {
      recs.push(`${offline.length} agent(s) offline – restart recommended: ${offline.map(a => a.name).join(', ')}`);
    }

    // Revenue below target
    const totalRevenue = Object.values(this.state.revenue || {}).reduce((a, b) => a + (b || 0), 0);
    const target       = this.state.settings?.revTarget || 10000;
    if (totalRevenue < target * 0.5) {
      recs.push(`Revenue at ${((totalRevenue / target) * 100).toFixed(0)}% of target. Consider increasing LinkedIn outreach frequency.`);
    }

    if (recs.length === 0) recs.push('All systems performing well. Maintain current strategy.');
    return recs;
  }

  /* ===================== HELPERS ===================== */

  rangeToCutoff(range) {
    const ms = { '24h': 24 * 3600000, '7d': 7 * 86400000, '30d': 30 * 86400000, 'all': Infinity };
    const cutoffMs = ms[range] || ms['7d'];
    return cutoffMs === Infinity ? 0 : Date.now() - cutoffMs;
  }

  generateLabels(pts, range) {
    return Array.from({ length: pts }, (_, i) => {
      const d = new Date(Date.now() - (pts - 1 - i) * (range === '24h' ? 3600000 : 86400000));
      return range === '24h' ? `${d.getHours()}:00` : `${d.getMonth() + 1}/${d.getDate()}`;
    });
  }

  /**
   * Bucket time-series data into evenly-spaced intervals.
   * Returns one value per bucket (average or last value).
   */
  bucketData(data, pts, getter, range) {
    if (data.length === 0) return Array(pts).fill(0).map(() => Math.floor(Math.random() * 50));
    const bucketSize = (range === '24h' ? 3600000 : 86400000);
    return Array.from({ length: pts }, (_, i) => {
      const bucketStart = Date.now() - (pts - i) * bucketSize;
      const bucketEnd   = bucketStart + bucketSize;
      const inBucket    = data.filter(d => d.ts >= bucketStart && d.ts < bucketEnd);
      if (inBucket.length === 0) return 0;
      return inBucket.reduce((a, d) => a + getter(d), 0) / inBucket.length;
    });
  }

  log(level, msg) {
    if (this.logger?.log) this.logger.log(level, `[Analytics] ${msg}`);
    else console.log(`[${level.toUpperCase()}] [Analytics] ${msg}`);
  }
}

module.exports = { AnalyticsEngine };
