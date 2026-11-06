# API Conventions

> **Last synced with codebase:** ATTENDKA-main.zip snapshot (2026-11-06) · source of truth: `Backend/src/**`
> Related: [[System Documentation]] · [[Wireframe & Flows]] · [[Implementation Tracker]] · [[List of Vulnerabilities]]

Rules that apply to **every** module contract. Individual contracts only restate what differs.

## Contract Index

| # | Contract | Covers | Endpoints |
|---|----------|--------|-----------|
| 00 | This file | Envelope, auth, errors, formats | — |
| 01 | [[API Contracts/01-auth-and-accounts]] | Register, login, profile, password, staff accounts | 10 |
| 02 | [[API Contracts/02-departments-and-events]] | Departments, school calendar, event lifecycle | 7 |
| 03 | [[API Contracts/03-rfid-devices-and-cards]] | Readers, heartbeat, cards, reader↔event assignments | 10 |
| 04 | [[API Contracts/04-scan-processing]] | Card tap → time-in / time-out | 1 |
| 05 | [[API Contracts/05-attendance-and-reports]] | Overview, reports, roster, manual edits, logs, live display | 10 |
| 06 | [[API Contracts/06-student-self-service]] | Own points, own events, points adjustments | 4 |
| 07 | [[API Contracts/07-directory-masterlists-teams]] | Student directory, photos, masterlists, teams, advisers | 22 |
| 08 | [[API Contracts/08-card-login-not-live]] | Card-tap web login — **file exists, route not mounted** | 2 |

Live endpoints: **64** (62 business + `GET /` + `GET /health/db`). Each endpoint is listed once, in the module that owns its business rule (e.g. `POST /admin/points` is in 06, `POST /admin/departments` is in 02).

## Base URL

| Environment | Base |
|-------------|------|
| Local | `http://localhost:5000` (port from `PORT`, default `5000`) |
| Frontend default | `https://attendka.onrender.com/api` (override with `window.ATTENDKA_API_BASE`) |

- All business routes live under `/api`. Admin-only routes live under `/api/admin`.
- Auth routes are additionally mounted at `/auth/*` (alias of `/api/auth/*`). Treat `/api/auth/*` as canonical.
- The server binds to `0.0.0.0`. Unknown paths return `404 not_found`.

## Access Levels

| Level | Meaning | How it is checked |
|-------|---------|-------------------|
| **Public** | No credential | — |
| **Login** | Any active account | `Authorization: Bearer <token>` |
| **Student** | Roles `student`, `team_leader` | Bearer + role check |
| **Staff** | Roles `admin`, `teacher` | Bearer + role check |
| **Teacher** | Role `teacher` only | Bearer + role check |
| **Admin** | Role `admin` only | Bearer + role check (all of `/api/admin/*`) |
| **Staff + Leader** | `admin`, `teacher`, `team_leader` | Bearer + role check |
| **Reader key** | An ESP32 reader, not a user | Header `x-device-key: <device_key>` |

Authentication rules:

1. Token format is `v1.<payload>.<signature>` (HMAC-SHA256, signed with `JWT_SECRET`, minimum 32 bytes). Lifetime **12 hours**. No refresh endpoint.
2. On **every** protected request the server re-reads the account: if it is inactive or missing → `401 account_inactive_or_not_found`. The role used for authorization is the **current database role**, not the role inside the token.
3. Tokens cannot be revoked individually; deactivating the account is the only kill switch.
4. A missing or non-`Bearer` header → `401 authentication_required`.

## Request Rules

- JSON only. `Content-Type: application/json`. Maximum body **32 KB** (larger bodies are not mapped to `413`; see [[#Known Envelope Gaps]]).
- CORS allow-list: `http://localhost:5173`, `http://127.0.0.1:5173`, `http://localhost:5500`, `http://127.0.0.1:5500`, plus comma-separated `FRONTEND_ORIGIN`. Allowed headers: `Authorization`, `Content-Type`, `X-Device-Key`. Allowed methods: `GET, POST, PUT, PATCH, DELETE, OPTIONS`.
- Path IDs must be positive safe integers; otherwise the endpoint returns its own `invalid_*_id` code (`400`).
- Strings are trimmed before storage where the endpoint says so. `email` is lower-cased on write.

## Standard Success Envelope

Every business success response is a JSON object with `"ok": true` and the payload fields **at the top level** (there is no `data` wrapper).

```json
{ "ok": true, "event": { "event_id": 12, "title": "Foundation Day" } }
```

| Pattern | Shape |
|---------|-------|
| Single record | `{ "ok": true, "<noun>": { … } }` |
| List | `{ "ok": true, "<plural noun>": [ … ] }` (no pagination metadata) |
| Action | `{ "ok": true, "deleted": true }` / `{ "ok": true, "message": "password_updated" }` |
| Create | Same as single record, HTTP `201` |

Lists are **hard-capped** and unpaginated: students 500, users 500, events 500, logs 500, report rows 10,000. Truncation is silent.

## Standard Error Envelope

```json
{ "ok": false, "error": "invalid_event", "message": "invalid_event" }
```

| Field | Rule |
|-------|------|
| `ok` | Always `false` |
| `error` | Machine-readable `snake_case` code (see catalog). Clients must branch on this, never on `message` |
| `message` | Present only on errors raised by the application; currently equal to `error` |

### Scan responses are different

`POST /api/scan` and `POST /api/reader/heartbeat` report device outcomes with a `result` field (`{ "ok": false, "result": "bad_device" }`). See [[API Contracts/04-scan-processing]]. Note that `no_event` returns `ok: true` while `unknown_card` returns `ok: false`, both with HTTP `200`.

## HTTP Status Usage

| Status | Used for |
|--------|----------|
| `200` | Success (including most scan outcomes) |
| `201` | Record created |
| `204` | CORS preflight only |
| `400` | Validation failed, or a referenced record does not exist (FK violation) |
| `401` | Missing/invalid/expired token, inactive account, bad reader key, bad login |
| `403` | Role not allowed, teacher scope violation, paused reader |
| `404` | Record not found (or not visible to the caller, for some scoped queries) |
| `409` | Unique value already exists, or an assignment changed mid-request |
| `500` | Unhandled error |

## Global Error Catalog

Raised by shared middleware, so any endpoint can return them.

| Code | HTTP | Cause |
|------|------|-------|
| `authentication_required` | 401 | No `Authorization: Bearer` header |
| `invalid_token` | 401 | Token malformed, wrong version, or signature mismatch |
| `invalid_or_expired_token` | 401 | Token expired, or claims invalid |
| `account_inactive_or_not_found` | 401 | Account deleted or `is_active = false` |
| `forbidden` | 403 | Authenticated role is not allowed on this route |
| `not_found` | 404 | No such route |
| `invalid_json` | 400 | Body is not parseable JSON |
| `already_exists` | 409 | PostgreSQL unique violation (`23505`) — username, email, student number, employee number, card UID, department code, duplicate team member, etc. The response does **not** say which field |
| `invalid_reference_or_value` | 400 | PostgreSQL FK/check/data-format violation (`23503`, `23514`, class `22`) — e.g. unknown `department_id`, `student_id`, `event_id` |
| `server_error` | 500 | Anything else; detail is only in the server log |

## Data Formats

| Type | Rule |
|------|------|
| Datetime input | ISO 8601 string. **Send an explicit offset** (`2026-10-20T09:00:00+08:00`). The server only checks that `Date.parse` accepts the string; an offset-less value is interpreted by the database, not rejected |
| Datetime output | `timestamptz` serialised as ISO 8601 UTC. Event timestamps in `GET /events*` are returned as stored; student-facing `/students/me/events` returns normalised instants |
| Date-only | `YYYY-MM-DD`, must be a real calendar day, else `400 valid_date_required` |
| School time zone | `ATTENDANCE_TIME_ZONE`, default `Asia/Manila`. "Today", daily rosters, and reader assignments use it. A local day is `[00:00, next 00:00)` |
| School year | `^\d{4}-\d{4}$` (e.g. `2026-2027`); the second year is **not** checked against the first |
| Card UID | Trimmed, whitespace/`:`/`-` removed, upper-cased, 1–50 chars |
| Role | `student`, `teacher`, `admin`, `team_leader` |
| Event type | `academic`, `seminar`, `sports`, `intramurals`, `meeting`, `holiday`, `other` |
| Event status | `pending`, `ongoing`, `moved`, `done`, `cancelled` |
| Attendance status | `present`, `late`, `absent`, `excused` |
| Reader mode | `auto`, `time_in`, `time_out` |
| Card status | `active`, `inactive`, `lost`, `blocked` |
| Semester | `1st`, `2nd`, `summer` |

## Teacher Scoping

A `teacher` account is bound to one department and optionally one year level (`teachers.department_id`, `teachers.year_level`; `NULL` year = all years). Staff endpoints that say **teacher-scoped** silently filter to that department and year. A teacher account with no teacher profile row gets `403 teacher_profile_not_found`.

## Known Envelope Gaps

These deviate from the "standard" envelope and are tracked in [[Implementation Tracker#Decisions Log]]:

1. Body larger than 32 KB → returns `500 server_error` (not `413`).
2. `unknown_card`/`inactive_card` scan results use HTTP `200` with `ok: false`.
3. `POST /auth/password` with a wrong current password returns `400`, not `401`.
4. Card-login endpoints ([[API Contracts/08-card-login-not-live]]) return bare objects without `ok`, and are not mounted.
5. `already_exists` and `invalid_reference_or_value` do not identify the offending field.
