import './style.css';
import './campus.css';
import './experience.css';
import { ACTIVITIES, activityFor, selectPlans, planTime } from './discovery.mjs';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { io } from 'socket.io-client';
import { renderAvatarSvg, renderFullBodyAvatarSvg, renderVerifiedBadgeSvg, AVATAR_OPTIONS, getDeterministicAvatar } from './avatar.js';
import { playSendSound, playReceiveSound } from './audio.js';
import { launchConfetti } from './confetti.js';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

// Reuse the initial HTML so loading stays identical before and after JavaScript.
const startupMarkup = document.querySelector('#app').innerHTML;

const API = import.meta.env.VITE_API_URL || (location.port === '5173' ? 'http://localhost:3002/api' : '/api');

function canNotify() {
  return 'Notification' in window && Notification.permission === 'granted';
}

function isNotificationsMuted() {
  return localStorage.getItem('afterclass_notifications_muted') === 'true';
}

function isSoundMuted() {
  return localStorage.getItem('afterclass_sound_muted') === 'true';
}

function updateProfileNotifCard() {
  const isMuted = isNotificationsMuted();
  const granted = 'Notification' in window && Notification.permission === 'granted';
  const isOn = granted && !isMuted;

  const card = document.querySelector('#profile-notif-card');
  if (card) {
    card.innerHTML = `
      <div style="text-align:left;">
        <strong style="font-size:13.5px;color:var(--ink);display:block;margin-bottom:2px;">Campus Push Alerts</strong>
        <small style="color:var(--muted);font-size:11.5px;">
          ${!('Notification' in window) ? 'Not supported on device' : (!granted ? 'Click switch to enable alerts' : (isOn ? 'Power ON · Active alerts' : 'Power OFF · Alerts muted'))}
        </small>
      </div>
      <div class="real-switch-casing ${isOn ? 'on' : 'off'}" onclick="${!granted ? 'requestNotificationPermission()' : 'toggleNotificationsMute()'}" title="${isOn ? 'Switch ON (Click to turn OFF)' : 'Switch OFF (Click to turn ON)'}" role="button" tabindex="0">
        <div class="real-switch-well">
          <div class="real-rocker-paddle">
            <div class="paddle-half paddle-top">
              <span class="lens-pilot-dot"></span>
              <span class="debossed-symbol symbol-on">|</span>
            </div>
            <div class="paddle-pivot-ridge"></div>
            <div class="paddle-half paddle-bottom">
              <span class="debossed-symbol symbol-off">○</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  const settingsNotif = document.querySelector('#settings-notif-card');
  if (settingsNotif) {
    settingsNotif.innerHTML = `
      <div style="text-align:left;">
        <strong style="font-size:14px;color:var(--ink);display:block;margin-bottom:2px;">Master Push Notifications</strong>
        <small style="color:var(--muted);font-size:12px;">
          ${!('Notification' in window) ? 'Not supported on device' : (!granted ? 'Click switch to enable push alerts' : (isOn ? 'Power ON · Alerts active and delivered in real-time' : 'Power OFF · Alerts muted'))}
        </small>
      </div>
      <div class="real-switch-casing ${isOn ? 'on' : 'off'}" onclick="${!granted ? 'requestNotificationPermission()' : 'toggleNotificationsMute()'}" title="${isOn ? 'Switch ON (Click to turn OFF)' : 'Switch OFF (Click to turn ON)'}" role="button" tabindex="0">
        <div class="real-switch-well">
          <div class="real-rocker-paddle">
            <div class="paddle-half paddle-top">
              <span class="lens-pilot-dot"></span>
              <span class="debossed-symbol symbol-on">|</span>
            </div>
            <div class="paddle-pivot-ridge"></div>
            <div class="paddle-half paddle-bottom">
              <span class="debossed-symbol symbol-off">○</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }
}

function updateSettingsSoundCard() {
  const card = document.querySelector('#settings-sound-card');
  if (!card) return;
  const soundOn = !isSoundMuted();

  card.innerHTML = `
    <div style="text-align:left;">
      <strong style="font-size:14px;color:var(--ink);display:block;margin-bottom:2px;">In-App Audio Effects</strong>
      <small style="color:var(--muted);font-size:12px;">
        ${soundOn ? 'Audio ON · High-fidelity chimes and feedback sounds' : 'Audio OFF · All in-app sound effects muted'}
      </small>
    </div>
    <div class="real-switch-casing ${soundOn ? 'on' : 'off'}" onclick="toggleSoundMute()" title="${soundOn ? 'Sound ON (Click to turn OFF)' : 'Sound OFF (Click to turn ON)'}" role="button" tabindex="0">
      <div class="real-switch-well">
        <div class="real-rocker-paddle">
          <div class="paddle-half paddle-top">
            <span class="lens-pilot-dot"></span>
            <span class="debossed-symbol symbol-on">|</span>
          </div>
          <div class="paddle-pivot-ridge"></div>
          <div class="paddle-half paddle-bottom">
            <span class="debossed-symbol symbol-off">○</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

window.toggleSoundMute = () => {
  const muted = isSoundMuted();
  localStorage.setItem('afterclass_sound_muted', muted ? 'false' : 'true');
  toast(muted ? '🔊 In-App Sound Effects Enabled!' : '🔇 In-App Sound Effects Muted');
  updateSettingsSoundCard();
};

window.clearLocalCache = () => {
  localStorage.removeItem('afterclass_sound_muted');
  localStorage.removeItem('afterclass_notifications_muted');
  toast('🧹 Local app cache cleared cleanly!');
  render();
};

window.toggleNotificationsMute = () => {
  const muted = isNotificationsMuted();
  localStorage.setItem('afterclass_notifications_muted', muted ? 'false' : 'true');
  toast(muted ? '🔔 Campus Push Alerts Unmuted!' : '🔕 Campus Push Alerts Muted');
  updateProfileNotifCard();
};

window.requestNotificationPermission = async () => {
  if (!('Notification' in window)) {
    return toast('Browser notifications are not supported on this device.');
  }
  try {
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      localStorage.setItem('afterclass_notifications_muted', 'false');
      toast('Notifications enabled! You will be alerted on new matches & messages 🔔');
      if (document.hidden) {
        triggerNotification('Afterclass Campus Alerts Active ✦', 'You will receive instant alerts for matches, applications, and direct messages.');
      }
      updateProfileNotifCard();
    } else if (perm === 'denied') {
      toast('Notifications blocked in browser settings.');
      updateProfileNotifCard();
    }
  } catch (err) {
    console.error('Notification error:', err);
  }
};

function triggerNotification(title, body, onClick) {
  if (!canNotify() || isNotificationsMuted() || !document.hidden) return;
  try {
    const n = new Notification(title, {
      body,
      icon: '/favicon-32.png',
      badge: '/favicon-32.png'
    });
    if (onClick) {
      n.onclick = () => {
        window.focus();
        onClick();
        n.close();
      };
    }
  } catch (err) {
    console.warn('Notification trigger error:', err);
  }
}

async function api(path, options = {}) {
  const r = await fetch(API + path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const contentType = r.headers.get('content-type') || '';
  let data;
  if (contentType.includes('application/json')) {
    try {
      data = await r.json();
    } catch {
      data = { error: `Invalid server response (${r.status})` };
    }
  } else {
    const text = await r.text().catch(() => '');
    data = { error: text || `Request failed (${r.status})` };
  }
  if (!r.ok) {
    const err = new Error(data.error || 'Something went wrong');
    err.status = r.status;
    throw err;
  }
  return data;
}

function getInitialBootView() {
  try {
    const params = new URLSearchParams(window.location.search);
    const viewParam = params.get('view');
    const validViews = ['home', 'chat', 'discover', 'inbox', 'safety', 'settings', 'admin', 'verification'];
    if (viewParam && validViews.includes(viewParam)) return viewParam;
    const clean = String(window.location.pathname || '').replace(/^\/+|\/+$/g, '').toLowerCase();
    if (!clean || clean === 'home') return 'home';
    if (validViews.includes(clean)) return clean;
  } catch {}
  return 'home';
}

function getCachedUser() {
  try {
    const raw = localStorage.getItem('afterclass_user_session');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setCachedUser(user) {
  try {
    if (user) {
      localStorage.setItem('afterclass_user_session', JSON.stringify(user));
    } else {
      localStorage.removeItem('afterclass_user_session');
    }
  } catch {}
}

function updateMe(user) {
  if (!user || state.me?.id !== user.id) {
    chatRequestController?.abort();
    chatRequestController = null;
    chatLoading = false;
    chatInitialized = false;
    chatLoadError = '';
    state.messages = [];
    state.campusOnlineCount = undefined;
    setCachedMessages([]);
    socket?.removeAllListeners();
    socket?.disconnect();
    socket = null;
  }
  state.me = user;
  setCachedUser(user);
}

function getCachedMessages() {
  try {
    const raw = sessionStorage.getItem('afterclass_cached_messages');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setCachedMessages(messages) {
  try {
    if (messages && messages.length) {
      sessionStorage.setItem('afterclass_cached_messages', JSON.stringify(messages.slice(-50)));
    } else {
      sessionStorage.removeItem('afterclass_cached_messages');
    }
  } catch {}
}

const initialCachedUser = getCachedUser();
let initialBootLoading = true;
let bootConnectionFailed = false;

const state = {
  view: getInitialBootView(),
  me: initialCachedUser,
  authLoading: !initialCachedUser,
  toast: '',
  messages: getCachedMessages(),
  requests: [],
  matches: [],
  pendingApplications: [],
  activeMatch: null,
  activeMatchMessages: [],
  safetyTab: 'guidelines',
  moderationReports: null,
  discoverFilter: 'all',
  savedPlanIds: new Set(JSON.parse(localStorage.getItem('afterclass_saved_plans') || '[]')),
  authPendingEmail: '',
  authOtpSent: false,
  authDevCode: '',
  authStep: 'welcome',
  authSelectedGender: 'prefer_not_to_say',
  adminTab: 'reports',
  adminReports: [],
  adminModerators: [],
  adminPrimaryAdmins: [],
  adminLoading: false,
  adminFilter: 'pending',
  adminSelectedUserId: null,
  adminWarningTarget: null,
  adminSearch: '',
  adminSortBy: 'pending',
  adminSortOrder: 'desc',
  adminFilterAccountStatus: 'all',
  adminFilterWarnings: 'all',
  adminFilterReporters: 'all',
  adminFilterReason: 'all',
  adminFiltersOpen: false,
  locationSharing: {
    matchId: null,
    active: false,
    myConsent: false,
    otherConsent: false,
    myCoords: null,
    otherCoords: null,
    watchId: null,
    map: null,
    markers: {},
    polyline: null,
    distanceMeters: null,
    simInterval: null,
    drawerOpen: true
  }
};

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeQuotes(str) {
  return String(str || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

let socket, chatInitialized = false, chatLoading = false, chatAuthToastShown = false;
let chatLoadError = '';
let chatRequestController = null;

const icons = {
  home: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12L12 3l9 9"/><path d="M9 21V12h6v9"/><path d="M5 10v11h14V10"/></svg>`,
  chat: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9.5" pathLength="60" stroke-dasharray="5 5"/></svg>`,
  discover: '⌘',
  inbox: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>`,
  safety: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  admin: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><circle cx="12" cy="11" r="3"/><path d="M12 14v4"/></svg>`,
  settings: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`
};

import { CAMPUS_STICKERS, EMOJI_CATEGORIES as EMOJI_NAV_TABS, ALL_UNICODE_EMOJIS } from './emojis.js';

function formatMessageContent(raw) {
  if (!raw) return '';
  let escaped = String(raw)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  escaped = escaped.replace(/(✦)/g, '<span class="special-star-emoji">✦</span>');
  return escaped;
}

function parseMessageContent(raw) {
  if (!raw) return { text: '', replyTo: null };
  if (typeof raw === 'object') return { text: raw.text || '', replyTo: raw.replyTo || null };
  if (typeof raw === 'string' && raw.trim().startsWith('{') && raw.trim().endsWith('}')) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.text === 'string') {
        return { text: parsed.text, replyTo: parsed.replyTo || null };
      }
    } catch {}
  }
  return { text: raw, replyTo: null };
}

const CAMPUS_REACTION_EMOJIS = ['❤️', '🔥', '👍', '😂', '👀', '☕', '❄️', '💯'];

function renderMessageReactionsHtml(reactions = [], msgId) {
  if (!Array.isArray(reactions) || reactions.length === 0) {
    return `<div class="message-reactions-row" data-reactions-for="${msgId}"></div>`;
  }
  return `
    <div class="message-reactions-row" data-reactions-for="${msgId}">
      ${reactions.map(r => `
        <button type="button" class="msg-reaction-pill ${r.userReacted ? 'active' : ''}" onclick="toggleMessageReaction('${msgId}', '${r.emoji}')" title="${r.count} reaction${r.count === 1 ? '' : 's'}">
          <span class="reaction-emoji">${r.emoji}</span>
          <span class="reaction-count">${r.count}</span>
        </button>
      `).join('')}
    </div>
  `;
}

window.openMessageReactionPicker = (e, msgId) => {
  e?.stopPropagation?.();
  document.querySelector('.msg-reaction-picker-popover')?.remove();

  const btn = e.currentTarget;
  const rect = btn.getBoundingClientRect();

  const popover = document.createElement('div');
  popover.className = 'msg-reaction-picker-popover';
  popover.innerHTML = CAMPUS_REACTION_EMOJIS.map(emoji => `
    <button type="button" class="reaction-picker-item" onclick="toggleMessageReaction('${msgId}', '${emoji}'); document.querySelector('.msg-reaction-picker-popover')?.remove();">
      ${emoji}
    </button>
  `).join('');

  popover.style.position = 'fixed';
  popover.style.top = `${Math.max(10, rect.top - 46)}px`;
  popover.style.left = `${Math.max(12, Math.min(rect.left - 40, window.innerWidth - 300))}px`;
  popover.style.zIndex = '9999';

  document.body.appendChild(popover);

  const closeHandler = (evt) => {
    if (!popover.contains(evt.target)) {
      popover.remove();
      document.removeEventListener('click', closeHandler);
    }
  };
  setTimeout(() => document.addEventListener('click', closeHandler), 10);
};

window.toggleMessageReaction = (msgId, emoji) => {
  if (!state.me) {
    toast('Verify your college email to react to campus chat.');
    return;
  }
  
  // Optimistic UI feedback
  const row = document.querySelector(`.message-reactions-row[data-reactions-for="${msgId}"]`);
  if (row) {
    let pill = row.querySelector(`button[onclick*="'${emoji}'"]`);
    if (pill) {
      const countEl = pill.querySelector('.reaction-count');
      const wasActive = pill.classList.contains('active');
      let count = parseInt(countEl?.textContent || '1', 10);
      if (wasActive) {
        count = Math.max(0, count - 1);
        pill.classList.remove('active');
        if (count === 0) pill.remove();
        else if (countEl) countEl.textContent = count;
      } else {
        count += 1;
        pill.classList.add('active');
        if (countEl) countEl.textContent = count;
        pill.classList.add('reaction-pop');
        setTimeout(() => pill.classList.remove('reaction-pop'), 300);
      }
    } else {
      row.insertAdjacentHTML('beforeend', `
        <button type="button" class="msg-reaction-pill active reaction-pop" onclick="toggleMessageReaction('${msgId}', '${emoji}')" title="1 reaction">
          <span class="reaction-emoji">${emoji}</span>
          <span class="reaction-count">1</span>
        </button>
      `);
    }
  }

  // Send to socket
  socket?.emit?.('message:react', { messageId: msgId, emoji });
};

function renderCampusMessageHtml(m) {
  const name = m.sender?.username || m.senderAlias || 'Anonymous';
  const parsed = parseMessageContent(m.content || '');
  const text = parsed.text || '';
  const replyTo = parsed.replyTo;
  const time = m.createdAt ? new Date(m.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
  const isMine = state.me && (name === state.me.username || m.senderId === state.me.id);
  const msgId = m.id || ('m-' + Math.random().toString(36).slice(2, 8));
  const safeText = text.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const safeName = name.replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  return `
    <div class="message-swipe-row" data-msg-id="${msgId}">
      <div class="swipe-reply-cue">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 14 4 9 9 4"></polyline><path d="M20 20v-7a4 4 0 0 0-4-4H4"></path></svg>
      </div>
      <div class="message ${isMine ? 'is-mine' : ''}" data-msg-id="${msgId}" data-sender="${safeName}" data-text="${safeText}">
        ${avatar(name)}
        <div class="message-content-col">
          <b>${name}</b><small>${time}${isMine ? ' <span class="tick delivered" title="Delivered">✓✓</span>' : ''}</small>
          ${replyTo ? `
            <div class="quoted-reply-box" onclick="scrollToMessage('${replyTo.id}')" title="Jump to original message">
              <div class="quoted-reply-bar"></div>
              <div class="quoted-reply-body">
                <strong class="quoted-reply-sender">${replyTo.sender}</strong>
                <span class="quoted-reply-text">${formatMessageContent(replyTo.text)}</span>
              </div>
            </div>
          ` : ''}
          <div class="message-body">${formatMessageContent(text)}</div>
          ${renderMessageReactionsHtml(m.reactions || [], msgId)}
        </div>
        <div class="chat-actions-group">
          <button type="button" class="react-hover-btn" onclick="openMessageReactionPicker(event, '${msgId}')" title="React with emoji">
            <span style="font-size:12px;line-height:1;">😀</span>
            <span>React</span>
          </button>
          <button type="button" class="reply-hover-btn" onclick="setReplyTo({ id: '${msgId}', sender: '${name.replace(/'/g, "\\'")}', text: '${text.replace(/'/g, "\\'").slice(0, 120)}' })" title="Reply to message">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 14 4 9 9 4"></polyline><path d="M20 20v-7a4 4 0 0 0-4-4H4"></path></svg>
            <span>Reply</span>
          </button>
          ${m.id && !isMine ? `<button type="button" class="report" onclick="reportMessage('${m.id}', '${text.replace(/'/g, "\\'")}')" title="Report message to moderators">Report</button>` : ''}
        </div>
      </div>
    </div>
  `;
}

let mediaTrayTarget = 'campus';
let mediaTrayActiveCategory = 'all';
let mediaTraySearchQuery = '';

window.toggleChatMediaTray = (e, target = 'campus') => {
  e?.stopPropagation?.();
  const existing = document.querySelector('#chat-media-tray');
  if (existing) {
    existing.remove();
    return;
  }
  mediaTrayTarget = target;
  mediaTrayActiveCategory = 'all';
  mediaTraySearchQuery = '';
  renderChatMediaTray(e?.currentTarget);
};

function renderChatMediaTray(anchorEl) {
  document.querySelector('#chat-media-tray')?.remove();
  const tray = document.createElement('div');
  tray.id = 'chat-media-tray';

  if (anchorEl) {
    const rect = anchorEl.getBoundingClientRect();
    tray.style.bottom = `${window.innerHeight - rect.top + 10}px`;
    tray.style.left = `${Math.max(12, Math.min(rect.left - 10, window.innerWidth - 375))}px`;
  } else {
    tray.style.bottom = '80px';
    tray.style.left = '20px';
  }

  tray.innerHTML = getMediaTrayFullContent();
  document.body.appendChild(tray);
}

function getMediaTrayFullContent() {
  const q = mediaTraySearchQuery.trim().toLowerCase();
  
  let stickers = CAMPUS_STICKERS;
  let emojis = ALL_UNICODE_EMOJIS;

  if (q) {
    stickers = CAMPUS_STICKERS.filter(s => s.label.toLowerCase().includes(q) || s.tags.toLowerCase().includes(q));
    emojis = ALL_UNICODE_EMOJIS.filter(e => {
      const name = e.n.toLowerCase();
      if (name.includes(q) || e.e === q) return true;
      const tags = e.t.toLowerCase().split(/\s+/);
      return tags.some(tag => tag.startsWith(q) || tag === q);
    });
  } else if (mediaTrayActiveCategory !== 'all') {
    if (mediaTrayActiveCategory === 'specials') {
      emojis = [];
    } else {
      stickers = [];
      emojis = ALL_UNICODE_EMOJIS.filter(e => e.c === mediaTrayActiveCategory);
    }
  }

  const showSpecials = stickers.length > 0;
  const showEmojis = emojis.length > 0;

  return `
    <div class="media-tray-header">
      <div class="tray-brand-title">✦ <b>Afterclass</b> Emojis & Stickers</div>
      <button class="media-tray-close" onclick="closeMediaTray()">✕</button>
    </div>
    <div class="emoji-search-wrapper">
      <span>🔍</span>
      <input type="text" id="emoji-search-input" placeholder="Search 800+ emojis (e.g. fire, laugh, love, chai)..." value="${mediaTraySearchQuery}" oninput="handleEmojiSearch(this.value)">
    </div>
    <div class="emoji-category-nav">
      ${EMOJI_NAV_TABS.map(tab => `
        <button type="button" class="emoji-category-chip ${mediaTrayActiveCategory === tab.id ? 'active' : ''}" onclick="selectEmojiCategory(event, '${tab.id}')">
          ${tab.label}
        </button>
      `).join('')}
    </div>
    <div class="media-tray-body" id="media-tray-body">
      ${showSpecials ? `
        <div>
          <div class="tray-section-title">✦ CAMPUS SPECIALS</div>
          <div class="sticker-grid">
            ${stickers.map(s => `
              <div class="sticker-item" onclick="insertSticker('${s.insert}', event)" title="${s.label}">
                <span class="sticker-emoji">${s.emoji}</span>
                <span class="sticker-label">${s.label}</span>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      ${showEmojis ? `
        <div>
          <div class="tray-section-title">${mediaTrayActiveCategory === 'all' ? `ALL UNICODE EMOJIS (${emojis.length})` : mediaTrayActiveCategory.toUpperCase() + ` (${emojis.length})`}</div>
          <div class="standard-emoji-grid">
            ${emojis.map(e => `
              <button class="std-emoji-btn" onclick="insertSticker('${e.e}', event)" title="${e.n}">
                ${e.e}
              </button>
            `).join('')}
          </div>
        </div>
      ` : ''}

      ${!showSpecials && !showEmojis ? `
        <p class="muted" style="text-align:center;font-size:12px;padding:30px 0;">No emojis found for "${mediaTraySearchQuery}".</p>
      ` : ''}
    </div>
  `;
}

window.selectEmojiCategory = (e, cat) => {
  e?.stopPropagation?.();
  if (mediaTrayActiveCategory === cat && !mediaTraySearchQuery) return;
  mediaTrayActiveCategory = cat;
  mediaTraySearchQuery = '';
  const tray = document.querySelector('#chat-media-tray');
  if (tray) tray.innerHTML = getMediaTrayFullContent();
};

window.handleEmojiSearch = query => {
  mediaTraySearchQuery = query;
  if (query.trim()) mediaTrayActiveCategory = 'all';
  const body = document.querySelector('#media-tray-body');
  if (body) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = getMediaTrayFullContent();
    const newBody = tempDiv.querySelector('#media-tray-body');
    if (newBody) body.innerHTML = newBody.innerHTML;
  }
};

window.closeMediaTray = (e) => {
  e?.stopPropagation?.();
  document.querySelector('#chat-media-tray')?.remove();
};

window.insertSticker = (text, e) => {
  e?.stopPropagation?.();
  const inputId = mediaTrayTarget === 'campus' ? '#message' : '#private-msg-input';
  const input = document.querySelector(inputId);
  if (input) {
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    const val = input.value;
    input.value = val.substring(0, start) + text + val.substring(end);
    const newPos = start + text.length;
    input.selectionStart = newPos;
    input.selectionEnd = newPos;
    input.focus();
  }
};

document.addEventListener('click', e => {
  const tray = document.querySelector('#chat-media-tray');
  if (tray) {
    const path = e.composedPath ? e.composedPath() : [];
    const isInsideTray = path.includes(tray) || tray.contains(e.target);
    const isMediaBtn = e.target.closest?.('.chat-media-btn');
    if (!isInsideTray && !isMediaBtn) {
      tray.remove();
    }
  }
});

function avatar(nameOrConfig, small = false, isVerified = null) {
  const size = small ? 30 : 40;
  const badgeSize = small ? 12 : 16;
  let svgContent;
  if (!nameOrConfig) svgContent = renderAvatarSvg('Anonymous', size);
  else if (typeof nameOrConfig === 'object') svgContent = renderAvatarSvg(nameOrConfig, size);
  else if (state.me && nameOrConfig === state.me.username && state.me.avatarConfig) {
    svgContent = renderAvatarSvg(state.me.avatarConfig, size);
  } else {
    svgContent = renderAvatarSvg(nameOrConfig, size);
  }

  const verified = isVerified !== null
    ? Boolean(isVerified)
    : (state.me && (nameOrConfig === state.me.username || nameOrConfig === state.me.publicAlias || nameOrConfig === state.me.avatarConfig) ? Boolean(state.me.isVerified) : false);

  if (!verified) return svgContent;

  return `
    <span class="avatar-verified-wrapper" style="position:relative;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;">
      ${svgContent}
      <span class="avatar-verified-badge" style="position:absolute;bottom:-2px;right:-2px;z-index:2;line-height:0;" title="Verified Student">
        ${renderVerifiedBadgeSvg(badgeSize)}
      </span>
    </span>
  `;
}

function renderWarnedStudentBanner() {
  if (!state.me?.latestWarning) return '';
  const w = state.me.latestWarning;
  const issuedStr = w.createdAt ? new Date(w.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  return `
    <div class="student-warning-alert-banner">
      <span class="warning-alert-icon">⚠️</span>
      <div class="warning-alert-content" style="flex:1;">
        <h4>Official Moderator Warning Notice</h4>
        <p>${escapeHtml(w.reason)}</p>
        <small style="display:block;margin-top:4px;color:#9a3412;font-size:11px;">
          Issued on ${issuedStr} · Please adhere to campus community guidelines to maintain active standing.
        </small>
      </div>
      <button type="button" onclick="dismissWarningNotice()" style="background:transparent;border:none;color:#9a3412;font-size:18px;cursor:pointer;line-height:1;padding:4px;" title="Dismiss banner">×</button>
    </div>
  `;
}

window.dismissWarningNotice = () => {
  if (state.me) state.me.latestWarning = null;
  render();
};

function layout(content) {
  const me = state.me;
  const nav = [['home','Home','Home'],['discover','Discover','Explore'],['chat','Campus chat','Chat'],['inbox','Inbox','Inbox'],['safety','Trust & safety','Safety'],['settings','Your space','You']];
  if (me?.isAdmin) nav.push(['admin','Moderation','Admin']);
  const username = me?.username || 'Your campus awaits';
  const campusName = me?.university || 'NIIT University';
  const inboxCount = state.pendingApplications.length;
  const currentLabel = nav.find(([key])=>key===state.view)?.[1] || 'Your campus';
  return `
    <div class="shell experience-shell ${state.view === 'chat' ? 'chat-shell' : ''}">
      <a class="skip-content" href="#main-content">Skip to content</a>
      <aside class="experience-sidebar">
        <a class="brand" href="/" onclick="event.preventDefault();go('home')"><i>✦</i> afterclass<span class="brand-period">.</span></a>
        <div class="campus"><span>YOUR LITTLE CORNER</span><b>${escapeHtml(campusName)}</b><small>Campus community</small></div>
        <nav aria-label="Main navigation">${nav.map(([key,label,mobile])=>`<button type="button" data-nav="${key}" class="${state.view===key?'active':''}" ${state.view===key?'aria-current="page"':''} aria-label="${label}" onclick="go('${key}')"><span class="nav-icon" aria-hidden="true">${icons[key]||'◈'}</span><span class="nav-label">${label}</span><span class="nav-mobile-label">${mobile}</span>${key==='inbox'&&inboxCount?`<em aria-label="${inboxCount} incoming interests">${inboxCount}</em>`:''}</button>`).join('')}</nav>
        <div class="sidebar-invitation"><span aria-hidden="true">✳</span><p>A small plan.<br>A new possibility.</p><button onclick="openComposer()">Make the first move <b>↗</b></button></div>
        <button class="sidebar-bottom" onclick="${me?'openAvatarPreview()':"go('auth')"}" aria-label="${me?'Open your profile':'Join your campus'}">${avatar(me?.avatarConfig||username,false,Boolean(me?.isVerified))}<span class="sidebar-profile-copy"><strong>${escapeHtml(username)}</strong><small>${me?(me.isVerified?'Verified student': 'Student profile'):'Sign in to get started'}</small></span><span class="profile-chevron" aria-hidden="true">↗</span></button>
      </aside>
      <main id="main-content" tabindex="-1" class="${state.view==='chat'?'chat-main':''}">
        <div class="experience-toolbar"><div class="toolbar-location"><span class="toolbar-symbol" aria-hidden="true">✳</span><span>${currentLabel}<small>${escapeHtml(campusName)}</small></span></div><a class="mobile-wordmark" href="/" onclick="event.preventDefault();go('home')">✦ afterclass<span>.</span></a><div class="toolbar-actions"><button class="toolbar-safety" aria-label="Trust and safety" onclick="go('safety')">${icons.safety}</button><button class="toolbar-create" aria-label="Create a plan" onclick="openComposer()"><span aria-hidden="true">＋</span><span class="toolbar-create-label">New plan</span></button><button class="toolbar-profile" aria-label="Open your profile" onclick="${me?'openAvatarPreview()':"go('auth')"}">${avatar(me?.avatarConfig||username,true,Boolean(me?.isVerified))}</button></div></div>
        ${renderWarnedStudentBanner()}${content}
      </main>
    </div><div id="toast" role="status" aria-live="polite" class="toast ${state.toast?'show':''}">${escapeHtml(state.toast)}</div>`;
}

const discovery = { query: '', category: 'all', when: 'any', sort: 'soonest' };
let discoverStatus = 'idle';

function planLoadState() {
  if (!state.me) return `<div class="campus-empty"><span class="campus-empty-icon">↗</span><h3>Your campus is on the other side.</h3><p>Sign in with your university email to see student plans.</p><button class="primary" onclick="go('auth')">Join your campus →</button></div>`;
  if (discoverStatus === 'error') return `<div class="campus-empty" role="status"><span class="campus-empty-icon">↻</span><h3>We couldn’t load campus plans.</h3><p>Your connection may need a moment. Give it another try.</p><button class="primary" onclick="retryDiscover()">Try again</button></div>`;
  if (discoverStatus === 'loading' || discoverStatus === 'idle') return `<div class="campus-empty" role="status"><span class="campus-empty-icon">✦</span><h3>Finding your next small adventure…</h3><p>Loading plans from your campus.</p></div>`;
  return '';
}

function home() {
  const plans = selectPlans(state.requests);
  const today = selectPlans(state.requests, { when: 'today' });
  const date = new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
  return layout(`
    <div class="campus-topline"><span>${escapeHtml(state.me?.university || 'NIIT University')} <span class="campus-divider">/</span> THE COMMON ROOM</span><time>${date}</time></div>
    <section class="campus-hero">
      <div class="campus-hero-copy"><span class="eyebrow">LESS SCROLLING. MORE SHOWING UP.</span>
        <h1>Good company.<br>Small plans.<br><em>Your kind of campus.</em></h1>
        <p>A chai break. A study buddy. One more person for a walk.<br class="desktop-break"> Make room for the people you haven’t met yet.</p>
        <div class="campus-actions"><button class="primary" onclick="go('discover')">Find your next plan <span>↗</span></button><button class="campus-text-action" onclick="openComposer()">Or start one yourself →</button></div>
        <div class="campus-promise"><span>◈</span> An alias first. Your identity, when you choose.</div>
      </div>
      <div class="campus-board" aria-label="A few ideas for your next campus plan">
        <span class="board-caption">THE BEST PLANS START SMALL</span>
        <div class="board-orbit" aria-hidden="true"></div>
        <button class="idea-note note-coffee" onclick="startPlanIdea('coffee')"><span>01 / TAKE A BREAK</span><strong>Chai?<br>Chai.</strong><small>Good conversation, no agenda. ↗</small><i aria-hidden="true">☕</i></button>
        <button class="idea-note note-study" onclick="startPlanIdea('study')"><span>02 / FIND YOUR FOCUS</span><strong>Same deadline.<br>Better company.</strong><small>Find a study buddy ↗</small></button>
        <button class="idea-note note-walk" onclick="startPlanIdea('move')"><span>03 / STEP OUTSIDE</span><strong>A walk.<br>A fresh perspective.</strong><small>Start something simple ↗</small><i aria-hidden="true">↝</i></button>
        <div class="board-stamp" aria-hidden="true">made for<br><b>real life.</b><span>✳</span></div>
      </div>
    </section>
    <section class="campus-intents" aria-label="Plan ideas">${ACTIVITIES.slice(1).map(a=>`<button onclick="browseActivity('${a.id}')"><span class="intent-icon intent-${a.id}">${a.icon}</span><span>${a.label}<small>Find your kind of company</small></span><b>↗</b></button>`).join('')}</section>
    <section class="section-head campus-section-heading"><div><span class="eyebrow">A LITTLE LESS “MAYBE SOMEDAY”</span><h2>Make today a little different.</h2><p>${discoverStatus === 'ready' && state.me ? `${today.length} ${today.length === 1 ? 'plan' : 'plans'} today · ${plans.length} upcoming on your campus` : 'Small invitations. A good place to start.'}</p></div><button class="link" onclick="go('discover')">Explore all plans ↗</button></section>
    <div class="request-grid campus-plan-grid">${planLoadState() || (plans.length ? plans.slice(0,3).map(card).join('') + (plans.length < 3 ? `<button class="campus-start-card ${plans.length===1?'wide':''}" onclick="openComposer()"><span class="eyebrow">THERE’S ROOM FOR YOUR IDEA</span><strong>Someone’s kind of plan<br>could be yours.</strong><span class="start-card-cta">Put out a little invitation <b>↗</b></span><i aria-hidden="true">✳</i></button>` : '') : `<div class="campus-empty"><span class="campus-empty-icon">✳</span><h3>Someone has to make the first move.</h3><p>A quiet campus feed is a blank page. Invite someone to your next coffee break.</p><button class="primary" onclick="startPlanIdea('coffee')">Start a small plan →</button></div>`)}</div>
    <section class="campus-chat-invite"><div class="chat-invite-icon" aria-hidden="true">“</div><div><span class="eyebrow">NOT READY TO MAKE A PLAN?</span><h2>Start with a hello.</h2><p>Drop into campus chat. Ask a question, share a thought, find a familiar voice.</p></div><button class="primary" onclick="go('chat')">Open campus chat ↗</button></section>
    <section class="campus-how"><div><span class="eyebrow">YOUR PACE. YOUR PEOPLE.</span><h2>Meeting someone<br>should feel this easy.</h2><button class="link" onclick="go('safety')">Read our safety guide ↗</button></div><ol><li><span>01</span><div><h3>Show up as yourself. Keep your name.</h3><p>Your public alias is how other students meet you.</p></div></li><li><span>02</span><div><h3>Find a shared little thing.</h3><p>Express interest in a plan. When the host accepts, you get a private conversation.</p></div></li><li><span>03</span><div><h3>Take it offline, on your terms.</h3><p>Choose a public campus spot. Sharing your identity takes mutual consent.</p></div></li></ol></section>
    <footer class="campus-footer"><span>✦ afterclass</span><span>For the life between lectures.</span></footer>
  `);
}

function card(r) {
  const isMine = state.me && r.host?.username === state.me.username;
  const hasApplied = Boolean(r.hasApplied);
  const isSaved = state.savedPlanIds?.has(r.id);
  const activity = activityFor(r);
  const id = escapeHtml(String(r.id));
  return `<article class="plan-card campus-plan-card" data-category="${activity.id}">
    <div class="plan-top"><span class="plan-category"><span>${activity.icon}</span>${activity.label}</span><button type="button" class="plan-bookmark-btn ${isSaved ? 'saved' : ''}" data-save-plan="${id}" aria-label="${isSaved ? 'Unsave' : 'Save'} ${escapeHtml(r.activity)}" aria-pressed="${Boolean(isSaved)}"><svg width="18" height="18" viewBox="0 0 24 24" fill="${isSaved ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.7"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg></button></div>
    <time class="plan-time" datetime="${escapeHtml(r.scheduledAt)}">${planTime(r.scheduledAt)}</time>
    <h3>${escapeHtml(r.activity)}</h3><p class="plan-location">⌖ ${escapeHtml(r.location || 'Campus')}</p>
    <div class="plan-host-row">${avatar(r.host?.username || 'Student')}<span>Hosted by <b>${escapeHtml(r.host?.username || 'Student')}</b></span></div>
    <footer><span>${isMine ? 'Your invitation' : 'Start with a shared plan'}</span>${isMine ? `<button class="campus-text-action" onclick="go('inbox')">Manage →</button>` : hasApplied ? '<button class="applied-btn" disabled>Interest sent ✓</button>' : `<button data-join-plan="${id}">I’m interested ↗</button>`}</footer>
  </article>`;
}

function discoveryResults() {
  const status = planLoadState();
  if (status) return status;
  const displayed = selectPlans(state.requests, { ...discovery, savedOnly: state.discoverFilter === 'saved', savedIds: state.savedPlanIds });
  if (!displayed.length) return `<div class="campus-empty"><span class="campus-empty-icon">✳</span><h3>${state.discoverFilter === 'saved' ? 'Keep a little possibility for later.' : 'Your next plan could start with you.'}</h3><p>${state.discoverFilter === 'saved' ? 'Bookmark a plan to find it here. Only upcoming plans appear.' : 'No upcoming plans match these filters. Try a broader search or put out an invitation.'}</p><div class="campus-actions"><button class="primary" onclick="openComposer()">Create a plan</button><button class="campus-text-action" onclick="resetDiscovery()">Reset filters</button></div></div>`;
  return displayed.map(card).join('');
}

function discoveryCount() {
  if (discoverStatus !== 'ready') return '';
  const count = selectPlans(state.requests, { ...discovery, savedOnly: state.discoverFilter === 'saved', savedIds: state.savedPlanIds }).length;
  return `${count} ${count === 1 ? 'plan' : 'plans'} to make room for`;
}

function discover() {
  const filter = state.discoverFilter || 'all';
  return layout(`<div class="campus-topline"><span>YOUR CAMPUS <span class="campus-divider">/</span> SMALL POSSIBILITIES</span><button class="campus-text-action" onclick="go('home')">← Common room</button></div>
    <section class="discovery-heading"><div><span class="eyebrow">FIND YOUR KIND OF COMPANY</span><h1>Less “we should.”<br><em>More “see you there.”</em></h1><p>Pick a shared interest. Say hello. See where a small plan takes you.</p></div><button class="primary" onclick="openComposer()">＋ Create a plan</button></section>
    <section class="discovery-tools" aria-label="Filter campus plans"><div class="discovery-search-row"><label class="discovery-search"><span aria-hidden="true">⌕</span><input type="search" id="plan-search" value="${escapeHtml(discovery.query)}" placeholder="Try chai, library, badminton…" aria-label="Search activities or locations" oninput="searchCampusPlans(this.value)"></label><label class="discovery-select">When<select onchange="setPlanOption('when',this.value)">${[['any','Any time'],['today','Today'],['tomorrow','Tomorrow'],['week','Next 7 days']].map(([v,l])=>`<option value="${v}" ${discovery.when===v?'selected':''}>${l}</option>`).join('')}</select></label></div>
    <div class="activity-filters" role="group" aria-label="Activity type">${ACTIVITIES.map(a=>`<button aria-pressed="${discovery.category===a.id}" class="${discovery.category===a.id?'selected':''}" onclick="setPlanOption('category','${a.id}')">${a.icon} ${a.label}</button>`).join('')}</div></section>
    <div class="discovery-results-bar"><div class="discovery-tabs"><button class="${filter==='all'?'selected':''}" aria-pressed="${filter==='all'}" onclick="setDiscoverFilter('all')">All plans</button><button class="${filter==='saved'?'selected':''}" aria-pressed="${filter==='saved'}" onclick="setDiscoverFilter('saved')">Saved for later</button></div><label class="discovery-sort">Sort by<select aria-label="Sort plans" onchange="setPlanOption('sort',this.value)"><option value="soonest" ${discovery.sort==='soonest'?'selected':''}>Happening soonest</option><option value="newest" ${discovery.sort==='newest'?'selected':''}>Recently posted</option></select></label></div>
    <p class="discovery-count" id="discovery-count" aria-live="polite">${discoveryCount()}</p><div class="request-grid all campus-plan-grid" id="discovery-results">${discoveryResults()}</div>
    <div class="discovery-nudge"><span>Can’t find your kind of plan?</span><button class="campus-text-action" onclick="openComposer()">Someone else might be waiting for you to start it. ↗</button></div>`);
}

window.browseActivity = category => { discovery.category = category; state.discoverFilter = 'all'; go('discover'); };
window.startPlanIdea = category => { openComposer(); const idea = ACTIVITIES.find(a=>a.id===category); if (idea?.prompt) window.selectQuickActivity(idea.prompt); };
window.searchCampusPlans = query => { discovery.query = query; document.querySelector('#discovery-results').innerHTML = discoveryResults(); document.querySelector('#discovery-count').textContent = discoveryCount(); };
window.setPlanOption = (key,value) => { if (['category','when','sort'].includes(key)) discovery[key]=value; render(); };
window.resetDiscovery = () => { Object.assign(discovery,{query:'',category:'all',when:'any',sort:'soonest'}); state.discoverFilter='all'; render(); };
window.retryDiscover = () => loadDiscover();
document.addEventListener('click', event => {
  const save = event.target.closest('[data-save-plan]');
  if (save) { window.toggleSavePlan(save.dataset.savePlan,event); return; }
  const join = event.target.closest('[data-join-plan]');
  if (join) { const plan=state.requests.find(p=>p.id===join.dataset.joinPlan); if (plan) window.joinPlan(plan.id,plan.activity); }
});

function chat() {
  if (!state.me) return layout(`<section class="chat-access-state"><span aria-hidden="true">${icons.chat}</span><h1>Join your campus conversation.</h1><p>Sign in with your university account to read and send messages.</p><button class="primary" onclick="openAuth()">Sign in to campus chat →</button></section>`);
  setTimeout(() => {
    loadLiveChat();
    renderReplyBar();
  }, 0);
  const username = state.me?.username || 'Anonymous';
  const online = state.campusOnlineCount ?? '—';
  return layout(`
    <section class="chat-layout">
      <div class="chat-panel">
        <div class="chat-title">
          <div>
            <span class="eyebrow">CAMPUS SPACE</span>
            <h2>${state.me?.university || 'NIIT University'} chat <button type="button" class="campus-live-badge clickable" onclick="openCampusMembersModal()" title="View campus members"><i class="live-pulse-dot"></i> <b id="campus-online-count">${online}</b> online</button></h2>
            <p>Say hi. Keep it kind. Be human.</p>
          </div>
          <div class="chat-title-actions">
            <button type="button" class="chat-members-action-btn" onclick="openCampusMembersModal()" title="View who all joined this group">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="9" cy="7" r="4"></circle>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
              </svg>
              <span>Members</span>
            </button>
            <button type="button" onclick="openGuidelines()" title="Campus Guidelines">•••</button>
          </div>
        </div>
        <div class="notice">✦ You’re chatting as <b>${username}</b>. Your identity stays private.</div>
        <div class="messages" id="chat-messages">
          ${chatLoadError ? `<div class="chat-access-state chat-load-error" role="status"><h2>Chat couldn’t load.</h2><p>${escapeHtml(chatLoadError)}</p><button class="primary" onclick="retryCampusChat()">Try again</button></div>` : state.messages.length > 0 ? state.messages.map(renderCampusMessageHtml).join('') : (
            !chatInitialized ? `
              <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:240px;color:var(--muted);gap:10px;">
                <span class="auth-loading-spinner" style="display:inline-block;width:22px;height:22px;border:2.5px solid rgba(0,0,0,0.08);border-top-color:var(--forest);border-radius:50%;animation:spin 0.8s linear infinite;"></span>
                <span style="font-size:13px;font-family:'DM Sans';">Loading campus chat...</span>
              </div>
            ` : `
              <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:240px;color:var(--muted);gap:8px;text-align:center;padding:20px;">
                <div style="width:46px;height:46px;border-radius:50%;background:#eef4ec;color:#244d42;display:flex;align-items:center;justify-content:center;font-size:22px;margin-bottom:2px;">💬</div>
                <div style="font:600 16px 'Playfair Display';color:var(--ink);">Start the conversation</div>
                <div style="font-size:12.5px;color:var(--muted);max-width:280px;line-height:1.45;">A shared space for your campus. Ask a question or be the first to say hello.</div>
              </div>
            `
          )}
        </div>
        <div id="campus-typing-indicator" class="typing-indicator"></div>
        <div id="reply-preview-container"></div>
        <form class="composer" onsubmit="sendMessage(event)">
          <div class="chat-input-pill">
            <button type="button" class="chat-media-btn" onclick="toggleChatMediaTray(event, 'campus')" title="Add emojis & stickers" aria-label="Add emojis">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M8 14s1.5 2 4 2 4-2 4-2"></path>
                <line x1="9" y1="9" x2="9.01" y2="9"></line>
                <line x1="15" y1="9" x2="15.01" y2="9"></line>
              </svg>
            </button>
            <input id="message" maxlength="500" placeholder="Say something to campus…" autocomplete="off" oninput="handleTypingInput()" onblur="stopTypingNow()">
          </div>
          <button type="submit" class="composer-send-btn" title="Send message">↑</button>
        </form>
      </div>
    </section>
  `);
}

function inbox() {
  const activeTab = state.inboxTab || 'matches';
  const myPlansCount = state.myPlans?.length || 0;
  return layout(`
    <section class="page-title compact">
      <span class="eyebrow">YOUR CONNECTIONS & PLANS</span>
      <h1>A little closer.</h1>
      <p>Your conversations, shared plans, and next possibilities.</p>
    </section>

    <div class="inbox-tabs">
      <button type="button" class="${activeTab === 'matches' ? 'active' : ''}" onclick="setInboxTab('matches')">
        Conversations <span class="inbox-tab-count">${state.matches.length}</span>
      </button>
      <button type="button" class="${activeTab === 'my-plans' ? 'active' : ''}" onclick="setInboxTab('my-plans')">
        Your plans <span class="inbox-tab-count">${myPlansCount}</span>
      </button>
    </div>

    ${activeTab === 'matches' ? `
      ${state.pendingApplications.length > 0 ? `
        <section style="margin-top:20px;">
          <h3 style="font-size:16px; margin-bottom:12px;">Incoming Interest on Your Plans</h3>
          ${state.pendingApplications.map(a => `
            <div class="conversation">
              <div class="conversation-avatar">✦</div>
              <div>
                <span class="eyebrow">INTEREST RECEIVED</span>
                <h3>${a.activity}</h3>
                <p>A fellow student wants to join your plan.</p>
              </div>
              <button class="primary" onclick="acceptApplication('${a.id}')">Accept & Open Chat →</button>
            </div>
          `).join('')}
        </section>
      ` : ''}

      ${state.matches.length > 0 ? `
        <section style="margin-top:20px;">
          <h3 style="font-size:16px; margin-bottom:12px;">Active Match Chats</h3>
          ${state.matches.map(m => `
            <div class="conversation">
              <div class="conversation-avatar">☕</div>
              <div>
                <span class="eyebrow">${m.status.toUpperCase()}</span>
                <h3>${m.activity}</h3>
                <p>${avatar(m.other?.username || 'Student', true)} ${m.other?.username || 'Student'} · ${m.location}</p>
              </div>
              <button onclick="openPrivateChat('${m.id}')">Open chat →</button>
            </div>
          `).join('')}
        </section>
      ` : ''}

      ${state.matches.length === 0 && state.pendingApplications.length === 0 ? `
        <div class="empty-inbox">
          <span>✦</span>
          <h2>Every connection starts somewhere.</h2>
          <p>When someone accepts your interest or you accept theirs, your private chat will appear here.</p>
          <button class="primary" onclick="go('discover')">Explore plans</button>
        </div>
      ` : ''}
    ` : `
      <section style="margin-top:20px;">
        ${state.myPlans && state.myPlans.length > 0 ? `
          <div class="my-plans-grid">
            ${state.myPlans.map(p => {
              const isPast = p.scheduledAt && new Date(p.scheduledAt).getTime() < Date.now();
              const isExpired = isPast || (p.expiresAt && new Date(p.expiresAt).getTime() < Date.now());
              const isActive = p.status === 'open' && !isExpired;
              let statusLabel = 'Active';
              let statusClass = 'active';
              if (p.status === 'matched') {
                statusLabel = 'Matched';
                statusClass = 'matched';
              } else if (p.status === 'cancelled') {
                statusLabel = 'Closed';
                statusClass = 'closed';
              } else if (isExpired) {
                statusLabel = 'Expired';
                statusClass = 'closed';
              }
              const dateStr = p.scheduledAt ? new Date(p.scheduledAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
              return `
                <div class="my-plan-card">
                  <div class="my-plan-header">
                    <span class="status-badge ${statusClass}">${statusLabel}</span>
                    <small>${dateStr}</small>
                  </div>
                  <h3>${p.activity}</h3>
                  <p class="muted">📍 ${p.location}</p>
                  <div class="my-plan-footer">
                    <span>👥 ${p.pendingApplicantsCount} applicant${p.pendingApplicantsCount === 1 ? '' : 's'}</span>
                    ${isActive ? `<button class="close-plan-btn" onclick="closeMyPlan('${p.id}')">Close plan</button>` : ''}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        ` : `
          <div class="empty-inbox">
            <span>☕</span>
            <h2>No posted plans yet.</h2>
            <p>Have an idea for a study session, coffee meetup, or gym workout?</p>
            <button class="primary" onclick="openComposer()">＋ Create a plan</button>
          </div>
        `}
      </section>
    `}
  `);
}

function safety() {
  const me = state.me;

  return layout(`
    <section class="page-title compact">
      <span class="eyebrow">CAMPUS TRUST & SAFETY</span>
      <h1>Safety & Trust</h1>
      <p>Transparent community standards, student anonymity guarantees, and zero tolerance policies.</p>
    </section>

    ${me?.isAdmin ? `
      <div class="admin-callout-banner" style="background: linear-gradient(135deg, #1e293b, #0f172a); border: 1px solid #334155; border-radius: 12px; padding: 16px 20px; margin: 24px 0 10px; display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; color: #fff;">
        <div style="display:flex;align-items:center;gap:12px;">
          <span style="font-size:24px;">🛡️</span>
          <div>
            <strong style="font-size:14px;color:#fff;display:block;">Campus Moderator Privileges Active</strong>
            <small style="color:#94a3b8;font-size:12px;">You have administrator access to the Incident Review Queue and Moderator Team Management.</small>
          </div>
        </div>
        <button class="primary" onclick="go('admin')" style="background:#38bdf8;color:#0f172a;border:none;font-weight:700;padding:8px 16px;border-radius:8px;font-size:12.5px;cursor:pointer;white-space:nowrap;">
          Open Admin Portal ⚡
        </button>
      </div>
    ` : ''}

    <div class="safety-grid">
      <article>
        <i>◉</i>
        <h3>Anonymous by default</h3>
        <p>Your institutional email and legal identity are never visible to other students in campus rooms or discovery.</p>
      </article>
      <article>
        <i>♢</i>
        <h3>Mutual reveal only</h3>
        <p>Real identities are exchanged only when both students mutually agree inside a confirmed 1-on-1 private connection.</p>
      </article>
      <article>
        <i>⚑</i>
        <h3>One-tap instant reporting</h3>
        <p>Every message can be reported anonymously. Campus moderators review reports with contextual chat windows to take prompt action.</p>
      </article>
    </div>

    <section class="report-box" style="margin-top: 24px;">
      <div>
        <span class="eyebrow">CAMPUS CODE</span>
        <h2>Community Standards & Zero Tolerance</h2>
        <p>Our platform maintains zero tolerance for harassment, hate speech, bullying, academic dishonesty, or non-consensual disclosure.</p>
      </div>
      <button class="primary" onclick="openGuidelines()">View Guidelines</button>
    </section>

    <div style="margin-top: 28px; background: #fff; border: 1px solid var(--line); border-radius: 14px; padding: 24px;">
      <h3 style="font: 600 20px 'Playfair Display'; margin: 0 0 8px;">How Incident Review Works</h3>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-top: 16px;">
        <div style="background: #fbfcf9; border: 1px solid var(--line); border-radius: 10px; padding: 14px;">
          <b style="font-size: 13.5px; color: var(--ink); display: block; margin-bottom: 4px;">1. Tap to Flag</b>
          <p style="font-size: 12px; color: var(--muted); margin: 0; line-height: 1.5;">Hover or hold any inappropriate message in chat and tap "Report" with the specific category.</p>
        </div>
        <div style="background: #fbfcf9; border: 1px solid var(--line); border-radius: 10px; padding: 14px;">
          <b style="font-size: 13.5px; color: var(--ink); display: block; margin-bottom: 4px;">2. Contextual Review</b>
          <p style="font-size: 12px; color: var(--muted); margin: 0; line-height: 1.5;">Authorized moderators review the surrounding conversation (5 messages before and 5 after) to make fair decisions.</p>
        </div>
        <div style="background: #fbfcf9; border: 1px solid var(--line); border-radius: 10px; padding: 14px;">
          <b style="font-size: 13.5px; color: var(--ink); display: block; margin-bottom: 4px;">3. Swift Resolution</b>
          <p style="font-size: 12px; color: var(--muted); margin: 0; line-height: 1.5;">Violating messages are removed and repeat offenders receive temporary timeouts or permanent bans.</p>
        </div>
      </div>
    </div>
  `);
}

function adminPortal() {
  const me = state.me;
  if (!me?.isAdmin) {
    return layout(`
      <section class="page-title compact">
        <span class="eyebrow" style="color: #dc2626;">RESTRICTED ACCESS</span>
        <h1>Admin & Staff Portal</h1>
        <p>This portal is restricted to authorized campus administrators and designated moderators.</p>
      </section>
      <div style="padding: 50px 24px; text-align: center; background: #fff; border-radius: 16px; border: 1px dashed var(--line); margin-top: 24px;">
        <div style="font-size: 48px; margin-bottom: 12px;">🔒</div>
        <h3 style="font: 600 22px 'Playfair Display'; margin: 0 0 8px;">Access Denied</h3>
        <p style="color: var(--muted); max-width: 440px; margin: 0 auto 20px; font-size: 13.5px; line-height: 1.5;">
          The account <b>${escapeHtml(me?.email || me?.username || 'Guest')}</b> does not have administrative privileges. Contact your university platform lead to request moderator permissions.
        </p>
        <button class="primary" onclick="go('home')">Return to Campus Home</button>
      </div>
    `);
  }

  const tab = state.adminTab || 'reports';
  const filter = state.adminFilter || 'pending';
  const reports = state.adminReports || [];
  const primaryAdmins = state.adminPrimaryAdmins || [];
  const teamModerators = state.adminModerators || [];

  const pendingCount = reports.filter(r => r.status === 'pending').length;
  const resolvedCount = reports.filter(r => r.status !== 'pending').length;
  const totalReportsCount = reports.length;
  const totalStaffCount = primaryAdmins.length + teamModerators.length;

  let filteredReports = reports;
  if (filter === 'pending') {
    filteredReports = reports.filter(r => r.status === 'pending');
  } else if (filter === 'resolved') {
    filteredReports = reports.filter(r => r.status !== 'pending');
  }

  // Group reports by reported user with rich analytics
  const userGroupsMap = {};
  filteredReports.forEach(r => {
    const uid = r.reportedUser?.id || r.reportedUserId || (r.reportedUser?.email || 'unknown');
    if (!userGroupsMap[uid]) {
      userGroupsMap[uid] = {
        userId: uid,
        user: r.reportedUser,
        reports: []
      };
    }
    userGroupsMap[uid].reports.push(r);
  });

  const allUserGroups = Object.values(userGroupsMap).map(g => {
    const pendingInGroup = g.reports.filter(r => r.status === 'pending').length;
    const resolvedInGroup = g.reports.filter(r => r.status !== 'pending').length;

    // Calculate unique and repeat reporters
    const reporterCounts = {};
    g.reports.forEach(r => {
      const repKey = r.reporter?.publicAlias || r.reporter?.alias || r.reporter?.email || 'Anonymous';
      reporterCounts[repKey] = (reporterCounts[repKey] || 0) + 1;
    });

    const uniqueReporters = Object.keys(reporterCounts).length;
    const repeatReporters = Object.entries(reporterCounts)
      .filter(([_, count]) => count > 1)
      .map(([alias, count]) => ({ alias, count }));

    // Find latest report date
    const latestDate = g.reports.reduce((latest, r) => {
      const d = new Date(r.createdAt);
      return !latest || d > latest ? d : latest;
    }, null);

    const warningCount = g.user?.warningCount || 0;

    return {
      ...g,
      pendingCount: pendingInGroup,
      resolvedCount: resolvedInGroup,
      uniqueReporters,
      repeatReporters,
      latestDate,
      warningCount
    };
  });

  // Calculate active filter count
  let activeFilterCount = 0;
  if (state.adminFilterAccountStatus && state.adminFilterAccountStatus !== 'all') activeFilterCount++;
  if (state.adminFilterWarnings && state.adminFilterWarnings !== 'all') activeFilterCount++;
  if (state.adminFilterReporters && state.adminFilterReporters !== 'all') activeFilterCount++;
  if (state.adminFilterReason && state.adminFilterReason !== 'all') activeFilterCount++;

  // Apply Search & Filters to user groups
  let userGroups = allUserGroups;

  // 1. Text Search Filter
  const q = (state.adminSearch || '').trim().toLowerCase();
  if (q) {
    userGroups = userGroups.filter(g => {
      const alias = (g.user?.publicAlias || g.user?.alias || '').toLowerCase();
      const username = (g.user?.username || '').toLowerCase();
      const email = (g.user?.email || '').toLowerCase();
      const reporters = g.reports.map(r => (r.reporter?.publicAlias || r.reporter?.email || '').toLowerCase()).join(' ');
      const reasons = g.reports.map(r => (r.reason || '').toLowerCase()).join(' ');
      return alias.includes(q) || username.includes(q) || email.includes(q) || reporters.includes(q) || reasons.includes(q);
    });
  }

  // 2. Account Status Filter
  if (state.adminFilterAccountStatus === 'active') {
    userGroups = userGroups.filter(g => {
      const isBanned = g.user?.accountStatus === 'banned' || g.user?.isBanned;
      const isTimedOut = g.user?.suspendedUntil && new Date(g.user.suspendedUntil) > new Date();
      return !isBanned && !isTimedOut;
    });
  } else if (state.adminFilterAccountStatus === 'suspended') {
    userGroups = userGroups.filter(g => g.user?.suspendedUntil && new Date(g.user.suspendedUntil) > new Date());
  } else if (state.adminFilterAccountStatus === 'banned') {
    userGroups = userGroups.filter(g => g.user?.accountStatus === 'banned' || g.user?.isBanned);
  }

  // 3. Warnings Filter
  if (state.adminFilterWarnings === 'warned') {
    userGroups = userGroups.filter(g => g.warningCount > 0);
  } else if (state.adminFilterWarnings === 'clean') {
    userGroups = userGroups.filter(g => g.warningCount === 0);
  }

  // 4. Reporter Pattern Filter
  if (state.adminFilterReporters === 'repeat') {
    userGroups = userGroups.filter(g => g.repeatReporters.length > 0);
  } else if (state.adminFilterReporters === 'distinct') {
    userGroups = userGroups.filter(g => g.repeatReporters.length === 0);
  }

  // 5. Incident Reason Filter
  if (state.adminFilterReason && state.adminFilterReason !== 'all') {
    userGroups = userGroups.filter(g => g.reports.some(r => r.reason === state.adminFilterReason));
  }

  // 6. Sorting
  const sortBy = state.adminSortBy || 'pending';
  const sortOrder = state.adminSortOrder || 'desc';
  const multiplier = sortOrder === 'asc' ? 1 : -1;

  userGroups.sort((a, b) => {
    if (sortBy === 'pending') {
      if (b.pendingCount !== a.pendingCount) return (b.pendingCount - a.pendingCount) * multiplier;
      return (b.reports.length - a.reports.length) * multiplier;
    }
    if (sortBy === 'latest') {
      const timeA = a.latestDate ? new Date(a.latestDate).getTime() : 0;
      const timeB = b.latestDate ? new Date(b.latestDate).getTime() : 0;
      return (timeA - timeB) * multiplier;
    }
    if (sortBy === 'reports') {
      return (a.reports.length - b.reports.length) * multiplier;
    }
    if (sortBy === 'warnings') {
      return (a.warningCount - b.warningCount) * multiplier;
    }
    if (sortBy === 'alias') {
      const nameA = (a.user?.publicAlias || a.user?.alias || '').toLowerCase();
      const nameB = (b.user?.publicAlias || b.user?.alias || '').toLowerCase();
      return nameA.localeCompare(nameB) * (sortOrder === 'asc' ? 1 : -1);
    }
    return 0;
  });

  return layout(`
    <div class="admin-portal-wrapper">
      <section class="admin-header-card">
        <div class="admin-header-left">
          <span class="admin-eyebrow-pill">CAMPUS MODERATION & GOVERNANCE</span>
          <h1 class="admin-title">Admin & Moderation Portal</h1>
          <div class="admin-meta-row">
            <span>Signed in as <b>${escapeHtml(me.email || me.username)}</b></span>
            <span class="admin-dot-sep">·</span>
            <span>Campus: <b>${escapeHtml(me.university || 'NIIT University')}</b></span>
          </div>
        </div>
        <div class="admin-header-actions">
          <button type="button" class="admin-btn-secondary" onclick="loadAdminData()" title="Reload reports and staff list">
            ↻ Refresh Queue
          </button>
        </div>
      </section>

      <div class="admin-toolbar-row">
        <div class="admin-view-tabs">
          <button type="button" class="admin-view-tab ${tab === 'reports' ? 'active' : ''}" onclick="setAdminTab('reports')">
            🛡️ Incident Reports ${pendingCount > 0 ? `<span class="tab-counter urgent">${pendingCount}</span>` : `<span class="tab-counter">${totalReportsCount}</span>`}
          </button>
          <button type="button" class="admin-view-tab ${tab === 'verifications' ? 'active' : ''}" onclick="setAdminTab('verifications')">
            📸 Student Verifications ${(state.adminVerifications?.length || 0) > 0 ? `<span class="tab-counter urgent">${state.adminVerifications.length}</span>` : `<span class="tab-counter">0</span>`}
          </button>
          <button type="button" class="admin-view-tab ${tab === 'moderators' ? 'active' : ''}" onclick="setAdminTab('moderators')">
            👥 Moderator Team <span class="tab-counter">${totalStaffCount}</span>
          </button>
        </div>

        ${tab === 'reports' ? `
          <div class="admin-filter-group">
            <button type="button" class="admin-filter-pill ${filter === 'pending' ? 'active' : ''}" onclick="setAdminFilter('pending')">
              Pending (${pendingCount})
            </button>
            <button type="button" class="admin-filter-pill ${filter === 'resolved' ? 'active' : ''}" onclick="setAdminFilter('resolved')">
              Resolved (${resolvedCount})
            </button>
            <button type="button" class="admin-filter-pill ${filter === 'all' ? 'active' : ''}" onclick="setAdminFilter('all')">
              All (${totalReportsCount})
            </button>
          </div>
        ` : ''}
      </div>

      ${tab === 'reports' ? `
        <div class="admin-reports-panel">
          ${state.adminLoading ? `
            <div class="admin-empty-state" style="padding: 40px; text-align: center; background:#fff; border-radius:14px; border:1px solid var(--line);">
              <p style="color: var(--muted); margin:0;">Loading incidents & contextual chat transcripts...</p>
            </div>
          ` : allUserGroups.length === 0 ? `
            <div class="admin-empty-state" style="padding: 50px 20px; text-align: center; background: #fff; border-radius: 14px; border: 1px dashed var(--line);">
              <span style="font-size: 38px;">🛡️</span>
              <h3 style="margin: 10px 0 6px; font: 600 20px 'Playfair Display';">Queue is clear!</h3>
              <p style="color: var(--muted); font-size: 13px; max-width: 420px; margin: 0 auto;">
                ${filter === 'pending' ? 'No pending incident reports. All campus interactions are currently in good standing.' : 'No incident reports match this filter.'}
              </p>
            </div>
          ` : state.adminSelectedUserId ? `
            <div class="admin-dossier-wrapper">
              <div class="admin-dossier-nav-bar">
                <button type="button" class="admin-back-btn" onclick="clearAdminUserSelection()">
                  ← Back to Reported Users Table
                </button>
                <div style="font: 500 12px 'DM Sans'; color: var(--muted);">
                  Viewing Incident Dossier for <b>${escapeHtml(allUserGroups.find(g => g.userId === state.adminSelectedUserId)?.user?.publicAlias || 'Student')}</b>
                </div>
              </div>
              ${(() => {
                const selectedGroup = allUserGroups.find(g => g.userId === state.adminSelectedUserId);
                return selectedGroup ? renderAdminUserGroup(selectedGroup) : `
                  <div class="admin-empty-state" style="padding: 30px; text-align: center; background: #fff; border-radius: 12px; border: 1px dashed var(--line);">
                    <p style="color: var(--muted); margin-bottom: 12px;">This student has no reports under the current filter (${filter}).</p>
                    <button type="button" class="admin-back-btn" onclick="clearAdminUserSelection()">← Back to Reported Users Table</button>
                  </div>
                `;
              })()}
            </div>
          ` : `
            <!-- Search, Advanced Filters & Sorting Controls -->
            <div class="admin-controls-card">
              <div class="admin-search-row">
                <div class="admin-search-input-wrap">
                  <span class="admin-search-icon">🔍</span>
                  <input 
                    type="text" 
                    id="admin-search-box"
                    class="admin-search-input" 
                    placeholder="Search student by username, alias, or email..." 
                    value="${escapeHtml(state.adminSearch || '')}"
                    oninput="setAdminSearch(this.value)"
                  />
                  ${state.adminSearch ? `
                    <button type="button" class="admin-search-clear" onclick="clearAdminSearch()" title="Clear search">×</button>
                  ` : ''}
                </div>

                <button type="button" class="admin-filter-toggle-btn ${state.adminFiltersOpen || activeFilterCount > 0 ? 'active' : ''}" onclick="toggleAdminFilters()">
                  <span>⚙️ Filters</span>
                  ${activeFilterCount > 0 ? `<span class="filter-count-badge">${activeFilterCount}</span>` : ''}
                  <span class="filter-arrow">${state.adminFiltersOpen ? '▲' : '▼'}</span>
                </button>

                <div class="admin-sort-group">
                  <label class="admin-sort-label">Sort:</label>
                  <select class="admin-sort-select" onchange="setAdminSortBy(this.value)">
                    <option value="pending" ${sortBy === 'pending' ? 'selected' : ''}>Pending Reports</option>
                    <option value="latest" ${sortBy === 'latest' ? 'selected' : ''}>Latest Incident</option>
                    <option value="reports" ${sortBy === 'reports' ? 'selected' : ''}>Total Reports</option>
                    <option value="warnings" ${sortBy === 'warnings' ? 'selected' : ''}>Warning Count</option>
                    <option value="alias" ${sortBy === 'alias' ? 'selected' : ''}>Student Name (A-Z)</option>
                  </select>
                  <button type="button" class="admin-sort-dir-btn" onclick="toggleAdminSortOrder()" title="${sortOrder === 'desc' ? 'Descending order (Click to switch to Ascending)' : 'Ascending order (Click to switch to Descending)'}">
                    ${sortOrder === 'desc' ? '↓ Desc' : '↑ Asc'}
                  </button>
                </div>
              </div>

              ${state.adminFiltersOpen ? `
                <div class="admin-filter-tray">
                  <div class="filter-tray-section">
                    <span class="filter-tray-label">ACCOUNT:</span>
                    <div class="filter-chip-row">
                      <button type="button" class="filter-chip ${state.adminFilterAccountStatus === 'all' ? 'active' : ''}" onclick="setAdminFilterAccountStatus('all')">All</button>
                      <button type="button" class="filter-chip ${state.adminFilterAccountStatus === 'active' ? 'active' : ''}" onclick="setAdminFilterAccountStatus('active')">● Active</button>
                      <button type="button" class="filter-chip ${state.adminFilterAccountStatus === 'suspended' ? 'active' : ''}" onclick="setAdminFilterAccountStatus('suspended')">⏱️ Timed Out</button>
                      <button type="button" class="filter-chip ${state.adminFilterAccountStatus === 'banned' ? 'active' : ''}" onclick="setAdminFilterAccountStatus('banned')">🚫 Banned</button>
                    </div>
                  </div>

                  <div class="filter-tray-section">
                    <span class="filter-tray-label">WARNINGS:</span>
                    <div class="filter-chip-row">
                      <button type="button" class="filter-chip ${state.adminFilterWarnings === 'all' ? 'active' : ''}" onclick="setAdminFilterWarnings('all')">All</button>
                      <button type="button" class="filter-chip ${state.adminFilterWarnings === 'warned' ? 'active' : ''}" onclick="setAdminFilterWarnings('warned')">⚠️ Has Warnings</button>
                      <button type="button" class="filter-chip ${state.adminFilterWarnings === 'clean' ? 'active' : ''}" onclick="setAdminFilterWarnings('clean')">0 Warnings</button>
                    </div>
                  </div>

                  <div class="filter-tray-section">
                    <span class="filter-tray-label">PATTERN:</span>
                    <div class="filter-chip-row">
                      <button type="button" class="filter-chip ${state.adminFilterReporters === 'all' ? 'active' : ''}" onclick="setAdminFilterReporters('all')">All</button>
                      <button type="button" class="filter-chip ${state.adminFilterReporters === 'repeat' ? 'active' : ''}" onclick="setAdminFilterReporters('repeat')">⚠️ Repeat (3x)</button>
                      <button type="button" class="filter-chip ${state.adminFilterReporters === 'distinct' ? 'active' : ''}" onclick="setAdminFilterReporters('distinct')">✓ Distinct</button>
                    </div>
                  </div>

                  <div class="filter-tray-section">
                    <span class="filter-tray-label">REASON:</span>
                    <select class="filter-select-input" onchange="setAdminFilterReason(this.value)">
                      <option value="all" ${state.adminFilterReason === 'all' ? 'selected' : ''}>All Violation Types</option>
                      <option value="inappropriate_content" ${state.adminFilterReason === 'inappropriate_content' ? 'selected' : ''}>Inappropriate Content</option>
                      <option value="harassment" ${state.adminFilterReason === 'harassment' ? 'selected' : ''}>Harassment & Bullying</option>
                      <option value="spam" ${state.adminFilterReason === 'spam' ? 'selected' : ''}>Spam / Commercial</option>
                      <option value="privacy_violation" ${state.adminFilterReason === 'privacy_violation' ? 'selected' : ''}>Privacy Violation</option>
                    </select>
                  </div>

                  ${(activeFilterCount > 0 || state.adminSearch) ? `
                    <div style="margin-left: auto;">
                      <button type="button" class="admin-reset-filters-btn" onclick="resetAdminFilters()">
                        ✕ Clear Filters
                      </button>
                    </div>
                  ` : ''}
                </div>
              ` : ''}
            </div>

            ${userGroups.length === 0 ? `
              <div class="admin-empty-state" style="padding: 36px 20px; text-align: center; background: #fff; border-radius: 12px; border: 1px dashed var(--line); margin-bottom: 12px;">
                <span style="font-size: 32px;">🔍</span>
                <h3 style="margin: 8px 0 4px; font: 600 17px 'Playfair Display';">No matching students found</h3>
                <p style="color: var(--muted); font-size: 12.5px; max-width: 360px; margin: 0 auto 12px;">
                  No reported students matched your search or active filter settings.
                </p>
                <button type="button" class="admin-btn-secondary" onclick="resetAdminFilters()">Reset Search & Filters</button>
              </div>
            ` : `
              <div style="margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
                <span style="font: 600 12.5px 'DM Sans'; color: var(--ink);">
                  Reported Students Index (${userGroups.length} student${userGroups.length === 1 ? '' : 's'} · ${userGroups.reduce((acc, g) => acc + g.reports.length, 0)} incident${userGroups.reduce((acc, g) => acc + g.reports.length, 0) === 1 ? '' : 's'})
                  ${(state.adminSearch || activeFilterCount > 0) ? `<span style="font-size: 11px; color: #b45309; font-weight: 500; margin-left: 6px;">(filtered from ${allUserGroups.length})</span>` : ''}
                </span>
                <span style="font: 500 11.5px 'DM Mono'; color: var(--muted);">
                  Click row to view dossier & transcripts
                </span>
              </div>
              ${renderAdminUsersTable(userGroups)}
            `}
          `}
        </div>
      ` : tab === 'verifications' ? `
        ${renderAdminVerificationsPanel()}
      ` : `
        <div class="admin-team-panel" style="display:flex;flex-direction:column;gap:16px;">
          <div class="admin-team-card" style="background:#fff;border:1px solid var(--line);border-radius:14px;padding:20px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
              <div>
                <h3 style="font:600 18px 'Playfair Display';margin:0 0 4px;">Add Administrator or Moderator</h3>
                <p style="font-size:12.5px;color:var(--muted);margin:0;">
                  Grant team access by email. You can add trusted moderators or designate permanent root co-owners.
                </p>
              </div>
              <span style="font-size: 24px;">👑</span>
            </div>

            <form onsubmit="event.preventDefault(); handleAdminAddModerator();" style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap;align-items:center;">
              <input 
                type="email" 
                id="admin-mod-email-input" 
                placeholder="e.g. colleague@niituniversity.in" 
                required
                style="flex: 2; min-width: 240px; border: 1px solid var(--line); border-radius: 8px; padding: 10px 14px; font: 13px 'DM Sans';"
              />
              <select 
                id="admin-mod-role-select" 
                style="flex: 1; min-width: 200px; border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; font: 600 12.5px 'DM Sans'; background: #fff; color: var(--ink); cursor: pointer;"
              >
                <option value="moderator">🛡️ Team Moderator</option>
                <option value="super_admin">👑 Permanent Root Owner</option>
              </select>
              <button type="submit" class="admin-btn-primary" style="white-space:nowrap;padding:10px 18px;font-weight:600;">
                + Grant Access
              </button>
            </form>
            <div style="display:flex;gap:16px;margin-top:10px;font-size:11.5px;color:var(--muted);flex-wrap:wrap;">
              <span>• <b>Team Moderator:</b> Can review incident reports and student selfies (can be revoked anytime).</span>
              <span>• <b>Permanent Root Owner:</b> Un-removable super admin configured permanently into system settings.</span>
            </div>
          </div>

          <div class="admin-team-card" style="background:#fff;border:1px solid var(--line);border-radius:14px;padding:20px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
              <div>
                <h3 style="font:600 18px 'Playfair Display';margin:0 0 4px;">Primary System Administrators (${primaryAdmins.length})</h3>
                <p style="font-size:12.5px;color:var(--muted);margin:0;">
                  Built-in root administrative accounts defined in application configuration.
                </p>
              </div>
              <span style="font-size: 20px;">👑</span>
            </div>

            ${primaryAdmins.length === 0 ? `
              <div style="padding: 20px; text-align: center; color: var(--muted); font-size: 12.5px; background: #fafbf9; border-radius: 8px; border: 1px dashed var(--line);">
                No static root administrators configured.
              </div>
            ` : `
              <div style="display:flex;flex-direction:column;gap:8px;margin-top:8px;">
                ${primaryAdmins.map(email => {
                  const isSelf = email.toLowerCase() === (me?.email || '').toLowerCase();
                  return `
                  <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:#fbfcf9;border:1px solid var(--line);border-radius:8px;flex-wrap:wrap;gap:8px;">
                    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                      <strong style="font-size:13px;color:var(--ink);">${escapeHtml(email)}</strong>
                      <span style="background:#fef3c7;color:#92400e;font:700 10.5px 'DM Sans';padding:2px 7px;border-radius:4px;">Primary Super Admin</span>
                      ${isSelf ? '<span style="background:#ecfdf5;color:#047857;font:600 10.5px \'DM Sans\';padding:2px 6px;border-radius:4px;">You</span>' : ''}
                    </div>
                    ${isSelf ? `
                      <span style="background:#f8fafc;border:1px solid #cbd5e1;color:#475569;font:600 11px 'DM Sans';padding:4px 10px;border-radius:6px;display:inline-flex;align-items:center;gap:4px;">
                        🔒 You (Primary Owner)
                      </span>
                    ` : `
                      <button 
                        onclick="handleAdminRemoveModerator('${escapeHtml(email)}')"
                        style="background:#fff1f2;border:1px solid #fecdd3;color:#e11d48;font:600 11.5px 'DM Sans';padding:4px 10px;border-radius:6px;cursor:pointer;display:inline-flex;align-items:center;gap:4px;transition:all 0.15s ease;"
                        onmouseover="this.style.background='#ffe4e6'"
                        onmouseout="this.style.background='#fff1f2'"
                        title="Remove Administrator Access"
                      >
                        🗑️ Remove Access
                      </button>
                    `}
                  </div>
                `;}).join('')}
              </div>
            `}
          </div>

          <div class="admin-team-card" style="background:#fff;border:1px solid var(--line);border-radius:14px;padding:20px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
              <div>
                <h3 style="font:600 18px 'Playfair Display';margin:0 0 4px;">Dynamic Team Moderators (${teamModerators.length})</h3>
                <p style="font-size:12.5px;color:var(--muted);margin:0;">
                  Colleagues and team members added via this portal to scale customer and incident operations.
                </p>
              </div>
              <span style="font-size: 20px;">🛡️</span>
            </div>

            ${teamModerators.length === 0 ? `
              <div style="padding: 20px; text-align: center; color: var(--muted); font-size: 12.5px; background: #fafbf9; border-radius: 8px; border: 1px dashed var(--line);">
                No dynamic team moderators added yet. Invite team members above to share report reviews!
              </div>
            ` : `
              <div style="display:flex;flex-direction:column;gap:8px;margin-top:8px;">
                ${teamModerators.map(mod => {
                  const modEmail = typeof mod === 'string' ? mod : mod.email;
                  const modDate = mod.addedAt ? new Date(mod.addedAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recently';
                  const isSelf = modEmail.toLowerCase() === (me?.email || '').toLowerCase();
                  return `
                  <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:#fbfcf9;border:1px solid var(--line);border-radius:8px;flex-wrap:wrap;gap:8px;">
                    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                      <strong style="font-size:13px;color:var(--ink);">${escapeHtml(modEmail)}</strong>
                      <span style="background:#e0f2fe;color:#0369a1;font:700 10.5px 'DM Sans';padding:2px 7px;border-radius:4px;">Team Moderator</span>
                      <small style="color:var(--muted);font-size:11.5px;">Added ${modDate}</small>
                    </div>
                    ${isSelf ? `
                      <span style="background:#f1f5f9;color:#64748b;font:600 11px 'DM Sans';padding:4px 10px;border-radius:6px;">Current Session</span>
                    ` : `
                      <button 
                        type="button"
                        onclick="handleAdminRemoveModerator('${escapeHtml(modEmail)}')"
                        style="background:#fff;border:1px solid #fca5a5;color:#dc2626;font:600 11.5px 'DM Sans';padding:4px 10px;border-radius:6px;cursor:pointer;"
                        title="Revoke moderator permissions"
                      >
                        Remove Access
                      </button>
                    `}
                  </div>
                `;
                }).join('')}
              </div>
            `}
          </div>
        </div>
      `}
    </div>
  `);
}

function renderAdminVerificationsPanel() {
  const verifs = state.adminVerifications || [];
  return `
    <div class="admin-verifications-panel" style="display:flex;flex-direction:column;gap:16px;">
      <div class="admin-verif-header-banner" style="background:#fff;border:1px solid var(--line);border-radius:14px;padding:20px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
        <div>
          <h3 style="font:600 19px 'Playfair Display';margin:0 0 4px;color:var(--ink);">Student Verification Queue</h3>
          <p style="font-size:12.5px;color:var(--muted);margin:0;max-width:600px;line-height:1.45;">
            Ephemeral live selfies for identity &amp; gender verification. <b>Images are compressed in-browser (~30KB) and permanently deleted the second you take action (0 KB retained).</b>
          </p>
        </div>
        <span class="stats-pill" style="font-size:12px;padding:5px 12px;background:#f0fdf4;color:#15803d;border-color:#bbf7d0;">
          🛡️ ${verifs.length} Pending Review
        </span>
      </div>

      ${verifs.length === 0 ? `
        <div class="admin-empty-state" style="padding: 60px 20px; text-align: center; background: #fff; border-radius: 14px; border: 1px dashed var(--line);">
          <span style="font-size: 42px;">🛡️</span>
          <h3 style="margin: 12px 0 6px; font: 600 20px 'Playfair Display';">Verification queue is completely clear!</h3>
          <p style="color: var(--muted); font-size: 13px; max-width: 440px; margin: 0 auto;">
            No pending student verification selfies. All registered student identities and genders are verified.
          </p>
        </div>
      ` : `
        <div class="admin-verif-grid" style="display:grid;grid-template-columns:repeat(auto-fill, minmax(320px, 1fr));gap:16px;">
          ${verifs.map(v => `
            <div class="admin-verif-card" id="verif-card-${v.id}" style="background:#fff;border:1px solid var(--line);border-radius:14px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,0.03);display:flex;flex-direction:column;">
              <div class="admin-verif-card-photo" style="position:relative;background:#0d1613;height:240px;display:flex;align-items:center;justify-content:center;overflow:hidden;">
                ${v.photoUrl ? `
                  <img src="${v.photoUrl}" alt="Verification Selfie" style="width:100%;height:100%;object-fit:cover;cursor:pointer;" onclick="openPhotoEnlarge('${v.photoUrl}')" title="Click to enlarge photo" onerror="this.onerror=null; this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='flex';">
                  <div style="display:none;color:rgba(255,255,255,0.6);font-size:12.5px;flex-direction:column;align-items:center;gap:6px;"><span style="font-size:24px;">📷</span><span>Photo unavailable</span></div>
                ` : `
                  <div style="color:rgba(255,255,255,0.4);font-size:13px;">No photo available</div>
                `}
                <span style="position:absolute;bottom:10px;left:10px;background:rgba(0,0,0,0.75);backdrop-filter:blur(4px);color:#fff;font:600 11px 'DM Sans';padding:4px 10px;border-radius:20px;display:inline-flex;align-items:center;gap:5px;">
                  Gesture: <b>${escapeHtml(v.verificationGesture?.replace('_', ' ').toUpperCase() || 'PEACE SIGN')}</b>
                </span>
              </div>
              <div class="admin-verif-card-body" style="padding:18px;display:flex;flex-direction:column;flex:1;">
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
                  ${avatar(v.publicAlias, false, false)}
                  <div>
                    <strong style="font-size:15px;color:var(--ink);display:block;">${escapeHtml(v.publicAlias)}</strong>
                    <span style="font-size:11.5px;color:var(--muted);word-break:break-all;">${escapeHtml(v.email)}</span>
                  </div>
                </div>

                <div style="display:flex;align-items:center;gap:8px;margin:8px 0 14px;flex-wrap:wrap;">
                  <span style="font-size:11px;font-weight:600;padding:3px 8px;border-radius:12px;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;">
                    Declared: <b>${v.gender === 'woman' ? 'Woman 👩' : (v.gender === 'man' ? 'Man 👨' : v.gender || 'Unknown')}</b>
                  </span>
                  <span style="font-size:11px;color:var(--muted);">
                    Submitted ${v.submittedAt ? formatMemberTimeAgo(v.submittedAt) : 'recently'}
                  </span>
                </div>

                <div style="margin-top:auto;display:grid;grid-template-columns:1fr 1fr;gap:10px;padding-top:12px;border-top:1px solid var(--line);">
                  <button type="button" class="primary" onclick="approveStudentVerification('${v.id}')" style="font-size:12px;padding:9px 12px;font-weight:700;white-space:nowrap;" title="Approve & permanently delete image">
                    ✓ Approve
                  </button>
                  <button type="button" class="secondary" onclick="rejectStudentVerification('${v.id}', '${v.gender || ''}', '${escapeHtml(v.publicAlias || '')}')" style="font-size:12px;padding:9px 12px;color:#dc2626;border-color:#fecaca;" title="Reject & delete image">
                    ✕ Reject
                  </button>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      `}
    </div>
  `;
}

function renderAdminUsersTable(userGroups) {
  return `
    <div class="admin-table-container">
      <div class="admin-table-responsive">
        <table class="admin-users-table">
          <thead>
            <tr>
              <th style="width: 32%;">Reported Student</th>
              <th style="width: 27%;">Incidents & Patterns</th>
              <th style="width: 23%;">Warnings & Activity</th>
              <th style="width: 18%; text-align: right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${userGroups.map(g => renderAdminUserTableRow(g)).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderAdminUserTableRow(g) {
  const userAlias = g.user?.publicAlias || g.user?.alias || 'Student';
  const userEmail = g.user?.email || '';
  const isBanned = g.user?.accountStatus === 'banned' || g.user?.isBanned;
  const isTimedOut = g.user?.suspendedUntil && new Date(g.user.suspendedUntil) > new Date();

  const statusBadge = isBanned 
    ? '<span class="punish-chip banned" style="display:inline-block;padding:2px 6px;font-size:10.5px;">● Banned</span>' 
    : (isTimedOut 
      ? '<span class="punish-chip timed-out" style="display:inline-block;padding:2px 6px;font-size:10.5px;">⏱️ Timed Out</span>' 
      : '<span class="punish-chip active" style="display:inline-block;padding:2px 6px;font-size:10.5px;">● Active</span>');

  const repeatHtml = g.repeatReporters.length > 0
    ? `<span class="repeat-reporter-badge" title="Same student reported this user multiple times">⚠️ ${g.repeatReporters.map(r => `${escapeHtml(r.alias)} (${r.count}x)`).join(', ')}</span>`
    : `<span class="clean-reporter-badge">✓ All distinct</span>`;

  const warningHtml = g.warningCount > 0
    ? `<span class="warning-badge-pill">⚠️ ${g.warningCount} Warning${g.warningCount === 1 ? '' : 's'}</span>`
    : `<span class="warning-badge-pill none">0 Warnings</span>`;

  const latestStr = g.latestDate 
    ? new Date(g.latestDate).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';

  return `
    <tr class="admin-table-row" onclick="selectAdminUser('${g.userId}')" title="Click to open detailed incident dossier & transcripts">
      <td>
        <div class="admin-user-cell">
          ${avatar(g.user?.avatarConfig || userAlias, false)}
          <div class="admin-user-info">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
              <strong class="admin-user-alias">${escapeHtml(userAlias)}</strong>
              ${statusBadge}
            </div>
            ${userEmail ? `<span class="admin-user-email">${escapeHtml(userEmail)}</span>` : ''}
          </div>
        </div>
      </td>
      <td>
        <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-start;">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
            <span class="incident-count-pill ${g.pendingCount === 0 ? 'resolved' : ''}">
              ${g.reports.length} report${g.reports.length === 1 ? '' : 's'}${g.pendingCount > 0 ? ` (${g.pendingCount} pending)` : ''}
            </span>
            <span style="font-size:11.5px;color:var(--muted);">${g.uniqueReporters} student${g.uniqueReporters === 1 ? '' : 's'}</span>
          </div>
          <div>${repeatHtml}</div>
        </div>
      </td>
      <td>
        <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-start;">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
            ${warningHtml}
            <button type="button" class="btn-table-warn-icon" onclick="event.stopPropagation(); openAdminWarningModal('${g.userId}', '${escapeQuotes(userAlias)}')" title="Issue formal warning">
              + Warn
            </button>
          </div>
          <span style="font-size:11px;color:var(--muted);">Last: ${latestStr}</span>
        </div>
      </td>
      <td style="text-align:right;">
        <div class="table-actions-cell" onclick="event.stopPropagation()">
          <button type="button" class="btn-table-action primary" onclick="selectAdminUser('${g.userId}')" title="View transcripts and incidents">
            Review Dossier →
          </button>
        </div>
      </td>
    </tr>
  `;
}

function renderAdminUserGroup(group) {
  const { user, reports, userId, uniqueReporters = 1, repeatReporters = [], warningCount = 0, pendingCount = 0 } = group;
  const userAlias = user?.publicAlias || user?.alias || 'Student';
  const userEmail = user?.email || '';
  const isBanned = user?.accountStatus === 'banned' || user?.isBanned;
  const isTimedOut = user?.suspendedUntil && new Date(user.suspendedUntil) > new Date();
  const pendingInGroup = pendingCount || reports.filter(r => r.status === 'pending').length;

  return `
    <section class="admin-dossier-card" id="user-dossier-${userId}">
      <!-- Header Profile & Actions -->
      <div class="dossier-profile-header">
        <div class="dossier-profile-info">
          ${avatar(user?.avatarConfig || userAlias, true)}
          <div class="dossier-identity">
            <div class="dossier-name-row">
              <strong class="dossier-title">${escapeHtml(userAlias)}</strong>
              ${isBanned 
                ? '<span class="punish-chip banned">● Banned</span>' 
                : (isTimedOut 
                  ? `<span class="punish-chip timed-out">⏱️ Timed Out (until ${new Date(user.suspendedUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})</span>` 
                  : '<span class="punish-chip active">● Active Standing</span>')}
            </div>
            ${userEmail ? `<span class="dossier-email">${escapeHtml(userEmail)}</span>` : ''}
          </div>
        </div>

        <div class="dossier-header-actions">
          <button type="button" class="btn-dossier-action warn" onclick="openAdminWarningModal('${userId}', '${escapeQuotes(userAlias)}')">
            ⚠️ Issue Warning
          </button>
          <button type="button" class="btn-dossier-action timeout" onclick="handleUserModeration('${userId}', 'timeout', 24, '${escapeQuotes(userAlias)}')">
            ⏱️ 24h Timeout
          </button>
          <button type="button" class="btn-dossier-action timeout" onclick="handleUserModeration('${userId}', 'timeout', 168, '${escapeQuotes(userAlias)}')">
            ⏱️ 7d Timeout
          </button>
          ${isBanned ? `
            <button type="button" class="btn-dossier-action unban" onclick="handleUserModeration('${userId}', 'unban', 0, '${escapeQuotes(userAlias)}')">
              ✓ Unban Student
            </button>
          ` : `
            <button type="button" class="btn-dossier-action ban" onclick="handleUserModeration('${userId}', 'ban', 0, '${escapeQuotes(userAlias)}', '${escapeQuotes(userEmail)}')">
              🚫 Ban Student
            </button>
          `}
        </div>
      </div>

      <!-- Compact 4-Tile KPI Summary Grid -->
      <div class="dossier-kpi-grid">
        <div class="dossier-kpi-tile">
          <span class="kpi-label">TOTAL REPORTS</span>
          <strong class="kpi-value ${pendingInGroup > 0 ? 'text-amber' : 'text-green'}">
            ${reports.length} <small>(${pendingInGroup} pending)</small>
          </strong>
        </div>
        <div class="dossier-kpi-tile">
          <span class="kpi-label">DISTINCT REPORTERS</span>
          <strong class="kpi-value">${uniqueReporters} student${uniqueReporters === 1 ? '' : 's'}</strong>
        </div>
        <div class="dossier-kpi-tile">
          <span class="kpi-label">REPORTER PATTERN</span>
          <div style="margin-top:2px;">
            ${repeatReporters.length > 0 
              ? `<span class="repeat-reporter-badge">⚠️ ${repeatReporters.map(r => `${escapeHtml(r.alias)} (${r.count}x)`).join(', ')}</span>`
              : `<span class="clean-reporter-badge">✓ All distinct</span>`}
          </div>
        </div>
        <div class="dossier-kpi-tile">
          <span class="kpi-label">WARNING RECORD</span>
          <strong class="kpi-value ${warningCount > 0 ? 'text-amber' : 'text-muted'}">
            ${warningCount > 0 ? `⚠️ ${warningCount} Warning${warningCount === 1 ? '' : 's'}` : '0 Warnings'}
          </strong>
        </div>
      </div>

      <!-- Nested Incidents List for this Student -->
      <div class="dossier-incidents-section">
        <div class="dossier-incidents-header">
          <span>REPORTED INCIDENTS & CONTEXT TRANSCRIPTS (${reports.length})</span>
          <span>${pendingInGroup} pending review</span>
        </div>
        <div class="dossier-incidents-list">
          ${reports.map((r, i) => renderAdminIncidentItem(r, i + 1, reports.length, userId, userAlias)).join('')}
        </div>
      </div>
    </section>
  `;
}

function renderAdminIncidentItem(r, index, total, userId, reportedAlias) {
  const isPending = r.status === 'pending';
  const createdStr = new Date(r.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  const ctx = r.context || {};
  const beforeMsgs = ctx.context_before || [];
  const reportedMsg = ctx.reported_message || (r.message ? {
    id: r.message.id,
    content: r.message.content,
    senderName: r.reportedUser?.publicAlias || r.reportedUser?.alias || r.message.senderAlias,
    senderEmail: r.reportedUser?.email,
    createdAt: r.message.createdAt,
    isDeleted: false
  } : null);
  const afterMsgs = ctx.context_after || [];

  const reporterId = r.reporter?.id || r.reporterId;
  const reporterAlias = r.reporter?.publicAlias || r.reporter?.alias || 'Anonymous Student';

  const formatMsgTime = d => d ? new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

  return `
    <article class="admin-incident-card ${isPending ? 'pending' : 'resolved'}" id="report-${r.id}">
      <div class="incident-card-top">
        <div class="incident-item-tags">
          <span class="incident-index-chip">Incident #${index} of ${total}</span>
          <span class="report-status-badge ${isPending ? 'pending' : 'resolved'}">
            ${isPending ? '● Pending Review' : `✓ Resolved (${r.actionTaken || 'dismissed'})`}
          </span>
          <span class="report-reason-chip">
            Reason: <b>${escapeHtml(r.reason.replace(/_/g, ' '))}</b>
          </span>
          <span class="report-room-chip">
            Room: <b>${escapeHtml(ctx.roomName || 'Campus Chat')}</b>
          </span>
        </div>
        <span class="report-timestamp">${createdStr}</span>
      </div>

      <div class="incident-reporter-strip">
        <span style="font:700 10px 'DM Mono';color:var(--muted);letter-spacing:.6px;">REPORTER:</span>
        <strong style="font-size:13px;color:var(--ink);">${escapeHtml(reporterAlias)}</strong>
        ${r.reporter?.email ? `<code style="font:11px 'DM Mono';background:#e2e8f0;padding:1px 5px;border-radius:4px;color:#334155;">${escapeHtml(r.reporter.email)}</code>` : ''}
      </div>

      ${r.notes || r.detail ? `
        <div class="report-notes-callout">
          <b>Reporter Detail:</b> "${escapeHtml(r.notes || r.detail)}"
        </div>
      ` : ''}

      <!-- 11-MESSAGE CONTEXTUAL TRANSCRIPT -->
      <div class="context-transcript-container">
        <div class="transcript-toolbar">
          <span class="transcript-title">
            📜 Chronological Context Transcript (5 Before · Flagged Message · 5 After)
          </span>
          <span class="transcript-meta">
            ${beforeMsgs.length} before · 1 reported · ${afterMsgs.length} after
          </span>
        </div>

        <div class="transcript-messages-flow">
          ${beforeMsgs.length === 0 ? `
            <div class="transcript-boundary-notice">— Start of room conversation history (no earlier messages) —</div>
          ` : beforeMsgs.map(m => `
            <div class="transcript-row context-prior ${m.senderId === userId ? 'offender-row' : (m.senderId === reporterId ? 'reporter-row' : '')}">
              <span class="transcript-time">${formatMsgTime(m.createdAt)}</span>
              <span class="transcript-sender ${m.senderId === userId ? 'offender-sender' : ''}">${escapeHtml(m.senderName || 'Student')}:</span>
              <span class="transcript-text">${m.isDeleted ? '<em style="color:#94a3b8;">[Message deleted]</em>' : escapeHtml(m.content || '')}</span>
            </div>
          `).join('')}

          ${reportedMsg ? `
            <div class="transcript-row flagged-row">
              <div class="flagged-cue-label">
                <span class="flagged-badge">⚠️ FLAGGED / REPORTED MESSAGE</span>
                <span class="transcript-time">${formatMsgTime(reportedMsg.createdAt)}</span>
              </div>
              <div class="flagged-content-wrap">
                <span class="transcript-sender flagged-sender">${escapeHtml(reportedMsg.senderName || reportedAlias)}:</span>
                <span class="transcript-text flagged-text">
                  ${reportedMsg.isDeleted ? '<em style="color:#dc2626;">[Message has been deleted]</em>' : escapeHtml(reportedMsg.content || '[Empty message]')}
                </span>
              </div>
            </div>
          ` : `
            <div class="transcript-row flagged-row missing">
              <em style="color:#94a3b8;">[Reported message not found in database]</em>
            </div>
          `}

          ${afterMsgs.length === 0 ? `
            <div class="transcript-boundary-notice">— End of messages in room (no subsequent messages) —</div>
          ` : afterMsgs.map(m => `
            <div class="transcript-row context-subsequent ${m.senderId === userId ? 'offender-row' : (m.senderId === reporterId ? 'reporter-row' : '')}">
              <span class="transcript-time">${formatMsgTime(m.createdAt)}</span>
              <span class="transcript-sender ${m.senderId === userId ? 'offender-sender' : ''}">${escapeHtml(m.senderName || 'Student')}:</span>
              <span class="transcript-text">${m.isDeleted ? '<em style="color:#94a3b8;">[Message deleted]</em>' : escapeHtml(m.content || '')}</span>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- INCIDENT ACTIONS -->
      ${isPending ? `
        <div class="admin-actions-row">
          <button type="button" class="action-btn dismiss" onclick="resolveAdminReport('${r.id}', 'dismiss')" title="Mark as reviewed without penalty">
            ✓ Dismiss Incident (No Action)
          </button>
          ${reportedMsg && !reportedMsg.isDeleted ? `
            <button type="button" class="action-btn delete-msg" onclick="resolveAdminReport('${r.id}', 'delete_message')" title="Delete offending message from chat">
              🗑️ Delete Message Only
            </button>
          ` : ''}
          <button type="button" class="action-btn timeout-24h" onclick="resolveAdminReport('${r.id}', 'timeout_user', 24)" title="Suspend user for 24 hours">
            ⏱️ 24h Timeout
          </button>
          <button type="button" class="action-btn timeout-7d" onclick="resolveAdminReport('${r.id}', 'timeout_user', 168)" title="Suspend user for 7 days">
            ⏱️ 7d Timeout
          </button>
          <button type="button" class="action-btn ban-user" onclick="confirmBanUser('${r.id}', '${escapeQuotes(reportedAlias)}', '${escapeQuotes(r.reportedUser?.email || '')}')" title="Permanently ban user">
            🚫 Ban User
          </button>
        </div>
      ` : `
        <div class="admin-resolved-footer">
          <span style="color:#16a34a;font-weight:700;">✓ Incident Resolved</span>
          <span style="color:var(--muted);font-size:12.5px;">Action taken: <b>${escapeHtml(r.actionTaken || 'dismissed')}</b> ${r.resolvedAt ? '· ' + new Date(r.resolvedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}</span>
        </div>
      `}
    </article>
  `;
}

window.selectAdminUser = (userId) => {
  state.adminSelectedUserId = userId;
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.clearAdminUserSelection = () => {
  state.adminSelectedUserId = null;
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.openAdminWarningModal = (userId, userAlias) => {
  document.querySelector('.modal-backdrop')?.remove();
  document.body.insertAdjacentHTML('beforeend', modal(`
    <div style="margin-bottom:16px;">
      <span class="eyebrow" style="color:#ea580c;">CAMPUS GOVERNANCE</span>
      <h2 style="margin:4px 0 6px;font:600 20px 'Playfair Display';">Issue Official Warning</h2>
      <p style="margin:0;font-size:12.5px;color:var(--muted);">
        Issuing an official warning to <b>${escapeHtml(userAlias)}</b>. This warning will be recorded on their account, delivered directly to their session, and emailed to their registered university address.
      </p>
    </div>

    <form onsubmit="event.preventDefault(); submitAdminWarning('${userId}');" style="display:flex;flex-direction:column;gap:14px;">
      <div>
        <label style="display:block;font:600 12px 'DM Sans';color:var(--ink);margin-bottom:6px;">Quick Preset Warning Templates:</label>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">
          <button type="button" class="secondary" style="font-size:11.5px;padding:4px 10px;" onclick="applyWarningPreset('Inappropriate Content: Please refrain from using offensive or inappropriate language in campus chat.')">Inappropriate Content</button>
          <button type="button" class="secondary" style="font-size:11.5px;padding:4px 10px;" onclick="applyWarningPreset('Harassment & Bullying: Targeted disrespect or hostility towards other students violates our community guidelines.')">Harassment</button>
          <button type="button" class="secondary" style="font-size:11.5px;padding:4px 10px;" onclick="applyWarningPreset('Spam & Repetitive Messages: Commercial promotion, spamming, or repetitive messaging is prohibited.')">Spam</button>
          <button type="button" class="secondary" style="font-size:11.5px;padding:4px 10px;" onclick="applyWarningPreset('Privacy Violation: Attempting to uncover or share real identities without mutual consent violates safety rules.')">Privacy Violation</button>
        </div>
      </div>

      <div>
        <label for="admin-warning-reason" style="display:block;font:600 12px 'DM Sans';color:var(--ink);margin-bottom:6px;">Official Warning Reason / Guidance to Student:</label>
        <textarea id="admin-warning-reason" required rows="4" style="width:100%;border:1px solid var(--line);border-radius:8px;padding:10px 12px;font:13px 'DM Sans';resize:vertical;" placeholder="Write specific guidance or reasons for this official warning..."></textarea>
      </div>

      <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 12px;font-size:12px;color:#92400e;line-height:1.4;">
        <b>⚡ Escalation Notice:</b> Issuing this warning will resolve current pending reports for this student. If the student repeats the violation, you can escalate to a 24-hour timeout, 7-day timeout, or permanent account ban.
      </div>

      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:6px;">
        <button type="button" class="secondary" onclick="closeModal()">Cancel</button>
        <button type="submit" class="primary" style="background:#ea580c;border-color:#ea580c;color:#fff;">
          ⚠️ Send Official Warning
        </button>
      </div>
    </form>
  `));
};

window.applyWarningPreset = (text) => {
  const el = document.getElementById('admin-warning-reason');
  if (el) el.value = text;
};

window.submitAdminWarning = async (userId) => {
  const input = document.getElementById('admin-warning-reason');
  const reason = input ? input.value.trim() : '';
  if (!reason) return;

  try {
    const res = await api(`/admin/users/${userId}/action`, {
      method: 'POST',
      body: JSON.stringify({ action: 'warn', reason })
    });
    closeModal();
    toast('⚠️ Official warning issued to student & sent to their email.');
    await loadAdminData();
  } catch (err) {
    toast(err.message || 'Failed to issue warning.');
  }
};

window.handleUserModeration = async (userId, action, hours = 24, alias = 'Student', email = '') => {
  const display = email ? `${alias} (${email})` : alias;
  let confirmMsg = '';
  if (action === 'ban') {
    confirmMsg = `Are you sure you want to PERMANENTLY BAN ${display} from campus? This will terminate all active sessions and resolve pending reports against this student.`;
  } else if (action === 'timeout') {
    confirmMsg = `Suspend ${display} from chatting for ${hours} hours? This will resolve pending reports against this student.`;
  } else if (action === 'unban') {
    confirmMsg = `Restore full active standing for ${display}?`;
  }
  if (confirmMsg && !confirm(confirmMsg)) return;

  try {
    const res = await api(`/admin/users/${userId}/action`, {
      method: 'POST',
      body: JSON.stringify({ action, hours })
    });
    toast('Student moderation status updated ✓');
    loadAdminData();
  } catch (err) {
    toast(err.message || 'Action failed.');
  }
};

window.setAdminTab = tab => {
  if (state.adminTab === tab) return;
  state.adminTab = tab;
  render();
};

window.setAdminFilter = filter => {
  if (state.adminFilter === filter) return;
  state.adminFilter = filter;
  render();
};

window.setAdminSearch = (val) => {
  state.adminSearch = val;
  const prevInput = document.getElementById('admin-search-box');
  const cursorPos = prevInput ? prevInput.selectionStart : null;
  render();
  const nextInput = document.getElementById('admin-search-box');
  if (nextInput && cursorPos !== null) {
    nextInput.focus();
    nextInput.setSelectionRange(cursorPos, cursorPos);
  }
};

window.clearAdminSearch = () => {
  state.adminSearch = '';
  render();
  const input = document.getElementById('admin-search-box');
  if (input) input.focus();
};

window.toggleAdminFilters = () => {
  state.adminFiltersOpen = !state.adminFiltersOpen;
  render();
};

window.setAdminFilterAccountStatus = (val) => {
  state.adminFilterAccountStatus = val;
  render();
};

window.setAdminFilterWarnings = (val) => {
  state.adminFilterWarnings = val;
  render();
};

window.setAdminFilterReporters = (val) => {
  state.adminFilterReporters = val;
  render();
};

window.setAdminFilterReason = (val) => {
  state.adminFilterReason = val;
  render();
};

window.resetAdminFilters = () => {
  state.adminSearch = '';
  state.adminFilterAccountStatus = 'all';
  state.adminFilterWarnings = 'all';
  state.adminFilterReporters = 'all';
  state.adminFilterReason = 'all';
  render();
};

window.setAdminSortBy = (val) => {
  state.adminSortBy = val;
  render();
};

window.toggleAdminSortOrder = () => {
  state.adminSortOrder = state.adminSortOrder === 'desc' ? 'asc' : 'desc';
  render();
};

window.loadAdminData = async () => {
  if (!state.me?.isAdmin) return;
  state.adminLoading = true;
  render();
  try {
    const [reportsData, modData, verifData] = await Promise.all([
      api('/admin/reports'),
      api('/admin/moderators'),
      api('/admin/verifications').catch(() => ({ verifications: [] }))
    ]);
    state.adminReports = reportsData.reports || [];
    state.adminPrimaryAdmins = modData.primaryAdmins || [];
    state.adminModerators = modData.teamModerators || [];
    state.adminVerifications = verifData.verifications || [];
  } catch (err) {
    toast(err.message || 'Could not load admin data.');
  } finally {
    state.adminLoading = false;
    render();
  }
};

window.approveStudentVerification = async (userId) => {
  try {
    await api(`/admin/verifications/${userId}/approve`, { method: 'POST' });
    toast('✓ Student identity verified! Selfie permanently deleted from storage.');
    loadAdminData();
  } catch (err) {
    toast(err.message || 'Failed to approve verification.');
  }
};

window.rejectStudentVerification = (userId, declaredGender = '', alias = '') => {
  const normGender = (declaredGender || '').toLowerCase();
  const isWoman = normGender === 'woman' || normGender === 'women' || normGender === 'female';
  const isMan = normGender === 'man' || normGender === 'men' || normGender === 'male';
  const declaredLabel = isWoman ? 'Woman 👩' : (isMan ? 'Man 👨' : 'Non-binary 🧑');
  const oppositeGender = isWoman ? 'man' : (isMan ? 'woman' : null);
  const oppositeLabel = oppositeGender === 'man' ? 'Man 👨' : 'Woman 👩';

  const modalHtml = modal(`
    <div style="text-align:center;max-width:440px;margin:0 auto;">
      <span class="eyebrow" style="color:#dc2626;">MODERATION ACTION</span>
      <h3 style="font:600 20px 'Playfair Display';margin:6px 0 6px;">Reject Verification</h3>
      <p style="font-size:12.5px;color:var(--muted);margin:0 0 16px;">
        Student declared <b>${declaredLabel}</b>${alias ? ` (${alias})` : ''}. Select the reason for rejection:
      </p>

      <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:18px;text-align:left;">
        <div style="font-size:11px;font-weight:700;color:#dc2626;text-transform:uppercase;letter-spacing:0.5px;margin:2px 0;">
          🛡️ Gender &amp; Anti-Catfishing Checks
        </div>

        <button type="button" class="verif-rejection-choice-btn danger-emphasis" onclick="submitRejectionReason('${userId}', 'Declared gender does not match the live verification selfie.')">
          <div style="font-weight:700;margin-bottom:2px;">🚫 Declared Gender Does Not Match Photo</div>
          <div style="font-size:11.5px;opacity:0.85;">Rejects verification for gender mismatch. Student is notified to correct their declared gender before re-verifying.</div>
        </button>

        ${oppositeGender ? `
          <button type="button" class="verif-rejection-choice-btn danger-emphasis" onclick="submitRejectionReason('${userId}', 'Declared gender does not match live selfie. Profile gender corrected to ${oppositeLabel} and locked.', '${oppositeGender}')">
            <div style="font-weight:700;margin-bottom:2px;">🔒 Correct Profile to ${oppositeLabel} &amp; Lock</div>
            <div style="font-size:11.5px;opacity:0.85;">Rejects verification, switches profile from ${declaredLabel} to ${oppositeLabel}, and locks it to prevent catfishing.</div>
          </button>
        ` : ''}

        <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px;margin:10px 0 2px;">
          📷 Photo Quality &amp; Challenge Checks
        </div>

        <button type="button" class="verif-rejection-choice-btn" onclick="submitRejectionReason('${userId}', 'Live selfie did not match the requested gesture.')">
          ✌️ Gesture did not match challenge prompt
        </button>
        <button type="button" class="verif-rejection-choice-btn" onclick="submitRejectionReason('${userId}', 'Face or gesture was blurry or obscured.')">
          🌫️ Face or gesture was blurry or obscured
        </button>
        <button type="button" class="verif-rejection-choice-btn" onclick="submitRejectionReason('${userId}', 'Image did not appear to be a live camera capture.')">
          📷 Photo did not appear to be a genuine live capture
        </button>
      </div>

      <button type="button" class="secondary" onclick="closeModal()" style="padding:8px 20px;font-size:12.5px;">Cancel</button>
    </div>
  `);
  document.body.insertAdjacentHTML('beforeend', modalHtml);
};

window.submitRejectionReason = async (userId, reason, correctGender = null) => {
  try {
    await api(`/admin/verifications/${userId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason, correctGender })
    });
    closeModal();
    toast(correctGender ? '✓ Verification rejected & gender locked to prevent catfishing.' : 'Verification rejected. Photo permanently deleted.');
    loadAdminData();
  } catch (err) {
    toast(err.message || 'Failed to reject verification.');
  }
};

window.openPhotoEnlarge = (url) => {
  const modalHtml = modal(`
    <div style="text-align:center;max-width:440px;margin:0 auto;">
      <span class="eyebrow">EPHEMERAL VERIFICATION SELFIE</span>
      <h3 style="margin:6px 0 14px;font:600 20px 'Playfair Display';">Live Verification Photo</h3>
      <img src="${url}" style="width:100%;max-height:65vh;object-fit:contain;border-radius:12px;box-shadow:0 10px 35px rgba(0,0,0,0.25);" alt="Enlarged verification photo">
      <p style="font-size:11.5px;color:var(--muted);margin:10px 0 16px;">🔒 This photo is ephemeral and will be purged immediately upon approval or rejection.</p>
      <button class="primary wide" onclick="closeModal()">Close Preview</button>
    </div>
  `);
  document.body.insertAdjacentHTML('beforeend', modalHtml);
};

window.handleAdminSelfVerify = () => {
  const curGender = state.me?.gender || 'prefer_not_to_say';
  const modalHtml = modal(`
    <div class="admin-self-verify-modal" style="text-align:center;max-width:460px;margin:0 auto;">
      <span class="eyebrow" style="color:#0284c7;">PRIVILEGED STAFF ACTION</span>
      <h2 style="font:600 22px 'Playfair Display';margin:6px 0 4px;">Admin Instant Verification</h2>
      <p style="font-size:12.5px;color:var(--muted);margin:0 0 20px;">
        Choose your gender to instantly authenticate your administrator profile with a permanent <b>Verified Student 🛡️✓</b> badge.
      </p>

      <div class="admin-gender-options-grid" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:20px;">
        <button type="button" class="admin-gender-card-btn ${curGender === 'man' ? 'selected' : ''}" onclick="submitAdminSelfVerify('man')">
          <span style="font-size:36px;display:block;margin-bottom:8px;line-height:1;">👨</span>
          <strong style="font-size:14px;display:block;margin-bottom:2px;">Man</strong>
          <small style="font-size:11px;color:var(--muted);">Male Profile</small>
        </button>
        <button type="button" class="admin-gender-card-btn ${curGender === 'woman' ? 'selected' : ''}" onclick="submitAdminSelfVerify('woman')">
          <span style="font-size:36px;display:block;margin-bottom:8px;line-height:1;">👩</span>
          <strong style="font-size:14px;display:block;margin-bottom:2px;">Woman</strong>
          <small style="font-size:11px;color:var(--muted);">Female Profile</small>
        </button>
        <button type="button" class="admin-gender-card-btn ${curGender === 'nonbinary' ? 'selected' : ''}" onclick="submitAdminSelfVerify('nonbinary')">
          <span style="font-size:36px;display:block;margin-bottom:8px;line-height:1;">🧑</span>
          <strong style="font-size:14px;display:block;margin-bottom:2px;">Non-binary</strong>
          <small style="font-size:11px;color:var(--muted);">Inclusive Profile</small>
        </button>
      </div>

      <button type="button" class="secondary" onclick="closeModal()" style="padding:9px 20px;font-size:13px;">Cancel</button>
    </div>
  `);
  document.body.insertAdjacentHTML('beforeend', modalHtml);
};

window.submitAdminSelfVerify = async (gender) => {
  try {
    const res = await api('/admin/self-verify', {
      method: 'POST',
      body: JSON.stringify({ gender })
    });
    if (res.user) updateMe({ ...state.me, ...res.user });
    closeModal();
    toast('✓ Admin profile authenticated & verified! 🛡️');
    render();
  } catch (err) {
    toast(err.message || 'Self-verification failed.');
  }
};

window.resolveAdminReport = async (reportId, action, hours = 24) => {
  try {
    const res = await api(`/admin/reports/${reportId}/action`, {
      method: 'POST',
      body: JSON.stringify({ action, hours })
    });
    toast(res.message || 'Moderation action applied ✓');
    loadAdminData();
  } catch (err) {
    toast(err.message || 'Action failed.');
  }
};

window.confirmBanUser = (reportId, alias, email) => {
  const display = email ? `${alias} (${email})` : alias;
  if (confirm(`Are you sure you want to PERMANENTLY BAN ${display} from campus chat and discovery? This will immediately terminate all active sessions.`)) {
    resolveAdminReport(reportId, 'ban_user');
  }
};

window.handleAdminAddModerator = async () => {
  const input = document.getElementById('admin-mod-email-input');
  const roleSelect = document.getElementById('admin-mod-role-select');
  if (!input) return;
  const email = input.value.trim().toLowerCase();
  const role = roleSelect?.value || 'moderator';
  if (!email || !email.includes('@')) {
    toast('Please enter a valid email address.');
    return;
  }
  try {
    const res = await api('/admin/moderators', {
      method: 'POST',
      body: JSON.stringify({ email, role })
    });
    toast(res.message || (role === 'super_admin' ? `👑 ${email} set as Permanent Root Owner!` : `🛡️ ${email} added as Team Moderator!`));
    input.value = '';
    loadAdminData();
  } catch (err) {
    toast(err.message || 'Failed to add administrator.');
  }
};

window.handleAdminRemoveModerator = async (email) => {
  const isSelf = email.toLowerCase() === (state.me?.email || '').toLowerCase();
  const msg = isSelf
    ? `⚠️ CAUTION: You are about to revoke your own administrative privileges (${email}). You will lose access to the Admin Portal immediately. Are you sure?`
    : `Revoke administrator / moderator access for ${email}?`;
  if (!confirm(msg)) return;
  try {
    await api(`/admin/moderators/${encodeURIComponent(email)}`, {
      method: 'DELETE'
    });
    toast('Access revoked ✓');
    if (isSelf) {
      if (state.me) state.me.isAdmin = false;
      go('home');
    } else {
      loadAdminData();
    }
  } catch (err) {
    toast(err.message || 'Failed to revoke access.');
  }
};

function getDeviceDescription() {
  const ua = navigator.userAgent || '';
  let os = 'Unknown Device';
  if (/Macintosh|Mac OS X/i.test(ua)) os = 'macOS';
  else if (/Windows/i.test(ua)) os = 'Windows PC';
  else if (/iPhone/i.test(ua)) os = 'iPhone';
  else if (/iPad/i.test(ua)) os = 'iPad';
  else if (/Android/i.test(ua)) os = 'Android Phone';
  else if (/Linux/i.test(ua)) os = 'Linux';

  let browser = 'Browser';
  if (/Edg/i.test(ua)) browser = 'Edge';
  else if (/Chrome/i.test(ua)) browser = 'Chrome';
  else if (/Safari/i.test(ua)) browser = 'Safari';
  else if (/Firefox/i.test(ua)) browser = 'Firefox';

  const isMobile = /iPhone|iPad|iPod|Android/i.test(ua);
  return { os, browser, icon: isMobile ? '📱' : '💻', label: `${os} · ${browser}` };
}

function settings() {
  const me = state.me;
  const username = me?.username || 'Anonymous';
  const campus = me?.university || 'NIIT University';
  const isMuted = isNotificationsMuted();
  const granted = 'Notification' in window && Notification.permission === 'granted';
  const isOn = granted && !isMuted;
  const soundOn = !isSoundMuted();
  const device = getDeviceDescription();

  return layout(`
    <section class="page-title compact">
      <span class="eyebrow">PREFERENCES & IDENTITY</span>
      <h1>Make yourself at home.</h1>
      <p>Your identity, your preferences, your corner of campus.</p>
    </section>

    <div class="settings-grid" style="display:grid;gap:20px;margin-top:28px;max-width:820px;">
      ${me?.isAdmin ? `
        <!-- Admin & Moderation Gateway -->
        <div class="settings-card" style="background: linear-gradient(135deg, #1e293b, #0f172a); border: 1px solid #334155; border-radius: 14px; padding: 22px; color: #fff;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;">
            <div>
              <span style="font: 700 10.5px 'DM Mono'; color: #38bdf8; letter-spacing: 1px; display: block; margin-bottom: 4px;">PRIVILEGED STAFF ACCESS</span>
              <h3 style="font: 600 20px 'Playfair Display'; margin: 0 0 4px; color: #fff;">Admin & Incident Review Portal</h3>
              <p style="font-size: 12.5px; color: #94a3b8; margin: 0;">Review flagged student messages with 11-message contextual transcripts and manage your moderator team.</p>
            </div>
            <button class="primary" onclick="go('admin')" style="background: #38bdf8; color: #0f172a; border: none; font-weight: 700; padding: 9px 16px; border-radius: 8px; cursor: pointer; white-space: nowrap;">
              Open Admin Portal ⚡
            </button>
          </div>
        </div>
      ` : ''}

      <!-- Section 1: Campus Identity Card -->
      <div class="settings-card" style="background:#fff;border:1px solid var(--line);border-radius:14px;padding:24px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
          <div>
            <h3 style="font:600 20px 'Playfair Display';margin:0 0 4px;">Campus Credentials</h3>
            <p style="font-size:12.5px;color:var(--muted);margin:0;">Your verified academic standing and anonymous pseudonym.</p>
          </div>
          <span style="font-size:24px;">🎓</span>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;background:#fbfcf9;border:1px solid var(--line);border-radius:10px;padding:16px;margin-bottom:0;">
          <div>
            <span style="font:10px 'DM Mono';color:var(--muted);letter-spacing:.8px;display:block;">STUDENT STANDING</span>
            <b style="font-size:14px;color:var(--ink);display:block;margin-top:4px;">${campus}</b>
            ${me?.isVerified ? `
              <span style="display:inline-flex;align-items:center;gap:4px;font-size:11.5px;color:var(--green);font-weight:600;margin-top:6px;">
                ${renderVerifiedBadgeSvg(14)} Verified College Student
              </span>
            ` : (me?.verificationStatus === 'pending' ? `
              <span style="display:inline-flex;align-items:center;gap:4px;font-size:11.5px;color:#d97706;font-weight:600;margin-top:6px;">
                ⏳ Under Verification
              </span>
            ` : (me?.verificationStatus === 'rejected' ? `
              <span style="display:inline-flex;align-items:center;gap:4px;font-size:11.5px;color:#dc2626;font-weight:600;margin-top:6px;">
                ✕ Unverified Student Profile
              </span>
            ` : `
              <span style="display:inline-flex;align-items:center;gap:4px;font-size:11.5px;color:var(--muted);font-weight:600;margin-top:6px;">
                🛡️ Unverified Student Profile
              </span>
            `))}
          </div>
          <div>
            <span style="font:10px 'DM Mono';color:var(--muted);letter-spacing:.8px;display:block;">CURRENT PSEUDONYM</span>
            <div style="display:flex;align-items:center;gap:8px;margin-top:4px;">
              ${avatar(me?.avatarConfig || username, true, Boolean(me?.isVerified))}
              <b style="font-size:14px;color:var(--ink);display:inline-flex;align-items:center;gap:4px;">
                ${username}
                ${me?.isVerified ? renderVerifiedBadgeSvg(13) : ''}
              </b>
            </div>
            <span style="display:block;font-size:11.5px;color:var(--muted);margin-top:6px;">${me?.isVerified ? 'Verified Student Profile' : 'Awaiting Face Verification'}</span>
          </div>
        </div>
      </div>

      <!-- Verification Section -->
      <div class="settings-card" style="background:#fff;border:1px solid var(--line);border-radius:14px;padding:24px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
          <div>
            <h3 style="font:600 20px 'Playfair Display';margin:0 0 4px;">Student Verification</h3>
            <p style="font-size:12.5px;color:var(--muted);margin:0;">Catfish-free campus pairing with live ephemeral face &amp; gesture verification.</p>
          </div>
          <span style="font-size:24px;">🛡️</span>
        </div>

        ${me?.isVerified ? `
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px 20px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;">
            <div style="display:flex;align-items:center;gap:14px;">
              <div style="width:40px;height:40px;border-radius:50%;background:#dcfce7;color:#15803d;display:grid;place-items:center;font-size:20px;flex-shrink:0;">
                ✓
              </div>
              <div>
                <strong style="font-size:14px;color:#166534;display:block;margin-bottom:2px;">Identity &amp; Gender Authenticated</strong>
                <span style="font-size:12px;color:#15803d;">
                  Verified as <b>${me?.gender === 'woman' ? 'Woman 👩' : (me?.gender === 'man' ? 'Man 👨' : me?.gender || 'Student')}</b> · Gender permanently locked
                </span>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              <span class="stats-pill" style="background:#dcfce7;color:#15803d;border-color:#86efac;font-size:12px;padding:6px 14px;font-weight:600;display:inline-flex;align-items:center;gap:5px;">
                ${renderVerifiedBadgeSvg(13)} Verified College Student
              </span>
            </div>
          </div>
        ` : me?.verificationStatus === 'pending' ? `
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px 20px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;">
            <div style="display:flex;align-items:center;gap:14px;">
              <div style="width:42px;height:42px;border-radius:50%;background:#dcfce7;color:#15803d;display:grid;place-items:center;font-size:22px;flex-shrink:0;">
                ⏳
              </div>
              <div>
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:2px;">
                  <strong style="font-size:14px;color:#14532d;">Profile Under Verification</strong>
                  <span style="background:#dcfce7;color:#15803d;border:1px solid #86efac;font-size:11px;font-weight:600;padding:2px 8px;border-radius:10px;">In Progress</span>
                </div>
                <span style="font-size:12.5px;color:#166534;line-height:1.4;display:block;">
                  Your verification has been submitted. It's now under verification — once verified, your blue student badge will activate and you can fully enjoy Afterclass!
                </span>
              </div>
            </div>
            <div style="display:flex;gap:8px;align-items:center;">
              <button type="button" class="secondary" onclick="loadMe().then(() => toast('Verification status checked ✓'))" style="font-size:12px;padding:6px 14px;background:#fff;">
                🔄 Refresh Status
              </button>
              <button type="button" class="secondary" onclick="openVerificationModal()" style="font-size:12px;padding:6px 12px;background:#fff;">
                📸 Retake
              </button>
            </div>
          </div>
        ` : `
          <div style="background:#fcfdfa;border:1px dashed #c2d1c6;border-radius:12px;padding:18px 20px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;">
            <div style="max-width:500px;">
              <strong style="font-size:14px;color:var(--ink);display:block;margin-bottom:4px;">Student Verification · Verified Blue Badge</strong>
              <p style="font-size:12.5px;color:var(--muted);margin:0;line-height:1.45;">
                Take a quick 5-second live selfie with a fun gesture (e.g. ✌️ peace sign). Your profile will go under verification, and right after that you can enjoy Afterclass with your verified student badge!
              </p>
              <div style="margin-top:6px;font-size:11.5px;color:#059669;display:flex;align-items:center;gap:6px;">
                <span>🔒 Zero permanent storage: compressed in your browser and permanently deleted right after verification.</span>
              </div>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
              <button type="button" class="primary" onclick="openVerificationModal()" style="white-space:nowrap;padding:11px 20px;font-weight:700;display:inline-flex;align-items:center;gap:6px;">
                <span>📸</span> Start Live Face Verification
              </button>
              ${me?.isAdmin ? `
                <button type="button" class="admin-btn-secondary" onclick="handleAdminSelfVerify()" style="white-space:nowrap;padding:10px 12px;font-weight:500;font-size:11.5px;background:#0f172a;color:#38bdf8;border:1px solid #38bdf8;border-radius:8px;cursor:pointer;" title="Skip camera with instant admin bypass">
                  ⚡ Skip Camera (Admin Bypass)
                </button>
              ` : ''}
            </div>
          </div>
        `}
      </div>

      <!-- Section 2: Notifications & Mechanical Switch -->
      <div class="settings-card" style="background:#fff;border:1px solid var(--line);border-radius:14px;padding:24px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
          <div>
            <h3 style="font:600 20px 'Playfair Display';margin:0 0 4px;">Live Push Alerts</h3>
            <p style="font-size:12.5px;color:var(--muted);margin:0;">Instant browser push alerts for plan applications and direct messages.</p>
          </div>
          <span style="font-size:24px;">🔔</span>
        </div>

        <div id="settings-notif-card" style="background:#f6f8f5;border:1px solid var(--line);border-radius:12px;padding:16px 20px;display:flex;align-items:center;justify-content:space-between;gap:16px;">
          <div style="text-align:left;">
            <strong style="font-size:14px;color:var(--ink);display:block;margin-bottom:2px;">Master Push Notifications</strong>
            <small style="color:var(--muted);font-size:12px;">
              ${!('Notification' in window) ? 'Not supported on device' : (!granted ? 'Click switch to enable push alerts' : (isOn ? 'Power ON · Alerts active and delivered in real-time' : 'Power OFF · Alerts muted'))}
            </small>
          </div>
          <div class="real-switch-casing ${isOn ? 'on' : 'off'}" onclick="${!granted ? 'requestNotificationPermission()' : 'toggleNotificationsMute()'}" title="${isOn ? 'Switch ON (Click to turn OFF)' : 'Switch OFF (Click to turn ON)'}" role="button" tabindex="0">
            <div class="real-switch-well">
              <div class="real-rocker-paddle">
                <div class="paddle-half paddle-top">
                  <span class="lens-pilot-dot"></span>
                  <span class="debossed-symbol symbol-on">|</span>
                </div>
                <div class="paddle-pivot-ridge"></div>
                <div class="paddle-half paddle-bottom">
                  <span class="debossed-symbol symbol-off">○</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Section 3: Audio & Sound Effects -->
      <div class="settings-card" style="background:#fff;border:1px solid var(--line);border-radius:14px;padding:24px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
          <div>
            <h3 style="font:600 20px 'Playfair Display';margin:0 0 4px;">Audio & Sound Effects</h3>
            <p style="font-size:12.5px;color:var(--muted);margin:0;">Real-time messaging pops, reveal chimes, and celebration effects.</p>
          </div>
          <span style="font-size:24px;">🔊</span>
        </div>

        <div id="settings-sound-card" style="background:#f6f8f5;border:1px solid var(--line);border-radius:12px;padding:16px 20px;display:flex;align-items:center;justify-content:space-between;gap:16px;">
          <div style="text-align:left;">
            <strong style="font-size:14px;color:var(--ink);display:block;margin-bottom:2px;">In-App Audio Effects</strong>
            <small style="color:var(--muted);font-size:12px;">
              ${soundOn ? 'Audio ON · High-fidelity chimes and feedback sounds' : 'Audio OFF · All in-app sound effects muted'}
            </small>
          </div>
          <div class="real-switch-casing ${soundOn ? 'on' : 'off'}" onclick="toggleSoundMute()" title="${soundOn ? 'Sound ON (Click to turn OFF)' : 'Sound OFF (Click to turn ON)'}" role="button" tabindex="0">
            <div class="real-switch-well">
              <div class="real-rocker-paddle">
                <div class="paddle-half paddle-top">
                  <span class="lens-pilot-dot"></span>
                  <span class="debossed-symbol symbol-on">|</span>
                </div>
                <div class="paddle-pivot-ridge"></div>
                <div class="paddle-half paddle-bottom">
                  <span class="debossed-symbol symbol-off">○</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Section 4: Session Management & Device Security -->
      <div class="settings-card" style="background:#fff;border:1px solid var(--line);border-radius:14px;padding:24px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
          <div>
            <h3 style="font:600 20px 'Playfair Display';margin:0 0 4px;">Session Management & Devices</h3>
            <p style="font-size:12.5px;color:var(--muted);margin:0;">Manage active logins across campus library PCs, personal laptops, and phones.</p>
          </div>
          <span style="font-size:24px;">🔐</span>
        </div>

        <!-- Current Device Card -->
        <div style="background:#fbfcf9;border:1px solid var(--line);border-radius:12px;padding:16px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;">
          <div style="display:flex;align-items:center;gap:12px;">
            <div style="width:40px;height:40px;border-radius:10px;background:#edf4ea;border:1px solid #cce8d5;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;">
              ${device.icon}
            </div>
            <div>
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                <strong style="font-size:13.5px;color:var(--ink);">${device.label}</strong>
                <span class="status-badge active" style="font-size:10.5px;padding:2px 8px;">🟢 This Device (Active)</span>
              </div>
              <small style="color:var(--muted);font-size:11.5px;display:block;margin-top:2px;">Signed in as <b>${username}</b> · Session valid</small>
            </div>
          </div>
          ${me ? `
            <button class="secondary" onclick="logout()" style="font-size:12px;padding:7px 13px;border-radius:8px;white-space:nowrap;">
              Log Out of This Device ⇥
            </button>
          ` : ''}
        </div>

        <!-- Global Invalidation Card -->
        <div style="background:#fff7ed;border:1px solid #ffedd5;border-radius:12px;padding:16px;display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:16px;flex-wrap:wrap;">
          <div style="max-width:480px;">
            <strong style="font-size:13.5px;color:#9a3412;display:flex;align-items:center;gap:6px;margin-bottom:2px;">
              <span>⚡</span> Sign Out of All Devices
            </strong>
            <p style="font-size:11.5px;color:#c2410c;margin:0;line-height:1.4;">
              Left your account open on a college computer, lab laptop, or another phone? Instantly terminate all active sessions globally.
            </p>
          </div>
          ${me ? `
            <button class="primary" onclick="openLogoutAllModal()" style="background:#ea580c;border:none;font-size:12px;font-weight:600;padding:8px 14px;border-radius:8px;white-space:nowrap;cursor:pointer;color:#fff;">
              Sign Out Everywhere ⚡
            </button>
          ` : ''}
        </div>

        <!-- Local Cache -->
        <div style="display:flex;align-items:center;justify-content:space-between;border-top:1px solid var(--line);padding-top:14px;">
          <small style="color:var(--muted);font-size:12px;">Local preferences, drafts, and cached thumbnails.</small>
          <button class="link" onclick="clearLocalCache()" style="font-size:12px;color:#d5573e;text-decoration:underline;">
            Clear Local Cache
          </button>
        </div>
      </div>
    </div>
  `);
}

window.switchAuthShowcase = function(tab) {
  document.querySelectorAll('.auth-deck-tab').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.auth-card-panel').forEach(el => el.classList.remove('active'));
  const targetTab = document.querySelector(`.auth-deck-tab[data-tab="${tab}"]`);
  const targetPanel = document.getElementById(`auth-panel-${tab}`);
  if (targetTab) targetTab.classList.add('active');
  if (targetPanel) targetPanel.classList.add('active');
};

function authPage() {
  const step = state.authStep || (state.authOtpSent ? 'otp' : 'welcome');
  const pendingEmail = state.authPendingEmail || '';
  const selectedGender = state.authSelectedGender || 'prefer_not_to_say';

  return `
    <div class="auth-page-wrapper">
      <!-- Top Navigation Bar -->
      <header class="auth-top-nav">
        <a class="auth-brand-logo" href="#" onclick="go('home')">
          <i>✦</i> afterclass
        </a>
        <div class="auth-campus-badge">
          <span class="auth-pulse-dot"></span>
          <span>VERIFIED CAMPUS NETWORK</span>
        </div>
      </header>

      <!-- Main Grid Container -->
      <main class="auth-main-grid ${step !== 'welcome' ? 'is-focused-flow' : ''}">
        ${step === 'welcome' ? `
        <div class="auth-left-showcase editorial-welcome">
          <span class="welcome-overline"><span></span> FOR THE LIFE BETWEEN LECTURES</span>
          <h1>Strangers today.<br><em>Your people<br>tomorrow.</em></h1>
          <p class="welcome-description">The best part of campus isn’t on your timetable. <br>Find it in a little conversation, a shared interest, <br>or a plan you almost didn’t make.</p>
          <div class="welcome-art" aria-label="A simple idea: turn a hello into a shared campus plan">
            <div class="welcome-orbit" aria-hidden="true"></div>
            <div class="welcome-avatar avatar-one" aria-hidden="true">${renderAvatarSvg('VelvetOtter',72)}</div>
            <div class="welcome-avatar avatar-two" aria-hidden="true">${renderAvatarSvg('SunnyFox',72)}</div>
            <div class="welcome-note"><span>A SMALL INVITATION</span><strong>One coffee.<br>Two stories.</strong><div><span>☕</span><small>Somewhere on campus.<br>Whenever you’re ready.</small></div></div>
            <div class="welcome-hello">It starts with <em>hello.</em><span>↗</span></div>
            <span class="welcome-art-caption">LESS PRESSURE. MORE POSSIBILITY.</span>
          </div>
          <div class="welcome-values"><span>01 <b>Campus only</b></span><span>02 <b>Alias first</b></span><span>03 <b>Your pace</b></span></div>
        </div>
        ` : ''}

        <!-- RIGHT: Sleek Frosted Glass Auth Card -->
        <div class="auth-right-container">
          <div class="auth-glass-card">
            ${step === 'welcome' ? `
              <span class="auth-form-eyebrow-tag">JOIN AFTERCLASS</span>
              <h2 class="auth-card-title">Your campus.<br>A wider circle.</h2>
              <p class="auth-card-sub">Meet students outside your usual group. Sign in with your university account to get started.</p>

              <ul class="auth-membership-details" aria-label="What you can do on Afterclass">
                <li>
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H5l-3 3v-9.5A7.5 7.5 0 0 1 9.5 5h3a7.5 7.5 0 0 1 7.5 6.5Z"/><path d="M7 10h8M7 14h5"/></svg>
                  <div><h3>Campus conversations</h3><p>Join the chat under an alias. Your real name stays off your public profile.</p></div>
                </li>
                <li>
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5" width="16" height="16" rx="3"/><path d="M8 3v4m8-4v4M4 11h16m-10 5h4"/></svg>
                  <div><h3>Plans beyond the group chat</h3><p>Find company for coffee, a study session, or a walk around campus.</p></div>
                </li>
                <li>
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Z"/><path d="m8.5 12 2.5 2.5 4.5-5"/></svg>
                  <div><h3>An introduction you both choose</h3><p>Reveal your identity in a private chat only when you both agree.</p></div>
                </li>
              </ul>

              <button type="button" class="auth-primary-btn" onclick="handleStartForFree()">
                Continue with student email →
              </button>

              <div class="auth-divider-or"><span>or</span></div>

              <button type="button" class="auth-google-btn" onclick="handleGoogleSignIn()">
                <svg class="auth-google-icon" width="20" height="20" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
                <span>Continue with Google</span>
              </button>
              <div class="auth-google-hint">Use your university Google account</div>

              <div class="auth-alt-action">
                Just browsing? <a onclick="go('home')">Enter as guest →</a>
              </div>

              <div class="auth-trust-strip">
                <div class="auth-trust-pill">Alias first</div>
                <div class="auth-trust-pill">Campus community</div>
                <div class="auth-trust-pill">Free to join</div>
              </div>
            ` : step === 'form' ? `
              <button type="button" class="auth-back-btn" onclick="handleAuthBack()">
                ← Back
              </button>
              <span class="auth-form-eyebrow-tag">✦ STEP 1 OF 2 · STUDENT SETUP</span>
              <h2 class="auth-card-title">Create your<br>profile</h2>
              <p class="auth-card-sub">Enter your student email and select your gender for companion and partner matching.</p>

              <form id="auth-page-form" onsubmit="handleAuthPageSendOtp(event)">
                <div class="auth-form-group">
                  <label for="auth-page-email">COLLEGE STUDENT EMAIL</label>
                  <input id="auth-page-email" class="auth-form-input" type="email" placeholder="you@college.edu" value="${pendingEmail}" required autofocus>
                </div>

                <div class="auth-form-group">
                  <label>YOUR GENDER (FOR COMPANION &amp; PARTNER PAIRING)</label>
                  <div class="auth-gender-grid">
                    <button type="button" class="auth-gender-btn ${selectedGender === 'woman' ? 'active' : ''}" onclick="selectAuthGender('woman')">
                      👩 Woman
                    </button>
                    <button type="button" class="auth-gender-btn ${selectedGender === 'man' ? 'active' : ''}" onclick="selectAuthGender('man')">
                      👨 Man
                    </button>
                    <button type="button" class="auth-gender-btn ${selectedGender === 'nonbinary' ? 'active' : ''}" onclick="selectAuthGender('nonbinary')">
                      🧑 Non-binary
                    </button>
                    <button type="button" class="auth-gender-btn ${selectedGender === 'prefer_not_to_say' ? 'active' : ''}" onclick="selectAuthGender('prefer_not_to_say')">
                      Prefer not to say
                    </button>
                  </div>
                  <small style="font:11.5px 'DM Sans';color:rgba(255,255,255,.5);display:block;margin-top:-4px;margin-bottom:14px;line-height:1.4;">
                    Choose the option that feels right for you.
                  </small>
                </div>

                <div class="auth-security-notice">
                  <span>🔒</span>
                  <small>Your university email helps us verify campus access. It isn’t shown on your public student profile.</small>
                </div>

                <button type="submit" class="auth-primary-btn">
                  Get Verification Code →
                </button>
              </form>

              <div class="auth-alt-action">
                Prefer faster sign in? <a onclick="handleGoogleSignIn()">Continue with Google →</a>
              </div>
            ` : `
              <span class="auth-form-eyebrow-tag" style="background:rgba(74,222,128,.15);color:#86efac;border-color:rgba(74,222,128,.3);">✦ STEP 2 OF 2 · ENTER PASSCODE</span>
              <h2 class="auth-card-title">Check your<br>inbox</h2>
              <p class="auth-card-sub">We sent a 6-digit verification code to:</p>
              <div style="display:flex;align-items:center;gap:8px;margin:-14px 0 20px;">
                <b style="color:#ffffff;font-size:14.5px;font-family:'DM Mono';">${pendingEmail}</b>
                <a onclick="handleAuthPageResetEmail()" style="font-size:12px;color:#86efac;font-weight:700;text-decoration:underline;cursor:pointer;">Change</a>
              </div>

              <form id="auth-page-otp-form" onsubmit="handleAuthPageVerifyOtp(event)">
                <div class="auth-form-group">
                  <label for="auth-page-code">6-DIGIT PASSCODE</label>
                  <input id="auth-page-code" class="auth-form-input auth-otp-field" inputmode="numeric" pattern="[0-9]*" maxlength="6" placeholder="· · · · · ·" required autofocus>
                </div>

                ${state.authDevCode ? `
                  <div class="auth-dev-badge">
                    <span>Development Code:</span>
                    <b>${state.authDevCode}</b>
                  </div>
                ` : ''}

                <button type="submit" class="auth-primary-btn">
                  Enter Afterclass ✦
                </button>
              </form>

              <div class="auth-alt-action">
                Didn't receive code? <a onclick="handleAuthPageResendOtp()">Resend Code</a>
              </div>
            `}
          </div>
        </div>
      </main>
    </div>
  `;
}

let currentDraftAvatar = null;
let activeAvatarStudioTab = 'appearance';
let avatarStudioDarkMode = false;

window.openAvatarPreview = () => {
  if (!state.me) return openAuth();
  if (!currentDraftAvatar) {
    currentDraftAvatar = state.me.avatarConfig ? { ...state.me.avatarConfig } : getDeterministicAvatar(state.me.username);
  }
  renderAvatarPreviewModal();
};

window.toggleAvatarStudioDarkMode = () => {
  avatarStudioDarkMode = !avatarStudioDarkMode;
  renderAvatarStudioModal();
};

function renderAvatarPreviewModal() {
  document.querySelector('.modal-backdrop')?.remove();
  if (!state.me) return;
  const cfg = currentDraftAvatar || state.me.avatarConfig || getDeterministicAvatar(state.me.username);

  document.body.insertAdjacentHTML('beforeend', modal(`
    <div class="avatar-showcase-modal">
      <span class="eyebrow">STUDENT PROFILE</span>
      <h2>Your Anonymous Identity</h2>

      <div class="profile-passport-box" style="margin: 20px 0 14px; display: flex; justify-content: center;">
        <span class="avatar-verified-wrapper" style="position:relative;display:inline-flex;align-items:center;justify-content:center;">
          ${renderAvatarSvg(cfg, 108)}
          <span style="position:absolute;bottom:0px;right:0px;z-index:2;line-height:0;" title="Verified Student">
            ${renderVerifiedBadgeSvg(30)}
          </span>
        </span>
      </div>

      <div class="showcase-user-meta" style="margin-bottom: 24px;">
        <h3>${state.me.username}</h3>
        <p><span class="badge-star">✦</span> Verified Student · ${state.me.university || 'Campus'}</p>
      </div>

      <div class="showcase-actions">
        <button class="primary wide" onclick="openAvatarStudio()">🎨 Customize Character & Wardrobe →</button>
      </div>
    </div>
  `));
}

window.openAvatarStudio = () => {
  if (!state.me) return openAuth();
  if (!currentDraftAvatar) {
    currentDraftAvatar = state.me.avatarConfig ? { ...state.me.avatarConfig } : getDeterministicAvatar(state.me.username);
  }
  activeAvatarStudioTab = 'appearance';
  renderAvatarStudioModal();
};

window.setAvatarStudioTab = tab => {
  if (activeAvatarStudioTab === tab) return;
  activeAvatarStudioTab = tab;
  renderAvatarStudioModal();
};

window.updateAvatarDraft = (field, value) => {
  if (!currentDraftAvatar) return;
  currentDraftAvatar[field] = value;
  renderAvatarStudioModal();
};

window.randomizeAvatarDraft = () => {
  const skins = AVATAR_OPTIONS.skins.map(s => s.id);
  const hairs = AVATAR_OPTIONS.hairs.map(h => h.id);
  const hairColors = AVATAR_OPTIONS.hairColors.map(h => h.id);
  const outfits = AVATAR_OPTIONS.outfits.map(o => o.id);
  const outfitColors = AVATAR_OPTIONS.outfitColors.map(o => o.color);
  const expressions = AVATAR_OPTIONS.expressions.map(e => e.id);
  const eyewearList = AVATAR_OPTIONS.eyewear.map(e => e.id);
  const accessories = AVATAR_OPTIONS.accessories.map(a => a.id);
  const bgs = AVATAR_OPTIONS.bgs.map(b => b.id);

  currentDraftAvatar = {
    skin: skins[Math.floor(Math.random() * skins.length)],
    hair: hairs[Math.floor(Math.random() * hairs.length)],
    hairColor: hairColors[Math.floor(Math.random() * hairColors.length)],
    outfit: outfits[Math.floor(Math.random() * outfits.length)],
    outfitColor: outfitColors[Math.floor(Math.random() * outfitColors.length)],
    expression: expressions[Math.floor(Math.random() * expressions.length)],
    eyewear: eyewearList[Math.floor(Math.random() * eyewearList.length)],
    accessory: accessories[Math.floor(Math.random() * accessories.length)],
    bg: bgs[Math.floor(Math.random() * bgs.length)]
  };
  renderAvatarStudioModal();
};

window.saveAvatar = async () => {
  if (!currentDraftAvatar) return;
  try {
    await api('/users/avatar', {
      method: 'PATCH',
      body: JSON.stringify({ avatarConfig: currentDraftAvatar })
    });
    if (state.me) state.me.avatarConfig = currentDraftAvatar;
    closeModal();
    toast('Avatar updated successfully! ✦');
    render();
  } catch (err) {
    toast(err.message || 'Could not save avatar.');
  }
};

function renderAvatarStudioModal() {
  document.querySelector('.modal-backdrop')?.remove();
  if (!currentDraftAvatar) return;

  const tab = activeAvatarStudioTab;
  const isDark = avatarStudioDarkMode;

  document.body.insertAdjacentHTML('beforeend', modal(`
    <div class="avatar-studio-container">
      <span class="eyebrow">AVATAR STUDIO</span>
      <h2>Customize Your Character</h2>
      
      <div class="showcase-stage-card ${isDark ? 'dark-stage' : ''}">
        <div class="stage-controls" style="width: 100%; display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <button class="stage-toggle-btn ${isDark ? 'active' : ''}" onclick="toggleAvatarStudioDarkMode()" title="Switch Light/Dark Spotlight Mode">
            ${isDark ? '🌙 Dark Stage' : '☀️ Light Studio'}
          </button>
          <button class="randomize-btn" style="margin:0;" onclick="randomizeAvatarDraft()" title="Generate random style">🎲 Randomize</button>
        </div>
        <div class="fullbody-stage-display">
          ${renderFullBodyAvatarSvg(currentDraftAvatar, isDark, 200, 260)}
        </div>
      </div>

      <div class="studio-tabs">
        <button type="button" class="${tab === 'appearance' ? 'active' : ''}" onclick="setAvatarStudioTab('appearance')">Face & Tone</button>
        <button type="button" class="${tab === 'hair' ? 'active' : ''}" onclick="setAvatarStudioTab('hair')">Hair</button>
        <button type="button" class="${tab === 'outfit' ? 'active' : ''}" onclick="setAvatarStudioTab('outfit')">Clothing</button>
        <button type="button" class="${tab === 'eyewear' ? 'active' : ''}" onclick="setAvatarStudioTab('eyewear')">Eyewear</button>
        <button type="button" class="${tab === 'extras' ? 'active' : ''}" onclick="setAvatarStudioTab('extras')">Extras & Bg</button>
      </div>

      <div class="studio-tab-content">
        ${tab === 'appearance' ? `
          <div class="studio-section">
            <label>Skin Tone</label>
            <div class="color-palette-row">
              ${AVATAR_OPTIONS.skins.map(s => `
                <button class="color-chip ${currentDraftAvatar.skin === s.id ? 'selected' : ''}" style="background:${s.color};" onclick="updateAvatarDraft('skin', '${s.id}')" title="${s.label}"></button>
              `).join('')}
            </div>
          </div>
          <div class="studio-section">
            <label>Expression</label>
            <div class="chip-options-grid">
              ${AVATAR_OPTIONS.expressions.map(e => `
                <button class="studio-chip ${currentDraftAvatar.expression === e.id ? 'selected' : ''}" onclick="updateAvatarDraft('expression', '${e.id}')">${e.label}</button>
              `).join('')}
            </div>
          </div>
        ` : ''}

        ${tab === 'hair' ? `
          <div class="studio-section">
            <label>Hairstyle</label>
            <div class="chip-options-grid">
              ${AVATAR_OPTIONS.hairs.map(h => `
                <button class="studio-chip ${currentDraftAvatar.hair === h.id ? 'selected' : ''}" onclick="updateAvatarDraft('hair', '${h.id}')">${h.label}</button>
              `).join('')}
            </div>
          </div>
          <div class="studio-section">
            <label>Hair Color</label>
            <div class="color-palette-row">
              ${AVATAR_OPTIONS.hairColors.map(h => `
                <button class="color-chip ${currentDraftAvatar.hairColor === h.id ? 'selected' : ''}" style="background:${h.color};" onclick="updateAvatarDraft('hairColor', '${h.id}')" title="${h.label}"></button>
              `).join('')}
            </div>
          </div>
        ` : ''}

        ${tab === 'outfit' ? `
          <div class="studio-section">
            <label>Outfit Style (10 College Looks)</label>
            <div class="chip-options-grid">
              ${AVATAR_OPTIONS.outfits.map(o => `
                <button class="studio-chip ${currentDraftAvatar.outfit === o.id ? 'selected' : ''}" onclick="updateAvatarDraft('outfit', '${o.id}')">${o.label}</button>
              `).join('')}
            </div>
          </div>
          <div class="studio-section">
            <label>Outfit Color</label>
            <div class="color-palette-row">
              ${AVATAR_OPTIONS.outfitColors.map(c => `
                <button class="color-chip ${currentDraftAvatar.outfitColor === c.color ? 'selected' : ''}" style="background:${c.color};" onclick="updateAvatarDraft('outfitColor', '${c.color}')" title="${c.label}"></button>
              `).join('')}
            </div>
          </div>
        ` : ''}

        ${tab === 'eyewear' ? `
          <div class="studio-section">
            <label>Eyewear & Sunglasses</label>
            <div class="chip-options-grid">
              ${AVATAR_OPTIONS.eyewear.map(e => `
                <button class="studio-chip ${(currentDraftAvatar.eyewear || 'none') === e.id ? 'selected' : ''}" onclick="updateAvatarDraft('eyewear', '${e.id}')">${e.label}</button>
              `).join('')}
            </div>
          </div>
        ` : ''}

        ${tab === 'extras' ? `
          <div class="studio-section">
            <label>Accessories & Details</label>
            <div class="chip-options-grid">
              ${AVATAR_OPTIONS.accessories.map(a => `
                <button class="studio-chip ${currentDraftAvatar.accessory === a.id ? 'selected' : ''}" onclick="updateAvatarDraft('accessory', '${a.id}')">${a.label}</button>
              `).join('')}
            </div>
          </div>
          <div class="studio-section">
            <label>Background Badge</label>
            <div class="color-palette-row">
              ${AVATAR_OPTIONS.bgs.map(b => `
                <button class="color-chip ${currentDraftAvatar.bg === b.id ? 'selected' : ''}" style="background:${b.color};" onclick="updateAvatarDraft('bg', '${b.id}')" title="${b.label}"></button>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>

      <div class="studio-actions">
        <button class="text-btn" onclick="openAvatarPreview()">← Back</button>
        <button class="primary" onclick="saveAvatar()">Save Character ✦</button>
      </div>
    </div>
  `));
}

let dialogReturnFocus = null;
function modal(content, extraClass = '') {
  if (!document.querySelector('.modal-backdrop')) dialogReturnFocus = document.activeElement;
  requestAnimationFrame(() => {
    const dialog = document.querySelector('.modal[role=dialog]');
    const heading = dialog?.querySelector('h2');
    if (heading) { heading.id = 'active-dialog-title'; dialog.setAttribute('aria-labelledby', heading.id); }
    (dialog?.querySelector('input:not([type=hidden]), textarea, select') || dialog?.querySelector('button'))?.focus();
  });
  return `
    <div class="modal-backdrop" onclick="closeModal(event)">
      <div class="modal ${extraClass}" role="dialog" aria-modal="true" aria-label="Afterclass dialog" onclick="event.stopPropagation()">
        <button class="close" aria-label="Close dialog" onclick="closeModal()">×</button>
        ${content}
      </div>
    </div>
  `;
}

function openComposer() {
  if (!state.me) return openAuth();

  const now = new Date();
  const nowIso = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const defaultDate = new Date(Date.now() + 3600000);
  const defaultIso = new Date(defaultDate.getTime() - defaultDate.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

  document.body.insertAdjacentHTML('beforeend', modal(`
    <div class="composer-modal-content">
      <span class="eyebrow">MAKE A PLAN</span>
      <h2>What would feel good?</h2>
      <p style="font-size: 13px; color: var(--muted); margin-bottom: 12px;">Create a low-pressure campus plan. Verified students can express interest.</p>

      <form onsubmit="createPlan(event)">
        <div class="composer-field-group">
          <label for="plan-activity">Activity
            <input id="plan-activity" placeholder="e.g. Coffee & study session" required maxlength="100">
          </label>
          <div class="quick-chips-row">
            <button type="button" class="quick-pick-chip activity-chip" data-val="Coffee meetup ☕" onclick="selectQuickActivity('Coffee meetup ☕')">☕ Coffee meetup</button>
            <button type="button" class="quick-pick-chip activity-chip" data-val="Library study session 📚" onclick="selectQuickActivity('Library study session 📚')">📚 Study session</button>
            <button type="button" class="quick-pick-chip activity-chip" data-val="Badminton / Gym 🏸" onclick="selectQuickActivity('Badminton / Gym 🏸')">🏸 Badminton / Gym</button>
            <button type="button" class="quick-pick-chip activity-chip" data-val="Quick bite / Lunch 🍱" onclick="selectQuickActivity('Quick bite / Lunch 🍱')">🍱 Quick bite / Mess</button>
            <button type="button" class="quick-pick-chip activity-chip" data-val="Evening campus walk 🚶" onclick="selectQuickActivity('Evening campus walk 🚶')">🚶 Campus walk</button>
            <button type="button" class="quick-pick-chip activity-chip" data-val="Gaming session 🎮" onclick="selectQuickActivity('Gaming session 🎮')">🎮 Gaming</button>
          </div>
        </div>

        <div class="composer-field-group">
          <label for="plan-where">Campus Location (Public spot)
            <input id="plan-where" placeholder="e.g. Central Library Cafe" required maxlength="120">
          </label>
          <div class="quick-chips-row">
            <button type="button" class="quick-pick-chip location-chip" data-val="Central Library Cafe" onclick="selectQuickLocation('Central Library Cafe')">☕ Library Cafe</button>
            <button type="button" class="quick-pick-chip location-chip" data-val="Indoor Sports Complex" onclick="selectQuickLocation('Indoor Sports Complex')">🏸 Sports Complex</button>
            <button type="button" class="quick-pick-chip location-chip" data-val="Food Court / Cafeteria" onclick="selectQuickLocation('Food Court / Cafeteria')">🍱 Food Court</button>
            <button type="button" class="quick-pick-chip location-chip" data-val="Green Amphitheater" onclick="selectQuickLocation('Green Amphitheater')">🌿 Amphitheater</button>
            <button type="button" class="quick-pick-chip location-chip" data-val="Academic Tech Block" onclick="selectQuickLocation('Academic Tech Block')">💻 Tech Block</button>
            <button type="button" class="quick-pick-chip location-chip" data-val="Basketball Courts" onclick="selectQuickLocation('Basketball Courts')">🏀 Basketball Courts</button>
          </div>
        </div>

        <div class="composer-field-group">
          <label for="plan-when">When
            <input id="plan-when" type="datetime-local" min="${nowIso}" value="${defaultIso}" required>
          </label>
          <div class="quick-chips-row">
            <button type="button" class="quick-pick-chip time-chip" data-val="30m" onclick="selectQuickTime('30m')">⚡ In 30 mins</button>
            <button type="button" class="quick-pick-chip time-chip" data-val="afternoon" onclick="selectQuickTime('afternoon')">☕ This Afternoon (4 PM)</button>
            <button type="button" class="quick-pick-chip time-chip" data-val="tonight" onclick="selectQuickTime('tonight')">🌙 Tonight (8 PM)</button>
            <button type="button" class="quick-pick-chip time-chip" data-val="tomorrow" onclick="selectQuickTime('tomorrow')">📅 Tomorrow (11 AM)</button>
          </div>
        </div>

        <div class="modal-actions" style="margin-top: 18px; display: flex; justify-content: flex-end; gap: 10px;">
          <button type="button" class="text-btn" onclick="closeModal()">Cancel</button>
          <button class="primary" type="submit">Share Plan ✦</button>
        </div>
      </form>
    </div>
  `));
}

window.selectQuickActivity = text => {
  const el = document.querySelector('#plan-activity');
  if (el) {
    el.value = text;
    el.focus();
  }
  document.querySelectorAll('.activity-chip').forEach(c => c.classList.toggle('selected', c.dataset.val === text));
};

window.selectQuickLocation = text => {
  const el = document.querySelector('#plan-where');
  if (el) {
    el.value = text;
    el.focus();
  }
  document.querySelectorAll('.location-chip').forEach(c => c.classList.toggle('selected', c.dataset.val === text));
};

window.selectQuickTime = type => {
  const now = new Date();
  let target = new Date();

  if (type === '30m') {
    target = new Date(now.getTime() + 30 * 60000);
  } else if (type === 'afternoon') {
    target.setHours(16, 0, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);
  } else if (type === 'tonight') {
    target.setHours(20, 0, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);
  } else if (type === 'tomorrow') {
    target.setDate(target.getDate() + 1);
    target.setHours(11, 0, 0, 0);
  }

  const iso = new Date(target.getTime() - target.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const el = document.querySelector('#plan-when');
  if (el) el.value = iso;

  document.querySelectorAll('.time-chip').forEach(c => c.classList.toggle('selected', c.dataset.val === type));
};

function openGuidelines() {
  document.body.insertAdjacentHTML('beforeend', modal(`
    <span class="eyebrow">COMMUNITY & SAFETY</span>
    <h2>Guidelines for Campus</h2>
    <div style="font-size: 13px; line-height: 1.6; color: var(--ink); margin: 15px 0;">
      <p><b>1. Mutual Respect:</b> Harassment, threats, hate speech, or bullying will result in permanent account removal.</p>
      <p><b>2. Anonymity & Privacy:</b> Do not attempt to de-anonymize, dox, or share another student's real details without their explicit consent.</p>
      <p><b>3. Public Meetups:</b> All activities should take place in public campus areas (cafeterias, sports centres, libraries).</p>
      <p><b>4. Reporting:</b> Hover over any message in campus chat to report inappropriate behaviour. Reports are reviewed privately by the moderation team.</p>
    </div>
    <button class="primary wide" onclick="closeModal()">I Understand</button>
  `));
}

// ── Campus Group Members Modal ──────────────────────────────────────────────

function formatMemberTimeAgo(dateStr) {
  if (!dateStr) return 'recently';
  const diffMs = Date.now() - new Date(dateStr).getTime();
  if (diffMs < 60000) return 'just now';
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatMemberJoinDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

function renderCampusMembersList(members) {
  const container = document.getElementById('campus-members-list');
  if (!container) return;
  if (!members || members.length === 0) {
    container.innerHTML = `
      <div class="members-empty-state">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color:#94a39d;margin-bottom:8px;">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <strong>No members found</strong>
        <p style="margin:4px 0 0;font-size:12px;">Try searching for a different name or alias.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = members.map(m => {
    const isMe = m.isMe || (state.me && (m.id === state.me.id || m.username === state.me.username));
    const timeAgo = formatMemberTimeAgo(m.lastActiveAt);
    const joined = formatMemberJoinDate(m.joinedAt);
    const displayName = m.username || m.publicAlias || 'Anonymous Student';
    const safeName = displayName.replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    return `
      <div class="campus-member-row ${m.isOnline ? 'is-online' : ''} ${isMe ? 'is-me' : ''}">
        <div class="member-avatar-wrapper">
          ${avatar(displayName, false, true)}
          ${m.isOnline ? '<span class="member-online-indicator" title="Online now"></span>' : ''}
        </div>
        <div class="member-info-col">
          <div class="member-name-row">
            <strong class="member-alias">${displayName}</strong>
            ${isMe ? '<span class="member-badge me">You</span>' : ''}
          </div>
          <div class="member-meta-row">
            ${m.isOnline 
              ? '<span class="member-status-tag online"><i class="live-pulse-dot"></i> Online now</span>' 
              : `<span class="member-status-tag offline">Active ${timeAgo}</span>`
            }
            ${joined ? `<span class="member-joined-bullet">·</span><span class="member-joined-text">Joined ${joined}</span>` : ''}
          </div>
        </div>
        <div class="member-actions-col">
          ${isMe ? `
            <span class="member-self-tag">You</span>
          ` : `
            <button type="button" class="member-mention-btn" onclick="mentionMemberInChat('${safeName}')" title="Mention ${safeName} in chat">
              @ Mention
            </button>
          `}
        </div>
      </div>
    `;
  }).join('');
}

async function openCampusMembersModal() {
  const modalHtml = modal(`
    <div class="campus-members-modal-wrapper">
      <div class="campus-members-header">
        <span class="eyebrow">CAMPUS GROUP MEMBERS</span>
        <h2 style="margin: 4px 0 2px; font-size: 22px; display: flex; align-items: center; gap: 8px;">
          <span>👥</span> <span id="members-modal-title">Campus Members</span>
        </h2>
        <p id="members-modal-subtitle" style="margin: 0 0 12px; font-size: 13px; color: var(--muted);">
          Students who have joined this campus chat group
        </p>
        <div class="member-search-wrap">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input 
            type="search" 
            id="campus-member-search" 
            placeholder="Search joined members by alias..." 
            oninput="filterCampusMembers(this.value)"
            autocomplete="off"
          />
        </div>
      </div>
      <div class="campus-members-stats-bar">
        <span class="stats-pill"><i class="live-pulse-dot"></i> <b id="stats-online-count">-</b> online now</span>
        <span class="stats-pill total">👥 <b id="stats-total-count">-</b> joined members</span>
      </div>
      <div class="campus-members-list-container" id="campus-members-list">
        <div class="members-loading-state">
          <span class="members-spinner"></span>
          <span>Loading members who joined...</span>
        </div>
      </div>
    </div>
  `, 'campus-members-dialog');

  document.body.insertAdjacentHTML('beforeend', modalHtml);

  // Focus search box automatically
  setTimeout(() => {
    document.getElementById('campus-member-search')?.focus();
  }, 50);

  try {
    const data = await api('/campus/members');
    window._cachedCampusMembers = data.members || [];

    const titleEl = document.getElementById('members-modal-title');
    const subtitleEl = document.getElementById('members-modal-subtitle');
    const onlineEl = document.getElementById('stats-online-count');
    const totalEl = document.getElementById('stats-total-count');

    if (titleEl) titleEl.textContent = `${data.campusName || 'Campus'} Members`;
    if (subtitleEl) subtitleEl.textContent = `All verified students joined in ${data.campusName || 'this campus'} (${data.totalCount || 0} members)`;
    if (onlineEl) onlineEl.textContent = data.onlineCount || 0;
    if (totalEl) totalEl.textContent = data.totalCount || 0;

    renderCampusMembersList(window._cachedCampusMembers);
  } catch (err) {
    console.error('Failed to load campus members:', err);
    const listEl = document.getElementById('campus-members-list');
    if (listEl) {
      listEl.innerHTML = `
        <div class="members-empty-state">
          <p>Could not load group members. Please ensure you are logged into your campus account.</p>
        </div>
      `;
    }
  }
}

function filterCampusMembers(q) {
  const query = (q || '').trim().toLowerCase();
  if (!window._cachedCampusMembers) return;
  if (!query) {
    renderCampusMembersList(window._cachedCampusMembers);
    return;
  }
  const filtered = window._cachedCampusMembers.filter(m => {
    const name = (m.username || m.publicAlias || '').toLowerCase();
    return name.includes(query);
  });
  renderCampusMembersList(filtered);
}

function mentionMemberInChat(username) {
  closeModal();
  const input = document.getElementById('message');
  if (input) {
    input.focus();
    const cur = input.value;
    input.value = cur ? (cur.endsWith(' ') ? `${cur}@${username} ` : `${cur} @${username} `) : `@${username} `;
  }
}

// ── Ephemeral Live Selfie Identity & Gender Verification ────────────────────

const VERIFICATION_GESTURES = [
  { id: 'peace_sign', icon: '✌️', title: 'Peace Sign', instruction: 'Hold up 2 fingers (peace sign) next to your face' },
  { id: 'thumbs_up', icon: '👍', title: 'Thumbs Up', instruction: 'Give a thumbs up next to your face' },
  { id: 'open_palm', icon: '🖐️', title: 'Open Palm', instruction: 'Hold up your open hand next to your face' },
  { id: 'three_fingers', icon: '🤟', title: 'Three Fingers', instruction: 'Hold up 3 fingers next to your face' }
];

async function openVerificationModal() {
  if (state.me?.isVerified) {
    toast('✓ Your student profile is already verified!');
    return;
  }
  const gesture = VERIFICATION_GESTURES[Math.floor(Math.random() * VERIFICATION_GESTURES.length)];
  window._activeVerificationGesture = gesture;

  const modalHtml = modal(`
    <div class="verif-modal-wrapper">
      <div class="verif-modal-header">
        <span class="eyebrow">IDENTITY &amp; TRUST SAFETY</span>
        <h2 style="font-size:22px;margin:4px 0 2px;display:flex;align-items:center;gap:8px;">
          <span>📸</span> Live Student Verification
        </h2>
        <p style="font-size:12.5px;color:var(--muted);margin:0 0 12px;">
          To stop catfishing and fake accounts, take a quick 5-second live selfie matching the gesture challenge below.
        </p>
      </div>

      <div class="verif-gesture-challenge-box">
        <div class="verif-gesture-icon">${gesture.icon}</div>
        <div class="verif-gesture-info">
          <span class="verif-gesture-label">REQUIRED LIVE GESTURE</span>
          <strong>${gesture.instruction}</strong>
        </div>
      </div>

      <div class="verif-camera-container">
        <video id="verif-video" autoplay playsinline muted></video>
        <div class="verif-camera-overlay">
          <div class="verif-viewfinder-guide">
            <div class="verif-corner verif-corner-tl"></div>
            <div class="verif-corner verif-corner-tr"></div>
            <div class="verif-corner verif-corner-bl"></div>
            <div class="verif-corner verif-corner-br"></div>
          </div>
          <span class="verif-guide-hint">Keep face &amp; hand gesture clearly in view</span>
        </div>
        <div id="verif-camera-error" class="verif-camera-error" style="display:none;">
          <p>⚠️ Camera access is required for live verification.</p>
          <small>Please allow camera permissions in your browser to verify your identity.</small>
        </div>
        <canvas id="verif-canvas" width="512" height="384" style="display:none;"></canvas>
      </div>

      <div class="verif-privacy-pill">
        ✨ <b>Zero Permanent Storage:</b> Your photo is submitted under verification and permanently deleted right after. Once verified, you're all set to enjoy Afterclass!
      </div>

      <div class="verif-actions-row">
        <button type="button" class="secondary" onclick="closeModal()">Cancel</button>
        <button type="button" id="verif-snap-btn" class="primary" onclick="captureAndSubmitVerification()">
          📸 Snap &amp; Submit Photo
        </button>
      </div>
    </div>
  `, 'verif-modal-dialog');

  document.body.insertAdjacentHTML('beforeend', modalHtml);

  // Request live camera stream
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width: { ideal: 640 },
        height: { ideal: 640 }
      },
      audio: false
    });
    window._verificationStream = stream;
    const video = document.getElementById('verif-video');
    if (video) {
      video.srcObject = stream;
      video.play().catch(() => {});
    }
  } catch (err) {
    console.warn('Camera error:', err);
    const errBox = document.getElementById('verif-camera-error');
    const snapBtn = document.getElementById('verif-snap-btn');
    if (errBox) errBox.style.display = 'flex';
    if (snapBtn) snapBtn.disabled = true;
  }
}

async function captureAndSubmitVerification() {
  const video = document.getElementById('verif-video');
  const canvas = document.getElementById('verif-canvas');
  const snapBtn = document.getElementById('verif-snap-btn');
  if (!video || !canvas) return;

  if (snapBtn) {
    snapBtn.disabled = true;
    snapBtn.innerHTML = `Submitting...`;
  }

  // Preserve full camera field of view so both face and hand gesture fit without being cropped out
  const vWidth = video.videoWidth || 640;
  const vHeight = video.videoHeight || 480;
  const targetWidth = 512;
  const targetHeight = Math.round((vHeight / vWidth) * targetWidth);
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, targetWidth, targetHeight);

  // Universal JPEG compression @ 70% (supported on all browsers including Safari & iOS; ~25-35 KB)
  let imageBase64 = canvas.toDataURL('image/jpeg', 0.7);
  if (!imageBase64 || !imageBase64.startsWith('data:image/jpeg')) {
    imageBase64 = canvas.toDataURL('image/webp', 0.6);
  }

  try {
    const data = await api('/verify/selfie', {
      method: 'POST',
      body: JSON.stringify({
        imageBase64,
        gesture: window._activeVerificationGesture?.id || 'peace_sign'
      })
    });

    // Close camera stream upon successful upload
    if (window._verificationStream) {
      try { window._verificationStream.getTracks().forEach(t => t.stop()); } catch (e) {}
      window._verificationStream = null;
    }

    if (data.user) {
      updateMe({ ...state.me, ...data.user });
    }
    closeModal();
    toast('✨ Verification submitted! Your profile is now under verification — once verified, you can enjoy Afterclass with your blue badge!');
    render();
  } catch (err) {
    console.warn('Verification submission error:', err);
    toast(err.message || 'Could not submit verification.');
    if (snapBtn) {
      snapBtn.disabled = false;
      snapBtn.innerHTML = 'Try Again';
    }
  }
}

// ── Live Location Sharing & Interactive Campus Map ──────────────────────────

let geolocationWatchId = null;
let simulatedLocationInterval = null;

function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
  const R = 6371e3; // meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

function formatWalkingDistance(meters) {
  if (meters == null || isNaN(meters)) return '📍 Locating students...';
  if (meters < 15) return '🎉 Arrived! You are together';
  const walkMinutes = Math.max(1, Math.round(meters / 80));
  if (meters < 1000) {
    return `🚶 ${meters}m away · ~${walkMinutes} min walk`;
  }
  return `🚶 ${(meters / 1000).toFixed(1)} km away · ~${walkMinutes} min walk`;
}

function sendLocationCoordinates(coords) {
  state.locationSharing.myCoords = coords;
  if (state.activeMatch && socket?.connected && state.locationSharing.active) {
    socket.emit('location:update', {
      matchId: state.activeMatch.id,
      coords: {
        lat: coords.lat,
        lng: coords.lng,
        accuracy: coords.accuracy || 10,
        heading: coords.heading || 0,
        speed: coords.speed || 0,
        updatedAt: Date.now()
      }
    });
  }
  updateMapMarkers();
}

function startCampusSimulation() {
  if (simulatedLocationInterval) clearInterval(simulatedLocationInterval);

  let lat = 27.97120;
  let lng = 76.39860;
  const offset = (state.me?.id?.slice(-3) ? (parseInt(state.me.id.slice(-3), 16) % 60) : 10) * 0.000004;
  lat += offset;
  lng += offset;

  sendLocationCoordinates({
    lat,
    lng,
    accuracy: 8,
    heading: 45,
    speed: 1.2
  });

  simulatedLocationInterval = setInterval(() => {
    if (!state.locationSharing?.active && !state.locationSharing?.myConsent) {
      clearInterval(simulatedLocationInterval);
      return;
    }
    lat += (Math.random() - 0.49) * 0.000012;
    lng += (Math.random() - 0.49) * 0.000012;
    sendLocationCoordinates({
      lat,
      lng,
      accuracy: 6,
      heading: 90,
      speed: 1.1
    });
  }, 4000);
}

function startGeolocationWatch() {
  stopGeolocationWatch();

  if ('geolocation' in navigator) {
    geolocationWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        sendLocationCoordinates({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy || 10,
          heading: pos.coords.heading || 0,
          speed: pos.coords.speed || 0
        });
      },
      (err) => {
        console.warn('Geolocation denied or unavailable, using campus simulation:', err.message);
        startCampusSimulation();
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 4000
      }
    );
  } else {
    startCampusSimulation();
  }
}

function stopGeolocationWatch() {
  if (geolocationWatchId != null) {
    try { navigator.geolocation?.clearWatch(geolocationWatchId); } catch (e) {}
    geolocationWatchId = null;
  }
  if (simulatedLocationInterval != null) {
    clearInterval(simulatedLocationInterval);
    simulatedLocationInterval = null;
  }
}

function initCampusMap(match) {
  const container = document.getElementById('live-campus-map');
  if (!container) return;

  if (state.locationSharing.map) {
    try { state.locationSharing.map.remove(); } catch (e) {}
    state.locationSharing.map = null;
  }

  const defaultLat = state.locationSharing.myCoords?.lat || 27.9712;
  const defaultLng = state.locationSharing.myCoords?.lng || 76.3986;

  const map = L.map(container, {
    zoomControl: false,
    attributionControl: false
  }).setView([defaultLat, defaultLng], 17);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19
  }).addTo(map);

  L.control.zoom({ position: 'topright' }).addTo(map);

  state.locationSharing.map = map;
  state.locationSharing.markers = {};
  state.locationSharing.polyline = null;

  setTimeout(() => {
    map.invalidateSize();
    updateMapMarkers();
  }, 100);
}

function updateMapMarkers() {
  const map = state.locationSharing?.map;
  if (!map || !state.activeMatch) return;

  const match = state.activeMatch;
  const otherName = match.revealed ? (match.other?.revealName || match.other?.username) : match.other?.username;
  const myCoords = state.locationSharing.myCoords;
  const otherCoords = state.locationSharing.otherCoords;

  const myLat = myCoords ? (myCoords.lat ?? myCoords.latitude) : null;
  const myLng = myCoords ? (myCoords.lng ?? myCoords.longitude) : null;
  const otherLat = otherCoords ? (otherCoords.lat ?? otherCoords.latitude) : null;
  const otherLng = otherCoords ? (otherCoords.lng ?? otherCoords.longitude) : null;

  if (myLat != null && myLng != null && otherLat != null && otherLng != null) {
    const dist = calculateHaversineDistance(myLat, myLng, otherLat, otherLng);
    state.locationSharing.distanceMeters = dist;
    const distPill = document.getElementById('live-distance-pill');
    if (distPill) {
      distPill.textContent = formatWalkingDistance(dist);
    }
  }

  const latLngs = [];

  if (myLat != null && myLng != null) {
    const myLatLng = [myLat, myLng];
    latLngs.push(myLatLng);

    if (!state.locationSharing.markers.mine) {
      const myIcon = L.divIcon({
        className: 'custom-map-avatar-marker mine',
        html: `
          <div class="map-accuracy-ring"></div>
          <div class="map-marker-bubble">
            ${avatar(state.me?.avatarConfig || state.me?.username || 'You', false)}
          </div>
          <div class="map-marker-label">You</div>
        `,
        iconSize: [40, 56],
        iconAnchor: [20, 28]
      });
      state.locationSharing.markers.mine = L.marker(myLatLng, { icon: myIcon }).addTo(map);
    } else {
      state.locationSharing.markers.mine.setLatLng(myLatLng);
    }
  }

  if (otherLat != null && otherLng != null) {
    const otherLatLng = [otherLat, otherLng];
    latLngs.push(otherLatLng);

    if (!state.locationSharing.markers.other) {
      const otherIcon = L.divIcon({
        className: 'custom-map-avatar-marker partner',
        html: `
          <div class="map-marker-bubble">
            ${avatar(match.other?.avatarConfig || otherName, false)}
          </div>
          <div class="map-marker-label">${escapeHtml(otherName)}</div>
        `,
        iconSize: [40, 56],
        iconAnchor: [20, 28]
      });
      state.locationSharing.markers.other = L.marker(otherLatLng, { icon: otherIcon }).addTo(map);
    } else {
      state.locationSharing.markers.other.setLatLng(otherLatLng);
    }
  }

  if (latLngs.length === 2) {
    if (!state.locationSharing.polyline) {
      state.locationSharing.polyline = L.polyline(latLngs, {
        color: '#15803d',
        dashArray: '6, 8',
        weight: 3,
        opacity: 0.85
      }).addTo(map);
    } else {
      state.locationSharing.polyline.setLatLngs(latLngs);
    }

    try {
      map.fitBounds(L.latLngBounds(latLngs), { padding: [40, 40], maxZoom: 18 });
    } catch (e) {}
  } else if (latLngs.length === 1) {
    map.setView(latLngs[0], 17);
  }
}

function recenterCampusMap() {
  const map = state.locationSharing?.map;
  if (!map) return;
  const markers = [];
  if (state.locationSharing.myCoords) markers.push([state.locationSharing.myCoords.lat, state.locationSharing.myCoords.lng]);
  if (state.locationSharing.otherCoords) markers.push([state.locationSharing.otherCoords.lat, state.locationSharing.otherCoords.lng]);
  if (markers.length >= 2) {
    map.fitBounds(L.latLngBounds(markers), { padding: [40, 40], maxZoom: 18 });
  } else if (markers.length === 1) {
    map.setView(markers[0], 17);
  }
}

async function fetchLocationStatus(matchId) {
  try {
    const res = await fetch(`${API}/matches/${matchId}/location`, { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      state.locationSharing.matchId = matchId;
      state.locationSharing.myConsent = !!data.myConsent;
      state.locationSharing.otherConsent = !!data.otherConsent;
      state.locationSharing.active = !!data.active;
      if (data.myCoords) state.locationSharing.myCoords = data.myCoords;
      if (data.otherCoords) state.locationSharing.otherCoords = data.otherCoords;

      if (state.locationSharing.active) {
        startGeolocationWatch();
      }
    }
  } catch (err) {
    console.error('fetchLocationStatus error:', err);
  }
}

async function consentLocationSharing(matchId) {
  try {
    state.locationSharing.myConsent = true;
    startGeolocationWatch();
    renderPrivateModal();

    const res = await fetch(`${API}/matches/${matchId}/location/consent`, {
      method: 'POST',
      credentials: 'include'
    });
    const data = await res.json();
    if (data.ok) {
      state.locationSharing.active = !!data.mutual;
      state.locationSharing.otherConsent = !!data.otherConsent;
      renderPrivateModal();
      if (data.mutual) {
        toast('📍 Location tracking active! Both students agreed.');
      } else {
        toast('📍 Request sent! Waiting for match to share location.');
      }
    }
  } catch (err) {
    toast('Could not share location. Please try again.');
  }
}

async function stopLocationSharing(matchId) {
  try {
    stopGeolocationWatch();
    state.locationSharing.active = false;
    state.locationSharing.myConsent = false;
    state.locationSharing.otherConsent = false;
    state.locationSharing.otherCoords = null;
    if (state.locationSharing.map) {
      try { state.locationSharing.map.remove(); } catch(e) {}
      state.locationSharing.map = null;
    }
    renderPrivateModal();

    await fetch(`${API}/matches/${matchId}/location/stop`, {
      method: 'POST',
      credentials: 'include'
    });
    toast('📍 Live location sharing stopped.');
  } catch (err) {
    console.error('stopLocationSharing error:', err);
  }
}

function toggleLocationConsent(matchId) {
  if (state.locationSharing?.active || state.locationSharing?.myConsent) {
    stopLocationSharing(matchId);
  } else {
    consentLocationSharing(matchId);
  }
}

function renderLocationPanelHtml(match, otherName) {
  const loc = state.locationSharing;
  if (!loc || loc.matchId !== match.id) return '';

  if (loc.active) {
    return `
      <div class="live-location-panel">
        <div class="live-tracking-header">
          <div class="live-status-pill">
            <span class="pulse-dot"></span>
            LIVE CAMPUS TRACKING
          </div>
          <div class="distance-badge-pill" id="live-distance-pill">
            ${formatWalkingDistance(loc.distanceMeters)}
          </div>
          <div class="location-action-group">
            <button class="btn-stop-location" onclick="stopLocationSharing('${match.id}')" title="Stop live location sharing">
              🛑 Stop Sharing
            </button>
          </div>
        </div>
        <div id="live-campus-map" class="live-map-container">
          <div class="map-control-overlay">
            <button class="btn-map-control" onclick="recenterCampusMap()" title="Recenter map">
              🎯 Center
            </button>
          </div>
        </div>
      </div>
    `;
  }

  if (loc.otherConsent && !loc.myConsent) {
    return `
      <div class="location-consent-banner requested-by-other">
        <div class="location-banner-info">
          <strong>📍 ${escapeHtml(otherName)} wants to share live location!</strong>
          <p>See each other's live campus position and walking distance. Strictly mutual & stops anytime.</p>
        </div>
        <div class="location-action-group">
          <button class="btn-share-location" onclick="consentLocationSharing('${match.id}')">
            ✓ Agree & Share
          </button>
          <button class="btn-cancel-location" onclick="stopLocationSharing('${match.id}')">
            Decline
          </button>
        </div>
      </div>
    `;
  }

  if (loc.myConsent && !loc.otherConsent) {
    return `
      <div class="location-consent-banner waiting-partner">
        <div class="location-banner-info">
          <strong>⏳ Waiting for ${escapeHtml(otherName)} to agree...</strong>
          <p>Your coordinates remain private until ${escapeHtml(otherName)} also agrees to share live location.</p>
        </div>
        <div class="location-action-group">
          <button class="btn-cancel-location" onclick="stopLocationSharing('${match.id}')">
            Cancel Request
          </button>
        </div>
      </div>
    `;
  }

  return `
    <div class="location-consent-banner" style="background:#f9fbf9;border:1px solid #e1ebe3;border-radius:12px;margin-bottom:12px;">
      <div class="location-banner-info">
        <strong>📍 Live Campus Location Sharing</strong>
        <p>Coordinate meetups on campus in real-time. Mutual consent required — ends anytime.</p>
      </div>
      <div class="location-action-group">
        <button class="btn-share-location" onclick="consentLocationSharing('${match.id}')">
          🛰️ Share Location
        </button>
      </div>
    </div>
  `;
}

async function openPrivateChat(matchId) {
  const match = state.matches.find(m => m.id === matchId);
  if (!match) return;
  state.activeMatch = match;
  state.activeMatchMessages = [];

  // Initialize location state for this match
  state.locationSharing.matchId = matchId;
  state.locationSharing.markers = {};
  state.locationSharing.polyline = null;
  state.locationSharing.map = null;

  if (socket?.connected) {
    socket.emit('room:join', match.roomId);
    socket.emit('room:read', { roomId: match.roomId });
  }

  await fetchLocationStatus(matchId);
  renderPrivateModal();
}

function renderPrivateBubble(m) {
  if (m.isSystem || m.sender?.username === 'System') {
    return `
      <div class="chat-system-pill" style="margin: 8px auto; max-width: 90%; text-align: center; background: #faede4; color: #9a3412; font-weight: 500; font-size: 11.5px; border: 1px solid #fed7aa; padding: 5px 14px; border-radius: 16px;">
        ${m.content}
      </div>
    `;
  }

  const isMine = state.me && (m.sender?.username === state.me.username || m.senderId === state.me.id);
  const name = m.sender?.username || (isMine ? (state.me?.username || 'You') : 'Student');
  const time = m.createdAt ? new Date(m.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
  const status = m.status || 'delivered';
  const is24h = !!m.expiresAt;

  return `
    <div class="private-bubble-row ${isMine ? 'mine' : 'theirs'}">
      ${!isMine ? `<div class="bubble-avatar">${avatar(name, true)}</div>` : ''}
      <div class="bubble-content-col">
        <div class="bubble-meta">
          <span class="bubble-name">${isMine ? 'You' : name}</span>
          <span class="bubble-time">
            ${is24h ? `<span title="Expires in 24 hours" style="font-size:11px;margin-right:2px;">⏳</span>` : ''}${time}
          </span>
        </div>
        <div class="bubble-pill">
          ${formatMessageContent(m.content)}
          ${isMine ? `<span class="bubble-ticks">${renderTick(status)}</span>` : ''}
        </div>
      </div>
      ${isMine ? `<div class="bubble-avatar">${avatar(state.me?.avatarConfig || name, true)}</div>` : ''}
    </div>
  `;
}

function renderPrivateModal() {
  document.querySelector('.modal-backdrop')?.remove();
  const match = state.activeMatch;
  if (!match) return;

  const otherName = match.revealed ? (match.other?.revealName || match.other?.username) : match.other?.username;
  const revealStatus = match.myReveal === 'accepted' ? (match.revealed ? '✓ Identity Revealed!' : 'Reveal Requested (Waiting)') : 'Request Identity Reveal';

  document.body.insertAdjacentHTML('beforeend', modal(`
    <div class="private-chat-header" style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
      <div class="private-header-left" style="display:flex;align-items:center;gap:12px;">
        ${avatar(match.other?.avatarConfig || otherName, false)}
        <div>
          <h2 style="font-size: 18px; margin: 0; color: var(--ink); display: flex; align-items: center; gap: 6px;">
            <span style="display:inline-block;width:7px;height:7px;background:#7fdc8a;border-radius:50%;"></span>
            ${otherName}
          </h2>
          <small class="muted" style="font-size: 12px;">Plan: <b>${match.activity}</b> · ${match.location || 'Campus'}</small>
        </div>
      </div>
      <div class="private-header-actions" style="display:flex;align-items:center;gap:8px;">
        <button class="location-toggle-btn ${state.locationSharing?.active ? 'active' : (state.locationSharing?.myConsent ? 'waiting' : '')}" onclick="toggleLocationConsent('${match.id}')" title="${state.locationSharing?.active ? 'Live campus tracking active (Click to stop)' : (state.locationSharing?.myConsent ? 'Waiting for match to agree (Click to cancel)' : 'Share live campus location')}">
          📍 ${state.locationSharing?.active ? 'Live Tracking' : (state.locationSharing?.myConsent ? 'Waiting...' : 'Live Location')}
        </button>
        <button class="disappearing-toggle-btn ${match.disappearingMode ? 'active' : ''}" onclick="toggleDisappearing('${match.id}')" title="${match.disappearingMode ? '24h Disappearing Messages Active (Click to turn off)' : 'Turn on 24-hour disappearing messages for new chats'}">
          ⏳ ${match.disappearingMode ? '24h Active' : 'Disappearing'}
        </button>
      </div>
    </div>

    ${match.revealed ? `
      <div class="reveal-banner unlocked celebration-card">
        <div class="celebration-left">
          <div class="celebration-badge-row">
            <span class="celebration-tag">✦ MUTUAL REVEAL UNLOCKED</span>
            <span class="verified-seal-tag">${renderVerifiedBadgeSvg(14)} Campus Verified</span>
          </div>
          <h3 class="celebration-name">${match.other?.revealName || otherName}</h3>
          <p class="celebration-sub">
            Real identity confirmed · <b>${match.other?.university || 'NIIT University'}</b>
            ${match.other?.email ? ` · <span class="reveal-email">${match.other.email}</span>` : ''}
          </p>
        </div>
        <div class="celebration-avatar-glow">
          ${avatar(match.other?.avatarConfig || otherName, false)}
        </div>
      </div>
    ` : `
      <div class="reveal-banner">
        <div style="flex:1;">
          <strong>🔒 Real identity protected</strong>
          <p>Your legal identity stays anonymous until both students tap reveal.</p>
        </div>
        <button class="reveal-action-btn" onclick="sendRevealRequest('${match.id}')">${revealStatus}</button>
      </div>
    `}

    ${renderLocationPanelHtml(match, otherName)}

    <div class="private-chat-area" id="private-messages">
      <div class="chat-system-pill">
        ✦ You matched on "${match.activity}" · Keep it friendly!
      </div>
      ${state.activeMatchMessages.length === 0 ? `<p class="muted" style="text-align:center;font-size:13px;margin:20px 0;">Say hi and coordinate your plan!</p>` : ''}
      ${state.activeMatchMessages.map(renderPrivateBubble).join('')}
    </div>

    <div id="private-typing-indicator" class="typing-indicator" style="padding:0 8px 6px;"></div>

    <form class="private-composer-box" onsubmit="sendPrivateMessage(event, '${match.roomId}')">
      <div class="chat-input-pill">
        <button type="button" class="chat-media-btn" onclick="toggleChatMediaTray(event, 'private', '${match.roomId}')" title="Add emojis & stickers" aria-label="Add emojis">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M8 14s1.5 2 4 2 4-2 4-2"></path>
            <line x1="9" y1="9" x2="9.01" y2="9"></line>
            <line x1="15" y1="9" x2="15.01" y2="9"></line>
          </svg>
        </button>
        <input id="private-msg-input" placeholder="Write a message…" required maxlength="500" autocomplete="off" oninput="handleTypingInput('${match.roomId}')" onblur="stopTypingNow('${match.roomId}')">
      </div>
      <button type="submit" class="composer-send-btn send-btn" title="Send message">↑</button>
    </form>
  `));

  if (state.locationSharing?.active) {
    setTimeout(() => {
      initCampusMap(match);
    }, 60);
  }

  const el = document.querySelector('#private-messages');
  if (el) el.scrollTop = el.scrollHeight;
}

// ── Global Window Handlers ───────────────────────────────────────────────────

window.go = (v, replace = false) => {
  // If authenticated but unverified non-admin, restrict to verification onboarding
  if (state.me && !state.me.isVerified && !state.me.isAdmin && v !== 'verification' && v !== 'auth') {
    v = 'verification';
  }
  if (state.view === v && !replace) return;

  // Reset chat state when leaving the chat view so the toast can re-appear
  // if the user logs out and navigates back without refreshing.
  if (state.view === 'chat' && v !== 'chat') {
    chatAuthToastShown = false;
    chatInitialized = false;
    chatLoading = false;
  }
  state.view = v;

  // Sync URL in browser address bar
  const targetPath = v === 'home' ? '/' : `/${v}`;
  if (window.location.pathname !== targetPath) {
    try {
      if (replace) {
        window.history.replaceState({ view: v }, '', targetPath);
      } else {
        window.history.pushState({ view: v }, '', targetPath);
      }
    } catch {}
  }

  render();
  if (v === 'discover' || v === 'home') loadDiscover();
  if (v === 'inbox') loadInbox();
  if (v === 'chat') loadLiveChat();
  if (v === 'admin') loadAdminData();
};

window.toast = t => {
  state.toast = t;
  render();
  setTimeout(() => {
    state.toast = '';
    render();
  }, 2500);
};

window.closeModal = () => {
  if (window._verificationStream) {
    try { window._verificationStream.getTracks().forEach(t => t.stop()); } catch (e) {}
    window._verificationStream = null;
  }
  if (state.locationSharing?.map) {
    try { state.locationSharing.map.remove(); } catch (e) {}
    state.locationSharing.map = null;
    state.locationSharing.markers = {};
    state.locationSharing.polyline = null;
  }
  document.querySelector('.modal-backdrop')?.remove();
  if (dialogReturnFocus?.isConnected) dialogReturnFocus.focus();
  dialogReturnFocus = null;
};
window.consentLocationSharing = consentLocationSharing;
window.stopLocationSharing = stopLocationSharing;
window.toggleLocationConsent = toggleLocationConsent;
window.recenterCampusMap = recenterCampusMap;
window.openComposer = openComposer;
window.openPrivateChat = openPrivateChat;
window.openGuidelines = openGuidelines;
window.openCampusMembersModal = openCampusMembersModal;
window.filterCampusMembers = filterCampusMembers;
window.mentionMemberInChat = mentionMemberInChat;
window.openVerificationModal = openVerificationModal;
window.captureAndSubmitVerification = captureAndSubmitVerification;
window.submitAdminSelfVerify = submitAdminSelfVerify;
window.submitRejectionReason = submitRejectionReason;

window.openAuth = (defaultEmail = '') => {
  if (defaultEmail) state.authPendingEmail = defaultEmail;
  state.authStep = 'form';
  go('auth');
};

window.handleStartForFree = () => {
  state.authStep = 'form';
  render();
};

window.handleAuthBack = () => {
  state.authStep = 'welcome';
  render();
};

window.selectAuthGender = (gender) => {
  state.authSelectedGender = gender;
  render();
};

window.handleGoogleSignIn = () => {
  const gender = state.authSelectedGender || 'prefer_not_to_say';
  window.location.href = `/api/auth/google?gender=${encodeURIComponent(gender)}`;
};

window.handleAuthPageSendOtp = async e => {
  e.preventDefault();
  const input = document.querySelector('#auth-page-email');
  if (!input) return;
  const email = input.value.trim().toLowerCase();
  try {
    const r = await api('/auth/send-otp', {
      method: 'POST',
      body: JSON.stringify({ email, gender: state.authSelectedGender })
    });
    state.authPendingEmail = email;
    state.authStep = 'otp';
    state.authOtpSent = true;
    state.authDevCode = r.developmentCode || '';
    toast('Verification code dispatched to your inbox');
    render();
  } catch (err) {
    toast(err.message);
  }
};

window.handleAuthPageResetEmail = () => {
  state.authStep = 'form';
  state.authOtpSent = false;
  state.authDevCode = '';
  render();
};

window.handleAuthPageResendOtp = async () => {
  if (!state.authPendingEmail) return;
  try {
    const r = await api('/auth/send-otp', {
      method: 'POST',
      body: JSON.stringify({ email: state.authPendingEmail, gender: state.authSelectedGender })
    });
    state.authDevCode = r.developmentCode || '';
    toast('New code sent to your email');
    render();
  } catch (err) {
    toast(err.message);
  }
};

window.handleAuthPageVerifyOtp = async e => {
  e.preventDefault();
  const input = document.querySelector('#auth-page-code');
  if (!input || !state.authPendingEmail) return;
  const code = input.value.trim();
  try {
    const r = await api('/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({
        email: state.authPendingEmail,
        code,
        gender: state.authSelectedGender
      })
    });
    updateMe(r.user);
    state.authStep = 'welcome';
    state.authOtpSent = false;
    state.authPendingEmail = '';
    state.authDevCode = '';
    toast(`Welcome, ${r.user.username} ✦`);
    initSocket();
    if (r.user?.isVerified || r.user?.isAdmin) {
      go('chat');
    } else {
      go('verification');
    }
  } catch (err) {
    toast(err.message);
  }
};

window.sendOtp = async e => {
  e.preventDefault();
  const emailInput = document.querySelector('#auth-email');
  if (!emailInput) return;
  const email = emailInput.value.trim().toLowerCase();
  try {
    const r = await api('/auth/send-otp', { method: 'POST', body: JSON.stringify({ email }) });
    document.querySelector('#otp-form').innerHTML = `
      <div style="background: #f1f5f3; padding: 10px 14px; border-radius: 8px; font-size: 12px; display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
        <div>
          <span style="color: var(--muted); font-size: 11px; display: block;">Verification code sent to</span>
          <b style="color: var(--ink);">${email}</b>
        </div>
        <button type="button" onclick="openAuth('${email}')" style="border: 0; background: none; color: var(--green); font-weight: 600; font-size: 12px; cursor: pointer; text-decoration: underline;">Change</button>
      </div>
      <label>Six-digit code
        <input id="auth-code" inputmode="numeric" required maxlength="6" autofocus placeholder="123456">
      </label>
      ${r.developmentCode ? `<p class="dev-code" style="color:var(--green); font-size:12px; margin-top:8px;">Development code: <b>${r.developmentCode}</b></p>` : ''}
      <button class="primary wide" type="submit">Verify and join →</button>
    `;
    document.querySelector('#otp-form').onsubmit = ev => verifyOtp(ev, email);
  } catch (err) {
    toast(err.message);
  }
};

window.verifyOtp = async (e, email) => {
  e.preventDefault();
  try {
    const code = String(document.querySelector('#auth-code')?.value || '').trim();
    const r = await api('/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ email: String(email || '').trim().toLowerCase(), code })
    });
    updateMe(r.user);
    closeModal();
    toast(`Welcome, ${r.user.username}`);
    initSocket();
    if (r.user?.isVerified || r.user?.isAdmin) {
      go('home');
    } else {
      go('verification');
    }
  } catch (err) {
    toast(err.message);
  }
};

window.logout = async () => {
  try {
    await api('/auth/logout', { method: 'POST' });
    updateMe(null);
    state.messages = [];
    setCachedMessages([]);
    state.matches = [];
    state.pendingApplications = [];
    state.view = 'auth';
    if (socket) socket.disconnect();
    toast('Logged out of this device');
    render();
  } catch (err) {
    toast(err.message);
  }
};

window.openLogoutAllModal = () => {
  document.querySelector('.modal-backdrop')?.remove();
  document.body.insertAdjacentHTML('beforeend', modal(`
    <div style="text-align:left;">
      <span class="eyebrow" style="color:#d5573e;">SESSION & DEVICE SECURITY</span>
      <h2 style="font:600 21px 'Playfair Display';margin:6px 0 8px;color:var(--ink);">Sign Out Everywhere?</h2>
      <p style="font-size:13.5px;color:var(--muted);line-height:1.5;margin-bottom:18px;">
        This will immediately terminate your active login session across <b>all devices</b> — including library computers, lab PCs, tablets, and phones.
      </p>
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:12px 14px;margin-bottom:20px;">
        <span style="font-size:12.5px;color:#991b1b;font-weight:600;display:block;">⚠️ Instant Remote Invalidation</span>
        <small style="color:#b91c1c;font-size:11.5px;display:block;margin-top:2px;">You will need to verify your student email with an OTP to log back in on any device.</small>
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end;">
        <button class="secondary" onclick="closeModal()" style="font-size:13px;padding:9px 16px;">Cancel</button>
        <button class="primary" onclick="logoutAllDevices()" style="background:#b91c1c;border-color:#b91c1c;font-size:13px;padding:9px 18px;">Sign Out Everywhere ⚡</button>
      </div>
    </div>
  `));
};

window.logoutAllDevices = async () => {
  try {
    closeModal();
    await api('/auth/logout-all', { method: 'POST' });
    updateMe(null);
    state.messages = [];
    setCachedMessages([]);
    state.matches = [];
    state.pendingApplications = [];
    state.view = 'auth';
    if (socket) socket.disconnect();
    toast('⚡ Signed out of all devices');
    render();
  } catch (err) {
    toast(err.message);
  }
};

window.createPlan = async e => {
  e.preventDefault();
  try {
    const activity = document.querySelector('#plan-activity').value;
    const when = document.querySelector('#plan-when').value;
    const where = document.querySelector('#plan-where').value;

    const chosen = new Date(when);
    if (isNaN(chosen.getTime()) || chosen <= new Date()) {
      return toast('Plan time must be in the future.');
    }

    await api('/match-requests', {
      method: 'POST',
      body: JSON.stringify({ activity, location: where, scheduledAt: chosen.toISOString() })
    });
    closeModal();
    toast(`Plan created! Students on campus can now apply.`);
    loadDiscover();
  } catch (err) {
    toast(err.message);
  }
};

window.joinPlan = async (id, activity) => {
  if (!state.me) return openAuth();
  try {
    await api(`/match-requests/${id}/applications`, { method: 'POST' });
    toast(`Interest sent for ${activity}!`);
    const targetReq = state.requests.find(r => r.id === id);
    if (targetReq) targetReq.hasApplied = true;
    render();
    loadDiscover();
  } catch (err) {
    toast(err.message);
  }
};

window.acceptApplication = async id => {
  try {
    await api(`/applications/${id}/accept`, { method: 'POST' });
    toast('Matched! Private chat created.');
    loadInbox();
  } catch (err) {
    toast(err.message);
  }
};

window.sendRevealRequest = async matchId => {
  try {
    const r = await api(`/matches/${matchId}/reveal`, { method: 'POST' });
    if (state.activeMatch) {
      state.activeMatch.myReveal = 'accepted';
      if (r.mutual) {
        state.activeMatch.revealed = true;
        launchConfetti(3500);
        playReceiveSound();
        toast('🎉 Mutual identity revealed! Welcome to the real world.');
      } else {
        toast('Reveal request sent! Waiting for your match to accept.');
      }
      renderPrivateModal();
      loadInbox();
    }
  } catch (err) {
    toast(err.message);
  }
};

window.toggleDisappearing = async matchId => {
  try {
    const r = await api(`/matches/${matchId}/disappearing`, { method: 'POST' });
    if (state.activeMatch && state.activeMatch.id === matchId) {
      state.activeMatch.disappearingMode = r.disappearingMode;
      renderPrivateModal();
    }
    const m = state.matches.find(x => x.id === matchId);
    if (m) m.disappearingMode = r.disappearingMode;
    toast(r.disappearingMode ? '⏳ 24-Hour Disappearing Messages Turned ON' : '⏳ Disappearing Messages Turned OFF');
  } catch (err) {
    toast(err.message || 'Could not change disappearing messages setting.');
  }
};

function renderTick(status = 'delivered') {
  if (status === 'read') return '<span class="tick read" title="Read">✓✓</span>';
  if (status === 'sent') return '<span class="tick sent" title="Sent">✓</span>';
  return '<span class="tick delivered" title="Delivered">✓✓</span>';
}

let typingTimeouts = {};
let activeTypingUsers = { campus: new Map(), private: new Map() };

window.handleTypingInput = (roomId) => {
  if (!socket?.connected) return;
  const key = roomId || 'campus';
  if (!typingTimeouts[key]) {
    socket.emit('typing:start', { roomId });
  } else {
    clearTimeout(typingTimeouts[key]);
  }
  typingTimeouts[key] = setTimeout(() => {
    socket.emit('typing:stop', { roomId });
    delete typingTimeouts[key];
  }, 2500);
};

window.stopTypingNow = (roomId) => {
  if (!socket?.connected) return;
  const key = roomId || 'campus';
  if (typingTimeouts[key]) {
    clearTimeout(typingTimeouts[key]);
    delete typingTimeouts[key];
  }
  socket.emit('typing:stop', { roomId });
};

function updateTypingUI(type, targetElId) {
  const el = document.querySelector(targetElId);
  if (!el) return;
  const map = activeTypingUsers[type];
  if (!map || map.size === 0) {
    el.innerHTML = '';
    el.style.opacity = '0';
    return;
  }
  const names = Array.from(map.values());
  const label = names.length === 1 ? `${names[0]} is typing` : `${names.slice(0, 2).join(', ')} are typing`;
  el.innerHTML = `
    <span class="typing-dots"><span></span><span></span><span></span></span>
    <span>${label}…</span>
  `;
  el.style.opacity = '1';
}

window.setReplyTo = msg => {
  if (!msg) return;
  state.replyingTo = msg;
  renderReplyBar();
  const input = document.querySelector('#message');
  if (input) {
    input.focus();
    input.placeholder = `Reply to ${msg.sender}…`;
  }
};

window.cancelReply = () => {
  state.replyingTo = null;
  renderReplyBar();
  const input = document.querySelector('#message');
  if (input) {
    input.placeholder = 'Say something to campus…';
  }
};

window.renderReplyBar = () => {
  const container = document.querySelector('#reply-preview-container');
  if (!container) return;
  if (!state.replyingTo) {
    container.innerHTML = '';
    container.style.display = 'none';
    return;
  }
  container.style.display = 'flex';
  container.innerHTML = `
    <div class="reply-preview-bar">
      <div class="reply-preview-accent"></div>
      <div class="reply-preview-body">
        <strong class="reply-preview-sender">Replying to ${state.replyingTo.sender}</strong>
        <span class="reply-preview-text">${state.replyingTo.text}</span>
      </div>
      <button type="button" class="reply-preview-close" onclick="cancelReply()" title="Cancel reply">✕</button>
    </div>
  `;
};

window.scrollToMessage = msgId => {
  if (!msgId) return;
  const row = document.querySelector(`.message-swipe-row[data-msg-id="${msgId}"]`);
  if (row) {
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const msgEl = row.querySelector('.message');
    if (msgEl) {
      msgEl.classList.remove('msg-highlight-pulse');
      void msgEl.offsetWidth;
      msgEl.classList.add('msg-highlight-pulse');
      setTimeout(() => msgEl.classList.remove('msg-highlight-pulse'), 1400);
    }
  }
};

window.sendMessage = e => {
  e.preventDefault();
  closeMediaTray();
  const el = document.querySelector('#message');
  if (!el || !el.value.trim()) return;
  if (!socket?.connected) return toast('Verify your college email to chat.');
  const val = el.value;
  const replyTo = state.replyingTo ? { ...state.replyingTo } : null;
  state.replyingTo = null;
  renderReplyBar();
  el.value = '';
  el.placeholder = 'Say something to campus…';
  el.focus();
  stopTypingNow();
  playSendSound();
  socket.emit('campus:message', { content: val, replyTo }, r => {
    if (r?.error) toast(r.error);
  });
};

window.sendPrivateMessage = (e, roomId) => {
  e.preventDefault();
  closeMediaTray();
  const el = document.querySelector('#private-msg-input');
  if (!el || !el.value.trim()) return;
  if (!socket?.connected) return toast('Chat disconnected.');
  const val = el.value;
  el.value = '';
  el.focus();
  stopTypingNow(roomId);
  playSendSound();
  socket.emit('message:send', { roomId, content: val }, r => {
    if (r?.error) toast(r.error);
  });
};

window.reportMessage = (messageId, snippet = '') => {
  if (!messageId) return;
  if (!snippet) {
    const msg = state.messages.find(m => m.id === messageId);
    snippet = msg?.content || '';
  }

  document.querySelector('.modal-backdrop')?.remove();
  document.body.insertAdjacentHTML('beforeend', modal(`
    <div class="report-modal-content">
      <span class="eyebrow" style="color:#dc2626;">CAMPUS TRUST & SAFETY</span>
      <h2>Report Message</h2>
      <p style="font-size:13.5px;color:var(--muted);margin-bottom:14px;">Help keep our campus respectful and safe. Select why this message violates community standards:</p>

      ${snippet ? `
        <div class="flagged-preview-box">
          <small class="eyebrow">FLAGGED MESSAGE</small>
          <blockquote>"${snippet}"</blockquote>
        </div>
      ` : ''}

      <form id="report-reason-form" onsubmit="submitReportForm(event, '${messageId}')">
        <div class="report-reasons-list">
          <label class="report-reason-item">
            <input type="radio" name="report_reason" value="harassment" checked>
            <div>
              <strong>🚨 Harassment or Bullying</strong>
              <small>Targeting, threatening, or intimidating a student.</small>
            </div>
          </label>

          <label class="report-reason-item">
            <input type="radio" name="report_reason" value="inappropriate_content">
            <div>
              <strong>🔞 Inappropriate / Abusive Content</strong>
              <small>Explicit, offensive, hateful, or abusive remarks.</small>
            </div>
          </label>

          <label class="report-reason-item">
            <input type="radio" name="report_reason" value="privacy_violation">
            <div>
              <strong>🔒 Doxxing / Privacy Breach</strong>
              <small>Sharing another student's real identity, phone, or photos.</small>
            </div>
          </label>

          <label class="report-reason-item">
            <input type="radio" name="report_reason" value="spam">
            <div>
              <strong>📣 Spam or Promotion</strong>
              <small>Repetitive messages, selling items, or advertising.</small>
            </div>
          </label>

          <label class="report-reason-item">
            <input type="radio" name="report_reason" value="other">
            <div>
              <strong>🚩 Other Safety Concern</strong>
              <small>Violates campus guidelines or creates an unsafe environment.</small>
            </div>
          </label>
        </div>

        <div style="margin-top:14px;">
          <label style="font-size:13px;font-weight:600;color:var(--ink);">Additional details (optional)
            <textarea id="report-detail-text" rows="2" maxlength="300" placeholder="Provide extra context for moderators..." style="width:100%;margin-top:6px;padding:8px 10px;border:1px solid var(--line);border-radius:8px;font-family:'DM Sans';font-size:13px;"></textarea>
          </label>
        </div>

        <div class="modal-actions" style="margin-top:18px;display:flex;justify-content:flex-end;gap:10px;">
          <button type="button" class="text-btn" onclick="closeModal()">Cancel</button>
          <button type="submit" class="primary" style="background:#dc2626;border-color:#dc2626;">Submit Report 🚩</button>
        </div>
      </form>
    </div>
  `));
};

window.submitReportForm = async (e, messageId) => {
  e.preventDefault();
  const reason = document.querySelector('input[name="report_reason"]:checked')?.value || 'inappropriate_content';
  const detail = document.querySelector('#report-detail-text')?.value || '';

  try {
    await api('/reports', {
      method: 'POST',
      body: JSON.stringify({ messageId, reason, detail })
    });
    closeModal();
    toast('Report submitted privately to campus moderators ✓');
    if (state.view === 'admin') loadAdminData();
  } catch (err) {
    toast(err.message || 'Could not submit report.');
  }
};

// ── Data Loaders ─────────────────────────────────────────────────────────────

async function loadMe() {
  initialBootLoading = true;
  bootConnectionFailed = false;
  render();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const data = await api('/me', { signal: controller.signal });
    if (!data.user) throw new Error('Invalid session response');
    updateMe(data.user);
    state.authLoading = false;
    if (state.view === 'auth') {
      const urlView = getViewFromPath(window.location.pathname) || 'home';
      state.view = urlView;
      const targetPath = urlView === 'home' ? '/' : `/${urlView}`;
      if (window.location.pathname !== targetPath) {
        try { window.history.replaceState({ view: urlView }, '', targetPath); } catch {}
      }
    }
    if (state.me && !state.me.isVerified && !state.me.isAdmin) {
      if (state.view !== 'verification') {
        state.view = 'verification';
        try { window.history.replaceState({ view: 'verification' }, '', '/verification'); } catch {}
      }
    }
    initSocket();
    if (state.view === 'discover' || state.view === 'home') loadDiscover();
    if (state.view === 'inbox') loadInbox();
    if (state.view === 'chat') loadLiveChat();
    if (state.view === 'admin' && state.me?.isAdmin) loadAdminData();
    if (state.me?.isAdmin) {
      api('/admin/reports').then(r => {
        state.adminReports = r.reports || [];
        render();
      }).catch(() => {});
    }
  } catch (err) {
    state.authLoading = false;
    if (err.status === 401 || err.status === 403 || err.message === 'Authentication required' || err.message === 'Account unavailable') {
      updateMe(null);
      state.view = 'auth';
    } else {
      bootConnectionFailed = true;
    }
  } finally {
    clearTimeout(timeout);
    initialBootLoading = false;
    render();
  }
}

let discoverLoading = false;
async function loadDiscover() {
  if (discoverLoading) return;
  if (!state.me) return;
  discoverLoading = true;
  discoverStatus = 'loading';
  if (state.view === 'discover' || state.view === 'home') render();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const data = await api('/match-requests', { signal: controller.signal });
    if (!Array.isArray(data.requests)) throw new Error('Invalid plans response');
    state.requests = data.requests;
    discoverStatus = 'ready';
  } catch {
    discoverStatus = 'error';
  } finally {
    clearTimeout(timeout);
    discoverLoading = false;
    if (state.view === 'discover' || state.view === 'home') render();
  }
}

window.setDiscoverFilter = filter => {
  if (state.discoverFilter === filter) return;
  state.discoverFilter = filter;
  render();
};

window.toggleSavePlan = (planId, e) => {
  e?.stopPropagation?.();
  if (!state.savedPlanIds) state.savedPlanIds = new Set();
  if (state.savedPlanIds.has(planId)) {
    state.savedPlanIds.delete(planId);
    toast('Removed from saved plans');
  } else {
    state.savedPlanIds.add(planId);
    toast('Plan saved! View anytime under Discover → Saved 📌');
  }
  try {
    localStorage.setItem('afterclass_saved_plans', JSON.stringify(Array.from(state.savedPlanIds)));
  } catch {}
  render();
};

window.applyToRequest = async (requestId, e) => {
  e?.stopPropagation?.();
  try {
    await api(`/match-requests/${requestId}/applications`, { method: 'POST' });
    toast('Application sent! You will be notified when they accept.');
    loadDiscover();
  } catch (err) {
    toast(err.message);
  }
};

window.setInboxTab = tab => {
  if (state.inboxTab === tab) return;
  state.inboxTab = tab;
  render();
};

window.closeMyPlan = planId => {
  const plan = state.myPlans?.find(p => p.id === planId);
  const planName = plan?.activity || 'this plan';

  document.querySelector('.modal-backdrop')?.remove();
  document.body.insertAdjacentHTML('beforeend', modal(`
    <div class="confirm-modal-content">
      <span class="eyebrow" style="color: #dc2626;">CLOSE PLAN</span>
      <h2>Close "${planName}"?</h2>
      <p style="font-size: 13.5px; color: var(--muted); line-height: 1.5; margin: 8px 0 18px;">
        Closing this plan will immediately remove it from the Discover feed. Any pending student applications will no longer be able to match.
      </p>
      <div class="modal-actions" style="display: flex; justify-content: flex-end; gap: 10px;">
        <button type="button" class="text-btn" onclick="closeModal()">Keep Plan</button>
        <button type="button" class="primary" style="background: #dc2626; border-color: #dc2626;" onclick="confirmClosePlan('${planId}')">Yes, Close Plan</button>
      </div>
    </div>
  `));
};

window.confirmClosePlan = async planId => {
  closeModal();
  try {
    await api(`/match-requests/${planId}`, { method: 'DELETE' });
    toast('Plan closed successfully.');
    loadInbox();
    loadDiscover();
  } catch (err) {
    toast(err.message || 'Could not close plan.');
  }
};

let inboxLoading = false;
async function loadInbox() {
  if (!state.me || inboxLoading) return;
  inboxLoading = true;
  try {
    const [matchesData, appsData, myPlansData] = await Promise.all([
      api('/matches').catch(() => ({ matches: [] })),
      api('/match-requests/mine/applications').catch(() => ({ applications: [] })),
      api('/match-requests/mine').catch(() => ({ plans: [] }))
    ]);
    state.matches = matchesData.matches || [];
    state.pendingApplications = appsData.applications || [];
    state.myPlans = myPlansData.plans || [];
    if (state.view === 'inbox') render();
  } catch {
    // Keep existing
  } finally {
    inboxLoading = false;
  }
}

async function loadLiveChat() {
  if (!state.me || chatInitialized || chatLoading || chatLoadError) return;
  chatLoading = true;
  const controller = new AbortController();
  chatRequestController = controller;
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const history = await api('/messages', { signal: controller.signal });
    if (chatRequestController !== controller) return;
    if (!Array.isArray(history.messages)) throw new Error('Invalid chat response');
    state.messages = history.messages;
    setCachedMessages(state.messages);
    chatInitialized = true;
    initSocket();
  } catch (err) {
    if (chatRequestController !== controller) return;
    if (err.status === 401) updateMe(null);
    else chatLoadError = err.status === 403 ? 'Your account does not currently have access to this conversation.' : 'The connection took too long or the service is unavailable. Please try again.';
  } finally {
    clearTimeout(timeout);
    if (chatRequestController === controller) {
      chatRequestController = null;
      chatLoading = false;
    }
    if (state.view === 'chat') {
      render();
      const el = document.querySelector('#chat-messages');
      if (el && chatInitialized) el.scrollTop = el.scrollHeight;
    }
  }
}

window.retryCampusChat = () => {
  chatLoadError = '';
  chatInitialized = false;
  loadLiveChat();
  render();
};

function initSocket() {
  if (socket || !state.me) return;
  const socketUrl = import.meta.env.VITE_API_URL ? new URL(import.meta.env.VITE_API_URL).origin : location.origin;
  socket = io(socketUrl, { withCredentials: true });

  socket.on('connect', () => {
    if (state.me?.campusId) {
      socket.emit('room:join', `campus:${state.me.campusId}`);
    }
    if (state.me?.id) {
      socket.emit('room:join', `user:${state.me.id}`);
    }
  });

  socket.on('campus:presence', ({ onlineCount }) => {
    state.campusOnlineCount = onlineCount;
    const el = document.querySelector('#campus-online-count');
    if (el) el.textContent = onlineCount;
  });

  socket.on('message:new', message => {
    if (state.view === 'chat') {
      state.messages.push(message);
      state.messages = state.messages.slice(-50);
      setCachedMessages(state.messages);
      const chatContainer = document.querySelector('#chat-messages');
      if (chatContainer) {
        const name = message.sender?.username || message.senderAlias || 'Anonymous';
        const isMine = state.me && (name === state.me.username || message.senderId === state.me.id);
        if (!isMine) playReceiveSound();
        chatContainer.insertAdjacentHTML('beforeend', renderCampusMessageHtml(message));
        chatContainer.scrollTop = chatContainer.scrollHeight;
      } else {
        render();
      }
    }
    if (state.activeMatch && message.roomId === state.activeMatch.roomId) {
      state.activeMatchMessages.push(message);
      const isMine = state.me && (message.sender?.username === state.me.username || message.senderId === state.me.id);
      if (!isMine) {
        playReceiveSound();
        socket.emit('room:read', { roomId: message.roomId });
        triggerNotification(
          `💬 Message from ${message.sender?.username || 'Match'}`,
          message.content,
          () => {
            go('inbox');
            if (state.activeMatch) openPrivateChat(state.activeMatch.id);
          }
        );
      }
      const el = document.querySelector('#private-messages');
      if (el) {
        el.insertAdjacentHTML('beforeend', renderPrivateBubble(message));
        el.scrollTop = el.scrollHeight;
      }
    }
  });

  socket.on('room:read', ({ roomId }) => {
    if (state.activeMatch && state.activeMatch.roomId === roomId) {
      state.activeMatchMessages.forEach(m => {
        const isMine = state.me && (m.sender?.username === state.me.username || m.senderId === state.me.id);
        if (isMine) m.status = 'read';
      });
      document.querySelectorAll('#private-messages .tick').forEach(tick => {
        tick.className = 'tick read';
        tick.title = 'Read';
        tick.innerHTML = '✓✓';
      });
    }
  });

  socket.on('room:history', messages => {
    state.activeMatchMessages = messages || [];
    const el = document.querySelector('#private-messages');
    if (el) {
      el.innerHTML = `
        <div class="chat-system-pill">
          ✦ You matched on "${state.activeMatch.activity}" · Keep it friendly!
        </div>
        ${state.activeMatchMessages.length === 0 ? `<p class="muted" style="text-align:center;font-size:13px;margin:20px 0;">Say hi and coordinate your plan!</p>` : ''}
        ${state.activeMatchMessages.map(renderPrivateBubble).join('')}
      `;
      el.scrollTop = el.scrollHeight;
    }
  });

  socket.on('typing:start', ({ roomId, username, userId }) => {
    if (state.me && userId === state.me.id) return;
    if (state.activeMatch && roomId === state.activeMatch.roomId) {
      activeTypingUsers.private.set(userId, username || 'Match');
      updateTypingUI('private', '#private-typing-indicator');
    } else if (state.view === 'chat') {
      activeTypingUsers.campus.set(userId, username || 'Someone');
      updateTypingUI('campus', '#campus-typing-indicator');
    }
  });

  socket.on('typing:stop', ({ roomId, userId }) => {
    if (state.activeMatch && roomId === state.activeMatch.roomId) {
      activeTypingUsers.private.delete(userId);
      updateTypingUI('private', '#private-typing-indicator');
    } else if (state.view === 'chat') {
      activeTypingUsers.campus.delete(userId);
      updateTypingUI('campus', '#campus-typing-indicator');
    }
  });

  socket.on('application:new', ({ activity, applicantName }) => {
    toast(`🎉 ${applicantName || 'A student'} expressed interest in "${activity}"!`);
    triggerNotification(
      '🎉 New Plan Application!',
      `${applicantName || 'A student'} wants to join your plan: "${activity}". Tap to review.`,
      () => go('inbox')
    );
    loadInbox();
  });

  socket.on('match:accepted', () => {
    toast('A match was accepted! Check your inbox.');
    triggerNotification(
      '✨ Match Accepted!',
      'A student accepted your plan request! Tap to open private chat.',
      () => go('inbox')
    );
    loadInbox();
  });

  socket.on('reveal:requested', () => {
    toast('Your match requested an identity reveal!');
    triggerNotification(
      '🔓 Identity Reveal Requested!',
      'Your match wants to reveal real identities with you.',
      () => go('inbox')
    );
    loadInbox();
  });

  socket.on('reveal:mutual', ({ matchId }) => {
    launchConfetti(3500);
    playReceiveSound();
    toast('🎉 Mutual identity revealed! Welcome to the real world.');
    triggerNotification(
      '🎉 Mutual Identity Revealed!',
      'Both students agreed to share identities! Tap to view.',
      () => {
        go('inbox');
        if (matchId) openPrivateChat(matchId);
      }
    );
    loadInbox();
    if (state.activeMatch && state.activeMatch.id === matchId) {
      state.activeMatch.revealed = true;
      renderPrivateModal();
    }
  });

  socket.on('match:disappearing_changed', ({ matchId, disappearingMode }) => {
    if (state.activeMatch && state.activeMatch.id === matchId) {
      state.activeMatch.disappearingMode = disappearingMode;
      renderPrivateModal();
    }
    const m = state.matches.find(x => x.id === matchId);
    if (m) m.disappearingMode = disappearingMode;
  });

  socket.on('message:deleted', ({ messageId }) => {
    state.messages = state.messages.filter(m => m.id !== messageId);
    if (state.view === 'chat') {
      const chatContainer = document.querySelector('#chat-messages');
      if (chatContainer) {
        document.querySelectorAll('#chat-messages .message').forEach(el => {
          if (el.querySelector(`button[onclick*="${messageId}"]`)) {
            el.remove();
          }
        });
      }
    }
  });

  socket.on('message:reaction:update', ({ messageId, emoji, userId, action, reactions }) => {
    const targetMsg = state.messages.find(m => m.id === messageId);
    if (targetMsg) {
      targetMsg.reactions = reactions.map(r => ({
        ...r,
        userReacted: state.me ? r.users?.includes(state.me.id) : false
      }));
    }

    const row = document.querySelector(`.message-reactions-row[data-reactions-for="${messageId}"]`);
    if (row && Array.isArray(reactions)) {
      const myId = state.me?.id;
      const formatted = reactions.map(r => ({
        ...r,
        userReacted: myId ? (r.users?.includes(myId) || (userId === myId && action === 'added')) : false
      }));
      row.outerHTML = renderMessageReactionsHtml(formatted, messageId);
      const updatedRow = document.querySelector(`.message-reactions-row[data-reactions-for="${messageId}"]`);
      const targetPill = updatedRow?.querySelector(`button[onclick*="'${emoji}'"]`);
      if (targetPill && action === 'added') {
        targetPill.classList.add('reaction-pop');
        setTimeout(() => targetPill.classList.remove('reaction-pop'), 300);
      }
    }
  });

  socket.on('location:requested', ({ matchId, requesterAlias }) => {
    toast(`📍 ${requesterAlias || 'Your match'} requested live campus location!`);
    playReceiveSound();
    triggerNotification(
      '📍 Live Location Requested!',
      `${requesterAlias || 'Your match'} requested mutual live location sharing on campus.`,
      () => {
        go('inbox');
        if (matchId) openPrivateChat(matchId);
      }
    );
    if (state.activeMatch && state.activeMatch.id === matchId) {
      state.locationSharing.otherConsent = true;
      renderPrivateModal();
    }
  });

  socket.on('location:consent_changed', ({ matchId, userId, consented, mutual }) => {
    if (state.activeMatch && state.activeMatch.id === matchId) {
      if (mutual) {
        state.locationSharing.active = true;
        state.locationSharing.otherConsent = true;
        startGeolocationWatch();
        renderPrivateModal();
      } else if (userId !== state.me?.id) {
        state.locationSharing.otherConsent = consented;
        renderPrivateModal();
      }
    }
  });

  socket.on('location:active', ({ matchId }) => {
    playReceiveSound();
    toast('📍 Live location tracking active! Both students agreed.');
    if (state.activeMatch && state.activeMatch.id === matchId) {
      state.locationSharing.active = true;
      state.locationSharing.myConsent = true;
      state.locationSharing.otherConsent = true;
      startGeolocationWatch();
      renderPrivateModal();
    }
  });

  socket.on('location:update', (coords) => {
    if (state.activeMatch && state.locationSharing?.active) {
      state.locationSharing.otherCoords = coords;
      updateMapMarkers();
    }
  });

  socket.on('location:stopped', ({ matchId, stoppedBy }) => {
    if (state.activeMatch && state.activeMatch.id === matchId) {
      stopGeolocationWatch();
      state.locationSharing.active = false;
      state.locationSharing.myConsent = false;
      state.locationSharing.otherConsent = false;
      state.locationSharing.otherCoords = null;
      if (state.locationSharing.map) {
        try { state.locationSharing.map.remove(); } catch (e) {}
        state.locationSharing.map = null;
      }
      renderPrivateModal();
      toast(`📍 Location sharing stopped by ${stoppedBy || 'partner'}.`);
    }
  });

  socket.on('user:warned', ({ reason }) => {
    playReceiveSound();
    toast(`⚠️ Official Warning from Campus Moderator: ${reason}`);
    if (state.me) {
      state.me.latestWarning = { reason, createdAt: new Date().toISOString() };
      render();
    }
  });

  socket.on('user:verified', () => {
    playReceiveSound();
    try { launchConfetti(); } catch (e) {}
    toast('🎉 Congratulations! Your student identity & gender have been verified.');
    if (state.me) {
      state.me.isVerified = true;
      state.me.verificationStatus = 'approved';
      state.me.genderLocked = true;
    }
    if (state.view === 'verification') {
      go('home');
    } else {
      render();
    }
  });

  socket.on('user:verification_rejected', ({ reason, correctedGender } = {}) => {
    toast(`⚠️ Student verification rejected: ${reason || 'Gesture did not match prompt'}`);
    if (state.me) {
      state.me.isVerified = false;
      state.me.verificationStatus = 'rejected';
      if (correctedGender) {
        state.me.gender = correctedGender;
        state.me.genderLocked = true;
      }
      render();
    }
  });
}

function verificationPage() {
  const me = state.me;
  const isPending = me?.verificationStatus === 'pending';
  const isRejected = me?.verificationStatus === 'rejected';

  return `
    <div class="verif-page-wrapper">
      <div class="auth-ambient-grid-overlay"></div>

      <!-- Top Navigation Bar -->
      <header class="auth-top-nav">
        <a class="auth-brand-logo" href="#" onclick="return false;">
          <i>✦</i> afterclass
        </a>
        <div class="auth-campus-badge">
          <span class="auth-pulse-dot"></span>
          <span>CAMPUS IDENTITY ONBOARDING</span>
        </div>
        <div style="margin-left:auto;">
          <button type="button" class="secondary" onclick="logout()" style="font-size:12px;padding:6px 14px;background:#fff;border:1px solid var(--line);">
            Log Out →
          </button>
        </div>
      </header>

      <main style="position:relative;z-index:1;max-width:640px;margin:32px auto;padding:0 20px 48px;">
        <div style="text-align:center;margin-bottom:28px;">
          <span class="eyebrow" style="color:var(--green);font-weight:700;">STEP 2 OF 2 · STUDENT VERIFICATION</span>
          <h1 style="font:600 32px 'Playfair Display';margin:8px 0 10px;color:var(--ink);">Verify Your Identity to Enter</h1>
          <p style="font-size:14px;color:var(--muted);line-height:1.6;margin:0 auto;max-width:480px;">
            Afterclass is an authentic campus community. To keep students safe and stop catfishing, every student completes a quick 5-second live selfie check before entering.
          </p>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:24px;">
          <div style="background:#fff;border:1px solid var(--line);border-radius:12px;padding:16px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,0.02);">
            <span style="font-size:24px;display:block;margin-bottom:6px;">🛡️</span>
            <strong style="font-size:13px;display:block;color:var(--ink);margin-bottom:4px;">No Catfishing</strong>
            <small style="font-size:11px;color:var(--muted);line-height:1.4;display:block;">Verified genders keep female &amp; campus spaces 100% safe.</small>
          </div>
          <div style="background:#fff;border:1px solid var(--line);border-radius:12px;padding:16px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,0.02);">
            <span style="font-size:24px;display:block;margin-bottom:6px;">🔒</span>
            <strong style="font-size:13px;display:block;color:var(--ink);margin-bottom:4px;">0 KB Storage</strong>
            <small style="font-size:11px;color:var(--muted);line-height:1.4;display:block;">Selfies are permanently deleted immediately upon verification.</small>
          </div>
          <div style="background:#fff;border:1px solid var(--line);border-radius:12px;padding:16px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,0.02);">
            <span style="font-size:24px;display:block;margin-bottom:6px;">✦</span>
            <strong style="font-size:13px;display:block;color:var(--ink);margin-bottom:4px;">Verified Badge</strong>
            <small style="font-size:11px;color:var(--muted);line-height:1.4;display:block;">Unlocks your verified college student blue checkmark badge.</small>
          </div>
        </div>

        <!-- Main Action Card -->
        <div style="background:#fff;border:1px solid var(--line);border-radius:18px;padding:34px 26px;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,0.04);">
          ${isPending ? `
            <div style="width:68px;height:68px;border-radius:50%;background:#dcfce7;color:#15803d;display:grid;place-items:center;font-size:32px;margin:0 auto 16px;">
              ⏳
            </div>
            <div style="display:inline-flex;align-items:center;gap:6px;background:#dcfce7;color:#15803d;border:1px solid #86efac;font-size:11.5px;font-weight:700;padding:3px 10px;border-radius:12px;margin-bottom:10px;">
              <span>●</span> UNDER VERIFICATION
            </div>
            <h3 style="font:600 22px 'Playfair Display';margin:0 0 8px;color:var(--ink);">Profile Under Verification</h3>
            <p style="font-size:13.5px;color:var(--muted);line-height:1.6;margin:0 auto 20px;max-width:440px;">
              Your live selfie has been submitted and is currently under verification. Once verified, your official blue student checkmark will activate and you can fully enjoy Afterclass!
            </p>
            <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
              <button type="button" class="primary" onclick="loadMe().then(() => toast('Verification status refreshed ✓'))" style="padding:11px 24px;font-size:13.5px;">
                🔄 Refresh Status
              </button>
              <button type="button" class="secondary" onclick="openVerificationModal()" style="padding:11px 20px;font-size:13.5px;background:#fff;">
                📸 Resubmit Selfie
              </button>
              ${me?.isAdmin ? `
                <button type="button" class="secondary" onclick="go('admin')" style="padding:11px 20px;font-size:13.5px;color:#d97706;border-color:#fcd34d;background:#fff;">
                  ⚡ Open Admin Queue
                </button>
              ` : ''}
            </div>
          ` : (isRejected ? `
            <div style="width:68px;height:68px;border-radius:50%;background:#fee2e2;color:#dc2626;display:grid;place-items:center;font-size:32px;margin:0 auto 16px;">
              ✕
            </div>
            <h3 style="font:600 22px 'Playfair Display';margin:0 0 8px;color:#991b1b;">Verification Not Approved</h3>
            <p style="font-size:13.5px;color:var(--muted);line-height:1.6;margin:0 auto 20px;max-width:440px;">
              Your previous verification attempt could not be approved. Please ensure your live selfie clearly matches the gesture prompt and that your declared profile gender (${me?.gender === 'woman' ? 'Woman 👩' : 'Man 👨'}) is accurate.
            </p>
            <button type="button" class="primary" onclick="openVerificationModal()" style="padding:12px 28px;font-size:14px;">
              📸 Retake Live Face Verification
            </button>
          ` : `
            <div style="width:68px;height:68px;border-radius:50%;background:#e0f2fe;color:#0284c7;display:grid;place-items:center;font-size:32px;margin:0 auto 16px;">
              📸
            </div>
            <h3 style="font:600 22px 'Playfair Display';margin:0 0 8px;color:var(--ink);">Ready for Live Face Check</h3>
            <p style="font-size:13.5px;color:var(--muted);line-height:1.6;margin:0 auto 18px;max-width:440px;">
              You will be asked to perform a simple live gesture (e.g. ✌️ Peace Sign or 👍 Thumbs Up) in front of your camera. Takes less than 5 seconds.
            </p>

            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px 16px;margin:0 auto 20px;max-width:360px;display:flex;align-items:center;justify-content:space-between;">
              <span style="font-size:12.5px;color:var(--muted);">Current Declared Gender:</span>
              <b style="font-size:13px;color:var(--ink);">${me?.gender === 'woman' ? 'Woman 👩' : (me?.gender === 'man' ? 'Man 👨' : me?.gender || 'Student')}</b>
            </div>

            <button type="button" class="primary" onclick="openVerificationModal()" style="padding:13px 34px;font-size:14.5px;font-weight:700;">
              📸 Start Live Face Check (~5s)
            </button>
            ${me?.isAdmin ? `
              <div style="margin-top:14px;">
                <button type="button" class="admin-btn-secondary" onclick="handleAdminSelfVerify()" style="padding:8px 14px;font-size:11.5px;background:#0f172a;color:#38bdf8;border:1px solid #38bdf8;border-radius:8px;cursor:pointer;">
                  ⚡ Admin Bypass (Skip Verification)
                </button>
              </div>
            ` : ''}
          `)}
        </div>

        <div style="text-align:center;margin-top:20px;color:var(--muted);font-size:12px;">
          🔒 Zero permanent storage · Photos are deleted immediately upon verification
        </div>
      </main>
    </div>
    <div id="toast" class="toast ${state.toast ? 'show' : ''}">${state.toast}</div>
  `;
}

const views = { home, discover, chat, inbox, safety, settings, auth: authPage, admin: adminPortal, verification: verificationPage };

function getViewFromPath(pathname) {
  const clean = String(pathname || '').replace(/^\/+|\/+$/g, '').toLowerCase();
  if (!clean || clean === 'home') return 'home';
  if (views[clean]) return clean;
  return null;
}


function render() {
  const appEl = document.querySelector('#app');
  if (!appEl) return;
  if (initialBootLoading) {
    if (!appEl.querySelector('.startup-screen')) appEl.innerHTML = startupMarkup;
    return;
  }
  if (bootConnectionFailed) {
    appEl.innerHTML = `<main style="max-width:480px;margin:15vh auto;padding:24px;text-align:center" role="alert">
      <h1>Unable to connect</h1>
      <p>Afterclass couldn’t finish loading. The server may be starting up or temporarily unavailable.</p>
      <button class="primary" id="retry-startup">Try again</button>
    </main>`;
    document.querySelector('#retry-startup').addEventListener('click', loadMe);
    return;
  }
  const currentView = views[state.view] || home;
  appEl.innerHTML = currentView();
}

// Initial Boot
const bootUrlParams = new URLSearchParams(window.location.search);
const bootAuthError = bootUrlParams.get('auth_error');
if (bootAuthError) {
  setTimeout(() => toast(bootAuthError), 300);
  window.history.replaceState({}, document.title, window.location.pathname);
}
const bootViewParam = bootUrlParams.get('view');
if (bootViewParam && views[bootViewParam]) {
  state.view = bootViewParam;
  const targetPath = bootViewParam === 'home' ? '/' : `/${bootViewParam}`;
  window.history.replaceState({ view: bootViewParam }, document.title, targetPath);
} else {
  const pathView = getViewFromPath(window.location.pathname);
  if (pathView && views[pathView]) {
    state.view = pathView;
  }
}

window.addEventListener('popstate', e => {
  const pathView = e.state?.view || getViewFromPath(window.location.pathname) || 'home';
  if (views[pathView] && pathView !== state.view) {
    if (state.view === 'chat' && pathView !== 'chat') {
      chatAuthToastShown = false;
      chatInitialized = false;
      chatLoading = false;
    }
    state.view = pathView;
    render();
    if (pathView === 'discover' || pathView === 'home') loadDiscover();
    if (pathView === 'inbox') loadInbox();
    if (pathView === 'chat') loadLiveChat();
    if (pathView === 'admin') loadAdminData();
  }
});

loadMe();
loadDiscover();
render();

// ── Swipe-to-Reply Gesture Engine (Touch & Pointer Drag) ─────────────────────
let swipeActiveEl = null;
let swipeStartX = 0;
let swipeStartY = 0;
let swipeCurrentDx = 0;
let isSwiping = false;

document.addEventListener('touchstart', e => {
  if (state.view !== 'chat') return;
  const target = e.target.closest('.message');
  if (!target) return;
  swipeActiveEl = target;
  swipeStartX = e.touches[0].clientX;
  swipeStartY = e.touches[0].clientY;
  swipeCurrentDx = 0;
  isSwiping = false;
}, { passive: true });

document.addEventListener('touchmove', e => {
  if (!swipeActiveEl || state.view !== 'chat') return;
  const dx = e.touches[0].clientX - swipeStartX;
  const dy = e.touches[0].clientY - swipeStartY;

  if (!isSwiping) {
    if (dx > 12 && dx > Math.abs(dy) * 1.3) {
      isSwiping = true;
    } else if (Math.abs(dy) > 10) {
      swipeActiveEl = null;
      return;
    }
  }

  if (isSwiping && dx > 0) {
    if (e.cancelable) e.preventDefault();
    swipeCurrentDx = Math.min(dx * 0.65, 75);
    swipeActiveEl.style.transform = `translateX(${swipeCurrentDx}px)`;
    const cue = swipeActiveEl.parentElement?.querySelector('.swipe-reply-cue');
    if (cue) {
      if (swipeCurrentDx >= 42) cue.classList.add('active');
      else cue.classList.remove('active');
    }
  }
}, { passive: false });

document.addEventListener('touchend', () => {
  if (!swipeActiveEl) return;
  const el = swipeActiveEl;
  const dx = swipeCurrentDx;
  const cue = el.parentElement?.querySelector('.swipe-reply-cue');
  if (cue) cue.classList.remove('active');
  el.style.transform = 'translateX(0px)';
  if (dx >= 42) {
    const id = el.getAttribute('data-msg-id');
    const sender = el.getAttribute('data-sender');
    const text = el.getAttribute('data-text');
    if (sender) {
      if (navigator.vibrate) navigator.vibrate(14);
      window.setReplyTo({ id, sender, text });
    }
  }
  swipeActiveEl = null;
  isSwiping = false;
  swipeCurrentDx = 0;
}, { passive: true });

// Keep keyboard focus inside the active dialog and restore it on dismissal.
document.addEventListener('keydown', event => {
  const dialog = document.querySelector('.modal[role=dialog]');
  if (event.key === 'Escape' && dialog) { event.preventDefault(); window.closeModal(); return; }
  if (event.key === 'Tab' && dialog) {
    const controls = [...dialog.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]):not([type=hidden]), textarea:not([disabled]), select:not([disabled]), [tabindex="0"]')].filter(el => el.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
  }
  if (['Enter',' '].includes(event.key) && event.target.matches('.real-switch-casing[role=button]')) { event.preventDefault(); event.target.click(); }
});
