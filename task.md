# Afterclass — Project Task Tracker & Changelog

This file serves as the single source of truth for all engineering tasks, design iterations, bug fixes, and architectural decisions in the **Afterclass** project. Every completed or upcoming task is logged chronologically below.

---

## System Architecture Summary

- **Backend**: Node.js + Express + Socket.io (`server/index.js`)
- **Database & ORM**: PostgreSQL (Supabase) via Prisma ORM (`server/prisma/schema.prisma`)
- **Cache & Ephemeral Storage**: Upstash Redis (OTP tokens, rate limiting) (`server/redis.js`)
- **Email Delivery**: Resend API (`server/index.js`)
- **Frontend**: Vanilla JavaScript (ES Modules) + Vite (`src/main.js`, `src/style.css`, `index.html`)

---

## Tasks & Changelog

### Task 1: OTP Email Verification Flow & Redis Persistence
- **Date / Time**: 2026-09-01 (Evening)
- **Status**: `COMPLETED`
- **Issue**: Users received OTP emails via Resend.com, but entering the OTP always returned *"This code is invalid or expired"*.
- **Root Cause**:
  1. `redis.setOtp()` was missing from the `/api/auth/send-otp` handler in `server/index.js` — codes were dispatched via Resend but never stored in Redis.
  2. `server/redis.js` had `enableOfflineQueue: false` and missing TLS configuration for Upstash.
  3. `REDIS_URL` was missing from `.env`.
- **Changes Made**:
  - `server/index.js`: Added `await redis.setOtp(email, { codeHash: hashOtp(email, code), campusId: campus.id })` in `send-otp`.
  - `server/redis.js`: Rebuilt with proper Upstash TLS configuration (`rejectUnauthorized: false`) and in-memory fallback.
  - `.env`: Restored `REDIS_URL`, configured Resend credentials.
  - Rate limit raised to 50 OTPs/hr in development mode.
- **Verification**: User account creation (`CalmClover`) verified successfully.

---

### Task 2: Campus Chat Toast Blinking & Auth State Fix
- **Date / Time**: 2026-09-01
- **Status**: `COMPLETED`
- **Issue**: "Verify your student email to chat" toast was continuously blinking when navigating to the Campus Chat tab.
- **Root Cause**: Polling and re-rendering triggered repeated error toasts on unauthenticated state without a suppression guard.
- **Changes Made**:
  - `src/main.js`: Added `chatAuthToastShown` flag ensuring the toast only fires once per session, and cleanly resets upon leaving the view in `go(v)`.

---

### Task 3: Brand Favicon Generation & Safari Caching Fix
- **Date / Time**: 2026-09-01 – 2026-09-02
- **Status**: `COMPLETED`
- **Issue**: No favicon displayed in browser tabs; Safari showed a generic fallback letter *"L"*.
- **Root Cause**:
  1. Favicon assets were originally written to `dist/`, which gets wiped on each `vite build` — assets needed to reside in `public/`.
  2. Resized images were saved as JPEG byte streams under `.png` extensions; Safari's strict format parser rejected them and reverted to the domain initial letter badge.
  3. Straight-edged needle star didn't match the brand's plump curved logo mark.
- **Changes Made**:
  - `public/favicon.svg` & `public/safari-pinned-tab.svg`: Vector astroid path with cubic bezier curves matching the plump `✦` brand star in `#e05c3a` on a 100% transparent background.
  - `public/favicon-32.png` & `public/apple-touch-icon.png`: Genuine RGBA PNG files generated with anti-aliasing.
  - `public/favicon.ico`: Standard Windows icon resource with embedded 32x32 PNG.
  - `index.html`: Added inline `data:image/png;base64` Data URI to immediately bypass Safari's `localhost` SQLite favicon cache.

---

### Task 4: Sidebar Branding & Navigation Icons Redesign
- **Date / Time**: 2026-09-02
- **Status**: `COMPLETED`
- **Issue**: Logo was undersized; nav icons felt small after initial SVG swap.
- **Changes Made**:
  - `src/style.css`: Sized `.brand` typography up to `26px` with bold styling, tighter `-1.2px` letter spacing, and a prominent `28px` coral star `✦`.
  - `src/main.js` & `src/style.css`:
    - **Campus Chat**: Clean vector dashed ring (`<circle stroke-dasharray="4.5 4.5">`) with distinct, bold dashes.
    - **Discover**: Apple Command symbol (`⌘`) at `24px` font weight `600`.
    - **Home, Inbox, Safety**: Uniform `24px × 24px` stroke SVGs with `28px` container width.

---

### Task 5: Campus Chat Window Expansion & Viewport Lock
- **Date / Time**: 2026-09-02
- **Status**: `COMPLETED`
- **Issue**: Campus chat kept expanding vertically off-screen, creating an outer page scrollbar; the chat box was narrow.
- **Root Cause**: Unused 270px right sidebar column squished the chat; lack of viewport boundary on `.chat-panel` allowed messages to push the entire page height.
- **Changes Made**:
  - `src/main.js`: Added `.chat-shell` and `.chat-main` classes when `state.view === 'chat'`.
  - `src/style.css`:
    - Locked chat viewport to `height: 100vh; overflow: hidden;` so the browser window never scrolls.
    - Expanded `.chat-layout` to a centered, full-width `1100px` container.
    - Added `min-height: 0; overflow-y: auto;` to `.messages` so only the internal message list scrolls.
    - Pinned the message composer (`.composer`) to the bottom.

---

### Task 6: Zero-Latency Chat Audio Effects
- **Date / Time**: 2026-09-02
- **Status**: `COMPLETED`
- **Feature**: Real-time sound effects for messaging.

---

### Task 7: Real-Time Message Delivery & Read Receipts Engine
- **Date / Time**: 2026-09-02
- **Status**: `COMPLETED`
- **Feature**: Sent, delivered, and read status indicators across messages.

---

### Task 8: Real-Time Typing Indicators
- **Date / Time**: 2026-09-02
- **Status**: `COMPLETED`
- **Feature**: Live typing status (`● ● ● CalmClover is typing...`) in Campus Chat and 1-on-1 Private DMs.

---

### Task 9: "My Plans" Management & Application Review
- **Date / Time**: 2026-09-02
- **Status**: `COMPLETED`
- **Feature**: Dedicated plan management in Inbox with segmented tabs, status chips, applicant counts, and plan closure.

---

### Task 10: Duplicate Application Prevention & UI State
- **Date / Time**: 2026-09-02
- **Status**: `COMPLETED`
- **Issue**: Duplicate plan application throwing raw constraint error.

---

### Task 11: Snapchat-Style Bitmoji Avatar Studio & Vector Engine
- **Date / Time**: 2026-09-02
- **Status**: `COMPLETED`
- **Feature**: Full procedural SVG character illustration generator with an interactive customizer studio.

---

### Task 12: Compulsory Coral Star Mark Signature on All Avatars
- **Date / Time**: 2026-09-02
- **Status**: `COMPLETED`
- **Feature**: Permanent coral `✦` cheek star mark on all characters.

---

### Task 13: SVG Layering Fix for Afro & All Hairstyle Permutations
- **Date / Time**: 2026-09-02
- **Status**: `COMPLETED`
- **Fix**: Re-architected SVG layer stack to strict 9-layer painter's order.

---

### Task 14: Expanded Wardrobe (10 Outfits), Dedicated Eyewear (6 Styles), and Accessories (7 Options)
- **Date / Time**: 2026-09-02
- **Status**: `COMPLETED`

---

### Task 15: High-Contrast Dynamic Logo Color for Coral Outfits
- **Date / Time**: 2026-09-02
- **Status**: `COMPLETED`

---

### Task 16: Aesthetic Pastel Palettes & Full-Body Showcase Stage with Spotlight & Dark Mode
- **Date / Time**: 2026-09-02
- **Status**: `COMPLETED`

---

### Task 17: Dedicated Two-Step Avatar Showcase Stage & Customization Studio Workflow
- **Date / Time**: 2026-09-02
- **Status**: `COMPLETED`

---

### Task 18: Screen Flow Reversal: Profile Passport Modal ⇄ Full Spotlight Customizer Stage with Live Lighting & Randomize
- **Date / Time**: 2026-09-02
- **Status**: `COMPLETED`

---

### Task 19: High-Intensity Volumetric Spotlight with Overhead Fixture, Luminous Beams & Floor Halo
- **Date / Time**: 2026-09-02
- **Status**: `COMPLETED`

---

### Task 20: Wide Flood Spotlight Geometry & Ambient Silhouette Backlighting
- **Date / Time**: 2026-09-02
- **Status**: `COMPLETED`

---

### Task 21: Verified Student Tick Badge on Avatar Logos
- **Date / Time**: 2026-09-02
- **Status**: `COMPLETED`

---

### Task 22: Authentic Unclipped Scalloped Verification Seal Badge on Avatar Logos
- **Date / Time**: 2026-09-02
- **Status**: `COMPLETED`
- **Issue**: Circle badge inside the avatar SVG was being clipped off by the SVG's 50% border radius.
- **Fix**:
  - Implemented `renderVerifiedBadgeSvg()` featuring the **authentic 8-point scalloped verification seal** with a crisp white border and drop shadow.
  - Positioned the seal as an **unclipped floating overlay** at the bottom-right corner of avatars throughout the application (profile modal, cards, and sidebar).
- **Implementation**:
  - `src/avatar.js`: Exported `renderVerifiedBadgeSvg()`.
  - `src/main.js`: Wrapped `avatar()` with the unclipped floating seal.

---

## Active & Upcoming Tasks

| # | Task Description | Priority | Status |
|---|------------------|----------|--------|
| 1 | Continuous tracking & audit in `task.md` | Normal | `ACTIVE` |
| 2 | Campus location quick-picks chips | Normal | `PENDING` |
| 3 | Identity reveal celebration animation | Normal | `PENDING` |
| 4 | Moderation dashboard & user reporting admin tools | Normal | `PENDING` |
| 5 | Browser push notifications | Low | `PENDING` |
