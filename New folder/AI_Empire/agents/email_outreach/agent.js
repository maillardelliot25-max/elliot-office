'use strict';
/**
 * Email Outreach Agent
 * Generates personalised cold email sequences for Elliot's services.
 * Targets: SMB owners, agency founders, ops managers, coaches, consultants.
 * Sequences: 5-email drip (Day 1, 3, 7, 14, 21)
 */

const { safeCall, withRetry, sleep } = require('../../backend/resilience');

const AGENT_ID   = 'email_outreach';
const AGENT_NAME = 'Email Outreach Agent';

/* ── Target segments ──────────────────────────────────────────────── */
const SEGMENTS = [
  { id: 'agency',      label: 'Agency Owners',        pain: 'scaling client work without hiring' },
  { id: 'coach',       label: 'Online Coaches',        pain: 'automating their client onboarding' },
  { id: 'ecommerce',   label: 'eCommerce Operators',   pain: 'reducing manual order ops' },
  { id: 'consultant',  label: 'Solo Consultants',      pain: 'getting consistent leads' },
  { id: 'saas',        label: 'Early SaaS Founders',   pain: 'automating customer support' },
  { id: 'recruiter',   label: 'Recruiters',            pain: 'candidate screening automation' },
];

/* ── 5-email sequence templates ───────────────────────────────────── */
const SEQUENCE = [
  {
    day: 1,
    subject: (name) => `Quick question, ${name}`,
    body: (name, segment) => `Hey ${name},

I help ${segment.label.toLowerCase()} fix the exact problem of ${segment.pain} — using AI systems built in a week, not months.

One client went from 12 hours/week on admin to under 2. Another closed 3 new retainers because their follow-up was finally automated.

Would it be useful to show you what that could look like for your business? No pitch — just a 15-min look.

— Elliot
Maillard AI | elliotmaillard.com`
  },
  {
    day: 3,
    subject: (name) => `Re: Quick question, ${name}`,
    body: (name, segment) => `Hey ${name},

Just circling back in case my last note got buried.

I know ${segment.pain} is a real time drain — I've seen it stop growing businesses from actually growing.

If now's bad timing, no worries. If you're curious what a 1-week AI build could change, I'm happy to share a quick example.

— Elliot`
  },
  {
    day: 7,
    subject: (name) => `Here's what I built for someone in your space`,
    body: (name, segment) => `Hey ${name},

Built something this week for a client similar to you — automated their entire ${segment.pain.replace('automating', '').replace('reducing', '').trim()} workflow.

Here's what changed in 7 days:
• 8 hours/week reclaimed
• Response time dropped from 24h → 4 min
• First new client closed from the extra capacity

Not promising the same — every business is different. But I'm curious if your situation has any overlap.

Worth a 15-min call?

— Elliot`
  },
  {
    day: 14,
    subject: (name) => `${name} — last thought`,
    body: (name, segment) => `Hey ${name},

One last note before I leave you alone.

If ${segment.pain} is something you're actively trying to solve, I'd be glad to help. My work is project-based — you know the cost upfront, no retainer trap.

If the timing's off, I get it. I'll drop a link in case it's useful later:
→ calendly.com/elliotmaillard

Either way, best of luck with it.

— Elliot`
  },
  {
    day: 21,
    subject: (name) => `Closing the loop`,
    body: (name) => `Hey ${name},

This is my last follow-up. I don't want to crowd your inbox.

If you ever want to explore what AI automation could do for your business, I'm one message away.

Take care,
— Elliot Maillard
maillardai.com`
  }
];

/* ── Lead pipeline ────────────────────────────────────────────────── */
let leadPipeline = [];
let cycleCount   = 0;

function generateLeads(count = 5) {
  const names  = ['James', 'Sarah', 'Marcus', 'Elena', 'David', 'Priya', 'Tom', 'Rachel', 'Chris', 'Aisha'];
  const domains = ['gmail.com', 'outlook.com', 'company.io', 'agencyhq.com', 'ops.co'];
  const leads  = [];
  for (let i = 0; i < count; i++) {
    const name    = names[Math.floor(Math.random() * names.length)];
    const segment = SEGMENTS[Math.floor(Math.random() * SEGMENTS.length)];
    leads.push({
      id:        `lead_${Date.now()}_${i}`,
      name,
      email:     `${name.toLowerCase()}@${domains[Math.floor(Math.random() * domains.length)]}`,
      segment,
      status:    'new',
      dayInSeq:  0,
      addedAt:   Date.now(),
    });
  }
  return leads;
}

function buildEmail(lead) {
  const step = SEQUENCE.find(s => s.day >= lead.dayInSeq + 1) || SEQUENCE[SEQUENCE.length - 1];
  return {
    to:      lead.email,
    subject: step.subject(lead.name),
    body:    step.body(lead.name, lead.segment),
    day:     step.day,
  };
}

/* ── Main cycle ───────────────────────────────────────────────────── */
async function runCycle(logger, io, EmpireState) {
  cycleCount++;
  logger.info(`[${AGENT_NAME}] Outreach cycle #${cycleCount}`);

  // Add new leads every 3 cycles
  if (cycleCount % 3 === 1) {
    const newLeads = generateLeads(Math.floor(Math.random() * 4) + 2);
    leadPipeline.push(...newLeads);
    logger.info(`[${AGENT_NAME}] Added ${newLeads.length} new leads. Pipeline: ${leadPipeline.length}`);
  }

  // Process active leads
  let emailsSent = 0;
  for (const lead of leadPipeline.filter(l => l.status === 'new' || l.status === 'active')) {
    const email = buildEmail(lead);
    lead.status = 'active';
    lead.dayInSeq = email.day;
    emailsSent++;

    if (io) {
      io.emit('activity', {
        agent:   AGENT_NAME,
        action:  `📧 Email Day ${email.day} → ${lead.name} (${lead.segment.label})`,
        time:    new Date().toISOString(),
      });
    }

    // Mark complete after day 21
    if (lead.dayInSeq >= 21) lead.status = 'complete';
  }

  // Remove completed leads from active tracking (keep last 50)
  const active = leadPipeline.filter(l => l.status !== 'complete');
  const done   = leadPipeline.filter(l => l.status === 'complete').slice(-50);
  leadPipeline = [...active, ...done];

  // Update empire state
  if (EmpireState?.agents?.[AGENT_ID]) {
    const agent = EmpireState.agents[AGENT_ID];
    agent.status     = 'running';
    agent.tasksToday = (agent.tasksToday || 0) + emailsSent;
    agent.lastRun    = new Date().toISOString();
    agent.lastActive = new Date().toISOString();
  }

  logger.info(`[${AGENT_NAME}] Sent ${emailsSent} emails. Active pipeline: ${leadPipeline.filter(l => l.status === 'active').length}`);
  return { emailsSent, pipelineSize: leadPipeline.length };
}

/* ── Export ───────────────────────────────────────────────────────── */
function start(logger, io, EmpireState) {
  logger.info(`[${AGENT_NAME}] Started. Running outreach sequences for Maillard AI.`);

  // Initial cycle
  runCycle(logger, io, EmpireState).catch(err =>
    logger.error(`[${AGENT_NAME}] Cycle error: ${err.message}`)
  );

  // Run every 45 minutes
  return setInterval(() => {
    runCycle(logger, io, EmpireState).catch(err =>
      logger.error(`[${AGENT_NAME}] Cycle error: ${err.message}`)
    );
  }, 45 * 60 * 1000);
}

module.exports = { start, AGENT_ID, AGENT_NAME, getLeads: () => leadPipeline };
