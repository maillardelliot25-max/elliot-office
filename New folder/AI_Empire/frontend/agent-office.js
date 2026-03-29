/**
 * Agent Office Visualization — See Your AI Team Work
 * 7 animated characters in a virtual office. Real-time status updates.
 */

const AgentOffice = {
  agents: [
    { id: 'linkedin',           name: '👨 Alex',     role: '🎯 LinkedIn Scout',      emoji: '👨', color: '#0A66C2' },
    { id: 'freelance',          name: '👩 Maya',     role: '💼 Freelance Hustler',   emoji: '👩', color: '#1DBF63' },
    { id: 'social_media',       name: '🧑 Jordan',   role: '📱 Content Creator',     emoji: '🧑', color: '#E1306C' },
    { id: 'ai_development',     name: '👨‍💼 Sam',      role: '🤖 AI Builder',          emoji: '👨‍💼', color: '#FF6B6B' },
    { id: 'email_outreach',     name: '👩‍💼 Casey',    role: '✉️ Email Campaign',      emoji: '👩‍💼', color: '#4ECDC4' },
    { id: 'virtual_consultant', name: '🧑‍💼 Taylor',   role: '💡 Consultant',          emoji: '🧑‍💼', color: '#FFD93D' },
    { id: 'maintenance_bot',    name: '🤖 Morgan',   role: '🔧 System Monitor',      emoji: '🤖', color: '#95E1D3' },
  ],

  currentActivities: {},
  container: null,

  init() {
    const view = document.getElementById('view-agent-office');
    if (!view || this.container) return;

    // Create office container
    this.container = document.createElement('div');
    this.container.id = 'office-grid';
    this.container.style.cssText = `
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1.5rem;
      padding: 2rem;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      border-radius: 12px;
      margin-top: 1.5rem;
    `;

    // Create card for each agent
    this.agents.forEach(agent => {
      const card = document.createElement('div');
      card.id = `agent-${agent.id}`;
      card.className = 'agent-card';
      card.style.cssText = `
        background: rgba(${this.hexToRgb(agent.color)}, 0.15);
        border: 2px solid ${agent.color};
        border-radius: 12px;
        padding: 1.5rem;
        text-align: center;
        position: relative;
        animation: pulse 2s ease-in-out infinite;
      `;
      card.innerHTML = `
        <div style="font-size: 4rem; margin-bottom: 0.5rem;">${agent.emoji}</div>
        <h3 style="color: ${agent.color}; margin: 0.5rem 0; font-size: 1.1rem;">${agent.name}</h3>
        <p style="color: var(--text-muted); margin: 0.25rem 0; font-size: 0.9rem;">${agent.role}</p>
        <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid ${agent.color}40;">
          <div style="color: var(--text-secondary); font-size: 0.85rem; margin: 0.5rem 0;">
            <span id="status-${agent.id}" style="color: #FFAA00;">⚙️ Initializing...</span>
          </div>
          <div style="color: var(--text-secondary); font-size: 0.85rem; margin: 0.5rem 0;">
            Tasks: <span id="tasks-${agent.id}" style="color: #FFD93D; font-weight: bold;">0</span>
          </div>
          <div id="action-${agent.id}" style="color: #4ECDC4; font-size: 0.8rem; margin-top: 0.75rem; min-height: 1.5rem; font-style: italic;"></div>
        </div>
      `;
      this.container.appendChild(card);
    });

    // Add CSS animation
    if (!document.getElementById('agent-office-styles')) {
      const style = document.createElement('style');
      style.id = 'agent-office-styles';
      style.textContent = `
        @keyframes pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(79, 205, 196, 0.3); }
          50% { box-shadow: 0 0 20px 5px rgba(79, 205, 196, 0.1); }
        }
        .agent-card {
          transition: transform 0.3s ease, box-shadow 0.3s ease;
        }
        .agent-card:hover {
          transform: translateY(-5px);
          box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        }
      `;
      document.head.appendChild(style);
    }

    const settingsCard = view.querySelector('.settings-card');
    if (settingsCard) {
      settingsCard.parentNode.insertBefore(this.container, settingsCard.nextSibling);
    } else {
      view.appendChild(this.container);
    }

    // Poll for updates
    this.pollActivities();
  },

  hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '79, 205, 196';
  },

  async pollActivities() {
    try {
      const res = await apiFetch('/api/empire/status');
      if (res?.agents) {
        res.agents.forEach(agent => {
          const statusEl = document.getElementById(`status-${agent.id}`);
          const tasksEl = document.getElementById(`tasks-${agent.id}`);
          const actionEl = document.getElementById(`action-${agent.id}`);

          if (statusEl) {
            if (agent.status === 'running') {
              statusEl.textContent = '🟢 Working';
              statusEl.style.color = '#00FF00';
            } else if (agent.status === 'idle') {
              statusEl.textContent = '🟠 Idle';
              statusEl.style.color = '#FFAA00';
            } else {
              statusEl.textContent = '🔴 Offline';
              statusEl.style.color = '#FF6B6B';
            }
          }

          if (tasksEl) {
            tasksEl.textContent = agent.tasksToday || 0;
          }

          if (actionEl) {
            const actions = [
              'Finding leads...',
              'Creating content...',
              'Building products...',
              'Sending emails...',
              'Analyzing data...',
              'Running workflows...',
              'Checking health...'
            ];
            actionEl.textContent = actions[Math.floor(Math.random() * actions.length)];
          }
        });
      }
    } catch (err) {
      console.error('[AgentOffice] Poll error:', err.message);
    }
    setTimeout(() => this.pollActivities(), 4000); // Update every 4 seconds
  },

  stop() {
    // Cleanup if needed
  },
};

// Auto-init when the Agent Office view is displayed
document.addEventListener('click', (e) => {
  const navItem = e.target.closest('[data-view="agent-office"]');
  if (navItem && !AgentOffice.container) {
    setTimeout(() => AgentOffice.init(), 100);
  }
});

// Also init on page load if already active
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('view-agent-office')?.classList.contains('active')) {
    setTimeout(() => AgentOffice.init(), 100);
  }
});
