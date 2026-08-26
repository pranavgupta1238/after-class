# Stage 1 — NIIT University product design

This folder is the implementation contract for the first release of Afterclass at NIIT University. No later-stage feature should be treated as complete until it conforms to these documents.

## Launch scope

- First campus: **NIIT University**, verified only through `@niituniversity.in`.
- Future campuses are isolated tenants. Chat, discovery, moderation, and usernames never cross a campus boundary.
- Students are anonymous to one another by default. Staff may trace an account internally for safety and legal compliance.
- Launchable Phase 1 is verified anonymous campus chat with reports and moderation. Matching is Phase 2.

## Product decisions made for design

1. A student may choose a public display name only after a match reaches mutual reveal; it is optional and never shown in campus chat.
2. A match is created only when the request author accepts one applicant. Neither party sees applicant identities beforehand.
3. A reveal is mutual: one request + the other user's acceptance reveals each participant's opted-in display name to the other, only in that match.
4. University email, internal account ID, device/IP metadata, and moderation records are never returned in public API payloads.
5. Messages retain the username active when sent (`sender_alias`) so a later alias rotation does not rewrite history.
6. Public campus chat is campus-scoped. Private chat belongs to exactly one match.

## Assumptions requiring founder confirmation before public launch

- The person operating moderation has NIIT University approval and a published privacy policy/community guidelines.
- The supported student population includes all valid `@niituniversity.in` addresses; alumni/staff handling must be confirmed.
- Initial launch has one designated administrator and an emergency/safety contact.
- Real-name reveal is deliberately optional. The platform does not need nor should it collect government identity documents.

Read [schema.md](schema.md), [flows.md](flows.md), [api-contract.md](api-contract.md), and [architecture.md](architecture.md) in that order.
