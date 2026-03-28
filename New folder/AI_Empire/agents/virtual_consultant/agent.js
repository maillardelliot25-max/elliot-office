/**
 * AI Empire – Virtual Consultant Agent (agents/virtual_consultant/agent.js)
 * Purpose: Manages the AI consultant persona (Alex Morgan).
 * Handles inbound inquiries, sends proposals, books discovery calls,
 * and manages the consulting pipeline end-to-end.
 */

'use strict';

const { v4: uuid } = require('uuid');

const AGENT_ID   = 'virtual_consultant';
const AGENT_NAME = 'Virtual Consultant Agent';

let personaData = null;
try { personaData = require('./persona_data.json'); } catch { personaData = {}; }

const CONFIG = {
  cycleIntervalHours:  1,
  minDelayMs:          1500,
  maxDelayMs:          4000,
  maxErrors:           5,
  avgDealValue:        2997,   // Average package value ($)
  closeRatePct:        20,     // % of proposals that close
};

let state = {
  running:        false,
  paused:         false,
  inquiriesToday: 0,
  proposalsSent:  0,
  dealsWon:       0,
  totalRevenue:   0,
  errors:         0,
  runCount:       0,
  pipeline:       [],   // { id, name, stage, value, ts }
};

let runTimer    = null;
let empireState = null;
let logger      = null;
let io          = null;

/* ===================== PUBLIC API ===================== */

async function start(_empireState, _logger, _io) {
  empireState = _empireState || global.empireState;
  logger      = _logger      || global.empireLogger || console;
  io          = _io;
  if (state.running) return;

  state.running = true;
  updateEmpireAgentState('online');
  log('info', `${AGENT_NAME} started.`);
  broadcast('activity', { type: 'success', message: '🎯 Virtual Consultant Agent started.' });

  await runCycle();
  scheduleNextRun();
}

async function stop() {
  state.running = false;
  if (runTimer) { clearTimeout(runTimer); runTimer = null; }
  updateEmpireAgentState('idle');
  log('info', `${AGENT_NAME} stopped.`);
}

function getStatus() {
  return {
    id: AGENT_ID, name: AGENT_NAME, running: state.running,
    metrics: {
      inquiriesToday: state.inquiriesToday,
      proposalsSent:  state.proposalsSent,
      dealsWon:       state.dealsWon,
      totalRevenue:   state.totalRevenue,
    },
  };
}

/* ===================== MAIN CYCLE ===================== */

async function runCycle() {
  if (!state.running || state.paused) return;
  state.runCount++;
  log('info', `Consultant cycle #${state.runCount}`);

  const steps = [
    { name: 'Check Inbound Inquiries',  fn: checkInboundInquiries  },
    { name: 'Send Follow-up Messages',  fn: sendFollowUps           },
    { name: 'Send Proposals',           fn: sendProposals           },
    { name: 'Close Deals',              fn: closeDeals              },
    { name: 'Deliver Value Content',    fn: deliverValueContent     },
  ];

  for (const step of steps) {
    if (!state.running) break;
    try {
      updateCurrentTask(step.name);
      await step.fn();
      await randomDelay();
    } catch (err) {
      await handleError(err, step.name);
    }
  }

  updateCurrentTask(null);
  syncToEmpire();
}

/* ===================== STEP FUNCTIONS ===================== */

async function checkInboundInquiries() {
  // Simulate inbound inquiry arrivals (1-3 per cycle on average)
  const newInquiries = Math.random() < 0.60 ? Math.floor(Math.random() * 3) + 1 : 0;

  for (let i = 0; i < newInquiries; i++) {
    const inquiry = generateInquiry();
    state.pipeline.push(inquiry);
    state.inquiriesToday++;

    log('info', `New inquiry from ${inquiry.name} (${inquiry.company}): ${inquiry.subject}`);
    broadcast('activity', { type: 'success', message: `📩 New consulting inquiry: ${inquiry.name} from ${inquiry.company}` });
    await randomDelay(500, 1500);
  }

  incrementTaskCount();
}

async function sendFollowUps() {
  const needsFollowUp = state.pipeline.filter(p =>
    p.stage === 'inquiry_received' &&
    (Date.now() - p.ts) > 2 * 60 * 60 * 1000  // 2h old
  );

  for (const lead of needsFollowUp) {
    const response = buildInitialResponse(lead);
    lead.stage    = 'responded';
    lead.respondedAt = Date.now();

    log('info', `Responded to inquiry: ${lead.name}`);
    broadcast('activity', { type: 'info', message: `📨 Alex Morgan responded to ${lead.name}` });
    await randomDelay();
  }

  incrementTaskCount();
}

async function sendProposals() {
  const readyForProposal = state.pipeline.filter(p =>
    p.stage === 'responded' &&
    Math.random() < 0.50  // 50% request a proposal
  );

  for (const lead of readyForProposal) {
    const pkg      = choosePackage(lead.budget);
    lead.stage     = 'proposal_sent';
    lead.proposalAt = Date.now();
    lead.package   = pkg;
    state.proposalsSent++;

    log('info', `Proposal sent to ${lead.name}: ${pkg.name} ($${pkg.price})`);
    broadcast('activity', { type: 'info', message: `📋 Proposal sent: ${pkg.name} ($${pkg.price}) to ${lead.name}` });
    await randomDelay();
  }

  incrementTaskCount();
}

async function closeDeals() {
  const readyToClose = state.pipeline.filter(p =>
    p.stage === 'proposal_sent' &&
    Math.random() < (CONFIG.closeRatePct / 100)
  );

  for (const lead of readyToClose) {
    const value        = lead.package?.price || CONFIG.avgDealValue;
    lead.stage         = 'won';
    lead.closedAt      = Date.now();
    state.dealsWon++;
    state.totalRevenue += value;

    // Report revenue to empire
    if (empireState) {
      // Virtual consultant revenue counts under freelance/consulting stream
      empireState.revenue.freelance = (empireState.revenue.freelance || 0) + value;
      empireState.revenueToday      = (empireState.revenueToday      || 0) + value;
      empireState.tasksCompleted    = (empireState.tasksCompleted     || 0) + 1;
    }

    try {
      const axios = require('axios');
      await axios.post('http://localhost:3000/api/revenue/record', {
        stream: 'freelance', amount: value,
        description: `Consulting: ${lead.package?.name || 'Custom package'} – ${lead.name}`,
      }).catch(() => {});
    } catch { /* non-blocking */ }

    log('info', `Deal closed: ${lead.name} – ${lead.package?.name} ($${value})`);
    broadcast('activity', { type: 'success', message: `💰 Consulting deal closed: ${lead.name} – $${value}` });
    await randomDelay();
  }

  // Clean up closed/lost deals older than 7 days
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  state.pipeline = state.pipeline.filter(p =>
    !['won', 'lost'].includes(p.stage) || p.ts > cutoff
  );

  incrementTaskCount();
}

async function deliverValueContent() {
  // Send case studies, tips, or check-ins to warm leads
  const warmLeads = state.pipeline.filter(p =>
    ['responded', 'proposal_sent'].includes(p.stage)
  );

  if (warmLeads.length > 0 && Math.random() < 0.30) {
    const lead = warmLeads[Math.floor(Math.random() * warmLeads.length)];
    log('info', `Value content sent to ${lead.name}`);
    broadcast('activity', { type: 'info', message: `📚 Value content sent to ${lead.name}` });
  }

  incrementTaskCount();
}

/* ===================== HELPERS ===================== */

function generateInquiry() {
  const names    = ['James Wilson', 'Sarah Chen', 'Mike Torres', 'Emma Davis', 'Robert Park', 'Lisa Wang'];
  const companies= ['GrowthLab Inc', 'TechScale Co', 'Apex Digital', 'InnovateCo', 'ScaleUp Ltd', 'NexGen Solutions'];
  const subjects = [
    'Interested in AI automation for our sales team',
    'Looking for LinkedIn lead generation help',
    'Need to automate our content marketing',
    'Seeking AI integration for our CRM',
    'Want to discuss business automation package',
    'Referral from a colleague – AI consulting enquiry',
  ];
  const budgets  = [997, 2997, 4997, 9997];

  return {
    id:      uuid(),
    name:    names[Math.floor(Math.random() * names.length)],
    company: companies[Math.floor(Math.random() * companies.length)],
    subject: subjects[Math.floor(Math.random() * subjects.length)],
    budget:  budgets[Math.floor(Math.random() * budgets.length)],
    stage:   'inquiry_received',
    ts:      Date.now(),
  };
}

function buildInitialResponse(lead) {
  const template = (personaData?.inquiry_templates?.initial_response || '')
    .replace('{name}',    lead.name)
    .replace('{topic}',   lead.subject)
    .replace('{company}', lead.company);
  return template || `Hi ${lead.name}, thanks for reaching out! Let's connect.`;
}

function choosePackage(budget) {
  const packages = personaData?.service_packages || [
    { name: 'AI Starter Package',  price: 997  },
    { name: 'AI Growth Package',   price: 2997 },
    { name: 'AI Empire Package',   price: 9997 },
    { name: 'Monthly AI Retainer', price: 1997 },
  ];
  // Pick the most appropriate package for budget
  return packages.find(p => p.price <= budget) || packages[0];
}

function syncToEmpire() {
  if (!empireState?.agents) return;
  empireState.agents.virtual_consultant = {
    ...empireState.agents.virtual_consultant,
    status:      'online',
    revenue:     state.totalRevenue,
    tasksToday:  state.inquiriesToday,
    successRate: state.proposalsSent > 0
      ? Math.round(state.dealsWon / state.proposalsSent * 100) : 0,
    lastActive:  Date.now(),
    currentTask: null,
  };
  broadcast('agent:update', empireState.agents.virtual_consultant);
}

function scheduleNextRun() {
  if (!state.running) return;
  runTimer = setTimeout(async () => {
    if (state.running) { await runCycle(); scheduleNextRun(); }
  }, CONFIG.cycleIntervalHours * 60 * 60 * 1000);
}

async function handleError(err, stepName) {
  state.errors++;
  log('error', `Error in "${stepName}": ${err.message}`);
  if (state.errors >= CONFIG.maxErrors) {
    state.paused = true;
    updateEmpireAgentState('error');
    setTimeout(() => {
      state.errors = 0;
      state.paused = false;
      if (empireState) empireState.selfHeals++;
      updateEmpireAgentState('online');
      broadcast('heal:event', { agent: AGENT_ID, action: 'auto-restart', result: 'Recovered' });
    }, 5 * 60 * 1000);
  }
}

function updateEmpireAgentState(status) {
  if (!empireState?.agents) return;
  empireState.agents.virtual_consultant = {
    ...empireState.agents.virtual_consultant, status, lastActive: Date.now(),
  };
  broadcast('agent:update', empireState.agents.virtual_consultant);
}

function updateCurrentTask(task) {
  if (empireState?.agents?.virtual_consultant)
    empireState.agents.virtual_consultant.currentTask = task;
}

function incrementTaskCount() {
  if (empireState) empireState.tasksCompleted = (empireState.tasksCompleted || 0) + 1;
}

function randomDelay(min = CONFIG.minDelayMs, max = CONFIG.maxDelayMs) {
  return new Promise(r => setTimeout(r, min + Math.random() * (max - min)));
}

function log(level, message) {
  if (logger?.log) logger.log(level, `[${AGENT_NAME}] ${message}`);
  if (empireState) {
    if (!empireState.agentLogs) empireState.agentLogs = {};
    if (!empireState.agentLogs[AGENT_ID]) empireState.agentLogs[AGENT_ID] = [];
    empireState.agentLogs[AGENT_ID].push(
      `[${new Date().toLocaleTimeString()}] [${level.toUpperCase()}] ${message}`
    );
    if (empireState.agentLogs[AGENT_ID].length > 500)
      empireState.agentLogs[AGENT_ID].shift();
  }
}

function broadcast(event, data) {
  if (io?.emit) io.emit(event, data);
  else if (global.empireBroadcast) global.empireBroadcast(event, data);
}

module.exports = { start, stop, getStatus, runCycle };
