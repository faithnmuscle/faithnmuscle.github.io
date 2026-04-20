import { supabase } from './supabase-client.js';

export async function requireAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { window.location.href = '/login.html'; return null; }
  startIdleTimer();
  return session;
}

export async function requireAdmin() {
  const session = await requireAuth();
  if (!session) return null;
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
  if (!profile || profile.role !== 'admin') { window.location.href = '/dashboard.html'; return null; }
  return session;
}

let idleTimer = null;
const IDLE_MS = 30 * 60 * 1000;
function resetIdleTimer() { clearTimeout(idleTimer); idleTimer = setTimeout(signOut, IDLE_MS); }
function startIdleTimer() {
  ['mousemove','keydown','touchstart','scroll','click'].forEach(e => document.addEventListener(e, resetIdleTimer, { passive: true }));
  resetIdleTimer();
}

export async function signOut() { await supabase.auth.signOut(); window.location.href = '/login.html'; }

let _profile = null;
export async function getProfile() {
  if (_profile) return _profile;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
  _profile = data;
  return data;
}

export async function initSidebar() {
  const profile = await getProfile();
  if (!profile) return;
  const nameEl = document.getElementById('sidebar-name');
  const roleEl = document.getElementById('sidebar-role');
  const avatarEl = document.getElementById('sidebar-avatar');
  if (nameEl)   nameEl.textContent   = profile.full_name || profile.email;
  if (roleEl)   roleEl.textContent   = profile.role === 'admin' ? 'Admin' : 'Client';
  if (avatarEl) avatarEl.textContent = initials(profile.full_name || profile.email);
  function markActiveNav() {
    const currentPath = window.location.pathname.replace(/\/$/, '') || '/';
    const currentHash = window.location.hash || '';
    document.querySelectorAll('.nav-item').forEach(link => {
      link.classList.remove('active');
      const href = link.getAttribute('href');
      if (!href) return;
      if (href.includes('#')) {
        // Hash-based link: match both path and hash
        const [hPath, hHash] = href.split('#');
        if ((currentPath === hPath || currentPath.endsWith(hPath.replace('.html',''))) && currentHash === '#' + hHash) {
          link.classList.add('active');
        }
      } else {
        // Plain path: only match if no hash (so Check-In doesn't highlight when on #trends)
        if (!currentHash && (currentPath === href || currentPath.endsWith(href.replace('.html','')))) {
          link.classList.add('active');
        }
      }
    });
  }
  markActiveNav();
  window.addEventListener('hashchange', markActiveNav);
  const signOutBtn = document.getElementById('btn-signout');
  if (signOutBtn) signOutBtn.addEventListener('click', signOut);
  const toggleBtn = document.querySelector('.sidebar-toggle');
  const sidebar   = document.querySelector('.sidebar');
  if (toggleBtn && sidebar) {
    toggleBtn.addEventListener('click', () => sidebar.classList.toggle('open'));
    document.addEventListener('click', e => { if (!sidebar.contains(e.target) && !toggleBtn.contains(e.target)) sidebar.classList.remove('open'); });
  }
  if (profile.role === 'admin') {
    const isAdminPage = window.location.pathname.includes('/admin');

    // Always-visible topbar toggle button - insert into .topbar-actions if present
    const topbar = document.querySelector('.portal-topbar');
    if (topbar) {
      const link = document.createElement('a');
      link.href = isAdminPage ? '/dashboard.html' : '/admin/dashboard.html';
      link.className = 'btn btn-secondary btn-sm';
      link.style.cssText = 'flex-shrink:0;';
      link.textContent = isAdminPage ? '← Client View' : 'Admin →';
      const actions = topbar.querySelector('.topbar-actions');
      if (actions) {
        actions.insertBefore(link, actions.firstChild);
      } else {
        link.style.marginLeft = 'auto';
        topbar.appendChild(link);
      }
    }

    // Also add to sidebar nav (secondary)
    const nav = document.querySelector('.sidebar-nav');
    if (nav) {
      nav.insertAdjacentHTML('beforeend', isAdminPage ? `
        <div class="nav-section-label" style="margin-top:0.5rem;">Switch</div>
        <a href="/dashboard.html" class="nav-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 0-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          Client Portal
        </a>
      ` : `
        <div class="nav-section-label" style="margin-top:0.5rem;">Admin</div>
        <a href="/admin/dashboard.html" class="nav-item" style="color:var(--blue-light);">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          Admin Portal
        </a>
      `);
    }
  }

  if (window.location.pathname.includes('/admin')) {
    loadCheckinBadge();
    loadMsgsBadge();
  } else {
    loadNotifBadge(profile.id);
    loadMsgsBadge();
  }
  autoSaveTimezone(profile);

  // Auto-gate nav items for client pages
  if (!window.location.pathname.includes('/admin')) {
    if (profile.role === 'admin') {
      // Admins see the full nav when browsing client pages
      gateClientNav('coaching');
    } else {
      const plan = await getActivePlan(profile.id);
      if (plan) gateClientNav(plan.plan_type);
    }
  }
}

async function loadNotifBadge(userId) {
  const badge = document.getElementById('notif-badge');
  if (!badge) return;
  const { count } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('is_read', false);
  if (count && count > 0) { badge.textContent = count > 9 ? '9+' : count; badge.style.display = 'inline-block'; }
  else badge.style.display = 'none';
}

async function loadCheckinBadge() {
  const badge = document.getElementById('notif-badge');
  if (!badge) return;
  const { count } = await supabase.from('weekly_checkins').select('id', { count: 'exact', head: true }).is('coach_reply', null).not('client_note', 'is', null);
  if (count && count > 0) { badge.textContent = count > 9 ? '9+' : count; badge.style.display = 'inline-block'; }
  else badge.style.display = 'none';
}

async function loadMsgsBadge() {
  const badge = document.getElementById('msgs-badge');
  if (!badge) return;
  const profile = await getProfile();
  if (!profile) return;
  const { count } = await supabase.from('messages').select('id', { count: 'exact', head: true }).eq('is_read', false).neq('sender_id', profile.id);
  if (count && count > 0) { badge.textContent = count > 9 ? '9+' : count; badge.style.display = 'inline-block'; }
  else badge.style.display = 'none';
}

async function autoSaveTimezone(profile) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (profile.timezone === tz) return;
  await supabase.from('profiles').update({ timezone: tz, updated_at: new Date().toISOString() }).eq('id', profile.id);
}

export function toast(message, type = 'info', durationMs = 4000) {
  let container = document.getElementById('toast-container');
  if (!container) { container = document.createElement('div'); container.id = 'toast-container'; document.body.appendChild(container); }
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  el.innerHTML = `<span>${icons[type]||icons.info}</span><span>${escapeHtml(message)}</span>`;
  container.appendChild(el);
  setTimeout(() => el.remove(), durationMs);
}

export function openModal(id) { document.getElementById(id)?.classList.add('open'); }
export function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }
export function initModals() {
  document.querySelectorAll('.modal-close, [data-modal-close]').forEach(btn => btn.addEventListener('click', () => btn.closest('.modal-overlay')?.classList.remove('open')));
  document.querySelectorAll('.modal-overlay').forEach(overlay => overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.remove('open'); }));
  document.querySelectorAll('[data-modal-open]').forEach(btn => btn.addEventListener('click', () => openModal(btn.dataset.modalOpen)));
}

export function setBusy(btn, busy) { btn.setAttribute('aria-busy', busy ? 'true' : 'false'); btn.disabled = busy; }

export function showFieldError(inputId, message) {
  const input = document.getElementById(inputId);
  const errorEl = document.getElementById(inputId + '-error');
  if (input)   input.classList.add('input-error');
  if (errorEl) { errorEl.textContent = message; errorEl.classList.add('visible'); }
}

export function clearFieldError(inputId) {
  const input = document.getElementById(inputId);
  const errorEl = document.getElementById(inputId + '-error');
  if (input)   input.classList.remove('input-error');
  if (errorEl) errorEl.classList.remove('visible');
}

export function clearAllErrors(form) {
  form.querySelectorAll('.input-error').forEach(el => el.classList.remove('input-error'));
  form.querySelectorAll('.form-error').forEach(el => el.classList.remove('visible'));
}

export function checkPasswordStrength(password) {
  let score = 0;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  return score;
}

export function updateStrengthBar(fillEl, labelEl, password) {
  const score = checkPasswordStrength(password);
  const pct   = (score / 4) * 100;
  const data  = [{color:'#ef4444',label:'Too weak'},{color:'#f59e0b',label:'Weak'},{color:'#eab308',label:'Fair'},{color:'#22c55e',label:'Strong'},{color:'#22c55e',label:'Strong'}];
  if (fillEl)  { fillEl.style.width = pct + '%'; fillEl.style.background = data[score].color; }
  if (labelEl) labelEl.textContent = password.length ? data[score].label : '';
}

export function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

export function initials(name = '') { return name.split(' ').map(w => w[0]||'').slice(0,2).join('').toUpperCase() || '?'; }

export function gateClientNav(planType) {
  if (!planType) return;
  const hasWorkout = ['coaching','workout','athletes','rehab'].includes(planType);
  const hasMeal    = ['coaching','meal'].includes(planType);
  if (hasWorkout) {
    document.querySelectorAll('.nav-section-training').forEach(el => el.style.display = '');
    document.querySelectorAll('.nav-workout').forEach(el => el.style.display = '');
  }
  if (planType === 'coaching') {
    document.querySelectorAll('.nav-coaching').forEach(el => el.style.display = '');
  }
  if (hasMeal) {
    document.querySelectorAll('.nav-section-nutrition').forEach(el => el.style.display = '');
    document.querySelectorAll('.nav-meal').forEach(el => el.style.display = '');
  }
  // Progress is visible to all plans
  document.querySelectorAll('.nav-progress').forEach(el => el.style.display = '');
}

// Settings - fetched once per page load, cached for the session
let _settings = null;
export async function getSettings() {
  if (_settings) return _settings;
  const { data } = await supabase.from('portal_settings').select('key, value');
  _settings = {};
  (data || []).forEach(r => { _settings[r.key] = r.value; });
  return _settings;
}

// Feature flags - read from portal_settings with hardcoded defaults as fallback
export async function getFeatures() {
  const s = await getSettings();
  const bool = (key, def) => s[key] !== undefined ? s[key] === 'true' : def;
  return {
    bookings:        bool('feature_bookings',         true),
    workoutLogging:  bool('feature_workout_logging',  true),
    mealLogging:     bool('feature_meal_logging',     true),
    progressCheckin: bool('feature_progress_checkin', true),
    messages:        bool('feature_messages',         true),
    weeklyCheckin:   bool('feature_weekly_checkin',   true),
    progressPhotos:  bool('feature_progress_photos',  false),
    adminBookings:   bool('feature_admin_bookings',   true),
    adminCheckins:   bool('feature_admin_checkins',   true),
    adminPayments:   bool('feature_admin_payments',   true),
    adminRenewals:   bool('feature_admin_renewals',   true),
  };
}

export async function getActivePlan(clientId) {
  const { data } = await supabase.from('plans').select('*').eq('client_id', clientId).in('status', ['active','pending']).order('created_at', { ascending: false }).limit(1);
  return data?.[0] || null;
}

export function formatDate(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(isoStr) {
  if (!isoStr) return '-';
  return new Date(isoStr).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** YYYY-MM-DD in the user's local timezone (weeks are Monday-Sunday). */
export function localCalendarDate(d = new Date()) {
  return d.toLocaleDateString('en-CA');
}

/** Monday of the week containing `d`, as YYYY-MM-DD local. */
export function weekStartMonday(d = new Date()) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = x.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + offset);
  return localCalendarDate(x);
}

/** Add `days` to a YYYY-MM-DD string; returns YYYY-MM-DD local. */
export function addCalendarDays(ymd, days) {
  const [y, m, dd] = ymd.split('-').map(Number);
  const x = new Date(y, m - 1, dd);
  x.setDate(x.getDate() + days);
  return localCalendarDate(x);
}

export function planTypeLabel(type) {
  const labels = {
    coaching: 'Online 1-on-1 Coaching',
    workout:  'Detailed Workout Plan',
    meal:     'Detailed Meal Plan',
    athletes: 'Youth & School Athletes Training',
    rehab:    'Rehab & Flexibility',
  };
  return labels[type] || type;
}

export const PLAN_DEFAULTS = {
  coaching: { price: 10000, period: 'month' },
  workout:  { price:  4500, period: 'plan'  },
  meal:     { price:  6000, period: 'plan'  },
  athletes: { price:  4500, period: 'plan'  },
  rehab:    { price:  5000, period: 'plan'  },
};
