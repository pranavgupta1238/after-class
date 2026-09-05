# Stage 6 — Matching Engine, Discover Feed & Companion Pairing

This document defines the architecture, data models, and API contracts for Afterclass's spontaneous activity matching and 1-on-1 private companion pairing engine.

---

## 1. Overview & Product Scope

The matching engine connects verified students at the same university over low-pressure, everyday campus plans without the social anxiety or public vulnerability of traditional social networks:

- **Spontaneous Campus Plans**: Quick invites for coffee, food court meals, badminton/sports, library study sessions, or campus walks.
- **Privacy-First Applications**: Students apply to plans anonymously. The plan host only sees an applicant count and alias profile, never their real name or university email.
- **Atomic Match Creation**: When a host accepts an applicant, an atomic database transaction closes the plan, locks out other applicants, and creates an isolated, encrypted 1-on-1 private chat room.
- **Mutual Identity Reveal**: Both students remain anonymous in their private chat until *both* participants mutually consent to reveal their real identities.

---

## 2. API Endpoints & Contracts

### Plan Creation & Feed
- **`POST /api/match-requests`**:
  - *Protection*: Authenticated session + `requireVerified`.
  - *Payload*: `{ activity: string, location: string, scheduledAt: ISOString, genderPreference?: string }`.
  - *Guards*: Scheduled time must be in the future; enforces campus tenancy. Sets `expiresAt = scheduledAt + 2 hours`.
- **`GET /api/match-requests`**:
  - *Returns*: Active open plans for the student's campus (`requests: [...]`).
  - *Enrichment*: Host pseudonym, formatted relative time, attendee counts, and bookmark states.

### Applications & Matching
- **`POST /api/match-requests/:id/applications`**:
  - *Protection*: Authenticated session + `requireVerified`.
  - *Guards*: Disallows applying to own plans; rejects duplicate applications (`UniqueConstraintViolation`).
  - *Notification*: Dispatches real-time web push and in-app notification to the plan author.
- **`POST /api/applications/:id/accept`**:
  - *Execution*: Atomic Prisma transaction (`prisma.$transaction`):
    1. Sets application status to `accepted`; marks competing applications as `waiting`.
    2. Creates a private `ChatRoom` with `kind = 'match'`.
    3. Creates a `Match` record binding `userOne` and `userTwo`.
    4. Initializes two pending `RevealConsent` records.

### Private Chat & Mutual Reveal
- **`GET /api/matches/:id/messages`**: Retrieves 1-on-1 conversation history with read receipts.
- **`POST /api/matches/:id/reveal`**:
  - Sets the requesting student's `RevealConsent = 'accepted'`.
  - If both participants accept, emits real-time `match:revealed` event with celebration confetti, unlocking real names.
- **`POST /api/matches/:id/close`**: Allows either participant to conclude or leave the match with no explanation required.

---

## 3. Security & Boundary Rules

1. **Strict Campus Isolation**: Students can only view, apply to, or match with students verified at the same university domain.
2. **Anti-Harassment Application Queue**: Rejected or pending applicants never see the identity of the accepted companion.
3. **Graceful Expiration**: Plans automatically expire once their scheduled time elapses, hiding the plan card from Discover and updating status badges in "My Plans".
