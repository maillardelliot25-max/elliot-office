/**
 * AI Empire – Login & Auth Handler (login.js)
 * Purpose: Manages user authentication flow, JWT token storage,
 * and session validation before loading the main dashboard.
 */

'use strict';

/* ===================== CONFIG ===================== */
const AUTH_CONFIG = {
  apiBase:      '/api',
  tokenKey:     'empire_token',
  refreshKey:   'empire_refresh',
  userKey:      'empire_user',
  sessionMins:  60,
};

/* ===================== SESSION MANAGER ===================== */
const Session = {
  /**
   * Save auth tokens and user info after successful login.
   * @param {string} token   - JWT access token
   * @param {string} refresh - JWT refresh token
   * @param {object} user    - User profile object
   */
  save(token, refresh, user) {
    localStorage.setItem(AUTH_CONFIG.tokenKey,  token);
    localStorage.setItem(AUTH_CONFIG.refreshKey, refresh);
    localStorage.setItem(AUTH_CONFIG.userKey,    JSON.stringify(user));
    // Record session start time for expiry tracking
    localStorage.setItem('empire_session_start', Date.now().toString());
  },

  /** Retrieve the stored access token. */
  getToken() {
    return localStorage.getItem(AUTH_CONFIG.tokenKey);
  },

  /** Retrieve the stored refresh token. */
  getRefreshToken() {
    return localStorage.getItem(AUTH_CONFIG.refreshKey);
  },

  /** Parse and return the stored user object. */
  getUser() {
    try {
      const raw = localStorage.getItem(AUTH_CONFIG.userKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  /**
   * Check if the current session is still valid (within expiry window).
   * @returns {boolean}
   */
  isValid() {
    const token = this.getToken();
    if (!token) return false;

    const start = parseInt(localStorage.getItem('empire_session_start') || '0', 10);
    const elapsed = (Date.now() - start) / 1000 / 60; // minutes
    return elapsed < AUTH_CONFIG.sessionMins;
  },

  /** Clear all session data on logout or expiry. */
  clear() {
    [
      AUTH_CONFIG.tokenKey,
      AUTH_CONFIG.refreshKey,
      AUTH_CONFIG.userKey,
      'empire_session_start',
    ].forEach(k => localStorage.removeItem(k));
  },
};

/* ===================== AUTH API ===================== */
const AuthAPI = {
  /**
   * POST /api/auth/login — Authenticate with email + password.
   * @param {string} email
   * @param {string} password
   * @returns {Promise<{token, refresh, user}>}
   */
  async login(email, password) {
    const res = await fetch(`${AUTH_CONFIG.apiBase}/auth/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Login failed' }));
      throw new Error(err.message || `HTTP ${res.status}`);
    }
    return res.json();
  },

  /**
   * POST /api/auth/refresh — Obtain a new access token using refresh token.
   * @returns {Promise<{token}>}
   */
  async refreshToken() {
    const refresh = Session.getRefreshToken();
    if (!refresh) throw new Error('No refresh token');

    const res = await fetch(`${AUTH_CONFIG.apiBase}/auth/refresh`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ refresh }),
    });
    if (!res.ok) throw new Error('Token refresh failed');
    return res.json();
  },

  /**
   * POST /api/auth/logout — Invalidate token on the server side.
   */
  async logout() {
    const token = Session.getToken();
    if (!token) return;
    await fetch(`${AUTH_CONFIG.apiBase}/auth/logout`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {}); // Best-effort
  },
};

/* ===================== TOKEN AUTO-REFRESH ===================== */
let refreshTimer = null;

/**
 * Schedule automatic token refresh 5 minutes before expiry.
 * Called after each successful login or refresh.
 */
function scheduleTokenRefresh() {
  clearInterval(refreshTimer);
  // Refresh every 50 minutes (session = 60 min, refresh 10 min early)
  const intervalMs = (AUTH_CONFIG.sessionMins - 10) * 60 * 1000;
  refreshTimer = setInterval(async () => {
    try {
      const { token } = await AuthAPI.refreshToken();
      localStorage.setItem(AUTH_CONFIG.tokenKey, token);
      localStorage.setItem('empire_session_start', Date.now().toString());
      console.info('[Auth] Token refreshed successfully.');
    } catch (err) {
      console.warn('[Auth] Token refresh failed – logging out.', err);
      logout();
    }
  }, intervalMs);
}

/* ===================== LOGIN FLOW ===================== */
/**
 * Attempt to log the user in with provided credentials.
 * On success: saves session, initialises dashboard, hides login overlay.
 * On failure: shows error message in the UI.
 */
async function attemptLogin() {
  const emailEl = document.getElementById('login-email');
  const passEl  = document.getElementById('login-password');
  const errEl   = document.getElementById('login-error');
  const btnEl   = document.getElementById('login-btn');

  if (!emailEl || !passEl) return;

  const email    = emailEl.value.trim();
  const password = passEl.value;

  // Basic client-side validation
  if (!email || !password) {
    showLoginError('Email and password are required.');
    return;
  }

  btnEl.disabled    = true;
  btnEl.textContent = 'Authenticating…';
  if (errEl) errEl.textContent = '';

  try {
    const { token, refresh, user } = await AuthAPI.login(email, password);
    Session.save(token, refresh, user);
    scheduleTokenRefresh();
    hideLoginOverlay();
    initDashboard(user);
  } catch (err) {
    showLoginError(err.message || 'Invalid credentials. Please try again.');
  } finally {
    btnEl.disabled    = false;
    btnEl.textContent = 'Enter Empire';
  }
}

/** Display an error message in the login panel. */
function showLoginError(msg) {
  const el = document.getElementById('login-error');
  if (el) {
    el.textContent = msg;
    el.classList.remove('hidden');
  }
}

/* ===================== LOGOUT ===================== */
/**
 * Log the user out: revoke server token, clear session, show login overlay.
 * Called by the Logout button in the top nav.
 */
async function logout() {
  clearInterval(refreshTimer);
  await AuthAPI.logout();
  Session.clear();
  showLoginOverlay();
}

/* ===================== LOGIN OVERLAY DOM ===================== */
/**
 * Inject the login overlay into the DOM dynamically.
 * This avoids a separate login.html page and keeps the SPA single-file.
 */
function injectLoginOverlay() {
  if (document.getElementById('login-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'login-overlay';
  overlay.style.cssText = `
    position:fixed;inset:0;z-index:99999;
    background:linear-gradient(135deg,#0a0e17 0%,#111827 100%);
    display:flex;align-items:center;justify-content:center;
    font-family:'Segoe UI',system-ui,sans-serif;
  `;

  overlay.innerHTML = `
    <div style="
      background:#1a2235;border:1px solid #2a3a55;border-radius:16px;
      padding:40px;width:380px;box-shadow:0 20px 60px rgba(0,0,0,0.5);
    ">
      <div style="text-align:center;margin-bottom:28px;">
        <div style="font-size:36px;margin-bottom:8px;">⚡</div>
        <h1 style="
          font-size:24px;font-weight:800;margin-bottom:6px;
          background:linear-gradient(135deg,#00d4ff,#7c3aed);
          -webkit-background-clip:text;-webkit-text-fill-color:transparent;
          background-clip:text;
        ">AI Empire</h1>
        <p style="color:#8899aa;font-size:13px;">Command Center · God Mode</p>
      </div>

      <div id="login-error" style="
        color:#ff5252;background:rgba(255,82,82,0.1);border:1px solid #ff5252;
        border-radius:8px;padding:10px 14px;font-size:13px;margin-bottom:16px;
      " class="hidden"></div>

      <div style="margin-bottom:14px;">
        <label style="display:block;color:#8899aa;font-size:12px;margin-bottom:6px;">Email Address</label>
        <input id="login-email" type="email" placeholder="admin@empire.ai"
          style="
            width:100%;background:#111827;border:1px solid #2a3a55;color:#e8eaf0;
            padding:10px 14px;border-radius:8px;font-size:14px;outline:none;
            box-sizing:border-box;
          "
          onkeydown="if(event.key==='Enter')attemptLogin()"
        />
      </div>
      <div style="margin-bottom:20px;">
        <label style="display:block;color:#8899aa;font-size:12px;margin-bottom:6px;">Password</label>
        <input id="login-password" type="password" placeholder="••••••••••••"
          style="
            width:100%;background:#111827;border:1px solid #2a3a55;color:#e8eaf0;
            padding:10px 14px;border-radius:8px;font-size:14px;outline:none;
            box-sizing:border-box;
          "
          onkeydown="if(event.key==='Enter')attemptLogin()"
        />
      </div>

      <button id="login-btn" onclick="attemptLogin()"
        style="
          width:100%;background:linear-gradient(135deg,#00d4ff,#448aff);
          color:#000;border:none;padding:12px;border-radius:8px;
          font-size:14px;font-weight:700;cursor:pointer;
          transition:opacity 0.2s;
        "
        onmouseenter="this.style.opacity='0.9'"
        onmouseleave="this.style.opacity='1'"
      >Enter Empire</button>

      <p style="text-align:center;color:#556677;font-size:11px;margin-top:16px;">
        Default: admin@empire.ai / empire2024
      </p>
    </div>
  `;

  document.body.appendChild(overlay);
}

function showLoginOverlay() {
  const el = document.getElementById('login-overlay');
  if (el) el.style.display = 'flex';
  else injectLoginOverlay();
}

function hideLoginOverlay() {
  const el = document.getElementById('login-overlay');
  if (el) el.style.display = 'none';
}

/* ===================== BOOTSTRAP ===================== */
/**
 * On page load: check for an existing valid session.
 * If valid → skip login and load dashboard directly.
 * If not  → show login overlay.
 */
(function bootstrap() {
  // Development bypass: allow ?dev=1 to skip auth
  const params = new URLSearchParams(window.location.search);
  if (params.get('dev') === '1') {
    const mockUser = { id: 'dev', name: 'Developer', email: 'dev@empire.ai', role: 'admin' };
    Session.save('dev-token', 'dev-refresh', mockUser);
  }

  if (Session.isValid()) {
    // Valid session – go straight to dashboard
    scheduleTokenRefresh();
    const user = Session.getUser();
    // Dashboard init is deferred until dashboard.js loads
    document.addEventListener('DOMContentLoaded', () => {
      if (typeof initDashboard === 'function') initDashboard(user);
    });
  } else {
    // No valid session – show login
    document.addEventListener('DOMContentLoaded', () => {
      injectLoginOverlay();
    });
  }
})();
