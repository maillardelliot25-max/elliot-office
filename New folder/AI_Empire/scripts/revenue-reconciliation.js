/**
 * Revenue Reconciliation (Infrastructure)
 * Daily/weekly reconciliation of reported revenue vs actual payments
 * Detects discrepancies, validates agent reports, ensures Finance Agent accuracy
 */

const axios = require('axios');
const logger = require('../config/logger');

class RevenueReconciliation {
  constructor() {
    this.name = 'Revenue Reconciliation';
    this.reconciliationCycle = 'daily'; // daily or weekly
    this.discrepancies = [];
    this.lastReconcileTime = null;
  }

  /**
   * Fetch reported revenue from all agents
   */
  async getReportedRevenue() {
    try {
      logger.info('Fetching reported revenue from all stacks');

      // Fetch from each stack
      const ariaSummary = await axios.get('http://localhost:4001/api/agents');
      const velaSummary = await axios.get('http://localhost:4002/api/agents');
      const tempaSummary = await axios.get('http://localhost:4003/api/agents');

      const reportedRevenue = {
        aria: ariaSummary.data.reduce((sum, agent) => sum + (agent.revenue || 0), 0),
        vela: velaSummary.data.reduce((sum, agent) => sum + (agent.revenue || 0), 0),
        tempa: tempaSummary.data.reduce((sum, agent) => sum + (agent.revenue || 0), 0),
      };

      reportedRevenue.total = reportedRevenue.aria + reportedRevenue.vela + reportedRevenue.tempa;

      logger.info('Reported revenue fetched', { reportedRevenue });
      return reportedRevenue;
    } catch (error) {
      logger.error('Failed to fetch reported revenue', { error: error.message });
      throw error;
    }
  }

  /**
   * Fetch actual payments from payment processors
   * (Stripe, PayPal, bank transfers, etc.)
   */
  async getActualPayments() {
    logger.info('Fetching actual payments from payment processors');

    // Simulate payment processor data (would integrate with Stripe API in production)
    const actualPayments = {
      stripe: 2500 + Math.random() * 1500,
      paypal: 1000 + Math.random() * 500,
      bankTransfer: 1500 + Math.random() * 1000,
      crypto: Math.random() < 0.3 ? Math.random() * 500 : 0,
    };

    actualPayments.total = Object.values(actualPayments)
      .slice(0, -1)
      .reduce((a, b) => a + b, 0);

    logger.info('Actual payments fetched', { actualPayments });
    return actualPayments;
  }

  /**
   * Compare reported vs actual and flag discrepancies
   */
  async compareRevenue(reported, actual) {
    logger.info('Comparing reported vs actual revenue');

    const variance = actual.total - reported.total;
    const variancePercent = (variance / reported.total * 100).toFixed(2);

    const discrepancy = {
      timestamp: new Date().toISOString(),
      reportedTotal: Math.round(reported.total),
      actualTotal: Math.round(actual.total),
      variance: Math.round(variance),
      variancePercent: variancePercent,
      status: 'pending', // pending, resolved, flagged
    };

    // Flag if variance > 5%
    if (Math.abs(variancePercent) > 5) {
      discrepancy.status = 'flagged';
      discrepancy.reason = variancePercent > 0
        ? 'Actual payments exceed reported revenue (possible unreported income)'
        : 'Reported revenue exceeds actual payments (possible accounting error)';

      this.discrepancies.push(discrepancy);

      logger.warn('Revenue discrepancy detected', {
        reported: Math.round(reported.total),
        actual: Math.round(actual.total),
        variance: Math.round(variance),
      });
    } else {
      discrepancy.status = 'reconciled';
      logger.info('Revenue reconciled successfully', {
        variance: Math.round(variance),
        variancePercent,
      });
    }

    return discrepancy;
  }

  /**
   * Validate individual agent reports
   */
  async validateAgentReports(agents) {
    logger.info('Validating individual agent reports');

    const validation = {
      validAgents: [],
      anomalies: [],
    };

    agents.forEach(agent => {
      // Check for suspicious patterns
      if (agent.revenue > 10000 && agent.tasksCompleted < 5) {
        validation.anomalies.push({
          agent: agent.id,
          issue: 'High revenue with low task count',
          severity: 'medium',
          action: 'Review agent logs',
        });
      }

      if (agent.revenue === 0 && agent.lastUpdate) {
        const lastUpdateAge = Date.now() - new Date(agent.lastUpdate).getTime();
        if (lastUpdateAge > 3600000) { // 1 hour
          validation.anomalies.push({
            agent: agent.id,
            issue: 'Agent inactive (no revenue for >1 hour)',
            severity: 'high',
            action: 'Restart agent or investigate',
          });
        }
      }

      if (validation.anomalies.every(a => a.agent !== agent.id)) {
        validation.validAgents.push(agent.id);
      }
    });

    logger.info('Agent validation complete', {
      valid: validation.validAgents.length,
      anomalies: validation.anomalies.length,
    });

    return validation;
  }

  /**
   * Generate reconciliation report
   */
  generateReport(comparison, validation) {
    const report = {
      timestamp: new Date().toISOString(),
      reconciliationType: this.reconciliationCycle,
      summary: {
        reportedRevenue: comparison.reportedTotal,
        actualRevenue: comparison.actualTotal,
        variance: comparison.variance,
        variancePercent: comparison.variancePercent,
        status: comparison.status,
      },
      agentValidation: validation,
      discrepancies: this.discrepancies,
      recommendations: [],
    };

    // Generate recommendations
    if (comparison.status === 'flagged') {
      report.recommendations.push('Investigate variance in reported vs actual revenue');
      report.recommendations.push('Review agent logs for anomalies');
    }

    if (validation.anomalies.length > 0) {
      report.recommendations.push('Address agent anomalies identified in validation');
      report.recommendations.push('Check agent health and connectivity');
    }

    logger.info('Reconciliation report generated', {
      status: report.summary.status,
      variance: report.summary.variance,
    });

    return report;
  }

  /**
   * Execute full reconciliation cycle
   */
  async execute() {
    logger.info(`Revenue Reconciliation (${this.reconciliationCycle}) cycle started`);

    try {
      const reported = await this.getReportedRevenue();
      const actual = await this.getActualPayments();
      const comparison = await this.compareRevenue(reported, actual);

      // Get agents for validation (placeholder)
      const agents = [
        { id: 'linkedin_agent', revenue: 2000, tasksCompleted: 50, lastUpdate: new Date().toISOString() },
        { id: 'social_agent', revenue: 1500, tasksCompleted: 30, lastUpdate: new Date().toISOString() },
        { id: 'freelance_agent', revenue: 3000, tasksCompleted: 15, lastUpdate: new Date().toISOString() },
      ];

      const validation = await this.validateAgentReports(agents);
      const report = this.generateReport(comparison, validation);

      this.lastReconcileTime = new Date();

      logger.info('Reconciliation cycle complete', {
        status: report.summary.status,
        variance: report.summary.variance,
      });

      return report;
    } catch (error) {
      logger.error('Reconciliation cycle failed', { error: error.message });
    }
  }
}

module.exports = RevenueReconciliation;

// Standalone execution
if (require.main === module) {
  const reconciliation = new RevenueReconciliation();
  reconciliation.execute();
}
