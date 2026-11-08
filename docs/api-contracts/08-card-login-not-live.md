# Contract 08 — Card-Tap Web Login

> **Last synced with codebase:** 2026-11-08 · `routes/cardLogin_route.ts`, `server/app.ts`, `Frontend/public/card-login.html`
> The router is mounted at the API root to match the card-login page and admin endpoint paths. Apply migration `011_card_tokens.sql` to the deployed database before use.
> Envelope: [[API Contracts/00-conventions]] · Product rules: [[System Documentation#13. Card-Tap Web Login]]

The intended feature: an admin generates a private link for a student; the student opens it on a phone (e.g., via an NFC tag on the ID) and is signed in without typing a password.

| # | Method | Path | Access | Purpose |
|---|--------|------|--------|---------|
| 8.1 | POST | `/admin/card-token/:userId`, `/admin/card-login/:userId` | Admin | Create/replace a student's link |
| 8.2 | POST | `/auth/card-login` | Public (rate-limited) | Exchange link token for a session |

## 8.1 `POST /admin/card-token/:userId` (also `/admin/card-login/:userId`)

- Target must be an **active** user with role `student` or `team_leader`.
- Creates a 32-byte random token, stores only its SHA-256 hash, and **revokes every earlier token** for that user (one live link per student).
- The link is returned **once**: `{ "url": "<CARD_LOGIN_URL>#t=<token>" }` (token in the URL *fragment*, so it is not sent to servers or logged). `CARD_LOGIN_URL` defaults to a different Render host (`attendka-1.onrender.com`) than the API host.
- Requires `Authorization: Bearer <admin-session-token>`.

**Errors:** `400 invalid_user_id` · `404 user_not_found` · `400 students_only` · plus global codes. Success has **no `ok` field**.

## 8.2 `POST /auth/card-login`

**Request:** `{ "token": "<43-char base64url>" }`; length must be 40–100.
**Response `200`:** `{ "token": "v1.…" }` (normal 12-hour session token; no `ok`, no `user`). The page then stores it and opens `app.html`, which loads the profile via `GET /api/auth/me`.
**Errors:** `401 invalid_card` for malformed, unknown, revoked, or inactive-user tokens (identical code for all).
Rate limit: 30 **failed** attempts per 15 minutes per client IP (successful requests are not counted).

## Remaining considerations

1. Tokens have no expiry (`card_tokens.last_used_at` is recorded but never enforced).
2. A leaked link is a permanent password-equivalent until an admin regenerates it.
3. There is no admin dashboard control for generating links; admins can use the protected endpoint.
