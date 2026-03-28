/**
 * AI Empire – Dashboard Controller (dashboard.js)
 * Purpose: Main SPA controller. Handles view routing, real-time data polling,
 * chart rendering, agent controls, workflow management, and settings UI.
 * Communicates with backend via REST API and Socket.IO for live updates.
 */

'use strict';

/* ===================== CONSTANTS ===================== */
const API_BASE   = '/api';
const POLL_MS    = 8000;   // polling fallback interval (ms)
const CHART_PTS  = 24;     // data points in time-series charts

/* ===================== STATE ===================== */
let socket        = null;
let pollTimer     = null;
let uptimeStart   = Date.now();
let charts        = {};    // Chart.js instances keyed by canvas id
let empireState   = {
  agents:   [],
  tasks:    [],
  revenue:  { linkedin: 0, social_media: 0, freelance: 0, ai_development: 0 },
  alerts:   [],
  metrics:  {},
  autopilot: { running: true },
};

/* ===================== INIT ===================== */
/**
 * Called by login.js after successful authentication.
 * Bootstraps the dashboard: connects socket, starts polling, renders initial state.
 * @param {object} user - Logged-in user profile
 */
function initDashboard(user) {
  console.info('[Dashboard] Initialising for user:', user?.email);

  // Update avatar / user display
  const avatar = document.getElementById('user-avatar');
  if (avatar && user?.name) {
    avatar.textContent = user.name.substring(0, 2).toUpperCase();
    avatar.title       = user.email;
  }

  // Start uptime counter
  uptimeStart = Date.now();
  setInterval(updateUptimeDisplay, 60000);
  updateUptimeDisplay();

  // Connect real-time socket
  connectSocket();

  // Initial data fetch
  Dashboard.refresh();

  // Start polling fallback
  pollTimer = setInterval(Dashboard.refresh, POLL_MS);

  // Init charts
  initAllCharts();

  // Navigate to overview by default
  navigateTo('overview');

  console.info('[Dashboard] Ready.');
}

/* ===================== NAVIGATION ===================== */
/**
 * Switch to a named view section.
 * @param {string} viewName - e.g. 'overview', 'agents', 'revenue'
 */
function navigateTo(viewName) {
  // Hide all views
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));

  // Show target view
  const target = document.getElementById(`view-${viewName}`);
  if (target) target.classList.add('active');

  // Update sidebar active state
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.view === viewName);
  });

  // Load view-specific data
  switch (viewName) {
    case 'overview':   Dashboard.loadOverview();  break;
    case 'agents':     Dashboard.refreshAgents(); break;
    case 'autopilot':  Dashboard.loadAutopilot(); break;
    case 'workflows':  Dashboard.loadWorkflows(); break;
    case 'revenue':    Dashboard.loadRevenue();   break;
    case 'analytics':  Dashboard.loadAnalytics(); break;
    case 'learning':   Dashboard.loadLearning();  break;
    case 'alerts':     Dashboard.loadAlerts();    break;
    case 'settings':   Settings.load();           break;
  }
}

/* ===================== SOCKET.IO ===================== */
/**
 * Connect to the backend Socket.IO server for real-time events.
 * Falls back gracefully if Socket.IO is unavailable.
 */
function connectSocket() {
  try {
    socket = io({ path: '/socket.io', transports: ['websocket', 'polling'] });

    socket.on('connect', () => {
      console.info('[Socket] Connected:', socket.id);
      socket.emit('subscribe', { channels: ['empire', 'agents', 'revenue', 'alerts'] });
    });

    // Real-time agent status updates
    socket.on('agent:update', (data) => {
      updateAgentInState(data);
      renderAgentStatusCard(data);
    });

    // Real-time revenue tick
    socket.on('revenue:tick', (data) => {
      empireState.revenue = { ...empireState.revenue, ...data };
      updateRevenueDisplay();
    });

    // Live activity feed events
    socket.on('activity', (event) => {
      addActivityFeedItem(event);
    });

    // Alert notifications
    socket.on('alert:new', (alert) => {
      empireState.alerts.unshift(alert);
      updateAlertBadge();
      showToast(alert.message, alert.severity === 'critical' ? 'error' : 'warn');
    });

    // Autopilot status change
    socket.on('autopilot:status', (data) => {
      empireState.autopilot.running = data.running;
      updateAutopilotButton();
    });

    // Self-heal events
    socket.on('heal:event', (data) => {
      appendHealLog(data);
    });

    // Learning cycle completed
    socket.on('learning:complete', (data) => {
      updateKPI('kpi-learning', data.totalCycles);
      showToast('Learning cycle complete – strategy updated!', 'info');
    });

    socket.on('disconnect', () => {
      console.warn('[Socket] Disconnected – relying on polling fallback.');
    });

    socket.on('connect_error', (err) => {
      console.warn('[Socket] Connection error:', err.message);
    });

  } catch (err) {
    console.warn('[Socket] Socket.IO not available, using polling only.', err);
  }
}

/* ===================== API HELPERS ===================== */
/**
 * Authenticated fetch wrapper.
 * Automatically attaches the JWT Bearer token from session storage.
 * @param {string} path   - API path (e.g. '/api/empire/status')
 * @param {object} options - fetch options
 * @returns {Promise<any>} - Parsed JSON response
 */
async function apiFetch(path, options = {}) {
  const token = localStorage.getItem('empire_token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };
  const res = await fetch(path, { ...options, headers });
  if (res.status === 401) {
    showToast('Session expired – please log in again.', 'error');
    logout();
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: `HTTP ${res.status}` }));
    throw new Error(err.message);
  }
  return res.json();
}

/* ===================== DASHBOARD NAMESPACE ===================== */
const Dashboard = {

  /** Refresh all dashboard data. */
  async refresh() {
    await Promise.allSettled([
      Dashboard.loadOverview(),
    ]);
  },

  /* ---- OVERVIEW ---- */
  async loadOverview() {
    try {
      const status = await apiFetch(`${API_BASE}/empire/status`);
      empireState = { ...empireState, ...status };
      renderOverview(status);
    } catch (err) {
      console.warn('[Dashboard] Could not load empire status:', err.message);
      // Render demo data so UI is not empty
      renderOverview(getDemoStatus());
    }
  },

  /* ---- AGENTS ---- */
  async refreshAgents() {
    try {
      const agents = await apiFetch(`${API_BASE}/agents`);
      empireState.agents = agents;
      renderAgentsGrid(agents);
    } catch {
      renderAgentsGrid(getDemoAgents());
    }
  },

  async startAgent(agentId) {
    try {
      await apiFetch(`${API_BASE}/agents/${agentId}/start`, { method: 'POST' });
      showToast(`Agent ${agentId} started.`, 'success');
      Dashboard.refreshAgents();
    } catch (err) {
      showToast(`Failed to start agent: ${err.message}`, 'error');
    }
  },

  async stopAgent(agentId) {
    try {
      await apiFetch(`${API_BASE}/agents/${agentId}/stop`, { method: 'POST' });
      showToast(`Agent ${agentId} stopped.`, 'info');
      Dashboard.refreshAgents();
    } catch (err) {
      showToast(`Failed to stop agent: ${err.message}`, 'error');
    }
  },

  async restartAgent(agentId) {
    try {
      await apiFetch(`${API_BASE}/agents/${agentId}/restart`, { method: 'POST' });
      showToast(`Agent ${agentId} restarting…`, 'info');
      setTimeout(() => Dashboard.refreshAgents(), 2000);
    } catch (err) {
      showToast(`Failed to restart: ${err.message}`, 'error');
    }
  },

  /* ---- AUTOPILOT ---- */
  async loadAutopilot() {
    try {
      const data = await apiFetch(`${API_BASE}/autopilot/status`);
      renderTaskQueue(data.tasks   || getDemoTasks());
      renderScheduler(data.schedule || getDemoSchedule());
    } catch {
      renderTaskQueue(getDemoTasks());
      renderScheduler(getDemoSchedule());
    }
  },

  /* ---- WORKFLOWS ---- */
  async loadWorkflows() {
    try {
      const wfs = await apiFetch(`${API_BASE}/workflows`);
      renderWorkflowCards(wfs);
    } catch {
      renderWorkflowCards(getDemoWorkflows());
    }
  },

  async runWorkflow(workflowId) {
    try {
      await apiFetch(`${API_BASE}/workflows/${workflowId}/run`, { method: 'POST' });
      showToast(`Workflow ${workflowId} triggered.`, 'success');
    } catch (err) {
      showToast(`Workflow failed: ${err.message}`, 'error');
    }
  },

  /* ---- REVENUE ---- */
  async loadRevenue() {
    try {
      const rev = await apiFetch(`${API_BASE}/revenue/summary`);
      empireState.revenue = rev.streams;
      renderRevenueDetail(rev);
    } catch {
      renderRevenueDetail(getDemoRevenue());
    }
  },

  /* ---- ANALYTICS ---- */
  async loadAnalytics() {
    const range = document.getElementById('analytics-range')?.value || '7d';
    try {
      const data = await apiFetch(`${API_BASE}/analytics?range=${range}`);
      updateAnalyticsCharts(data);
    } catch {
      updateAnalyticsCharts(getDemoAnalytics());
    }
  },

  exportReport() {
    const range = document.getElementById('analytics-range')?.value || '7d';
    window.open(`${API_BASE}/analytics/export?range=${range}&format=csv`, '_blank');
    showToast('Report download started.', 'info');
  },

  /* ---- LEARNING ---- */
  async loadLearning() {
    try {
      const data = await apiFetch(`${API_BASE}/learning/status`);
      renderLearningPanel(data);
    } catch {
      renderLearningPanel(getDemoLearning());
    }
  },

  async triggerLearnCycle() {
    try {
      await apiFetch(`${API_BASE}/learning/trigger`, { method: 'POST' });
      showToast('Learning cycle started…', 'info');
      setTimeout(() => Dashboard.loadLearning(), 4000);
    } catch (err) {
      showToast(`Learn cycle error: ${err.message}`, 'error');
    }
  },

  /* ---- ALERTS ---- */
  async loadAlerts() {
    try {
      const data = await apiFetch(`${API_BASE}/alerts`);
      empireState.alerts = data.alerts;
      renderAlerts(data.alerts);
      renderHealLog(data.healLog);
      updateAlertBadge();
    } catch {
      renderAlerts([]);
      renderHealLog('No healing events recorded.');
    }
  },

  async dismissAlert(alertId) {
    try {
      await apiFetch(`${API_BASE}/alerts/${alertId}/dismiss`, { method: 'POST' });
      empireState.alerts = empireState.alerts.filter(a => a.id !== alertId);
      Dashboard.loadAlerts();
    } catch (err) {
      showToast(`Could not dismiss alert: ${err.message}`, 'error');
    }
  },
};

/* ===================== RENDER FUNCTIONS ===================== */

/** Render the full Overview section. */
function renderOverview(status) {
  // KPIs
  updateKPI('kpi-revenue',  formatMoney(status.totalRevenue || 0));
  updateKPI('kpi-agents',   `${status.activeAgents || 0} / ${status.totalAgents || 5}`);
  updateKPI('kpi-tasks',    status.tasksCompleted || 0);
  updateKPI('kpi-learning', status.learningCycles || 0);
  updateKPI('kpi-heals',    status.selfHeals || 0);
  updateKPI('kpi-api-calls', status.apiCalls || 0);

  setText('live-revenue', `Revenue: ${formatMoney(status.totalRevenue || 0)}`);
  setText('kpi-revenue-delta', `+${formatMoney(status.revenueToday || 0)} today`);

  // Agent status cards
  const grid = document.getElementById('agent-status-grid');
  if (grid && status.agents) {
    grid.innerHTML = '';
    status.agents.forEach(agent => {
      grid.innerHTML += buildAgentStatusCard(agent);
    });
  }

  // Update revenue overview chart
  if (charts['chart-revenue-overview'] && status.revenueHistory) {
    const c = charts['chart-revenue-overview'];
    c.data.labels   = status.revenueHistory.map(p => p.label);
    c.data.datasets[0].data = status.revenueHistory.map(p => p.value);
    c.update();
  }

  // Revenue pie chart
  if (charts['chart-revenue-pie'] && status.revenuePie) {
    const c = charts['chart-revenue-pie'];
    c.data.datasets[0].data = status.revenuePie;
    c.update();
  }
}

/** Render the full Agents grid (Agents view). */
function renderAgentsGrid(agents) {
  const grid = document.getElementById('agents-grid');
  if (!grid) return;
  grid.innerHTML = agents.map(buildAgentFullCard).join('');
}

/** Build HTML for a compact agent status card (overview). */
function buildAgentStatusCard(agent) {
  const stateClass = agent.status === 'online' ? 'online'
                   : agent.status === 'idle'   ? 'idle'
                   : agent.status === 'error'  ? 'error' : 'offline';
  return `
    <div class="agent-status-card ${stateClass}">
      <div class="agent-name">${agent.icon || '🤖'} ${agent.name}</div>
      <div class="agent-meta">Last active: ${agent.lastActive || 'never'}</div>
      <div class="agent-stat-row">
        <span>Tasks: <strong>${agent.tasksToday || 0}</strong></span>
        <span>Revenue: <strong>${formatMoney(agent.revenue || 0)}</strong></span>
      </div>
      <div class="agent-controls">
        <button class="btn btn-success" onclick="Dashboard.startAgent('${agent.id}')">Start</button>
        <button class="btn btn-ghost" onclick="Dashboard.stopAgent('${agent.id}')">Stop</button>
      </div>
    </div>
  `;
}

/** Build HTML for a full agent card (Agents view). */
function buildAgentFullCard(agent) {
  const tagClass = agent.status === 'online' ? 'tag-online'
                 : agent.status === 'idle'   ? 'tag-idle'   : 'tag-offline';
  const tagLabel = agent.status?.toUpperCase() || 'OFFLINE';

  return `
    <div class="agent-full-card">
      <div class="agent-header">
        <div class="agent-avatar">${agent.icon || '🤖'}</div>
        <div>
          <div class="agent-title">${agent.name}</div>
          <div class="agent-subtitle">${agent.description || ''}</div>
        </div>
        <span class="agent-tag ${tagClass}">${tagLabel}</span>
      </div>

      <div class="agent-stats-row">
        <div class="agent-stat"><div class="val">${agent.tasksToday || 0}</div><div class="lbl">Tasks/Day</div></div>
        <div class="agent-stat"><div class="val">${formatMoney(agent.revenue || 0)}</div><div class="lbl">Revenue</div></div>
        <div class="agent-stat"><div class="val">${agent.successRate || 0}%</div><div class="lbl">Success</div></div>
      </div>

      <div class="progress-bar"><div class="progress-fill" style="width:${agent.successRate || 0}%"></div></div>

      <div style="font-size:12px;color:var(--text-secondary)">
        ${agent.currentTask ? `⚙️ ${agent.currentTask}` : 'Idle – awaiting next task'}
      </div>

      <div class="agent-actions">
        <button class="btn btn-success" onclick="Dashboard.startAgent('${agent.id}')">▶ Start</button>
        <button class="btn btn-ghost"   onclick="Dashboard.stopAgent('${agent.id}')">⏹ Stop</button>
        <button class="btn btn-secondary" onclick="Dashboard.restartAgent('${agent.id}')">↻ Restart</button>
        <button class="btn btn-ghost" onclick="showAgentLogs('${agent.id}')">📋 Logs</button>
      </div>
    </div>
  `;
}

/** Render task queue in Autopilot view. */
function renderTaskQueue(tasks) {
  const el = document.getElementById('task-queue-list');
  if (!el) return;
  if (!tasks.length) { el.innerHTML = '<div style="color:var(--text-muted);font-size:12px">No pending tasks</div>'; return; }
  el.innerHTML = tasks.map(t => `
    <div class="task-item">
      <div class="task-priority prio-${t.priority || 'medium'}"></div>
      <div style="flex:1">
        <div style="font-weight:600;font-size:12px">${t.name}</div>
        <div style="font-size:11px;color:var(--text-muted)">${t.agent} · ${t.eta || 'soon'}</div>
      </div>
      <span style="font-size:11px;color:var(--text-secondary)">${t.status || 'queued'}</span>
    </div>
  `).join('');
}

/** Render scheduler in Autopilot view. */
function renderScheduler(schedule) {
  const el = document.getElementById('scheduler-list');
  if (!el) return;
  el.innerHTML = schedule.map(s => `
    <div class="task-item">
      <span style="font-size:16px">${s.icon || '⏰'}</span>
      <div style="flex:1">
        <div style="font-weight:600;font-size:12px">${s.name}</div>
        <div style="font-size:11px;color:var(--text-muted)">Next: ${s.nextRun || 'unknown'}</div>
      </div>
      <span style="font-size:11px;color:var(--accent)">${s.interval}</span>
    </div>
  `).join('');
}

/** Render workflow cards. */
function renderWorkflowCards(workflows) {
  const el = document.getElementById('workflow-cards');
  if (!el) return;
  el.innerHTML = workflows.map(w => `
    <div class="workflow-card">
      <div class="workflow-icon">${w.icon || '🔄'}</div>
      <div class="workflow-name">${w.name}</div>
      <div class="workflow-desc">${w.description || ''}</div>
      <div class="workflow-stats">
        <div class="wf-stat"><div class="val">${w.runsToday || 0}</div><div class="lbl">Runs/Day</div></div>
        <div class="wf-stat"><div class="val">${formatMoney(w.revenue || 0)}</div><div class="lbl">Revenue</div></div>
        <div class="wf-stat"><div class="val">${w.successRate || 0}%</div><div class="lbl">Success</div></div>
      </div>
      <div class="workflow-actions">
        <button class="btn btn-primary" onclick="Dashboard.runWorkflow('${w.id}')">▶ Run Now</button>
        <button class="btn btn-ghost" onclick="showWorkflowLogs('${w.id}')">📋 Logs</button>
      </div>
    </div>
  `).join('');
}

/** Update revenue display in Revenue view. */
function renderRevenueDetail(data) {
  const streams = data.streams || data;
  const total   = Object.values(streams).reduce((a, b) => a + (b || 0), 0);

  const setStream = (key, elemId) => {
    const amount = streams[key] || 0;
    const pct    = total > 0 ? (amount / total * 100).toFixed(1) : 0;
    setText(`rev-${elemId}-amount`, formatMoney(amount));
    const bar = document.getElementById(`rev-${elemId}-bar`);
    if (bar) bar.style.width = `${pct}%`;
  };

  setStream('linkedin',       'linkedin');
  setStream('social_media',   'social');
  setStream('freelance',      'freelance');
  setStream('ai_development', 'aidev');
}

/** Update revenue overview across all displays. */
function updateRevenueDisplay() {
  const total = Object.values(empireState.revenue).reduce((a, b) => a + (b || 0), 0);
  setText('live-revenue', `Revenue: ${formatMoney(total)}`);
  updateKPI('kpi-revenue', formatMoney(total));
}

/** Render learning panel. */
function renderLearningPanel(data) {
  // Knowledge sources
  const srcEl = document.getElementById('knowledge-sources-list');
  if (srcEl && data.sources) {
    srcEl.innerHTML = data.sources.map(s => `
      <div class="knowledge-source">
        <div><div class="ks-name">${s.name}</div><div class="ks-url">${s.url || ''}</div></div>
        <span style="color:var(--success);font-size:11px">${s.status || 'active'}</span>
      </div>
    `).join('');
  }

  // Recent insights
  const insEl = document.getElementById('insights-list');
  if (insEl && data.insights) {
    insEl.innerHTML = data.insights.map(i => `
      <div class="insight-item">
        <div class="insight-meta">${i.source} · ${i.time || ''}</div>
        ${i.text}
      </div>
    `).join('');
  }

  // Strategy updates
  const strEl = document.getElementById('strategy-updates-list');
  if (strEl && data.strategies) {
    strEl.innerHTML = data.strategies.map(s => `
      <div class="strategy-item">
        <div class="s-title">${s.title}</div>
        <div class="s-body">${s.body}</div>
      </div>
    `).join('');
  }
}

/** Render alerts list. */
function renderAlerts(alerts) {
  const el = document.getElementById('alerts-list');
  if (!el) return;
  if (!alerts.length) {
    el.innerHTML = '<div style="color:var(--text-muted);padding:16px">No alerts – all systems operational.</div>';
    return;
  }
  el.innerHTML = alerts.map(a => `
    <div class="alert-item ${a.severity || 'info'}">
      <div class="alert-icon">${a.icon || '🔔'}</div>
      <div class="alert-body">
        <div class="alert-title">${a.title}</div>
        <div class="alert-detail">${a.detail}</div>
        <div class="alert-time">${a.time || ''}</div>
        <div class="alert-actions">
          <button class="btn btn-ghost" onclick="Dashboard.dismissAlert('${a.id}')">Dismiss</button>
          ${a.autoFixed ? '<span class="text-success" style="font-size:12px">✓ Auto-fixed</span>' : ''}
        </div>
      </div>
    </div>
  `).join('');
}

/** Append text to heal log. */
function renderHealLog(log) {
  const el = document.getElementById('healing-log');
  if (!el) return;
  el.textContent = typeof log === 'string' ? log
    : log.map(e => `[${e.time}] ${e.agent} – ${e.action}: ${e.result}`).join('\n');
}

function appendHealLog(event) {
  const el = document.getElementById('healing-log');
  if (!el) return;
  if (el.textContent.startsWith('No self-healing')) el.textContent = '';
  el.textContent += `[${new Date().toLocaleTimeString()}] ${event.agent} – ${event.action}: ${event.result}\n`;
}

/* ===================== ACTIVITY FEED ===================== */
function addActivityFeedItem(event) {
  const feed = document.getElementById('activity-feed');
  if (!feed) return;

  // Remove placeholder
  const placeholder = feed.querySelector('.placeholder');
  if (placeholder) placeholder.remove();

  const item = document.createElement('div');
  item.className = `feed-item ${event.type || 'info'}`;
  item.innerHTML = `
    <span class="feed-time">${new Date().toLocaleTimeString()}</span>
    <span class="feed-msg">${event.message}</span>
  `;
  feed.insertBefore(item, feed.firstChild);

  // Cap feed at 50 items
  while (feed.children.length > 50) feed.removeChild(feed.lastChild);
}

/* ===================== AUTOPILOT TOGGLE ===================== */
function toggleAutopilot() {
  const running = empireState.autopilot.running;
  const action  = running ? 'pause' : 'resume';

  apiFetch(`${API_BASE}/autopilot/${action}`, { method: 'POST' })
    .then(() => {
      empireState.autopilot.running = !running;
      updateAutopilotButton();
      showToast(`Autopilot ${action}d.`, 'info');
    })
    .catch(err => showToast(`Autopilot toggle failed: ${err.message}`, 'error'));
}

function updateAutopilotButton() {
  const btn    = document.getElementById('btn-toggle-autopilot');
  const badge  = document.getElementById('empire-status');
  const running = empireState.autopilot.running;

  if (btn) btn.textContent = running ? '⏸ Pause Autopilot' : '▶ Resume Autopilot';
  if (badge) {
    badge.textContent = running ? 'AUTOPILOT: ON' : 'AUTOPILOT: PAUSED';
    badge.className   = `status-badge ${running ? 'running' : 'paused'}`;
  }
}

/* ===================== PRIORITY OVERRIDE ===================== */
async function submitPriorityOverride(e) {
  e.preventDefault();
  const agentId  = document.getElementById('priority-agent')?.value;
  const priority = parseInt(document.getElementById('priority-value')?.value || '5', 10);
  try {
    await apiFetch(`${API_BASE}/autopilot/priority`, {
      method: 'POST',
      body:   JSON.stringify({ agentId, priority }),
    });
    showToast(`Priority set for ${agentId}: ${priority}`, 'success');
  } catch (err) {
    showToast(`Priority update failed: ${err.message}`, 'error');
  }
}

/* ===================== CHART INITIALISATION ===================== */
function initAllCharts() {
  charts['chart-revenue-overview'] = newLineChart('chart-revenue-overview', 'Revenue ($)', '#00d4ff');
  charts['chart-revenue-pie']      = newPieChart('chart-revenue-pie',
    ['LinkedIn', 'Social', 'Freelance', 'AI Dev'],
    ['#00d4ff', '#00e676', '#ffc107', '#448aff']
  );
  charts['chart-revenue-detail']   = newLineChart('chart-revenue-detail', 'Revenue Detail ($)', '#00e676');
  charts['chart-tasks-over-time']  = newLineChart('chart-tasks-over-time', 'Tasks Completed', '#448aff');
  charts['chart-agent-performance']= newBarChart('chart-agent-performance', 'Agent Performance', '#7c3aed');
  charts['chart-api-calls']        = newLineChart('chart-api-calls', 'API Calls', '#ffc107');
  charts['chart-error-rate']       = newLineChart('chart-error-rate', 'Error Rate (%)', '#ff5252');
}

/** Create a Chart.js line chart. */
function newLineChart(canvasId, label, color) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;
  return new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: generateTimeLabels(CHART_PTS),
      datasets: [{
        label,
        data:            Array(CHART_PTS).fill(0),
        borderColor:     color,
        backgroundColor: color + '22',
        borderWidth:     2,
        pointRadius:     2,
        tension:         0.4,
        fill:            true,
      }],
    },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: '#8899aa', font: { size: 11 } } } },
      scales: {
        x: { ticks: { color: '#556677', font: { size: 10 } }, grid: { color: '#2a3a55' } },
        y: { ticks: { color: '#556677', font: { size: 10 } }, grid: { color: '#2a3a55' } },
      },
    },
  });
}

/** Create a Chart.js pie/doughnut chart. */
function newPieChart(canvasId, labels, colors) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;
  return new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data: Array(labels.length).fill(25), backgroundColor: colors, borderWidth: 0 }],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'bottom', labels: { color: '#8899aa', font: { size: 11 } } },
      },
      cutout: '65%',
    },
  });
}

/** Create a Chart.js bar chart. */
function newBarChart(canvasId, label, color) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;
  return new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: ['LinkedIn', 'Social', 'Freelance', 'AI Dev', 'Consultant'],
      datasets: [{ label, data: Array(5).fill(0), backgroundColor: color + '99', borderColor: color, borderWidth: 1 }],
    },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: '#8899aa', font: { size: 11 } } } },
      scales: {
        x: { ticks: { color: '#556677' }, grid: { color: '#2a3a55' } },
        y: { ticks: { color: '#556677' }, grid: { color: '#2a3a55' } },
      },
    },
  });
}

/** Update analytics charts with fresh data. */
function updateAnalyticsCharts(data) {
  const update = (id, labels, values) => {
    const c = charts[id];
    if (!c) return;
    if (labels) c.data.labels = labels;
    c.data.datasets[0].data = values;
    c.update();
  };

  if (data.tasksOverTime)     update('chart-tasks-over-time',  data.tasksOverTime.labels,  data.tasksOverTime.values);
  if (data.agentPerformance)  update('chart-agent-performance', null,                       data.agentPerformance);
  if (data.apiCalls)          update('chart-api-calls',         data.apiCalls.labels,       data.apiCalls.values);
  if (data.errorRate)         update('chart-error-rate',        data.errorRate.labels,      data.errorRate.values);
}

/* ===================== AGENT MODAL (LOGS) ===================== */
async function showAgentLogs(agentId) {
  openModal(`Agent Logs – ${agentId}`, '<div style="color:var(--text-muted)">Loading logs…</div>');
  try {
    const data = await apiFetch(`${API_BASE}/agents/${agentId}/logs`);
    const logHtml = `<pre class="log-panel" style="max-height:300px">${data.logs.join('\n')}</pre>`;
    document.getElementById('modal-body').innerHTML = logHtml;
  } catch {
    document.getElementById('modal-body').innerHTML = '<div class="text-muted">Could not load logs.</div>';
  }
}

async function showWorkflowLogs(wfId) {
  openModal(`Workflow Logs – ${wfId}`, '<div style="color:var(--text-muted)">Loading…</div>');
  try {
    const data = await apiFetch(`${API_BASE}/workflows/${wfId}/logs`);
    document.getElementById('modal-body').innerHTML = `<pre class="log-panel">${data.logs.join('\n')}</pre>`;
  } catch {
    document.getElementById('modal-body').innerHTML = '<div class="text-muted">Could not load logs.</div>';
  }
}

/* ===================== MODAL UTILS ===================== */
function openModal(title, bodyHtml) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHtml;
  document.getElementById('modal-overlay').classList.remove('hidden');
}
function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

/* ===================== TOAST ===================== */
/**
 * Display a transient toast notification.
 * @param {string} message
 * @param {'success'|'error'|'info'|'warn'} type
 */
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const icons = { success: '✅', error: '❌', info: 'ℹ️', warn: '⚠️' };
  const toast  = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${message}</span>`;
  container.appendChild(toast);

  // Auto-remove after 4s
  setTimeout(() => { toast.remove(); }, 4000);
}

/* ===================== SETTINGS NAMESPACE ===================== */
const Settings = {
  load() {
    // Load saved settings from backend or localStorage
    const saved = JSON.parse(localStorage.getItem('empire_settings') || '{}');
    if (saved.taskInterval) setVal('cfg-task-interval', saved.taskInterval);
    if (saved.maxAgents)    setVal('cfg-max-agents',    saved.maxAgents);
    if (saved.revTarget)    setVal('cfg-rev-target',    saved.revTarget);
    if (saved.healRetries)  setVal('cfg-heal-retries',  saved.healRetries);
  },

  async saveCredentials(e) {
    e.preventDefault();
    const creds = {
      openaiKey:      getVal('cfg-openai-key'),
      linkedinId:     getVal('cfg-linkedin-id'),
      linkedinSecret: getVal('cfg-linkedin-secret'),
      twitterToken:   getVal('cfg-twitter-token'),
      upworkKey:      getVal('cfg-upwork-key'),
    };
    try {
      await apiFetch(`${API_BASE}/settings/credentials`, { method: 'POST', body: JSON.stringify(creds) });
      showToast('Credentials saved securely.', 'success');
    } catch (err) {
      showToast(`Save failed: ${err.message}`, 'error');
    }
  },

  async saveAutopilot(e) {
    e.preventDefault();
    const cfg = {
      taskInterval: parseInt(getVal('cfg-task-interval') || '5'),
      maxAgents:    parseInt(getVal('cfg-max-agents')    || '5'),
      revTarget:    parseFloat(getVal('cfg-rev-target')  || '10000'),
      healRetries:  parseInt(getVal('cfg-heal-retries')  || '3'),
    };
    try {
      await apiFetch(`${API_BASE}/settings/autopilot`, { method: 'POST', body: JSON.stringify(cfg) });
      localStorage.setItem('empire_settings', JSON.stringify(cfg));
      showToast('Autopilot config saved.', 'success');
    } catch (err) {
      showToast(`Save failed: ${err.message}`, 'error');
    }
  },

  async saveWebhooks(e) {
    e.preventDefault();
    const hooks = {
      slack:   getVal('cfg-slack-webhook'),
      discord: getVal('cfg-discord-webhook'),
      email:   getVal('cfg-alert-email'),
    };
    try {
      await apiFetch(`${API_BASE}/settings/webhooks`, { method: 'POST', body: JSON.stringify(hooks) });
      showToast('Webhooks saved.', 'success');
    } catch (err) {
      showToast(`Save failed: ${err.message}`, 'error');
    }
  },
};

/* ===================== ALERT BADGE ===================== */
function updateAlertBadge() {
  const badge = document.getElementById('badge-alerts');
  const count = empireState.alerts.length;
  if (badge) {
    badge.textContent = count;
    badge.style.display = count > 0 ? 'inline-block' : 'none';
  }
}

/* ===================== UPTIME COUNTER ===================== */
function updateUptimeDisplay() {
  const el = document.getElementById('uptime-counter');
  if (!el) return;
  const ms      = Date.now() - uptimeStart;
  const minutes = Math.floor(ms / 60000);
  const hours   = Math.floor(minutes / 60);
  const days    = Math.floor(hours / 24);
  el.textContent = `${days}d ${hours % 24}h ${minutes % 60}m`;
}

/* ===================== AGENT STATE HELPERS ===================== */
function updateAgentInState(agent) {
  const idx = empireState.agents.findIndex(a => a.id === agent.id);
  if (idx >= 0) empireState.agents[idx] = { ...empireState.agents[idx], ...agent };
  else empireState.agents.push(agent);
}

function renderAgentStatusCard(agent) {
  const existing = document.querySelector(`[data-agent-id="${agent.id}"]`);
  if (existing) {
    const stateClass = agent.status === 'online' ? 'online'
                     : agent.status === 'idle'   ? 'idle'
                     : agent.status === 'error'  ? 'error' : 'offline';
    existing.className = `agent-status-card ${stateClass}`;
  }
}

/* ===================== DOM UTILS ===================== */
function updateKPI(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}
function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}
function getVal(id) {
  const el = document.getElementById(id);
  return el ? el.value : '';
}
function setVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}

/* ===================== FORMAT HELPERS ===================== */
function formatMoney(amount) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(amount);
}
function generateTimeLabels(n) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.now() - (n - 1 - i) * 3600000);
    return d.getHours() + ':00';
  });
}

/* ===================== DEMO DATA (offline/dev fallback) ===================== */
function getDemoStatus() {
  return {
    totalRevenue:   3842.50, revenueToday:  245.80,
    activeAgents:   4,       totalAgents:   5,
    tasksCompleted: 1240,    learningCycles: 18,
    selfHeals:      7,       apiCalls:       8820,
    agents: getDemoAgents(),
    revenueHistory: Array.from({length:24},(_,i)=>({ label:`${i}:00`, value: Math.random()*200+50 })),
    revenuePie: [1200, 900, 1100, 642],
  };
}

function getDemoAgents() {
  return [
    { id:'linkedin',       name:'LinkedIn Outreach', icon:'💼', status:'online', tasksToday:42, revenue:1200, successRate:91, description:'Automated connection & outreach',  currentTask:'Sending connection requests' },
    { id:'social_media',   name:'Social Media',      icon:'📱', status:'online', tasksToday:88, revenue:900,  successRate:87, description:'Multi-platform content posting',  currentTask:'Scheduling Twitter posts' },
    { id:'freelance',      name:'Freelance Services',icon:'🛠️', status:'online', tasksToday:15, revenue:1100, successRate:95, description:'Upwork/Fiverr bid automation',    currentTask:'Bidding on projects' },
    { id:'ai_development', name:'AI Development',    icon:'🧬', status:'idle',   tasksToday:8,  revenue:642,  successRate:99, description:'AI app & tool generation',        currentTask: null },
    { id:'virtual_consultant', name:'Virtual Consultant', icon:'🎯', status:'online', tasksToday:22, revenue:0, successRate:82, description:'Consultant persona management', currentTask:'Replying to inquiries' },
  ];
}

function getDemoTasks() {
  return [
    { name:'LinkedIn Morning Outreach', agent:'LinkedIn', priority:'high',   eta:'2 min',  status:'running' },
    { name:'Social Media Post Batch',   agent:'Social',   priority:'medium', eta:'5 min',  status:'queued'  },
    { name:'Upwork Bid Scan',           agent:'Freelance',priority:'high',   eta:'3 min',  status:'queued'  },
    { name:'Learning Cycle',            agent:'Engine',   priority:'low',    eta:'15 min', status:'scheduled'},
    { name:'Revenue Report Gen',        agent:'Analytics',priority:'low',    eta:'1 hr',   status:'scheduled'},
  ];
}

function getDemoSchedule() {
  return [
    { name:'LinkedIn Outreach', icon:'💼', interval:'Every 2h',  nextRun:'in 45 min'  },
    { name:'Social Posts',      icon:'📱', interval:'Every 4h',  nextRun:'in 1h 20m'  },
    { name:'Freelance Bids',    icon:'🛠️', interval:'Every 3h',  nextRun:'in 2h 5m'   },
    { name:'Learning Cycle',    icon:'🧠', interval:'Every 6h',  nextRun:'in 4h 10m'  },
    { name:'Health Check',      icon:'💊', interval:'Every 30m', nextRun:'in 12 min'  },
  ];
}

function getDemoWorkflows() {
  return [
    { id:'linkedin_pipeline',    icon:'💼', name:'LinkedIn Pipeline',    description:'End-to-end LinkedIn outreach & conversion.', runsToday:12, revenue:1200, successRate:91 },
    { id:'social_media_pipeline',icon:'📱', name:'Social Media Pipeline',description:'Multi-platform posting and engagement.', runsToday:24, revenue:900, successRate:87  },
    { id:'freelance_pipeline',   icon:'🛠️', name:'Freelance Pipeline',   description:'Automated bidding on Upwork & Fiverr.', runsToday:8, revenue:1100, successRate:95   },
    { id:'ai_dev_pipeline',      icon:'🧬', name:'AI Dev Pipeline',       description:'AI tool generation and deployment.', runsToday:4, revenue:642, successRate:99       },
  ];
}

function getDemoRevenue() {
  return { streams: { linkedin: 1200, social_media: 900, freelance: 1100, ai_development: 642 } };
}

function getDemoAnalytics() {
  const labels = generateTimeLabels(24);
  const rnd = n => Array.from({length:n}, ()=>Math.floor(Math.random()*100));
  return {
    tasksOverTime:    { labels, values: rnd(24) },
    agentPerformance: [91, 87, 95, 99, 82],
    apiCalls:         { labels, values: rnd(24).map(v=>v*10) },
    errorRate:        { labels, values: rnd(24).map(v=>v%10) },
  };
}

function getDemoLearning() {
  return {
    sources: [
      { name:'AI News Feed',     url:'https://news.ycombinator.com', status:'active' },
      { name:'LinkedIn Trends',  url:'https://linkedin.com',          status:'active' },
      { name:'Upwork Insights',  url:'https://upwork.com',            status:'active' },
      { name:'Reddit r/AI',      url:'https://reddit.com/r/artificial', status:'active' },
    ],
    insights: [
      { source:'HN',      time:'2 min ago', text:'GPT-5 announced – update AI dev pitches.'       },
      { source:'LinkedIn',time:'1h ago',    text:'Demand for AI consultants +34% this quarter.'   },
      { source:'Upwork',  time:'3h ago',    text:'New high-budget AI automation projects listed.'  },
    ],
    strategies: [
      { title:'LinkedIn CTA Update', body:'Replace "Let\'s connect" with "Open to AI consulting?" – +12% acceptance.' },
      { title:'Pricing Increase',    body:'Freelance market rates up 18% – raise Upwork bid floor to $85/hr.'          },
    ],
  };
}
