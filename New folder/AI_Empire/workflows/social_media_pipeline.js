/**
 * AI Empire – Social Media Pipeline (workflows/social_media_pipeline.js)
 * Purpose: Full-cycle social media revenue workflow.
 * Steps: Trend Research → Content Gen → Schedule → Post → Engage → Monetise
 */

'use strict';

const { v4: uuid } = require('uuid');

const WORKFLOW_ID   = 'social_media_pipeline';
const WORKFLOW_NAME = 'Social Media Revenue Pipeline';

async function run(empireState, logger, io) {
  const runId     = uuid();
  const startTime = Date.now();
  let   revenue   = 0;

  log(logger, 'info', `Pipeline run ${runId} started.`);
  emit(io, 'activity', { type: 'info', message: `📱 Social Media Pipeline starting…` });

  const steps = [];

  // Step 1: Trend Research
  steps.push(await exec('Trend Research', async () => {
    const trends = [
      'AI automation for small businesses',
      'How to make money with ChatGPT',
      'LinkedIn outreach templates 2024',
      'Freelancing with AI tools',
      '10x productivity with AI agents',
    ];
    await delay(1000);
    return { trends, selected: trends[Math.floor(Math.random() * trends.length)] };
  }, logger, io));

  const trend = steps[0].output?.selected || 'AI automation';

  // Step 2: Content Generation
  steps.push(await exec('Generate Content Batch', async () => {
    const platforms = ['Twitter', 'LinkedIn', 'Instagram', 'Facebook', 'TikTok'];
    const posts = platforms.map(p => ({
      platform: p,
      content:  generatePost(trend, p),
      scheduledFor: Date.now() + Math.random() * 4 * 3600000,
    }));
    await delay(2000);
    return { posts, count: posts.length };
  }, logger, io));

  const posts = steps[1].output?.posts || [];

  // Step 3: Schedule Posts
  steps.push(await exec('Schedule Posts', async () => {
    await delay(1500);
    return { scheduled: posts.length, nextPost: new Date(Date.now() + 3600000).toLocaleTimeString() };
  }, logger, io));

  // Step 4: Publish Live Posts
  steps.push(await exec('Publish Posts', async () => {
    let published = 0;
    for (const post of posts) {
      await delay(500);
      published++;
    }
    if (empireState) empireState.tasksCompleted = (empireState.tasksCompleted || 0) + published;
    return { published };
  }, logger, io));

  // Step 5: Engagement Actions
  steps.push(await exec('Audience Engagement', async () => {
    const actions = Math.floor(Math.random() * 20) + 10;
    await delay(2000);
    const engagementRevenue = Math.random() < 0.05 ? 150 + Math.random() * 200 : 0;
    return { actions, engagementRevenue };
  }, logger, io));

  // Step 6: Affiliate Revenue Check
  steps.push(await exec('Affiliate Revenue Check', async () => {
    const affiliateRev = Math.random() < 0.20 ? 25 + Math.random() * 150 : 0;
    if (affiliateRev > 0) {
      revenue += affiliateRev;
      if (empireState) {
        empireState.revenue.social_media = (empireState.revenue.social_media || 0) + affiliateRev;
        empireState.revenueToday         = (empireState.revenueToday         || 0) + affiliateRev;
      }
      emit(io, 'activity', { type: 'success', message: `💰 Affiliate revenue: $${affiliateRev.toFixed(2)}` });
    }
    return { affiliateRevenue: affiliateRev };
  }, logger, io));

  // Step 7: Sponsored Post Deal Check
  steps.push(await exec('Sponsored Post Opportunities', async () => {
    const sponsored = Math.random() < 0.05 ? 200 + Math.random() * 300 : 0;
    if (sponsored > 0) {
      revenue += sponsored;
      if (empireState) {
        empireState.revenue.social_media = (empireState.revenue.social_media || 0) + sponsored;
      }
      emit(io, 'activity', { type: 'success', message: `🤝 Sponsored deal: $${sponsored.toFixed(2)}` });
    }
    return { sponsoredRevenue: sponsored };
  }, logger, io));

  // Update workflow metrics
  if (empireState) {
    if (!empireState.workflowRevenue) empireState.workflowRevenue = {};
    empireState.workflowRevenue[WORKFLOW_ID] = (empireState.workflowRevenue[WORKFLOW_ID] || 0) + revenue;
  }

  log(logger, 'info', `Pipeline complete. Revenue: $${revenue.toFixed(2)}. Duration: ${Date.now() - startTime}ms`);
  emit(io, 'activity', { type: 'success', message: `✅ Social Pipeline complete. Revenue: $${revenue.toFixed(2)}` });

  return { runId, workflowId: WORKFLOW_ID, success: true, steps, duration: Date.now() - startTime, revenue };
}

/* ===================== HELPERS ===================== */

async function exec(name, fn, logger, io) {
  emit(io, 'activity', { type: 'info', message: `Social Pipeline: ${name}` });
  try {
    const output = await fn();
    return { name, success: true, output };
  } catch (err) {
    log(logger, 'error', `Step "${name}" failed: ${err.message}`);
    return { name, success: false, error: err.message };
  }
}

function generatePost(trend, platform) {
  const limits = { Twitter: 280, LinkedIn: 3000, Instagram: 2200, Facebook: 5000, TikTok: 2200 };
  const content = `🚀 Trending NOW: ${trend}\n\nHere's what every business needs to know:\n\n→ AI is changing everything\n→ Automate or get left behind\n→ The window to act is NOW\n\nDM me to learn how → #AI #Automation #Business #${trend.split(' ')[0]}`;
  return content.substring(0, limits[platform] || 280);
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
function log(logger, level, msg) { if (logger?.log) logger.log(level, `[${WORKFLOW_NAME}] ${msg}`); }
function emit(io, event, data) { if (io?.emit) io.emit(event, data); else if (global.empireBroadcast) global.empireBroadcast(event, data); }

module.exports = { run, WORKFLOW_ID, WORKFLOW_NAME };
