# API contract — v1

All protected routes require the httpOnly `session` cookie. Public payloads never include `user.id`, email, orientation, or other students' internal identifiers. Error body is `{ "error": "human readable message" }`.

## Authentication

| Method / path | Input | Success |
|---|---|---|
| POST `/api/auth/send-otp` | `{ email }` | `200 { campus }`; 3 per hour/email |
| POST `/api/auth/verify-otp` | `{ email, code, onboarding? }` | `200 { user }`, sets cookie |
| POST `/api/auth/logout` | — | `200 { ok:true }`, clears cookie |
| GET `/api/me` | — | `200 { user }` |

## Chat

| Method / path | Input | Success |
|---|---|---|
| GET `/api/rooms/campus/messages?cursor=` | — | `{ messages, nextCursor }` |
| GET `/api/matches/:matchId/messages?cursor=` | — | `{ messages, nextCursor }` |
| Socket `message:send` | `{ roomId, content }` | ack `{ message }` |
| Socket `message:new` | server event | `{ message }` |

The server determines sender and campus from the session. It never accepts sender IDs from the client.

## Matching

| Method / path | Input | Success |
|---|---|---|
| GET `/api/match-requests` | query filters only | `{ requests, nextCursor }` |
| POST `/api/match-requests` | activity, location, scheduledAt, preferences | `{ request }` |
| POST `/api/match-requests/:id/applications` | — | `{ application }` |
| GET `/api/match-requests/mine/applications` | — | count/status only, aliases hidden |
| POST `/api/applications/:id/accept` | — | `{ match }` |
| POST `/api/matches/:id/cancel` | `{ reason? }` | `{ match }` |
| POST `/api/matches/:id/complete` | `{ attended }` | `{ match }` |

## Reveal, reports, moderation

| Method / path | Input | Success |
|---|---|---|
| POST `/api/matches/:id/reveal` | `{ decision: 'accept'|'decline' }` | `{ status, mutualReveal }` |
| POST `/api/reports` | reported public target token/message ID, reason, detail? | `{ report }` |
| GET `/api/admin/reports` | admin session | `{ reports }` |
| POST `/api/admin/actions` | user ID, action, reason, endAt? | `{ action }` |

## Status codes

`400` invalid input, `401` unauthenticated, `403` forbidden, `404` not visible/not found, `409` invalid state transition, `429` rate limited, `500` unexpected server failure.
