import './style.css';
import { io } from 'socket.io-client';

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

const icons = { home: '⌂', chat: '◌', discover: '⌘', inbox: '✦', safety: '♢', settings: '⚙' };

function avatar(name, small = false) {
  const char = (name || '?').slice(0, 1).toUpperCase();
  return `<span class="avatar ${small ? 'small' : ''}">${char}</span>`;
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
    <div class="shell">
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
        <div class="sidebar-bottom">
          ${avatar(username, true)}
          <div>
            <strong>${username}</strong>
            <small>${me ? 'verified student' : 'not signed in'}</small>
          </div>
          ${me ? `<button class="gear" title="Log out" onclick="logout()">⇥</button>` : `<button class="gear" onclick="openAuth()">⚙</button>`}
        </div>
      </aside>
      <main>
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
          : `<button onclick="joinPlan('${r.id}', '${r.activity.replace(/'/g, "\\'")}')">I’m interested</button>`}
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
                  <b>${name}</b><small>${time}</small>
                  <p>${text}</p>
                </div>
                ${m.id && !isMine ? `<button class="report" onclick="reportMessage('${m.id}')" title="Report message to moderators">Report</button>` : ''}
              </div>
            `;
          }).join('')}
        </div>
        <form class="composer" onsubmit="sendMessage(event)">
          <input id="message" maxlength="500" placeholder="Say something to campus…" autocomplete="off">
          <button type="submit">↑</button>
        </form>
      </div>
    </section>
  `);
}

function inbox() {
  setTimeout(loadInbox, 0);
  return layout(`
    <section class="page-title compact">
      <span class="eyebrow">YOUR CONNECTIONS</span>
      <h1>Inbox</h1>
      <p>Private conversations only begin when you both say yes.</p>
    </section>

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
      ${state.activeMatchMessages.map(m => `
        <div class="message">
          ${avatar(m.sender?.username || 'Student', true)}
          <div>
            <b>${m.sender?.username || 'Student'}</b>
            <p>${m.content}</p>
          </div>
        </div>
      `).join('')}
    </div>
    <form class="composer" onsubmit="sendPrivateMessage(event, '${match.roomId}')">
      <input id="private-msg-input" placeholder="Write a private message…" required maxlength="500" autocomplete="off">
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

window.sendMessage = e => {
  e.preventDefault();
  const el = document.querySelector('#message');
  if (!el || !el.value.trim()) return;
  if (!socket?.connected) return toast('Verify your NIIT email to chat.');
  const val = el.value;
  el.value = '';
  el.focus();
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

async function loadInbox() {
  if (!state.me) return;
  try {
    const [matchesData, appsData] = await Promise.all([
      api('/matches').catch(() => ({ matches: [] })),
      api('/match-requests/mine/applications').catch(() => ({ applications: [] }))
    ]);
    state.matches = matchesData.matches || [];
    state.pendingApplications = appsData.applications || [];
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
        chatContainer.insertAdjacentHTML('beforeend', `
          <div class="message">
            ${avatar(name)}
            <div>
              <b>${name}</b><small>${time}</small>
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
      const el = document.querySelector('#private-messages');
      if (el) {
        el.insertAdjacentHTML('beforeend', `
          <div class="message">
            ${avatar(message.sender?.username || 'Student', true)}
            <div>
              <b>${message.sender?.username || 'Student'}</b>
              <p>${message.content}</p>
            </div>
          </div>
        `);
        el.scrollTop = el.scrollHeight;
      }
    }
  });

  socket.on('room:history', messages => {
    state.activeMatchMessages = messages || [];
    const el = document.querySelector('#private-messages');
    if (el) {
      el.innerHTML = state.activeMatchMessages.map(m => `
        <div class="message">
          ${avatar(m.sender?.username || 'Student', true)}
          <div>
            <b>${m.sender?.username || 'Student'}</b>
            <p>${m.content}</p>
          </div>
        </div>
      `).join('');
      el.scrollTop = el.scrollHeight;
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
