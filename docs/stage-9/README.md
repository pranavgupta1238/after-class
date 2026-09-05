# Stage 9 — Web Push Notifications, Mobile PWA & Production Launch Readiness

This document outlines the native browser notifications engine, audio synthesizer, Progressive Web App (PWA) configuration, zero-flicker skeleton hydration, and production deployment architecture.

---

## 1. Overview & Launch Scope

Stage 9 elevates Afterclass from a functional web prototype to an installable, production-ready campus platform with native operating system integrations:

- **Instant Browser Push Notifications**: Real-time operating system alerts for plan applications, message replies, and mutual identity reveals.
- **Mobile Progressive Web App (PWA)**: Installable directly to iOS and Android home screens with native full-screen app shells and standalone display modes.
- **Zero-Flicker Skeleton Hydration**: YouTube-style blurry shimmer skeleton eliminating flashes of unauthenticated content during refresh.
- **Enterprise Multi-Cloud Deployment**: Production configurations supporting Oracle Cloud VM (PM2 + Nginx reverse proxy), Railway, and Vercel.

---

## 2. Native Push Notifications & Audio Synthesizer

### Browser Push & Notification Dispatcher (`src/main.js`)
- Requests native OS notification permissions via `Notification.requestPermission()`.
- Dispatches formatted notifications with campus icon badge and click-to-open routing:
  - Plan application received: `💬 [Applicant] applied to your plan` &rarr; opens `/inbox`.
  - Private DM message received: `💬 Message from [Companion]` &rarr; opens chat.
  - Identity revealed: `🎉 Mutual Identity Reveal Unlocked!` &rarr; triggers celebration view.

### Zero-Latency Embedded Audio Synthesizer (`src/audio.js`)
- Native Web Audio API (`AudioContext`) generating soft, harmonious chime alerts without downloading heavy MP3/WAV assets:
  - `playSendSound()`: Upward rising acoustic chime (frequency curve 587 Hz &rarr; 880 Hz).
  - `playReceiveSound()`: Gentle incoming campus notification tone (784 Hz &rarr; 1046 Hz).
- Zero network latency; operates reliably in offline and poor mobile signal states.

### Tactile Notification Controls (`src/style.css`)
- Section 3 of **Settings** includes an ultra-realistic 3D skeuomorphic mechanical rocker switch:
  - 3D perspective rocking paddle with realistic shadows.
  - Luminous emerald LED pilot light indicator when ON.
  - Controls both audio playback and push notifications reactively.

---

## 3. Mobile Progressive Web App (PWA)

Configured for native mobile installation without requiring app store downloads:

- **Manifest (`public/manifest.webmanifest`)**:
  - `display: standalone`: Hides Safari/Chrome browser URL bars, providing a full-screen native mobile app feel.
  - `theme_color: #fbfcf8`: Blends with campus paper aesthetic.
  - High-DPI icons: `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`.
- **Touch Gesture Engine**:
  - WhatsApp-style pull-to-right swipe-to-reply on chat bubbles.
  - Touch-optimized sticky bottom navigation bar on mobile viewports (`@media (max-width: 800px)`).

---

## 4. Zero-Flicker & YouTube-Style Skeleton Loading

To eliminate the Flash of Unauthenticated Content (FOUS) on page reloads or rapid **Cmd+R** refreshes:

1. **Pre-Hydration Critical Skeleton (`index.html`)**:
   - Embedded directly inside `<div id="app">` with critical inline CSS in `<head>`.
   - Browser paints the layout skeleton on millisecond 0 before JavaScript executes.
2. **Blurry Shimmer Effect (`.sk-box`)**:
   - Soft blurry edges (`filter: blur(0.3px)`) with smooth sweeping gradient animation (`@keyframes ytShimmer`).
   - Mirrors YouTube and Linear layout boxes (sidebar items, chat title, message bubbles, composer pill).
3. **Session Cache & Safe Boot**:
   - `state.view` initializes from the current route pathname (`getInitialBootView()`), never defaulting to `'auth'`.
   - `loadMe()` distinguishes between explicit `401 Unauthorized` responses and aborted requests, preventing Cmd+R from kicking users to the "Start for Free" screen.

---

## 5. Production Deployment Architecture

The codebase is hardened for scalable cloud production deployment:

| Environment | Purpose | Configuration Files |
| :--- | :--- | :--- |
| **Oracle Cloud Infrastructure (OCI)** | Self-hosted production VM with Nginx reverse proxy and SSL termination. | `ORACLE_DEPLOYMENT.md`, `deploy/nginx/afterclass.conf`, `ecosystem.config.cjs` |
| **Railway** | Cloud container deployment for Node.js API and Redis. | `railway.toml`, `Dockerfile` |
| **Vercel** | Edge CDN deployment for compiled static assets (`dist/`). | `vercel.json` |
| **Supabase** | Managed PostgreSQL with transaction-mode connection pooler (`pgbouncer=true`). | `DATABASE_URL`, `DIRECT_URL` in `.env` |
| **Upstash Redis** | Serverless in-memory cache for OTP codes, rate limits, and live presence. | `REDIS_URL` in `.env` |

### Production Health Check
The deployment exposes a zero-dependency health check endpoint:
```bash
curl https://your-domain.com/api/health
```
Returns:
```json
{ "ok": true, "service": "afterclass", "database": "connected" }
```
