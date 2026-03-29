/**
 * Agent Office Visualization
 * See AI agents as animated characters working in a virtual office (like The Sims)
 */

const AgentOffice = {
  agents: [
    { id: 'linkedin',           name: 'Alex',     role: '🎯 LinkedIn Scout',      color: '#0A66C2', x: 100, y: 150 },
    { id: 'freelance',          name: 'Maya',     role: '💼 Freelance Hustler',   color: '#1DBF63', x: 300, y: 150 },
    { id: 'social_media',       name: 'Jordan',   role: '📱 Content Creator',     color: '#E1306C', x: 500, y: 150 },
    { id: 'ai_development',     name: 'Sam',      role: '🤖 Builder',             color: '#FF6B6B', x: 700, y: 150 },
    { id: 'email_outreach',     name: 'Casey',    role: '✉️ Email Campaign',      color: '#4ECDC4', x: 900, y: 150 },
    { id: 'virtual_consultant', name: 'Taylor',   role: '💡 Consultant',          color: '#FFD93D', x: 100, y: 350 },
    { id: 'maintenance_bot',    name: 'Morgan',   role: '🔧 Maintenance',         color: '#95E1D3', x: 300, y: 350 },
  ],

  currentActivities: {},
  canvas: null,
  ctx: null,
  animationId: null,

  init() {
    const container = document.getElementById('view-agent-office');
    if (!container) return;

    // Create canvas
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1100;
    this.canvas.height = 500;
    this.canvas.style.border = '2px solid var(--border-color)';
    this.canvas.style.background = 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)';
    this.canvas.style.borderRadius = '8px';

    container.querySelector('.settings-card')?.insertAdjacentElement('afterend', this.canvas);
    this.ctx = this.canvas.getContext('2d');

    // Start animation
    this.animate();

    // Update activities from server
    this.pollActivities();
  },

  async pollActivities() {
    try {
      const res = await apiFetch('/api/empire/status');
      if (res?.agents) {
        res.agents.forEach(agent => {
          const agentDef = this.agents.find(a => a.id === agent.id);
          if (agentDef) {
            this.currentActivities[agent.id] = {
              status: agent.status || 'idle',
              action: agent.lastAction || 'Waiting...',
              tasksToday: agent.tasksToday || 0,
            };
          }
        });
      }
    } catch (err) {
      console.error('[AgentOffice] Poll error:', err.message);
    }
    setTimeout(() => this.pollActivities(), 3000);
  },

  animate() {
    this.draw();
    this.animationId = requestAnimationFrame(() => this.animate());
  },

  draw() {
    const ctx = this.ctx;
    const now = Date.now();

    // Clear canvas
    ctx.fillStyle = 'rgba(26, 26, 46, 0.1)';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw office grid background
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i < this.canvas.width; i += 100) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, this.canvas.height);
      ctx.stroke();
    }

    // Draw each agent
    this.agents.forEach(agent => {
      this.drawAgent(ctx, agent, now);
    });

    // Draw legend
    this.drawLegend(ctx);
  },

  drawAgent(ctx, agent, now) {
    const bobbing = Math.sin(now / 500) * 5; // Bobbing animation
    const y = agent.y + bobbing;
    const activity = this.currentActivities[agent.id] || { status: 'idle', action: 'Waiting...' };

    // Draw desk
    ctx.fillStyle = 'rgba(100, 100, 120, 0.3)';
    ctx.fillRect(agent.x - 40, y + 30, 80, 40);
    ctx.strokeStyle = agent.color;
    ctx.lineWidth = 2;
    ctx.strokeRect(agent.x - 40, y + 30, 80, 40);

    // Draw character (simple avatar)
    ctx.fillStyle = agent.color;
    // Head
    ctx.beginPath();
    ctx.arc(agent.x, y, 15, 0, Math.PI * 2);
    ctx.fill();
    // Body
    ctx.fillRect(agent.x - 12, y + 15, 24, 20);
    // Eyes
    ctx.fillStyle = '#fff';
    ctx.fillRect(agent.x - 6, y - 3, 3, 3);
    ctx.fillRect(agent.x + 3, y - 3, 3, 3);

    // Status indicator (pulsing dot)
    ctx.fillStyle = activity.status === 'running' ? '#00FF00' : '#FFAA00';
    ctx.beginPath();
    ctx.arc(agent.x, y - 25, 4 + Math.sin(Date.now() / 300) * 2, 0, Math.PI * 2);
    ctx.fill();

    // Agent info
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(agent.name, agent.x, y + 65);

    ctx.font = '10px Arial';
    ctx.fillStyle = agent.color;
    ctx.fillText(agent.role, agent.x, y + 80);

    // Current action
    ctx.font = '9px Arial';
    ctx.fillStyle = '#4ECDC4';
    const action = activity.action || 'Idle';
    ctx.fillText(action.substring(0, 20), agent.x, y + 95);

    // Task counter
    ctx.fillStyle = '#FFD93D';
    ctx.fillText(`Tasks: ${activity.tasksToday || 0}`, agent.x, y + 110);
  },

  drawLegend(ctx) {
    const y = 10;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(10, y, 250, 30);

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px Arial';
    ctx.fillText('🟢 Running  🟠 Idle  🟡 Working', 20, y + 22);
  },

  stop() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  },
};

// Auto-init when view becomes active
document.addEventListener('DOMContentLoaded', () => {
  const observer = new MutationObserver(() => {
    const officeView = document.getElementById('view-agent-office');
    if (officeView && officeView.classList.contains('active') && !AgentOffice.canvas) {
      AgentOffice.init();
    }
  });
  observer.observe(document.getElementById('main-content') || document.body, {
    attributes: true,
    subtree: true,
  });
});
