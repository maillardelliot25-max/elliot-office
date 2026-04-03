/**
 * Consulting Rate Optimizer (VELA Stack)
 * Dynamically adjusts consultation rates based on demand, market rates, availability
 * Maximizes revenue per hour while maintaining competitive positioning
 */

const axios = require('axios');
const logger = require('../config/logger');

class ConsultingRateOptimizer {
  constructor() {
    this.name = 'Consulting Rate Optimizer';
    this.baseRate = 150; // $/hour
    this.currentRate = 150;
    this.minRate = 100;
    this.maxRate = 300;
    this.marketAnalysis = {};
  }

  /**
   * Analyze market rates for similar services
   */
  async analyzeMarketRates() {
    logger.info('Analyzing market rates for consulting services');

    // Simulate market research (would call API in production)
    const marketRates = {
      junior: 75 + Math.random() * 50, // $75-$125/hr
      mid: 125 + Math.random() * 75, // $125-$200/hr
      senior: 200 + Math.random() * 150, // $200-$350/hr
      enterprise: 300 + Math.random() * 200, // $300-$500/hr
    };

    this.marketAnalysis = marketRates;
    logger.info('Market rates analyzed', { rates: marketRates });

    return marketRates;
  }

  /**
   * Check current demand for consulting (booking rate, inquiry volume)
   */
  async checkDemand() {
    // Simulate demand metrics
    const demand = {
      bookingRate: Math.random() * 100, // % of availability booked
      inquiriesPerDay: Math.floor(Math.random() * 10) + 2,
      avgProjectValue: 1500 + Math.random() * 3500,
      clientSatisfaction: 4.2 + Math.random() * 0.8, // 4.2-5.0 stars
    };

    logger.info('Demand analysis', { demand });
    return demand;
  }

  /**
   * Calculate optimal rate based on demand, market, availability
   */
  async calculateOptimalRate(demand, marketRates) {
    let optimalRate = this.baseRate;

    // Factor 1: Market positioning
    const seniorRate = marketRates.senior;
    const competitiveBonus = seniorRate > this.baseRate ? (seniorRate - this.baseRate) * 0.5 : 0;

    // Factor 2: Booking rate (if >80% booked, increase price)
    const demandMultiplier = demand.bookingRate > 80 ? 1.15 : 1.0;

    // Factor 3: Client satisfaction (high satisfaction = can charge more)
    const satisfactionMultiplier = 1 + (demand.clientSatisfaction - 4.0) * 0.1;

    // Factor 4: Inquiry volume (high inquiries = increase price)
    const inquiryMultiplier = demand.inquiriesPerDay > 5 ? 1.1 : 1.0;

    // Calculate final rate
    optimalRate = this.baseRate + competitiveBonus;
    optimalRate *= demandMultiplier;
    optimalRate *= satisfactionMultiplier;
    optimalRate *= inquiryMultiplier;

    // Clamp to min/max
    optimalRate = Math.max(this.minRate, Math.min(this.maxRate, Math.round(optimalRate)));

    logger.info('Optimal rate calculated', {
      baseRate: this.baseRate,
      competitiveBonus: Math.round(competitiveBonus),
      demandMultiplier,
      satisfactionMultiplier,
      inquiryMultiplier,
      optimalRate,
    });

    return optimalRate;
  }

  /**
   * Update consulting rate
   */
  async updateRate(newRate) {
    const oldRate = this.currentRate;
    this.currentRate = newRate;

    const percentChange = ((newRate - oldRate) / oldRate * 100).toFixed(1);

    logger.info('Consulting rate updated', {
      oldRate,
      newRate,
      change: `${percentChange}%`,
    });

    // Notify Finance Agent of rate change
    await this.notifyRateChange(oldRate, newRate);

    return { oldRate, newRate, change: percentChange };
  }

  /**
   * Estimate impact on monthly revenue
   */
  async estimateRevenueImpact(newRate, currentBookingHours) {
    const currentRevenue = this.currentRate * currentBookingHours;
    const projectedRevenue = newRate * currentBookingHours;
    const increaseAmount = projectedRevenue - currentRevenue;
    const increasePercent = (increaseAmount / currentRevenue * 100).toFixed(1);

    const impact = {
      currentRevenue,
      projectedRevenue,
      increaseAmount: Math.round(increaseAmount),
      increasePercent,
      annualImpact: Math.round(increaseAmount * 12),
    };

    logger.info('Revenue impact estimated', { impact });
    return impact;
  }

  /**
   * Notify Finance Agent of rate optimization
   */
  async notifyRateChange(oldRate, newRate) {
    try {
      const estimatedMonthlyBookingHours = 100; // Assumption
      const impact = await this.estimateRevenueImpact(newRate, estimatedMonthlyBookingHours);

      await axios.post(
        process.env.FINANCE_AGENT_URL || 'http://localhost:5000/api/events/rate-optimization',
        {
          agent: 'vela_consulting_agent',
          oldRate,
          newRate,
          impact,
          timestamp: new Date().toISOString(),
        }
      );

      logger.info('Rate change notified to Finance Agent');
    } catch (error) {
      logger.error('Failed to notify rate change', { error: error.message });
    }
  }

  /**
   * Execute optimization cycle
   */
  async execute() {
    logger.info('Consulting Rate Optimizer cycle started');

    try {
      const marketRates = await this.analyzeMarketRates();
      const demand = await this.checkDemand();
      const optimalRate = await this.calculateOptimalRate(demand, marketRates);

      const rateUpdate = await this.updateRate(optimalRate);

      logger.info('Optimization cycle complete', { rateUpdate });
    } catch (error) {
      logger.error('Optimization cycle failed', { error: error.message });
    }
  }
}

module.exports = ConsultingRateOptimizer;

// Standalone execution
if (require.main === module) {
  const optimizer = new ConsultingRateOptimizer();
  optimizer.execute();
}
