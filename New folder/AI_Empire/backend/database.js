/**
 * AI Empire – Database Layer (database.js)
 * Purpose: MongoDB connection management via Mongoose.
 * Provides models for Users, Revenue, Agents, Alerts, LearningLog.
 * Falls back to in-memory mode if MongoDB is unavailable.
 */

'use strict';

const mongoose = require('mongoose');

/* ===================== CONNECTION ===================== */
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ai_empire';
let connected   = false;

/**
 * Connect to MongoDB.
 * Non-fatal: if connection fails, empire runs in in-memory mode.
 */
async function connect() {
  if (connected) return;
  try {
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS:          45000,
    });
    connected = true;
    console.info('[DB] MongoDB connected:', MONGO_URI);

    mongoose.connection.on('error',       err  => console.error('[DB] Error:', err.message));
    mongoose.connection.on('disconnected',()   => { connected = false; console.warn('[DB] Disconnected'); });
    mongoose.connection.on('reconnected', ()   => { connected = true;  console.info('[DB] Reconnected'); });
  } catch (err) {
    console.warn('[DB] MongoDB unavailable – running in-memory mode.', err.message);
  }
}

/**
 * Gracefully close the MongoDB connection.
 */
async function disconnect() {
  if (connected) await mongoose.disconnect();
}

/* ===================== SCHEMAS & MODELS ===================== */

/* ---- User ---- */
const UserSchema = new mongoose.Schema({
  email:       { type: String, required: true, unique: true, lowercase: true, trim: true },
  password:    { type: String, required: true },     // bcrypt hash
  name:        { type: String, default: 'Empire Admin' },
  role:        { type: String, enum: ['admin', 'viewer'], default: 'admin' },
  refreshToken:{ type: String, default: null },
  createdAt:   { type: Date,   default: Date.now },
  lastLogin:   { type: Date,   default: null },
}, { timestamps: true });

const User = mongoose.models.User || mongoose.model('User', UserSchema);

/* ---- Revenue Event ---- */
const RevenueSchema = new mongoose.Schema({
  stream:      { type: String, required: true },      // e.g. 'linkedin', 'freelance'
  amount:      { type: Number, required: true },
  description: { type: String, default: '' },
  agentId:     { type: String, default: null },
  ts:          { type: Date,   default: Date.now },
}, { timestamps: true });

RevenueSchema.index({ stream: 1, ts: -1 });
const Revenue = mongoose.models.Revenue || mongoose.model('Revenue', RevenueSchema);

/* ---- Agent Log ---- */
const AgentLogSchema = new mongoose.Schema({
  agentId:   { type: String, required: true },
  level:     { type: String, enum: ['info', 'warn', 'error', 'debug'], default: 'info' },
  message:   { type: String, required: true },
  meta:      { type: mongoose.Schema.Types.Mixed, default: {} },
  ts:        { type: Date, default: Date.now },
}, { timestamps: false });

AgentLogSchema.index({ agentId: 1, ts: -1 });
const AgentLog = mongoose.models.AgentLog || mongoose.model('AgentLog', AgentLogSchema);

/* ---- Alert ---- */
const AlertSchema = new mongoose.Schema({
  id:        { type: String, required: true, unique: true },
  title:     { type: String, required: true },
  detail:    { type: String, default: '' },
  severity:  { type: String, enum: ['info', 'warning', 'critical'], default: 'info' },
  agentId:   { type: String, default: null },
  autoFixed: { type: Boolean, default: false },
  dismissed: { type: Boolean, default: false },
  ts:        { type: Date, default: Date.now },
}, { timestamps: true });

const Alert = mongoose.models.Alert || mongoose.model('Alert', AlertSchema);

/* ---- Learning Log ---- */
const LearningLogSchema = new mongoose.Schema({
  cycleId:    { type: String, required: true },
  sources:    [{ name: String, url: String, itemsScraped: Number }],
  insights:   [{ source: String, text: String }],
  strategies: [{ title: String, body: String }],
  duration:   { type: Number }, // ms
  ts:         { type: Date, default: Date.now },
}, { timestamps: false });

LearningLogSchema.index({ ts: -1 });
const LearningLog = mongoose.models.LearningLog || mongoose.model('LearningLog', LearningLogSchema);

/* ---- Workflow Run ---- */
const WorkflowRunSchema = new mongoose.Schema({
  workflowId: { type: String, required: true },
  status:     { type: String, enum: ['running', 'success', 'failed'], default: 'running' },
  revenueGen: { type: Number, default: 0 },
  steps:      [{ name: String, status: String, duration: Number, output: String }],
  error:      { type: String, default: null },
  startedAt:  { type: Date, default: Date.now },
  endedAt:    { type: Date, default: null },
}, { timestamps: false });

WorkflowRunSchema.index({ workflowId: 1, startedAt: -1 });
const WorkflowRun = mongoose.models.WorkflowRun || mongoose.model('WorkflowRun', WorkflowRunSchema);

/* ===================== REPOSITORY HELPERS ===================== */

/**
 * Save a revenue event to the database.
 * Silently fails if DB is not connected (in-memory mode handles it).
 */
async function saveRevenue(stream, amount, description, agentId = null) {
  if (!connected) return null;
  try {
    return await Revenue.create({ stream, amount, description, agentId });
  } catch (err) {
    console.warn('[DB] Failed to save revenue event:', err.message);
    return null;
  }
}

/**
 * Get revenue totals grouped by stream.
 * @param {Date} since - Start date filter
 */
async function getRevenueSummary(since = new Date(0)) {
  if (!connected) return null;
  try {
    return await Revenue.aggregate([
      { $match: { ts: { $gte: since } } },
      { $group: { _id: '$stream', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort:  { total: -1 } },
    ]);
  } catch (err) {
    console.warn('[DB] Revenue query failed:', err.message);
    return null;
  }
}

/**
 * Append a log line for a specific agent.
 */
async function logAgent(agentId, level, message, meta = {}) {
  if (!connected) return;
  try {
    await AgentLog.create({ agentId, level, message, meta });
  } catch { /* Silent */ }
}

/**
 * Get the last N log lines for an agent.
 */
async function getAgentLogs(agentId, limit = 100) {
  if (!connected) return [];
  try {
    const docs = await AgentLog.find({ agentId }).sort({ ts: -1 }).limit(limit).lean();
    return docs.reverse().map(d => `[${new Date(d.ts).toLocaleTimeString()}] [${d.level.toUpperCase()}] ${d.message}`);
  } catch {
    return [];
  }
}

/**
 * Persist an alert to the database.
 */
async function saveAlert(alert) {
  if (!connected) return;
  try {
    await Alert.create(alert);
  } catch { /* Silent */ }
}

/**
 * Mark an alert as dismissed.
 */
async function dismissAlert(alertId) {
  if (!connected) return;
  try {
    await Alert.updateOne({ id: alertId }, { dismissed: true });
  } catch { /* Silent */ }
}

/**
 * Save a learning cycle result.
 */
async function saveLearningLog(cycleData) {
  if (!connected) return;
  try {
    await LearningLog.create(cycleData);
  } catch { /* Silent */ }
}

/**
 * Save a workflow run record.
 */
async function saveWorkflowRun(data) {
  if (!connected) return null;
  try {
    return await WorkflowRun.create(data);
  } catch {
    return null;
  }
}

/**
 * Seed the default admin user if no users exist.
 * @param {string} passwordHash - bcrypt hash of the default password
 */
async function seedAdminUser(passwordHash) {
  if (!connected) return;
  try {
    const count = await User.countDocuments();
    if (count === 0) {
      await User.create({
        email:    'admin@empire.ai',
        password: passwordHash,
        name:     'Empire Admin',
        role:     'admin',
      });
      console.info('[DB] Default admin user seeded: admin@empire.ai');
    }
  } catch (err) {
    console.warn('[DB] Seed failed:', err.message);
  }
}

/* ===================== EXPORTS ===================== */
module.exports = {
  connect,
  disconnect,
  isConnected: () => connected,

  // Models
  User,
  Revenue,
  AgentLog,
  Alert,
  LearningLog,
  WorkflowRun,

  // Repository helpers
  saveRevenue,
  getRevenueSummary,
  logAgent,
  getAgentLogs,
  saveAlert,
  dismissAlert,
  saveLearningLog,
  saveWorkflowRun,
  seedAdminUser,
};
