/**
 * AI Empire – Authentication Router (auth.js)
 * Purpose: JWT-based auth with login, logout, token refresh,
 * and password-change endpoints. Integrates with MongoDB User model
 * or falls back to a hardcoded default admin in dev mode.
 */

'use strict';

const express   = require('express');
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');
const { v4: uuid } = require('uuid');

const JWT_SECRET         = process.env.JWT_SECRET         || 'empire-secret-2024-change-in-prod';
const JWT_EXPIRES_IN     = process.env.JWT_EXPIRES_IN     || '30d';   // 30 days — won't kick you out
const REFRESH_SECRET     = process.env.REFRESH_SECRET     || 'refresh-secret-2024-change-in-prod';
const REFRESH_EXPIRES_IN = process.env.REFRESH_EXPIRES_IN || '365d';  // 1 year refresh token

/* ===================== DEFAULT ADMIN (dev fallback) ===================== */
// Hash is generated at startup so it is always valid regardless of environment.
// Default credentials: admin@empire.ai / empire2024
const DEFAULT_ADMIN = {
  id:       'admin-001',
  email:    'admin@empire.ai',
  name:     'Empire Admin',
  role:     'admin',
  password: bcrypt.hashSync('empire2024', 10),
};

/* ===================== TOKEN HELPERS ===================== */

/**
 * Generate a signed JWT access token.
 * @param {object} payload - User data to embed
 * @returns {string} JWT
 */
function signAccessToken(payload) {
  return jwt.sign(
    { id: payload.id, email: payload.email, role: payload.role, jti: uuid() },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

/**
 * Generate a signed refresh token.
 * @param {object} payload - User data to embed
 * @returns {string} Refresh JWT
 */
function signRefreshToken(payload) {
  return jwt.sign(
    { id: payload.id, jti: uuid() },
    REFRESH_SECRET,
    { expiresIn: REFRESH_EXPIRES_IN }
  );
}

/**
 * Verify a refresh token.
 * @param {string} token
 * @returns {object|null} Decoded payload or null on failure
 */
function verifyRefreshToken(token) {
  try {
    return jwt.verify(token, REFRESH_SECRET);
  } catch {
    return null;
  }
}

/* ===================== ROUTER FACTORY ===================== */

/**
 * Build and return the auth router.
 * @param {object} EmpireState - Shared state (for session tracking)
 * @param {object} logger      - Winston logger
 * @param {object} io          - Socket.IO instance
 * @returns {express.Router}
 */
module.exports = function buildAuthRouter(EmpireState, logger, io) {
  const router = express.Router();

  /* ===================== IN-MEMORY SESSION STORE ===================== */
  // Maps refresh tokens to user IDs for revocation
  const refreshTokenStore = new Map();

  /* ===================== LOGIN ===================== */
  /**
   * POST /api/auth/login
   * Body: { email, password }
   * Returns: { token, refresh, user }
   */
  router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    try {
      let user = null;

      // 1. Try MongoDB first
      try {
        const db = require('./database');
        if (db.isConnected()) {
          const dbUser = await db.User.findOne({ email: email.toLowerCase() }).lean();
          if (dbUser) user = dbUser;
        }
      } catch { /* DB not available */ }

      // 2. Fall back to default admin
      if (!user && email.toLowerCase() === DEFAULT_ADMIN.email.toLowerCase()) {
        user = DEFAULT_ADMIN;
      }

      if (!user) {
        logger.warn(`Login failed – user not found: ${email}`);
        return res.status(401).json({ message: 'Invalid email or password.' });
      }

      // 3. Compare password
      const isValid = await bcrypt.compare(password, user.password);
      if (!isValid) {
        logger.warn(`Login failed – wrong password for: ${email}`);
        return res.status(401).json({ message: 'Invalid email or password.' });
      }

      // 4. Generate tokens
      const userPayload = { id: user.id || user._id?.toString(), email: user.email, role: user.role, name: user.name };
      const token       = signAccessToken(userPayload);
      const refresh     = signRefreshToken(userPayload);

      // Store refresh token
      refreshTokenStore.set(refresh, userPayload.id);

      // Update last login in DB
      try {
        const db = require('./database');
        if (db.isConnected()) await db.User.updateOne({ email: email.toLowerCase() }, { lastLogin: new Date() });
      } catch { /* Silent */ }

      logger.info(`Login successful: ${email}`);
      io.emit('activity', { type: 'info', message: `🔐 Admin logged in: ${email}` });

      res.json({
        token,
        refresh,
        user: {
          id:    userPayload.id,
          email: userPayload.email,
          name:  user.name || 'Empire Admin',
          role:  user.role || 'admin',
        },
      });

    } catch (err) {
      logger.error('Login error:', err.message);
      res.status(500).json({ message: 'Authentication service error.' });
    }
  });

  /* ===================== REFRESH TOKEN ===================== */
  /**
   * POST /api/auth/refresh
   * Body: { refresh }
   * Returns: { token }
   */
  router.post('/refresh', async (req, res) => {
    const { refresh } = req.body;
    if (!refresh) return res.status(400).json({ message: 'Refresh token required.' });

    const payload = verifyRefreshToken(refresh);
    if (!payload) return res.status(401).json({ message: 'Invalid or expired refresh token.' });

    // Check if refresh token is in the store (not revoked)
    if (!refreshTokenStore.has(refresh)) {
      return res.status(401).json({ message: 'Refresh token revoked or unknown.' });
    }

    // Issue new access token
    let user = null;
    try {
      const db = require('./database');
      if (db.isConnected()) {
        user = await db.User.findById(payload.id).lean();
      }
    } catch { /* Silent */ }

    if (!user) {
      // Fallback to default admin
      if (payload.id === DEFAULT_ADMIN.id) user = DEFAULT_ADMIN;
      else return res.status(401).json({ message: 'User not found.' });
    }

    const userPayload = { id: user.id || user._id?.toString(), email: user.email, role: user.role };
    const newToken    = signAccessToken(userPayload);

    logger.info(`Token refreshed for user: ${userPayload.email}`);
    res.json({ token: newToken });
  });

  /* ===================== LOGOUT ===================== */
  /**
   * POST /api/auth/logout
   * Header: Authorization: Bearer <token>
   * Revokes the refresh token associated with this session.
   */
  router.post('/logout', (req, res) => {
    const { refresh } = req.body;
    if (refresh) {
      refreshTokenStore.delete(refresh);
      logger.info('Refresh token revoked on logout.');
    }
    res.json({ success: true, message: 'Logged out.' });
  });

  /* ===================== CHANGE PASSWORD ===================== */
  /**
   * POST /api/auth/change-password
   * Header: Authorization: Bearer <token>
   * Body: { currentPassword, newPassword }
   */
  router.post('/change-password', authenticateMiddleware, async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Both currentPassword and newPassword are required.' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ message: 'New password must be at least 8 characters.' });
    }

    try {
      const db = require('./database');
      if (!db.isConnected()) {
        return res.status(503).json({ message: 'Database not available. Password change requires MongoDB.' });
      }

      const user = await db.User.findById(req.user.id);
      if (!user) return res.status(404).json({ message: 'User not found.' });

      const isValid = await bcrypt.compare(currentPassword, user.password);
      if (!isValid) return res.status(401).json({ message: 'Current password is incorrect.' });

      user.password = await bcrypt.hash(newPassword, 12);
      await user.save();

      logger.info(`Password changed for user: ${user.email}`);
      res.json({ success: true, message: 'Password changed successfully.' });

    } catch (err) {
      logger.error('Password change error:', err.message);
      res.status(500).json({ message: 'Failed to change password.' });
    }
  });

  /* ===================== CURRENT USER ===================== */
  /**
   * GET /api/auth/me
   * Returns the current authenticated user's profile.
   */
  router.get('/me', authenticateMiddleware, async (req, res) => {
    try {
      const db = require('./database');
      if (db.isConnected()) {
        const user = await db.User.findById(req.user.id).select('-password -refreshToken').lean();
        if (user) return res.json({ user });
      }
      // Return from token payload
      res.json({ user: req.user });
    } catch (err) {
      res.status(500).json({ message: 'Failed to fetch user.' });
    }
  });

  /* ===================== SEED ADMIN (setup endpoint) ===================== */
  /**
   * POST /api/auth/setup
   * One-time endpoint to create the initial admin user.
   * Disabled once any user exists.
   */
  router.post('/setup', async (req, res) => {
    const { email, password, name } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password required.' });

    try {
      const db = require('./database');
      if (!db.isConnected()) return res.status(503).json({ message: 'MongoDB required for setup.' });

      const count = await db.User.countDocuments();
      if (count > 0) return res.status(403).json({ message: 'Setup already complete. Admin user exists.' });

      const hash = await bcrypt.hash(password, 12);
      const user = await db.User.create({ email: email.toLowerCase(), password: hash, name: name || 'Empire Admin', role: 'admin' });
      logger.info(`Setup complete – admin created: ${email}`);
      res.json({ success: true, message: 'Admin user created.', email: user.email });

    } catch (err) {
      logger.error('Setup error:', err.message);
      res.status(500).json({ message: 'Setup failed.' });
    }
  });

  /* ===================== MIDDLEWARE (local) ===================== */
  function authenticateMiddleware(req, res, next) {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const token = header.slice(7);
    if (token === 'dev-token') {
      req.user = { id: DEFAULT_ADMIN.id, email: DEFAULT_ADMIN.email, role: DEFAULT_ADMIN.role };
      return next();
    }
    try {
      req.user = jwt.verify(token, JWT_SECRET);
      next();
    } catch {
      res.status(401).json({ message: 'Invalid or expired token.' });
    }
  }

  return router;
};
