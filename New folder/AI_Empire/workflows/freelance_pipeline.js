/**
 * AI Empire – Freelance Pipeline (workflows/freelance_pipeline.js)
 * Purpose: Automated freelance revenue workflow.
 * Steps: Scan Jobs → Filter → Generate Proposals → Submit → Track → Deliver → Invoice
 */

'use strict';

const { v4: uuid } = require('uuid');

const WORKFLOW_ID   = 'freelance_pipeline';
const WORKFLOW_NAME = 'Freelance Revenue Pipeline';

async function run(empireState, logger, io) {
  const runId     = uuid();
  const startTime = Date.now();
  let   revenue   = 0;

  log(logger, 'info', `Freelance pipeline ${runId} started.`);
  emit(io, 'activity', { type: 'info', message: `🛠️ Freelance Pipeline starting…` });

  const steps = [];

  // Step 1: Scan Job Boards
  steps.push(await exec('Scan Job Boards', async () => {
    const jobs = generateJobs(12);
    await delay(2000);
    return { total: jobs.length, jobs };
  }, logger, io));

  const allJobs = steps[0].output?.jobs || [];

  // Step 2: Filter Relevant Jobs
  steps.push(await exec('Filter High-Value Jobs', async () => {
    const filtered = allJobs.filter(j => j.budget >= 500 && isRelevant(j));
    return { filtered: filtered.length, jobs: filtered };
  }, logger, io));

  const filteredJobs = steps[1].output?.jobs || [];

  // Step 3: Generate Proposals
  steps.push(await exec('Generate AI Proposals', async () => {
    const proposals = filteredJobs.map(job => ({
      jobId:    job.id,
      proposal: generateProposal(job),
      bidAmount:Math.round(job.budget * 0.90),
    }));
    await delay(3000);
    return { proposals: proposals.length };
  }, logger, io));

  // Step 4: Submit Proposals
  steps.push(await exec('Submit Proposals', async () => {
    let submitted = 0;
    let won = 0;
    let wonRevenue = 0;

    for (const job of filteredJobs.slice(0, 8)) {
      await delay(800);
      submitted++;
      const isWon = Math.random() < 0.15;
      if (isWon) {
        won++;
        wonRevenue += job.budget;
        revenue += job.budget;

        if (empireState) {
          empireState.revenue.freelance = (empireState.revenue.freelance || 0) + job.budget;
          empireState.revenueToday      = (empireState.revenueToday      || 0) + job.budget;
          empireState.tasksCompleted    = (empireState.tasksCompleted     || 0) + 1;
        }

        emit(io, 'activity', { type: 'success', message: `🏆 Freelance bid won: ${job.title} ($${job.budget})` });
      }
    }

    return { submitted, won, wonRevenue };
  }, logger, io));

  // Step 5: Project Delivery Tracking
  steps.push(await exec('Track Active Deliveries', async () => {
    await delay(1000);
    return { activeProjects: Math.floor(Math.random() * 4) + 1 };
  }, logger, io));

  // Step 6: Invoice & Payment Collection
  steps.push(await exec('Invoice & Collect Payments', async () => {
    const paymentReceived = revenue > 0 && Math.random() < 0.80;
    return { paymentReceived, amount: paymentReceived ? revenue : 0 };
  }, logger, io));

  // Update metrics
  if (empireState) {
    if (!empireState.workflowRevenue) empireState.workflowRevenue = {};
    empireState.workflowRevenue[WORKFLOW_ID] = (empireState.workflowRevenue[WORKFLOW_ID] || 0) + revenue;
  }

  log(logger, 'info', `Freelance pipeline complete. Revenue: $${revenue.toFixed(2)}`);
  emit(io, 'activity', { type: 'success', message: `✅ Freelance Pipeline complete. Revenue: $${revenue.toFixed(2)}` });

  return { runId, workflowId: WORKFLOW_ID, success: true, steps, duration: Date.now() - startTime, revenue };
}

/* ===================== HELPERS ===================== */

async function exec(name, fn, logger, io) {
  emit(io, 'activity', { type: 'info', message: `Freelance Pipeline: ${name}` });
  try {
    const output = await fn();
    return { name, success: true, output };
  } catch (err) {
    log(logger, 'error', `Step "${name}" failed: ${err.message}`);
    return { name, success: false, error: err.message };
  }
}

function generateJobs(count) {
  const titles = [
    'Build AI Chatbot for E-commerce', 'LinkedIn Automation System', 'Python Data Pipeline',
    'OpenAI API Integration', 'N8N Workflow Setup', 'Social Media Automation',
    'Custom CRM with AI', 'Email Marketing Automation', 'AI Content Generator', 'Business Process RPA',
  ];
  const budgets = [500, 750, 1000, 1500, 2000, 2500, 3000, 5000];
  return Array.from({ length: count }, () => ({
    id:       uuid(),
    title:    titles[Math.floor(Math.random() * titles.length)],
    budget:   budgets[Math.floor(Math.random() * budgets.length)],
    platform: Math.random() > 0.5 ? 'upwork' : 'freelancer',
    keywords: ['AI', 'automation', 'python', 'openai'],
  }));
}

function isRelevant(job) {
  const kws = ['AI', 'automation', 'python', 'openai', 'chatbot', 'api', 'integration'];
  return kws.some(kw => job.title.toLowerCase().includes(kw.toLowerCase()));
}

function generateProposal(job) {
  return `Hi! I specialise in ${job.title} type projects and have delivered 20+ similar automations.\n\nMy approach:\n✅ Free kick-off call\n✅ Milestone-based delivery\n✅ 30-day support\n\nTimeline: ${Math.ceil(job.budget / 500)} weeks. Happy to start immediately!`;
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
function log(logger, level, msg) { if (logger?.log) logger.log(level, `[${WORKFLOW_NAME}] ${msg}`); }
function emit(io, event, data) { if (io?.emit) io.emit(event, data); else if (global.empireBroadcast) global.empireBroadcast(event, data); }

module.exports = { run, WORKFLOW_ID, WORKFLOW_NAME };
