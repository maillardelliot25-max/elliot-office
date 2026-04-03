const express = require('express');
const cors = require('cors');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.get('/socket.io.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'node_modules/socket.io/client-dist/socket.io.min.js'));
});

const agents = {
  'linkedin-01': { id: 'linkedin-01', name: 'LinkedIn Agent', status: 'online', revenue: 5200, tasks: 45 },
  'social-01': { id: 'social-01', name: 'Social Media Agent', status: 'online', revenue: 3800, tasks: 32 },
  'freelance-01': { id: 'freelance-01', name: 'Freelance Agent', status: 'online', revenue: 7100, tasks: 58 },
  'ai-dev-01': { id: 'ai-dev-01', name: 'AI Dev Agent', status: 'online', revenue: 9500, tasks: 72 },
  'email-01': { id: 'email-01', name: 'Email Agent', status: 'online', revenue: 2400, tasks: 28 },
  'consulting-01': { id: 'consulting-01', name: 'Consulting Agent', status: 'online', revenue: 6800, tasks: 41 }
};

app.get('/api/agents', (req, res) => res.json(Object.values(agents)));

app.post('/api/agents/:id/run', (req, res) => {
  const agent = agents[req.params.id];
  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  agent.tasks += Math.floor(Math.random() * 10) + 1;
  agent.revenue += Math.floor(Math.random() * 500) + 100;
  io.emit('agent-update', agent);
  res.json(agent);
});

io.on('connection', (socket) => {
  socket.emit('agents', Object.values(agents));
  socket.on('disconnect', () => {});
});

httpServer.listen(5000, () => console.log('🚀 Maillard AI server on port 5000'));
