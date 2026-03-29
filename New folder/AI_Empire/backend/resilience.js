'use strict';
/**
 * resilience.js — Auto-retry, circuit-breaker, and crash recovery
 * Wraps all outbound calls so a single failure never kills the system.
 */

const logger = require('./logger');   // lightweight logger re-export

/* ─── Exponential back-off retry ──────────────────────────────────── */
async function withRetry(fn, { retries = 3, baseDelay = 500, label = 'op' } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const delay = baseDelay * Math.pow(2, attempt - 1);          // 500 → 1000 → 2000
      logger.warn(`[Resilience] ${label} failed (attempt ${attempt}/${retries}): ${err.message}. Retry in ${delay}ms`);
      await sleep(delay);
    }
  }
  logger.error(`[Resilience] ${label} permanently failed after ${retries} attempts.`);
  throw lastErr;
}

/* ─── Circuit breaker ─────────────────────────────────────────────── */
class CircuitBreaker {
  constructor({ threshold = 5, cooldown = 30000, label = 'service' } = {}) {
    this.label     = label;
    this.threshold = threshold;   // failures before open
    this.cooldown  = cooldown;    // ms before half-open
    this.failures  = 0;
    this.state     = 'CLOSED';   // CLOSED | OPEN | HALF_OPEN
    this.openedAt  = null;
  }

  async call(fn) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.openedAt > this.cooldown) {
        this.state = 'HALF_OPEN';
        logger.info(`[CircuitBreaker:${this.label}] Half-open — testing…`);
      } else {
        throw new Error(`[CircuitBreaker:${this.label}] Circuit is OPEN — request blocked`);
      }
    }
    try {
      const result = await fn();
      this._onSuccess();
      return result;
    } catch (err) {
      this._onFailure();
      throw err;
    }
  }

  _onSuccess() {
    this.failures = 0;
    if (this.state !== 'CLOSED') {
      logger.info(`[CircuitBreaker:${this.label}] Recovered → CLOSED`);
      this.state = 'CLOSED';
    }
  }

  _onFailure() {
    this.failures++;
    if (this.failures >= this.threshold) {
      this.state    = 'OPEN';
      this.openedAt = Date.now();
      logger.error(`[CircuitBreaker:${this.label}] OPEN after ${this.failures} failures. Cooling down ${this.cooldown / 1000}s`);
    }
  }

  get status() { return this.state; }
}

/* ─── Safe async wrapper (never throws, returns { ok, data, error }) ─ */
async function safeCall(fn, label = 'call') {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (err) {
    logger.error(`[SafeCall] ${label} error: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

/* ─── Process-level crash shield ──────────────────────────────────── */
function installCrashShield(restartFn) {
  process.on('uncaughtException', (err) => {
    logger.error(`[CrashShield] Uncaught exception: ${err.message}`);
    if (restartFn) restartFn(err);
  });
  process.on('unhandledRejection', (reason) => {
    logger.error(`[CrashShield] Unhandled rejection: ${reason}`);
    if (restartFn) restartFn(reason);
  });
}

/* ─── Agent watchdog — restarts dead agent loops ─────────────────── */
function watchAgent(name, startFn, intervalMs = 60000) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await startFn();
    } catch (err) {
      logger.error(`[Watchdog:${name}] Crashed: ${err.message}. Restarting in ${intervalMs / 1000}s`);
    } finally {
      running = false;
    }
  };
  tick();
  return setInterval(tick, intervalMs);
}

/* ─── Helpers ─────────────────────────────────────────────────────── */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

module.exports = { withRetry, CircuitBreaker, safeCall, installCrashShield, watchAgent, sleep };
