# Stage 5 — Campus chatroom

## Implemented

- Socket.IO browser client connects with the authenticated httpOnly session cookie.
- Client loads protected message history before opening the live socket.
- Server authorizes campus-room membership from the verified account, never from client-provided identity.
- Server limits a user to 20 messages/minute, filters configured blocked words, persists messages, and broadcasts cleaned messages to the room.

## Remaining before Stage 5 is complete

- [ ] Replace temporary JSON message persistence with the Prisma `Message` / `ChatRoom` repositories.
- [ ] Add a functional report action on each message, using server-derived sender IDs.
- [ ] Verify live broadcast with two separate browser sessions.
- [ ] Add Redis-backed rate limiting and last-50 cache when deferred Stage 2 Redis is connected.
- [ ] Add chat integration tests against Postgres.

The current live socket server uses the Stage 3 temporary store. This is intentionally not a public-launch milestone until the Prisma adapter and two-user browser test are complete.
