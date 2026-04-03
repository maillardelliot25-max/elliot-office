/**
 * Health Check Monitor (Infrastructure)
 * Continuously monitors all stacks, agents, APIs
 * Detects issues, sends alerts, triggers failover if needed
 */

const axios = require('axios');
const logger = require('../config/logger');

class HealthCheckMonitor {
  constructor() {
    this.name = 'Health Check Monitor';
    this.endpoints = [
      { name: 'ARIA Stack', url: 'http://localhost:4001/health' },
      { name: 'VELA Stack', url: 'http://localhost:4002/health' },
      { name: 'TEMPA Stack', url: 'http://localhost:4003/health' },
      { name: 'Finance Agent', url: 'http://localhost:5000/health' },
      { name: 'Maillard Dashboard', url: 'http://localhost:3000/health' },
    ];
    this.checkInterval = 60000; // 1 minute
    this.alerts = [];
    this.uptimeStats = {};
  }

  /**
   * Check endpoint health
   */
  async checkEndpoint(endpoint) {
    const startTime = Date.now();

    try {
      const response = await axios.get(endpoint.url, {
        timeout: 5000,
        validateStatus: () => true, // Don't throw on non-2xx
      });

      const responseTime = Date.now() - startTime;

      const health = {
        endpoint: endpoint.name,
        url: endpoint.url,
        status: response.status === 200 ? 'healthy' : 'unhealthy',
        statusCode: response.status,
        responseTime,
        uptime: response.data?.uptime || 'N/A',
        agents: response.data?.agents || 0,
        lastCheck: new Date().toISOString(),
      };

      return health;
    } catch (error) {
      return {
        endpoint: endpoint.name,
        url: endpoint.url,
        status: 'offline',
        statusCode: 0,
        responseTime: Date.now() - startTime,
        error: error.message,
        lastCheck: new Date().toISOString(),
      };
    }
  }

  /**
   * Evaluate health check results
   */
  evaluateHealth(healthCheck) {
    const issues = [];

    if (healthCheck.status === 'offline') {
      issues.push({
        severity: 'critical',
        message: `${healthCheck.endpoint} is OFFLINE`,
        action: 'Restart stack immediately',
      });
    } else if (healthCheck.status === 'unhealthy') {
      issues.push({
        severity: 'high',
        message: `${healthCheck.endpoint} returned status ${healthCheck.statusCode}`,
        action: 'Investigate endpoint logs',
      });
    }

    if (healthCheck.responseTime > 5000) {
      issues.push({
        severity: 'medium',
        message: `${healthCheck.endpoint} slow response (${healthCheck.responseTime}ms)`,
        action: 'Check system load',
      });
    }

    return issues;
  }

  /**
   * Send alert notifications
   */
  async sendAlert(alert) {
    logger.error(`ALERT [${alert.severity}]: ${alert.message}`, {
      action: alert.action,
      timestamp: new Date().toISOString(),
    });

    // In production, integrate with Slack, PagerDuty, etc.
    // For now, just log and store

    this.alerts.push({
      ...alert,
      timestamp: new Date().toISOString(),
    });

    // Keep last 100 alerts
    if (this.alerts.length > 100) {
      this.alerts.shift();
    }
  }

  /**
   * Calculate uptime statistics
   */
  updateUptimeStats(endpoint, health) {
    if (!this.uptimeStats[endpoint.name]) {
      this.uptimeStats[endpoint.name] = {
        checks: 0,
        successes: 0,
        failures: 0,
        uptime: 100,
      };
    }

    const stats = this.uptimeStats[endpoint.name];
    stats.checks++;

    if (health.status !== 'offline') {
      stats.successes++;
    } else {
      stats.failures++;
    }

    stats.uptime = (stats.successes / stats.checks * 100).toFixed(2);
  }

  /**
   * Generate health summary
   */
  generateSummary(allHealthChecks) {
    const summary = {
      timestamp: new Date().toISOString(),
      totalEndpoints: allHealthChecks.length,
      healthyEndpoints: allHealthChecks.filter(h => h.status === 'healthy').length,
      unhealthyEndpoints: allHealthChecks.filter(h => h.status === 'unhealthy').length,
      offlineEndpoints: allHealthChecks.filter(h => h.status === 'offline').length,
      avgResponseTime: Math.round(
        allHealthChecks.reduce((sum, h) => sum + h.responseTime, 0) / allHealthChecks.length
      ),
      overallStatus: allHealthChecks.filter(h => h.status === 'healthy').length === allHealthChecks.length
        ? 'OPERATIONAL'
        : 'DEGRADED',
      details: allHealthChecks,
    };

    return summary;
  }

  /**
   * Execute continuous monitoring
   */
  async execute() {
    logger.info('Health Check Monitor cycle started');

    try {
      const allHealthChecks = [];
      const allIssues = [];

      // Check all endpoints
      for (const endpoint of this.endpoints) {
        const health = await this.checkEndpoint(endpoint);
        allHealthChecks.push(health);

        // Evaluate and flag issues
        const issues = this.evaluateHealth(health);
        if (issues.length > 0) {
          issues.forEach(issue => {
            allIssues.push(issue);
            this.sendAlert(issue);
          });
        }

        // Update uptime stats
        this.updateUptimeStats(endpoint, health);
      }

      // Generate summary
      const summary = this.generateSummary(allHealthChecks);

      logger.info('Health Check Monitor cycle complete', {
        status: summary.overallStatus,
        healthy: summary.healthyEndpoints,
        unhealthy: summary.unhealthyEndpoints,
        offline: summary.offlineEndpoints,
      });

      return summary;
    } catch (error) {
      logger.error('Health check monitor cycle failed', { error: error.message });
    }
  }

  /**
   * Get current status dashboard
   */
  getStatus() {
    return {
      name: this.name,
      alerts: this.alerts.slice(-10), // Last 10 alerts
      uptimeStats: this.uptimeStats,
      nextCheck: new Date(Date.now() + this.checkInterval).toISOString(),
    };
  }
}

module.exports = HealthCheckMonitor;

// Standalone execution
if (require.main === module) {
  const monitor = new HealthCheckMonitor();
  monitor.execute();

  // Run continuously
  setInterval(() => {
    monitor.execute();
  }, monitor.checkInterval);
}
