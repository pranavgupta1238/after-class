# Stage 3 — Authentication implementation

## Completion target

A valid NIIT University email receives a one-time code; successful verification creates or restores an anonymous account; the server sets an httpOnly session cookie; `/api/me` succeeds only for that session; invalid, expired, replayed, and revoked sessions are rejected.

## Local versus production transport

- Local development intentionally returns the OTP in the API response and logs it. This is solely to support automated/local testing.
- Production never returns or logs an OTP. It requires `RESEND_API_KEY` and sends a code from a verified Resend domain.
- Until Stage 4, OTP and session records use the temporary local store. Postgres/Redis replace it before public deployment.

## Security rules

- OTPs are generated cryptographically and stored only as a keyed hash.
- A code expires after 10 minutes, is single-use, and has per-email send and verification limits.
- JWT contains only subject, session version, issuer, audience, and expiry—no email or public alias.
- Logging out increments the account session version, invalidating all issued sessions for that account.
- Cookies are httpOnly and `secure` in production.

## Acceptance checks

- [ ] Unsupported email domain is rejected.
- [ ] Valid NIIT email receives a code only in development response.
- [ ] Wrong code is rejected and cannot be brute-forced.
- [ ] Valid code is single-use and produces a valid session.
- [ ] Logout makes `/api/me` return `401` with the old cookie.
- [ ] A suspended/banned account cannot obtain usable access.
