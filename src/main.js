import './style.css';
import { io } from 'socket.io-client';
import { renderAvatarSvg, renderFullBodyAvatarSvg, renderVerifiedBadgeSvg, AVATAR_OPTIONS, getDeterministicAvatar } from './avatar.js';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

const API = import.meta.env.VITE_API_URL || (location.port === '5173' ? 'http://localhost:3002/api' : '/api');

async function api(path, options = {}) {
  const r = await fetch(API + path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

const state = {
  view: 'home',
  me: null,
  toast: '',
  messages: [],
  requests: [],
  matches: [],
  pendingApplications: [],
  activeMatch: null,
  activeMatchMessages: []
};

let socket, chatInitialized = false, chatLoading = false, chatAuthToastShown = false;

const icons = {
  home: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12L12 3l9 9"/><path d="M9 21V12h6v9"/><path d="M5 10v11h14V10"/></svg>`,
  chat: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="4.5 4.5"><circle cx="12" cy="12" r="9.5"/></svg>`,
  discover: '⌘',
  inbox: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>`,
  safety: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  settings: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83-2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`
};

function avatar(nameOrConfig, small = false, isVerified = true) {
  const size = small ? 22 : 36;
  const badgeSize = small ? 10 : 15;
  let svgContent;
  if (!nameOrConfig) svgContent = renderAvatarSvg('Anonymous', size);
  else if (typeof nameOrConfig === 'object') svgContent = renderAvatarSvg(nameOrConfig, size);
  else if (state.me && nameOrConfig === state.me.username && state.me.avatarConfig) {
    svgContent = renderAvatarSvg(state.me.avatarConfig, size);
  } else {
    svgContent = renderAvatarSvg(nameOrConfig, size);
  }

  if (!isVerified) return svgContent;

  return `
    <span class="avatar-verified-wrapper" style="position:relative;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;">
      ${svgContent}
      <span class="avatar-verified-badge" style="position:absolute;bottom:-2px;right:-2px;z-index:2;line-height:0;" title="Verified Student">
        ${renderVerifiedBadgeSvg(badgeSize)}
      </span>
    </span>
  `;
}

function layout(content) {
  const nav = [
    ['home', 'Home'],
    ['chat', 'Campus chat'],
    ['discover', 'Discover'],
    ['inbox', 'Inbox'],
    ['safety', 'Safety']
  ];
  const me = state.me;
  const username = me?.username || 'Anonymous';
  const campusName = me?.university || 'NIIT University';
  const inboxCount = (state.matches.length + state.pendingApplications.length) || 0;

  return `
    <div class="shell ${state.view === 'chat' ? 'chat-shell' : ''}">
      <aside>
        <a class="brand" href="#" onclick="go('home')"><i>✦</i> afterclass</a>
        <div class="campus">YOUR CAMPUS <b>${campusName}</b></div>
        <nav>
          ${nav.map(([key, label]) => `
            <button class="${state.view === key ? 'active' : ''}" onclick="go('${key}')">
              <span>${icons[key] || '◈'}</span>${label}
              ${key === 'inbox' && inboxCount > 0 ? `<em>${inboxCount}</em>` : ''}
            </button>
          `).join('')}
        </nav>
        <div class="sidebar-bottom" onclick="${me ? 'openAvatarPreview()' : 'openAuth()'}" style="cursor:pointer;" title="${me ? 'View your avatar showcase' : ''}">
          ${avatar(me?.avatarConfig || username, false)}
          <div>
            <strong>${username}</strong>
            <small>${me ? 'view character ✦' : 'not signed in'}</small>
          </div>
          ${me ? `<button class="gear" title="Log out" onclick="event.stopPropagation(); logout()">⇥</button>` : `<button class="gear" onclick="event.stopPropagation(); openAuth()">⚙</button>`}
        </div>
      </aside>
      <main class="${state.view === 'chat' ? 'chat-main' : ''}">
        <header>
          <div class="mobile-brand">✦ afterclass</div>
          <div class="online"><span></span> ${campusName}</div>
          ${me
            ? `<button class="new" onclick="openComposer()">＋ Create plan</button>`
            : `<button class="new" onclick="openAuth()">Verify student email</button>`}
        </header>
        ${content}
      </main>
    </div>
    <div id="toast" class="toast ${state.toast ? 'show' : ''}">${state.toast}</div>
  `;
}

function home() {
  const previewRequests = state.requests.slice(0, 3);
  return layout(`
    <section class="hero">
      <div class="hero-copy">
        <span class="eyebrow">${(state.me?.university || 'NIIT UNIVERSITY').toUpperCase()}</span>
        <h1>Your campus,<br><em>without the pressure.</em></h1>
        <p>Meet people over the little things. Stay anonymous until it feels right.</p>
        <div>
          <button class="primary" onclick="go('discover')">Explore plans <b>→</b></button>
          <button class="text-btn" onclick="go('chat')">Join campus chat</button>
        </div>
      </div>
      <div class="orb">
        <div>✦<small>Live<br>Campus</small></div>
      </div>
    </section>
    <section class="section-head">
      <div>
        <h2>Happening near you</h2>
        <p>Small plans, easy company.</p>
      </div>
      <button class="link" onclick="go('discover')">See all plans →</button>
    </section>
    <div class="request-grid">
      ${previewRequests.length > 0 ? previewRequests.map(card).join('') : '<p class="muted">No open plans right now. Be the first to create one!</p>'}
    </div>
    <section class="why">
      <div>
        <span class="eyebrow">HOW IT WORKS</span>
        <h2>Connection, on your terms.</h2>
      </div>
      <div class="steps">
        <div>
          <b>01</b>
          <h3>Stay anonymous</h3>
          <p>Use a rotating alias. Your real identity is yours to share, when you choose.</p>
        </div>
        <div>
          <b>02</b>
          <h3>Find your people</h3>
          <p>Say yes to a plan that feels like you — nothing more.</p>
        </div>
        <div>
          <b>03</b>
          <h3>Meet safely</h3>
          <p>Public places, mutual consent, and safety built in.</p>
        </div>
      </div>
    </section>
  `);
}

function card(r) {
  const isMine = state.me && r.host?.username === state.me.username;
  const hasApplied = Boolean(r.hasApplied);
  const formattedDate = r.scheduledAt ? new Date(r.scheduledAt).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Soon';
  return `
    <article class="plan-card">
      <div class="plan-top">
        <span class="emoji">✦</span>
        <button onclick="toast('Plan saved')">♡</button>
      </div>
      <h3>${r.activity}</h3>
      <p>${avatar(r.host?.username || 'Student', true)} by <b>${r.host?.username || 'Student'}</b></p>
      <p class="muted">⌖ ${r.location || 'Campus'} · ${formattedDate}</p>
      <div class="tags">
        <span>Campus plan</span>
      </div>
      <footer>
        <span>${isMine ? 'Your plan' : 'Verified host'}</span>
        ${isMine
          ? `<span class="muted">Hosted by you</span>`
          : (hasApplied
              ? `<button class="applied-btn" disabled>Interest sent ✓</button>`
              : `<button onclick="joinPlan('${r.id}', '${r.activity.replace(/'/g, "\\'")}')">I’m interested</button>`)}
      </footer>
    </article>
  `;
}

function discover() {
  setTimeout(loadDiscover, 0);
  return layout(`
    <section class="page-title">
      <span class="eyebrow">MAKE A SMALL PLAN</span>
      <h1>Find a reason to get out.</h1>
      <p>Everything here is hosted by a verified student, and everyone starts anonymous.</p>
    </section>
    <div class="filters">
      <button class="selected">All plans</button>
    </div>
    <div class="request-grid all">
      ${state.requests.map(card).join('')}
      <article class="create-card" onclick="openComposer()">
        <span>＋</span>
        <h3>Have an idea?</h3>
        <p>Put out a low-pressure invite.</p>
        <button>Create a plan →</button>
      </article>
    </div>
  `);
}

function chat() {
  setTimeout(loadLiveChat, 0);
  const username = state.me?.username || 'Anonymous';
  return layout(`
    <section class="chat-layout">
      <div class="chat-panel">
        <div class="chat-title">
          <div>
            <span class="eyebrow">CAMPUS SPACE</span>
            <h2>${state.me?.university || 'NIIT University'} chat <i>●</i></h2>
            <p>Say hi. Keep it kind. Be human.</p>
          </div>
          <button onclick="openGuidelines()">•••</button>
        </div>
        <div class="notice">✦ You’re chatting as <b>${username}</b>. Your identity stays private.</div>
        <div class="messages" id="chat-messages">
          ${state.messages.map(m => {
            const name = m.sender?.username || 'Anonymous';
            const text = m.content || '';
            const time = m.createdAt ? new Date(m.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
            const isMine = state.me && (name === state.me.username || m.senderId === state.me.id);
            return `
              <div class="message">
                ${avatar(name)}
                <div>
                  <b>${name}</b><small>${time}${isMine ? ' <span class="tick delivered" title="Delivered">✓✓</span>' : ''}</small>
                  <p>${text}</p>
                </div>
                ${m.id && !isMine ? `<button class="report" onclick="reportMessage('${m.id}')" title="Report message to moderators">Report</button>` : ''}
              </div>
            `;
          }).join('')}
        </div>
        <div id="campus-typing-indicator" class="typing-indicator"></div>
        <form class="composer" onsubmit="sendMessage(event)">
          <input id="message" maxlength="500" placeholder="Say something to campus…" autocomplete="off" oninput="handleTypingInput()" onblur="stopTypingNow()">
          <button type="submit">↑</button>
        </form>
      </div>
    </section>
  `);
}

function inbox() {
  setTimeout(loadInbox, 0);
  const activeTab = state.inboxTab || 'matches';
  const myPlansCount = state.myPlans?.length || 0;
  return layout(`
    <section class="page-title compact">
      <span class="eyebrow">YOUR CONNECTIONS & PLANS</span>
      <h1>Inbox</h1>
      <p>Manage your 1-on-1 private conversations and active campus plans.</p>
    </section>

    <div class="inbox-tabs">
      <button class="${activeTab === 'matches' ? 'active' : ''}" onclick="setInboxTab('matches')">
        Active Matches (${state.matches.length})
      </button>
      <button class="${activeTab === 'my-plans' ? 'active' : ''}" onclick="setInboxTab('my-plans')">
        My Posted Plans (${myPlansCount})
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
          <h2>Keep it easy.</h2>
          <p>When someone accepts your interest or you accept theirs, your private chat will appear here.</p>
          <button class="primary" onclick="go('discover')">Explore plans</button>
        </div>
      ` : ''}
    ` : `
      <section style="margin-top:20px;">
        ${state.myPlans && state.myPlans.length > 0 ? `
          <div class="my-plans-grid">
            ${state.myPlans.map(p => {
              const isActive = p.status === 'open';
              const statusLabel = p.status === 'open' ? 'Active' : (p.status === 'matched' ? 'Matched' : 'Closed');
              const statusClass = p.status === 'open' ? 'active' : (p.status === 'matched' ? 'matched' : 'closed');
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
  return layout(`
    <section class="page-title compact">
      <span class="eyebrow">SAFETY, BY DESIGN</span>
      <h1>Your space. Your rules.</h1>
      <p>Afterclass is designed to let you decide what, when, and who you share with.</p>
    </section>
    <div class="safety-grid">
      <article>
        <i>◉</i>
        <h3>Anonymous by default</h3>
        <p>Your email and legal name are never shown to other students.</p>
      </article>
      <article>
        <i>♢</i>
        <h3>Mutual reveal only</h3>
        <p>Identity details are shared only if both people explicitly agree.</p>
      </article>
      <article>
        <i>⚑</i>
        <h3>Report in a tap</h3>
        <p>Every conversation can be reported. We take action on patterns, fast.</p>
      </article>
    </div>
    <section class="report-box">
      <div>
        <span class="eyebrow">CAMPUS SAFETY</span>
        <h2>Something not feel right?</h2>
        <p>You can report a person or a message without sharing your identity.</p>
      </div>
      <button class="primary" onclick="openGuidelines()">Community Guidelines</button>
    </section>
  `);
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

      <div class="showcase-user-meta" style="margin-bottom: 20px;">
        <h3>${state.me.username}</h3>
        <p><span class="badge-star">✦</span> Verified Student · ${state.me.university || 'Campus'}</p>
      </div>

      <div class="showcase-actions">
        <button class="primary wide" onclick="openAvatarStudio()">🎨 Customize Character →</button>
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
        <button class="${tab === 'appearance' ? 'active' : ''}" onclick="setAvatarStudioTab('appearance')">Face & Tone</button>
        <button class="${tab === 'hair' ? 'active' : ''}" onclick="setAvatarStudioTab('hair')">Hair</button>
        <button class="${tab === 'outfit' ? 'active' : ''}" onclick="setAvatarStudioTab('outfit')">Clothing</button>
        <button class="${tab === 'eyewear' ? 'active' : ''}" onclick="setAvatarStudioTab('eyewear')">Eyewear</button>
        <button class="${tab === 'extras' ? 'active' : ''}" onclick="setAvatarStudioTab('extras')">Extras & Bg</button>
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

function modal(content) {
  return `
    <div class="modal-backdrop" onclick="closeModal(event)">
      <div class="modal" onclick="event.stopPropagation()">
        <button class="close" onclick="closeModal()">×</button>
        ${content}
      </div>
    </div>
  `;
}

function openComposer() {
  if (!state.me) return openAuth();
  document.body.insertAdjacentHTML('beforeend', modal(`
    <span class="eyebrow">NEW PLAN</span>
    <h2>What would feel good?</h2>
    <p>Keep it simple. Details are shared with students on campus.</p>
    <form onsubmit="createPlan(event)">
      <label>Activity
        <input id="plan-activity" placeholder="e.g. Coffee & study session" required maxlength="100">
      </label>
      <label>When
        <input id="plan-when" type="datetime-local" required>
      </label>
      <label>Where (Public location)
        <input id="plan-where" placeholder="e.g. Campus Library Cafe" required maxlength="120">
      </label>
      <button class="primary wide" type="submit">Share plan →</button>
    </form>
  `));
}

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

async function openPrivateChat(matchId) {
  const match = state.matches.find(m => m.id === matchId);
  if (!match) return;
  state.activeMatch = match;
  state.activeMatchMessages = [];

  if (socket?.connected) {
    socket.emit('room:join', match.roomId);
    socket.emit('room:read', { roomId: match.roomId });
  }

  renderPrivateModal();
}

function renderPrivateModal() {
  document.querySelector('.modal-backdrop')?.remove();
  const match = state.activeMatch;
  if (!match) return;

  const otherName = match.revealed ? (match.other?.revealName || match.other?.username) : match.other?.username;
  const revealStatus = match.myReveal === 'accepted' ? (match.revealed ? 'Identity Revealed!' : 'Reveal Requested (Waiting)') : 'Request Identity Reveal';

  document.body.insertAdjacentHTML('beforeend', modal(`
    <span class="eyebrow">PRIVATE CHAT · ${match.activity.toUpperCase()}</span>
    <h2>${match.revealed ? `Chat with ${otherName}` : 'Still anonymous. Still in control.'}</h2>
    <div class="reveal">
      <div>
        <b>${match.revealed ? 'Mutual identity shared' : 'Want to share your name?'}</b>
        <p>${match.revealed ? 'Both students agreed to reveal identities.' : 'It will only be revealed if you both agree.'}</p>
      </div>
      ${!match.revealed ? `<button onclick="sendRevealRequest('${match.id}')">${revealStatus}</button>` : ''}
    </div>
    <div class="messages" id="private-messages" style="max-height: 250px; overflow-y: auto; margin: 15px 0;">
      ${state.activeMatchMessages.length === 0 ? `<p class="muted" style="text-align:center;">Say hi and coordinate your plan!</p>` : ''}
      ${state.activeMatchMessages.map(m => {
        const isMine = state.me && (m.sender?.username === state.me.username || m.senderId === state.me.id);
        const time = m.createdAt ? new Date(m.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
        return `
          <div class="message">
            ${avatar(m.sender?.username || 'Student', true)}
            <div>
              <b>${m.sender?.username || 'Student'}</b>${time ? `<small>${time}${isMine ? ' <span class="tick delivered" title="Delivered">✓✓</span>' : ''}</small>` : ''}
              <p>${m.content}</p>
            </div>
          </div>
        `;
      }).join('')}
    </div>
    <div id="private-typing-indicator" class="typing-indicator"></div>
    <form class="composer" onsubmit="sendPrivateMessage(event, '${match.roomId}')">
      <input id="private-msg-input" placeholder="Write a private message…" required maxlength="500" autocomplete="off" oninput="handleTypingInput('${match.roomId}')" onblur="stopTypingNow('${match.roomId}')">
      <button type="submit">↑</button>
    </form>
  `));
}

// ── Global Window Handlers ───────────────────────────────────────────────────

window.go = v => {
  // Reset chat state when leaving the chat view so the toast can re-appear
  // if the user logs out and navigates back without refreshing.
  if (state.view === 'chat' && v !== 'chat') {
    chatAuthToastShown = false;
    chatInitialized = false;
    chatLoading = false;
  }
  state.view = v;
  render();
};

window.toast = t => {
  state.toast = t;
  render();
  setTimeout(() => {
    state.toast = '';
    render();
  }, 2500);
};

window.closeModal = () => document.querySelector('.modal-backdrop')?.remove();
window.openComposer = openComposer;
window.openPrivateChat = openPrivateChat;
window.openGuidelines = openGuidelines;

window.openAuth = (defaultEmail = '') => {
  document.querySelector('.modal-backdrop')?.remove();
  document.body.insertAdjacentHTML('beforeend', modal(`
    <span class="eyebrow">VERIFIED STUDENTS ONLY</span>
    <h2>Use your NIIT University email.</h2>
    <p>We never show it to other students.</p>
    <form id="otp-form" onsubmit="sendOtp(event)">
      <label>Email
        <input id="auth-email" type="email" placeholder="you@st.niituniversity.in" value="${defaultEmail}" required>
      </label>
      <button class="primary wide" type="submit">Send verification code →</button>
    </form>
  `));
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
    state.me = r.user;
    closeModal();
    toast(`Welcome, ${r.user.username}`);
    initSocket();
    render();
  } catch (err) {
    toast(err.message);
  }
};

window.logout = async () => {
  try {
    await api('/auth/logout', { method: 'POST' });
    state.me = null;
    state.messages = [];
    state.matches = [];
    state.pendingApplications = [];
    if (socket) socket.disconnect();
    toast('Logged out');
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
    await api('/match-requests', {
      method: 'POST',
      body: JSON.stringify({ activity, location: where, scheduledAt: new Date(when).toISOString() })
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
      if (r.mutual) state.activeMatch.revealed = true;
      renderPrivateModal();
    }
    toast(r.mutual ? 'Mutual reveal accepted!' : 'Reveal request sent.');
  } catch (err) {
    toast(err.message);
  }
};

function renderTick(status = 'delivered') {
  if (status === 'read') return '<span class="tick read" title="Read">✓✓</span>';
  if (status === 'sent') return '<span class="tick sent" title="Sent">✓</span>';
  return '<span class="tick delivered" title="Delivered">✓✓</span>';
}

function playSendSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(540, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(920, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  } catch {}
}

function playReceiveSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(760, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(480, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.10, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.14);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.14);
  } catch {}
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

window.sendMessage = e => {
  e.preventDefault();
  const el = document.querySelector('#message');
  if (!el || !el.value.trim()) return;
  if (!socket?.connected) return toast('Verify your NIIT email to chat.');
  const val = el.value;
  el.value = '';
  el.focus();
  stopTypingNow();
  playSendSound();
  socket.emit('campus:message', { content: val }, r => {
    if (r?.error) toast(r.error);
  });
};

window.sendPrivateMessage = (e, roomId) => {
  e.preventDefault();
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

window.reportMessage = async messageId => {
  if (!messageId) return;
  try {
    await api('/reports', { method: 'POST', body: JSON.stringify({ messageId, reason: 'inappropriate_content' }) });
    toast('Report submitted privately to moderation.');
  } catch (err) {
    toast(err.message);
  }
};

// ── Data Loaders ─────────────────────────────────────────────────────────────

async function loadMe() {
  try {
    const data = await api('/me');
    state.me = data.user;
    initSocket();
    render();
  } catch {
    state.me = null;
    render();
  }
}

async function loadDiscover() {
  try {
    const data = await api('/match-requests');
    state.requests = data.requests || [];
    render();
  } catch {
    // Keep existing
  }
}

window.setInboxTab = tab => {
  state.inboxTab = tab;
  render();
};

window.closeMyPlan = async planId => {
  if (!confirm('Are you sure you want to close this plan? It will no longer appear on Discover.')) return;
  try {
    await api(`/match-requests/${planId}`, { method: 'DELETE' });
    toast('Plan closed successfully.');
    loadInbox();
    loadDiscover();
  } catch (err) {
    toast(err.message || 'Could not close plan.');
  }
};

async function loadInbox() {
  if (!state.me) return;
  try {
    const [matchesData, appsData, myPlansData] = await Promise.all([
      api('/matches').catch(() => ({ matches: [] })),
      api('/match-requests/mine/applications').catch(() => ({ applications: [] })),
      api('/match-requests/mine').catch(() => ({ plans: [] }))
    ]);
    state.matches = matchesData.matches || [];
    state.pendingApplications = appsData.applications || [];
    state.myPlans = myPlansData.plans || [];
    render();
  } catch {
    // Keep existing
  }
}

async function loadLiveChat() {
  if (chatInitialized || chatLoading) return;
  chatLoading = true;
  try {
    const history = await api('/messages');
    state.messages = history.messages || [];
    chatInitialized = true;
    chatAuthToastShown = false; // reset so it shows again if user logs out and back
    if (state.view === 'chat') render();
    initSocket();
    const el = document.querySelector('#chat-messages');
    if (el) el.scrollTop = el.scrollHeight;
  } catch (err) {
    if (err.message === 'Authentication required' && !chatAuthToastShown) {
      chatAuthToastShown = true;
      toast('Verify your NIIT email to join campus chat.');
    }
  } finally {
    chatLoading = false;
  }
}

function initSocket() {
  if (socket?.connected || !state.me) return;
  const socketUrl = import.meta.env.VITE_API_URL ? new URL(import.meta.env.VITE_API_URL).origin : location.origin;
  socket = io(socketUrl, { withCredentials: true });

  socket.on('connect', () => {
    if (state.me?.campusId) {
      socket.emit('room:join', `campus:${state.me.campusId}`);
    }
  });

  socket.on('message:new', message => {
    if (state.view === 'chat') {
      state.messages.push(message);
      state.messages = state.messages.slice(-50);
      const chatContainer = document.querySelector('#chat-messages');
      if (chatContainer) {
        const name = message.sender?.username || 'Anonymous';
        const text = message.content || '';
        const time = message.createdAt ? new Date(message.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
        const isMine = state.me && (name === state.me.username || message.senderId === state.me.id);
        if (!isMine) playReceiveSound();
        chatContainer.insertAdjacentHTML('beforeend', `
          <div class="message">
            ${avatar(name)}
            <div>
              <b>${name}</b><small>${time}${isMine ? ' <span class="tick delivered" title="Delivered">✓✓</span>' : ''}</small>
              <p>${text}</p>
            </div>
            ${message.id && !isMine ? `<button class="report" onclick="reportMessage('${message.id}')" title="Report message to moderators">Report</button>` : ''}
          </div>
        `);
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
      }
      const el = document.querySelector('#private-messages');
      if (el) {
        const time = message.createdAt ? new Date(message.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
        const status = message.status || 'delivered';
        el.insertAdjacentHTML('beforeend', `
          <div class="message">
            ${avatar(message.sender?.username || 'Student', true)}
            <div>
              <b>${message.sender?.username || 'Student'}</b>${time ? `<small>${time}${isMine ? ` ${renderTick(status)}` : ''}</small>` : ''}
              <p>${message.content}</p>
            </div>
          </div>
        `);
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
      el.innerHTML = state.activeMatchMessages.map(m => {
        const isMine = state.me && (m.sender?.username === state.me.username || m.senderId === state.me.id);
        const time = m.createdAt ? new Date(m.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
        const status = m.status || 'delivered';
        return `
          <div class="message">
            ${avatar(m.sender?.username || 'Student', true)}
            <div>
              <b>${m.sender?.username || 'Student'}</b>${time ? `<small>${time}${isMine ? ` ${renderTick(status)}` : ''}</small>` : ''}
              <p>${m.content}</p>
            </div>
          </div>
        `;
      }).join('');
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

  socket.on('match:accepted', () => {
    toast('A match was accepted! Check your inbox.');
    loadInbox();
  });

  socket.on('reveal:requested', () => {
    toast('Your match requested an identity reveal!');
    loadInbox();
  });
}

function render() {
  const views = { home, discover, chat, inbox, safety };
  const currentView = views[state.view] || home;
  const appEl = document.querySelector('#app');
  if (appEl) appEl.innerHTML = currentView();
}

// Initial Boot
loadMe();
loadDiscover();
render();
