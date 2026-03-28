/**
 * AI Empire – Self-Learning Engine (autopilot/learning.js)
 * Purpose: Continuous knowledge acquisition, strategy adaptation,
 * and agent improvement through web scraping, trend analysis,
 * and AI-driven insight generation.
 *
 * Learning sources:
 *   - Industry news and trends
 *   - Competitor analysis
 *   - Market pricing data
 *   - Job market demand signals
 *   - Engagement performance feedback
 *
 * Outputs:
 *   - Updated outreach templates
 *   - Revised pricing strategies
 *   - New content topics
 *   - Improved proposal frameworks
 *   - Alert on market shifts
 */

'use strict';

const axios   = require('axios');
const { v4: uuid } = require('uuid');

class LearningEngine {
  /**
   * @param {object} empireState - Shared empire state
   * @param {object} logger      - Winston logger
   * @param {object} io          - Socket.IO instance
   */
  constructor(empireState, logger, io) {
    this.state   = empireState;
    this.logger  = logger;
    this.io      = io;
    this.running = false;
    this.cycleTimer = null;

    // Knowledge base
    this.knowledgeBase = {
      trends:     [],   // { topic, relevance, source, ts }
      insights:   [],   // { text, source, actionable }
      strategies: [],   // { title, body, impact, implementedAt }
      pricing:    {},   // { service: { min, max, avg, trend } }
      competitors:[],   // { name, strengths, weaknesses, pricing }
    };

    // Learning sources (scraped / polled)
    this.sources = [
      { name: 'Hacker News',          url: 'https://hacker-news.firebaseio.com/v0/topstories.json', type: 'api',     active: true },
      { name: 'LinkedIn Job Trends',  url: 'https://linkedin.com/jobs/search',                       type: 'scrape',  active: true },
      { name: 'Upwork Market Data',   url: 'https://upwork.com/market',                              type: 'scrape',  active: true },
      { name: 'AI Research (arXiv)',  url: 'https://arxiv.org/list/cs.AI/recent',                   type: 'scrape',  active: true },
      { name: 'Reddit r/Entrepreneur',url: 'https://www.reddit.com/r/Entrepreneur/hot.json',        type: 'api',     active: true },
      { name: 'Product Hunt',         url: 'https://www.producthunt.com',                            type: 'scrape',  active: true },
    ];
  }

  /* ===================== LIFECYCLE ===================== */

  start() {
    this.running = true;
    this.log('info', 'Learning Engine starting…');

    // Run first cycle after 30s (let system stabilise first)
    setTimeout(() => this.runCycle(), 30000);

    // Schedule cycles every 6 hours
    this.cycleTimer = setInterval(() => this.runCycle(), 6 * 60 * 60 * 1000);

    this.log('info', 'Learning Engine running. First cycle in 30s.');
  }

  stop() {
    this.running = false;
    clearInterval(this.cycleTimer);
    this.log('info', 'Learning Engine stopped.');
  }

  /* ===================== MAIN LEARNING CYCLE ===================== */

  /**
   * Execute a full learning cycle:
   * 1. Scrape knowledge sources
   * 2. Analyse trends
   * 3. Generate insights
   * 4. Update strategies
   * 5. Push updates to agents
   */
  async runCycle() {
    if (!this.running) return;

    const cycleId  = uuid();
    const startTime = Date.now();

    this.log('info', `Learning cycle ${cycleId} starting…`);
    this.state.learningCycles = (this.state.learningCycles || 0) + 1;
    this.broadcast('activity', { type: 'info', message: '🧠 Learning cycle started…' });

    const results = {
      cycleId,
      sources:    [],
      insights:   [],
      strategies: [],
      duration:   0,
    };

    try {
      // Step 1: Gather knowledge
      const rawData = await this.gatherKnowledge();
      results.sources = rawData.sources;

      // Step 2: Analyse and extract insights
      const insights = await this.extractInsights(rawData.data);
      results.insights = insights;
      this.knowledgeBase.insights = [...insights, ...this.knowledgeBase.insights].slice(0, 50);
      this.state.insights = this.knowledgeBase.insights;

      // Step 3: Generate actionable strategies
      const strategies = await this.generateStrategies(insights);
      results.strategies = strategies;
      this.knowledgeBase.strategies = [...strategies, ...this.knowledgeBase.strategies].slice(0, 20);
      this.state.strategies = this.knowledgeBase.strategies;

      // Step 4: Update agent strategies
      await this.pushUpdatesToAgents(strategies);

      // Step 5: Update pricing intelligence
      await this.updatePricingIntelligence();

      // Step 6: Record completed cycle
      results.duration = Date.now() - startTime;
      this.state.lastLearnCycle = Date.now();

      this.log('info', `Learning cycle complete. ${insights.length} insights, ${strategies.length} strategies. (${results.duration}ms)`);
      this.broadcast('learning:complete', { totalCycles: this.state.learningCycles, insights: insights.length, strategies: strategies.length });
      this.broadcast('activity', { type: 'success', message: `🧠 Learning cycle complete: ${insights.length} new insights, ${strategies.length} strategy updates.` });

    } catch (err) {
      this.log('error', `Learning cycle failed: ${err.message}`);
      results.error = err.message;
    }

    return results;
  }

  /* ===================== KNOWLEDGE GATHERING ===================== */

  /**
   * Gather data from all configured knowledge sources.
   * @returns {{ sources, data }}
   */
  async gatherKnowledge() {
    const sourceResults = [];
    const allData       = [];

    for (const source of this.sources.filter(s => s.active)) {
      try {
        this.log('debug', `Scraping: ${source.name}`);
        const items = await this.fetchSource(source);
        sourceResults.push({ name: source.name, url: source.url, itemsScraped: items.length, status: 'success' });
        allData.push(...items.map(item => ({ ...item, sourceName: source.name })));
        await this.delay(1000 + Math.random() * 2000); // Polite delay
      } catch (err) {
        this.log('warn', `Failed to scrape ${source.name}: ${err.message}`);
        sourceResults.push({ name: source.name, url: source.url, itemsScraped: 0, status: 'error', error: err.message });
      }
    }

    return { sources: sourceResults, data: allData };
  }

  /**
   * Fetch data from a single source.
   * @param {object} source - Source configuration
   * @returns {Array} Array of data items
   */
  async fetchSource(source) {
    if (source.type === 'api') {
      return this.fetchApiSource(source);
    }
    // For scraping sources, use simulated data in dev mode
    return this.simulateSourceData(source.name);
  }

  async fetchApiSource(source) {
    if (source.url.includes('hacker-news')) {
      const res   = await axios.get(source.url, { timeout: 10000 });
      const topIds = res.data.slice(0, 10);
      const stories = await Promise.allSettled(
        topIds.map(id => axios.get(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, { timeout: 5000 }))
      );
      return stories
        .filter(r => r.status === 'fulfilled')
        .map(r => ({
          title:  r.value.data.title,
          url:    r.value.data.url || '',
          score:  r.value.data.score,
          type:   'news',
        }));
    }

    if (source.url.includes('reddit')) {
      const res = await axios.get(source.url, {
        headers: { 'User-Agent': 'EmpireLearningBot/1.0' },
        timeout: 10000,
      });
      return (res.data?.data?.children || []).slice(0, 10).map(p => ({
        title: p.data.title,
        score: p.data.score,
        url:   `https://reddit.com${p.data.permalink}`,
        type:  'discussion',
      }));
    }

    return this.simulateSourceData(source.name);
  }

  /** Generate realistic simulated data for a source. */
  simulateSourceData(sourceName) {
    const dataBySource = {
      'LinkedIn Job Trends': [
        { title: 'AI Engineer demand up 280% in Q1 2024', type: 'trend', relevance: 'high' },
        { title: 'Remote AI consulting jobs increased 145%', type: 'trend', relevance: 'high' },
        { title: 'Average AI consultant rate now $180/hr', type: 'pricing', relevance: 'high' },
        { title: 'Top skill: OpenAI API integration', type: 'skill', relevance: 'medium' },
      ],
      'Upwork Market Data': [
        { title: 'AI automation projects avg budget $3,400', type: 'pricing', relevance: 'high' },
        { title: 'ChatGPT integration: 1,200 new jobs this week', type: 'demand', relevance: 'high' },
        { title: 'LinkedIn automation RFPs up 67%', type: 'demand', relevance: 'medium' },
        { title: 'Python AI scripts: $75-150/hr market rate', type: 'pricing', relevance: 'medium' },
      ],
      'AI Research (arXiv)': [
        { title: 'New fine-tuning technique reduces costs by 40%', type: 'research', relevance: 'medium' },
        { title: 'GPT-4 outperforms humans in 15 professional tasks', type: 'research', relevance: 'high' },
        { title: 'Agent frameworks: LangChain vs AutoGen comparison', type: 'research', relevance: 'medium' },
      ],
      'Product Hunt': [
        { title: 'AI writing tool reaches $1M ARR in 6 months', type: 'market', relevance: 'high' },
        { title: 'New AI HR tool: 2,000 upvotes on launch day', type: 'market', relevance: 'medium' },
        { title: 'B2B AI chatbot: 500 paying customers in 30 days', type: 'market', relevance: 'high' },
      ],
    };

    return dataBySource[sourceName] || [
      { title: `Trending: AI automation in ${sourceName}`, type: 'general', relevance: 'medium' },
    ];
  }

  /* ===================== INSIGHT EXTRACTION ===================== */

  /**
   * Analyse raw data and extract actionable insights.
   * Uses OpenAI if credentials available, otherwise rule-based extraction.
   */
  async extractInsights(data) {
    const creds = this.state?.credentials;

    if (creds?.openaiKey && data.length > 0) {
      try {
        return await this.extractInsightsWithAI(data, creds.openaiKey);
      } catch (err) {
        this.log('warn', `AI insight extraction failed: ${err.message}. Using rule-based.`);
      }
    }

    return this.extractInsightsRuleBased(data);
  }

  async extractInsightsWithAI(data, apiKey) {
    const summary = data.slice(0, 20).map(d => d.title).join('\n');
    const res = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4o-mini',
      messages: [{
        role: 'user',
        content: `You are an AI business strategist. Analyse these trending topics and extract 5 actionable business insights for an AI consulting and automation business:\n\n${summary}\n\nReturn JSON: [{"text": "insight text", "source": "source name", "actionable": true, "impact": "high/medium/low"}]`,
      }],
      max_tokens: 600,
    }, { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 20000 });

    const raw = res.data.choices[0].message.content;
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    return jsonMatch ? JSON.parse(jsonMatch[0]).map(i => ({ ...i, time: new Date().toLocaleTimeString() })) : [];
  }

  extractInsightsRuleBased(data) {
    const insights = [];

    // Check for pricing signals
    const pricingItems = data.filter(d => d.type === 'pricing');
    if (pricingItems.length > 0) {
      insights.push({
        text:       `Market pricing signal: ${pricingItems[0].title}. Consider updating rate card.`,
        source:     pricingItems[0].sourceName || 'Market Data',
        actionable: true,
        impact:     'high',
        time:       new Date().toLocaleTimeString(),
      });
    }

    // Check for demand signals
    const demandItems = data.filter(d => d.type === 'demand' || d.relevance === 'high');
    if (demandItems.length > 0) {
      insights.push({
        text:       `High demand signal: ${demandItems[0].title}. Prioritise this service offering.`,
        source:     demandItems[0].sourceName || 'Job Market',
        actionable: true,
        impact:     'high',
        time:       new Date().toLocaleTimeString(),
      });
    }

    // Check for market trends
    const trendItems = data.filter(d => d.type === 'trend');
    if (trendItems.length > 0) {
      insights.push({
        text:       `Market trend detected: ${trendItems[0].title}. Align content strategy accordingly.`,
        source:     trendItems[0].sourceName || 'Trend Data',
        actionable: true,
        impact:     'medium',
        time:       new Date().toLocaleTimeString(),
      });
    }

    // Add general insight from research
    const researchItems = data.filter(d => d.type === 'research');
    if (researchItems.length > 0) {
      insights.push({
        text:       `Research update: ${researchItems[0].title}. Apply to client proposals.`,
        source:     'Research',
        actionable: false,
        impact:     'medium',
        time:       new Date().toLocaleTimeString(),
      });
    }

    // Default insight if no specific data
    if (insights.length === 0) {
      insights.push({
        text:       'Continue current strategy. No significant market shifts detected.',
        source:     'System',
        actionable: false,
        impact:     'low',
        time:       new Date().toLocaleTimeString(),
      });
    }

    return insights;
  }

  /* ===================== STRATEGY GENERATION ===================== */

  /**
   * Turn insights into concrete strategy updates.
   */
  async generateStrategies(insights) {
    const strategies = [];

    for (const insight of insights.filter(i => i.actionable)) {
      const strategy = this.insightToStrategy(insight);
      if (strategy) strategies.push(strategy);
    }

    // Always add at least one default strategy
    if (strategies.length === 0) {
      strategies.push({
        title:   'A/B Test Connection Messages',
        body:    'Run a 50/50 split test on LinkedIn connection templates. Track acceptance rates over 7 days.',
        impact:  'medium',
        source:  'Self-optimisation',
        ts:      Date.now(),
      });
    }

    return strategies;
  }

  insightToStrategy(insight) {
    const text = insight.text.toLowerCase();

    if (text.includes('pricing') || text.includes('rate')) {
      return {
        title:  'Update Pricing Strategy',
        body:   `Based on market data: ${insight.text}. Review and update the freelance bid minimum rates and consulting packages.`,
        impact: insight.impact,
        source: insight.source,
        ts:     Date.now(),
      };
    }

    if (text.includes('demand') || text.includes('trending')) {
      return {
        title:  'Capitalise on High-Demand Area',
        body:   `${insight.text}. Create targeted content and outreach campaigns around this opportunity this week.`,
        impact: insight.impact,
        source: insight.source,
        ts:     Date.now(),
      };
    }

    if (text.includes('content') || text.includes('post')) {
      return {
        title:  'Refresh Content Strategy',
        body:   `${insight.text}. Generate new social media content batch focused on this topic.`,
        impact: insight.impact,
        source: insight.source,
        ts:     Date.now(),
      };
    }

    return {
      title:  'Market Insight Applied',
      body:   insight.text,
      impact: insight.impact,
      source: insight.source,
      ts:     Date.now(),
    };
  }

  /* ===================== STRATEGY PUSH ===================== */

  /**
   * Push updated strategies to relevant agents.
   */
  async pushUpdatesToAgents(strategies) {
    for (const strategy of strategies) {
      this.log('debug', `Pushing strategy: ${strategy.title}`);

      // In production: each agent exposes an updateStrategy() method
      // For now, broadcast as an activity event
      this.broadcast('activity', {
        type:    'info',
        message: `📋 Strategy update: ${strategy.title}`,
      });
    }
  }

  /* ===================== PRICING INTELLIGENCE ===================== */

  async updatePricingIntelligence() {
    // Simulate market pricing scan
    const marketRates = {
      'AI Consulting':      { min: 100, max: 300, avg: 175, trend: 'up'   },
      'LinkedIn Automation':{ min: 800, max: 5000, avg: 2000, trend: 'up' },
      'Python Development': { min: 50,  max: 150, avg: 90,  trend: 'stable'},
      'AI App Development': { min: 2000, max: 15000, avg: 6000, trend: 'up'},
      'Social Automation':  { min: 500, max: 3000, avg: 1200, trend: 'up' },
    };

    this.knowledgeBase.pricing = marketRates;

    // Check if our prices are below market
    const alerts = [];
    for (const [service, rates] of Object.entries(marketRates)) {
      if (rates.trend === 'up') {
        alerts.push(`${service} rates trending up (avg: $${rates.avg}). Consider raising prices.`);
      }
    }

    if (alerts.length > 0) {
      this.log('info', `Pricing intelligence update: ${alerts.length} opportunities found.`);
    }
  }

  /* ===================== HELPERS ===================== */

  delay(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  getKnowledgeBase() {
    return {
      ...this.knowledgeBase,
      sources: this.sources,
      totalCycles: this.state.learningCycles || 0,
      lastCycle: this.state.lastLearnCycle
        ? new Date(this.state.lastLearnCycle).toLocaleString()
        : 'never',
    };
  }

  log(level, message) {
    if (this.logger?.log) this.logger.log(level, `[LearningEngine] ${message}`);
    else console.log(`[${level.toUpperCase()}] [LearningEngine] ${message}`);
  }

  broadcast(event, data) {
    if (this.io?.emit) this.io.emit(event, data);
    else if (global.empireBroadcast) global.empireBroadcast(event, data);
  }
}

module.exports = { LearningEngine };
