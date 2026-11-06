# ATTENDKA — List of Vulnerabilities (Current System)

> **Last synced with codebase:** `ATTENDKA-main.zip` snapshot, 2026-11-06
> Companion docs: [[System Documentation]] · [[Implementation Tracker]] (phase P7 holds the fix backlog) · [[API Contracts/00-conventions]] · [[Wireframe & Flows]]

## Scope and method

- **Method:** static review of the code in the zip (backend routes, middleware, services, migrations, frontend scripts, ESP32 firmware). Nothing was executed, deployed, or penetration-tested; the live Render deployment was **not** touched.
- **Not reviewable:** the base database schema, database roles/privileges, the Render configuration, and `.env` values. Findings that depend on them are marked *unverified*.
- **Secrets:** the committed Wi-Fi password is deliberately **not** reproduced here.
- **Severity** uses likelihood × impact for a school deployment holding minors' names, photos, and attendance:

| Severity | Meaning |
|----------|---------|
| **Critical** | Secret or access exposure that is already effective |
| **High** | Realistic abuse with significant data or availability impact |
| **Medium** | Needs a precondition, or limited impact |
| **Low** | Hardening / defence in depth |

## Summary

| ID | Finding | Severity | Area | Status |
|----|---------|----------|------|--------|
| [[#V-01]] | Wi-Fi credentials committed in firmware source | **Critical** | Firmware / repo | Open |
| [[#V-02]] | Student photo files committed to the repository | **High** | Privacy / repo | Open |
| [[#V-03]] | No rate limiting or lockout on login, register, scan | **High** | Backend | Open |
| [[#V-04]] | Reader keys stored in plain text and sent over plain HTTP | **High** | Device auth | Open |
| [[#V-06]] | Teachers can read other departments' students on school-wide events | **High** | Access control | Open |
| [[#V-05]] | Tokens cannot be revoked and live in `localStorage` | Medium | Session | Open |
| [[#V-08]] | Card-tap login: unmounted but risky if enabled | Medium | Auth (latent) | Open |
| [[#V-09]] | Card UID alone authenticates a student | Medium | Physical | Open |
| [[#V-10]] | Self-registration accepts any student number | Medium | Identity | Open |
| [[#V-11]] | Manual edits are unaudited and can leave inconsistent data | Medium | Integrity | Open |
| [[#V-12]] | API creates tables at runtime (DDL privilege needed) | Medium | Least privilege | Open |
| [[#V-13]] | A failed first schema lookup is cached forever | Medium | Availability | Open |
| [[#V-14]] | Photo size vs body limit; heavy photo polling | Medium | Availability | Open |
| [[#V-15]] | Silent truncation of lists and reports | Medium | Integrity | Open |
| [[#V-16]] | Taps lost when Wi-Fi drops; no retry | Medium | Reliability | Open |
| [[#V-19]] | Event deletion is permanent with unverified cascades | Medium | Integrity | Open |
| [[#V-21]] | No security headers / HTTPS / proxy configuration | Medium | Transport | Open |
| [[#V-07]] | Public unauthenticated event and health endpoints | Low | Exposure | Open |
| [[#V-17]] | Validation gaps | Low | Input | Open |
| [[#V-18]] | Weak password policy; account enumeration | Low | Auth | Open |
| [[#V-20]] | No tests, missing schema, dead code, unused dependencies | Low | Supply chain / maintainability | Open |

**Totals:** 1 Critical · 4 High · 12 Medium · 4 Low (21 findings). Non-security defects are listed separately in [[#Functional defects that affect trust]].

---

## Critical

### V-01
**Wi-Fi credentials committed in firmware source**

| | |
|---|---|
| **Where** | `PlatformIO/Projects/rfid/src/main.cpp`, constants `WIFI_SSID` / `WIFI_PASS` (lines 15–16) |
| **Evidence** | A real-looking network name and password are in plain text. The API URLs and device key right next to them are placeholders, so the secrets were clearly meant to be edited per site but were committed with live values |
| **Impact** | Anyone with the zip or repository can join the school or lab network the reader uses; the secret also persists in git history and every clone/download |
| **Fix** | Treat the password as compromised and change it. Move network and key settings out of source (build flags from an untracked `secrets.h`, or a provisioning portal). Purge from history if the repo was ever shared |

## High

### V-02
**Student photo files committed to the repository**

| | |
|---|---|
| **Where** | `Frontend/images/students/` (11 image files named by first name) |
| **Evidence** | The README says this folder is git-ignored, but the files are in the archive. The application no longer reads them (photos come from `users.photo`) |
| **Impact** | Personal images of (likely minor) students are distributed with the source. Privacy and legal exposure |
| **Fix** | Delete from the repo and history, add an ignore rule, and confirm consent/retention for the stored photos |

### V-03
**No rate limiting or lockout on login, registration, scan, or heartbeat**

| | |
|---|---|
| **Where** | `server/app.ts` (no limiter); `express-rate-limit` is imported only in the unmounted `cardLogin_route.ts` |
| **Impact** | Unlimited password guessing on `/api/auth/login`; open registration lets a script flood `users`/`students` and burn CPU (scrypt hashing is deliberately slow); `/api/scan` can be hammered with random UIDs, each writing an `attendance_logs` row |
| **Fix** | Per-IP and per-account limits on login/register; limits per reader key on scan/heartbeat; set `trust proxy` so limits see real client IPs ([[#V-21]]); consider CAPTCHA or admin approval on registration |

### V-04
**Reader device keys stored in plain text and transmitted over HTTP**

| | |
|---|---|
| **Where** | `rfid_readers.device_key` looked up by equality in `routes/attendance_route.ts`; firmware uses `http://` URLs and a plain `WiFiClient` |
| **Impact** | Whoever can sniff the LAN gets the key and every card UID (UIDs are the student credential — see [[#V-09]]) and can forge scans or replay taps. A database leak exposes all keys at once |
| **Fix** | Serve the API over HTTPS only and use TLS on the ESP32 with certificate pinning; store a hash of the key; add key rotation; bind keys to expected source network if possible |

### V-06
**Teachers can read other departments' students on school-wide events**

| | |
|---|---|
| **Where** | `GET /api/events/:eventId/attendance` in `routes/attendance_route.ts` ([[API Contracts/05-attendance-and-reports#5.4 `GET /api/events/:eventId/attendance`]]) |
| **Evidence** | For a teacher the code checks only that the *event* is school-wide or in the teacher's department; the returned student rows are not filtered by the teacher's department or year level, unlike every other staff endpoint |
| **Impact** | Broken access control: a teacher of one department sees names, student numbers, times, and remarks for all departments on any school-wide event |
| **Fix** | Join `students` and apply the same department/year predicate used by the roster and report endpoints; add an automated scope test |

---

## Medium

### V-05
**Session tokens: no revocation, stored in `localStorage`**

| | |
|---|---|
| **Where** | `Frontend/js/api.js`, `auth.js` (`ptci_access_token`); `services/auth_service.ts` (stateless 12 h token); `POST /auth/password` |
| **Impact** | Any XSS (even a future one — the dashboard builds HTML strings with manual per-field escaping in dozens of places) steals a 12-hour admin session. Changing a password or "signing out" does not invalidate stolen tokens; only deactivating the account does |
| **Mitigations present** | Role and active state are re-read from the database every request |
| **Fix** | Shorter lifetime + refresh, a token-version column checked at each request, or HttpOnly cookies; add a strict Content-Security-Policy ([[#V-21]]); centralise output escaping |

### V-08
**Card-tap login: unmounted, but risky if switched on as written**

| | |
|---|---|
| **Where** | `routes/cardLogin_route.ts`, `Frontend/public/card-login.html`; see [[API Contracts/08-card-login-not-live]] |
| **Impact if enabled** | Links never expire, so a photographed or forwarded link is a permanent password; the limiter is keyed by IP behind a proxy (all users may share one bucket); the `card_tokens` table has no migration; the link host differs from the API host |
| **Impact today** | The page's request returns `404`; the unused route and rate-limit code add confusion |
| **Fix** | Decide: delete the feature, or add expiry/one-time use, per-device binding, an admin revoke screen, and a migration before mounting |

### V-09
**A card UID alone authenticates a student**

| | |
|---|---|
| **Where** | Firmware reads only the UID; `POST /api/scan` trusts it |
| **Impact** | ISO 14443A UIDs can be read from a few centimetres away and emulated by phones or "magic" cards; friends can also tap for each other (proxy attendance). Points are earned on each accepted time-in |
| **Fix** | Use cards with authenticated secure sectors/DESFire; compare the live display photo against the person at the reader; anomaly checks (same card at two readers); keep the staff photo screen as the deterrent |

### V-10
**Self-registration accepts any student number and department**

| | |
|---|---|
| **Where** | `POST /api/auth/register` ([[API Contracts/01-auth-and-accounts#1.3 `POST /api/auth/register`]]) |
| **Impact** | A person can register under someone else's student number (blocking the real student with `409`) or into any department; admins later assign cards by `student_id`, so a wrong identity silently inherits attendance and points |
| **Fix** | Pre-load official student numbers (or reuse masterlists) and require a match or admin approval; verify email |

### V-11
**Manual edits are unaudited and can leave inconsistent data**

| | |
|---|---|
| **Where** | `PUT /api/admin/events/:e/students/:s/attendance`, `PATCH /api/admin/attendance/:id` ([[API Contracts/05-attendance-and-reports]]) |
| **Evidence** | No editor/timestamp/previous-value is stored. Switching to `absent`/`excused` keeps old times; the live display and some views then still show a check-in. Edits are allowed on cancelled/future events. When only one time is sent it is not compared to the other stored time. Points are neither awarded nor reversed, so the ledger and status can disagree; manual points have no cap or undo |
| **Impact** | A teacher (or a compromised teacher account) can quietly change records; reports and the points ledger can contradict each other with no trail |
| **Fix** | Append-only `attendance_audit` (who, when, old/new); clear or validate times on status change; block edits on `cancelled` events; compensating ledger entries |

### V-12
**API creates tables at runtime (needs DDL privilege)**

| | |
|---|---|
| **Where** | `POST /api/admin/attendance/live/reset` creates `attendance_live_display_state` if missing; `GET /attendance/recent` and `/overview` query `information_schema` on every call |
| **Impact** | The application's database user must be allowed to run DDL, so any SQL injection or code flaw has schema-level reach; extra catalog queries every 3 s per kiosk |
| **Fix** | Create the table only via migration 008, give the app role DML-only rights, remove runtime DDL |

### V-13
**A failed first schema lookup is cached forever**

| | |
|---|---|
| **Where** | `utils/zonedDateRange.ts` — a module-level map stores the *promise* of the column-type lookup |
| **Evidence** | If the first lookup fails (e.g., brief DB hiccup at start-up), the rejected promise stays in the map. Every endpoint that uses it (overview, report, scan, admin queries) then fails until the process restarts |
| **Impact** | Self-inflicted outage; scans return `500` and taps are lost until a restart |
| **Fix** | Evict the cache entry on rejection, or resolve the column types once at boot |

### V-14
**Photo size exceeds the body limit; heavy photo polling**

| | |
|---|---|
| **Where** | `server/app.ts` (`express.json` limit 32 KB) vs photo cap of 300,000 characters in `PUT /admin/students/:userId/photo`; `GET /attendance/recent` returns each photo inline |
| **Impact** | Uploads above ~32 KB return `500 server_error` instead of `413`/`invalid_photo`; the dashboard's resize usually fits but borderline photos fail unpredictably. Conversely, if the limit is raised, the live display pulls up to 5 photos (potentially hundreds of KB) every 3 seconds per kiosk, and `/auth/me` returns the photo for every profile load |
| **Fix** | Map body-too-large to `413`; raise the limit only on the photo route; store photos as files/objects and return URLs with caching |

### V-15
**Silent truncation of lists and reports**

| | |
|---|---|
| **Where** | Hard caps: students 500, users 500, events 500, logs 500, report rows 10,000; no pagination or "truncated" flag |
| **Impact** | A school with more than 500 students cannot see everyone in the directory without filters; a report or CSV over 10,000 rows is incomplete while its summary totals include the missing rows — an easy source of wrong decisions |
| **Fix** | Pagination + total counts; return `truncated: true`; stream CSV server-side |

### V-16
**Taps lost when Wi-Fi drops**

| | |
|---|---|
| **Where** | Firmware: "WiFi offline / Scan not sent" path in `main.cpp` |
| **Impact** | Students at an event during a network outage are marked absent; there is no queue, retry, or later sync |
| **Fix** | Local ring-buffer queue with timestamps and a replay endpoint (server-side idempotency by reader, UID, and timestamp) |

### V-19
**Event deletion is permanent; cascade effects are unverified**

| | |
|---|---|
| **Where** | `DELETE /api/events/:eventId` hard-deletes |
| **Evidence** | Migrations show cascades for assignments and personal checklist rows; behaviour for `event_attendance` and `attendance_points` depends on the base schema, which is not in the repository |
| **Impact** | Either deletion fails with a generic `400`, or historical attendance and points disappear with the event |
| **Fix** | Soft-delete (or forbid deletion once attendance exists); document and test the foreign-key rules |

### V-21
**No security headers, HTTPS enforcement, or proxy configuration**

| | |
|---|---|
| **Where** | `server/app.ts` — no `helmet`, no HSTS/CSP, no `trust proxy`; frontend served as static files |
| **Impact** | Clickjacking and MIME-sniffing protections are absent; no CSP to contain XSS; behind Render, client IPs are the proxy's, which breaks any future rate limit; nothing forces HTTPS for the device |
| **Fix** | Add `helmet` with a CSP tuned to the dashboard, HSTS, `trust proxy`, and HTTPS-only reader URLs |

---

## Low

### V-07
**Public unauthenticated endpoints**

| | |
|---|---|
| **Where** | `GET /api/events`, `GET /api/events/:id`, `GET /health/db`, `GET /api/departments` |
| **Evidence** | Event reads return internal fields (`created_by` user id, status notes, attendance flags) with no token; `/health/db` reveals database state |
| **Impact** | Reconnaissance (user ids of event creators, internal scheduling); scraping up to 500 events per call |
| **Fix** | Require login for the full event record, expose a reduced public projection; restrict health checks to the platform |

### V-17
**Validation gaps**

| Gap | Where | Effect |
|-----|-------|--------|
| Offset-less datetimes accepted | Events create/update | Events can shift by hours depending on database session time zone |
| Email format never validated; `""` stored as empty (not `NULL`) | Register, profile edit, admin edit | Unusable emails; two empty emails collide with `409` |
| `venue` and `description` not length-checked on create | `POST /events` | Oversized text or database errors |
| `points` has no upper bound | Events, manual points | Absurd awards or deductions |
| `section` ≤ 20 at registration but ≤ 30 on edit | Auth vs admin edit | Inconsistent data |
| `school_year` second year not checked | Masterlists, teams | `2026-2030` accepted |
| `year_level` 1–10 on server vs 1–5 in UI | All | Out-of-range values possible by API |
| Conflict errors do not name the field | `already_exists` | Poor UX; (also see [[#V-18]]) |

### V-18
**Weak password policy and account enumeration**

| | |
|---|---|
| **Where** | Password rules (8–200, no complexity/breach check); admin-created accounts keep admin-chosen passwords with no forced change; register returns `409 already_exists` |
| **Impact** | Weak passwords are accepted; registration can be used to test whether a username, email, or student number exists |
| **Mitigations present** | Login returns one generic `invalid_credentials`; hashes are salted scrypt |
| **Fix** | Minimum length 12 for staff, common-password check, forced change on first login, generic conflict responses |

### V-20
**No tests, missing schema, dead code, unused dependencies**

| | |
|---|---|
| **Evidence** | `npm test` has no test files; the base schema is absent and `Backend/.gitignore` lists `database`; `package.json` includes `prisma`/`@prisma/client` and `nodemon` that the code never uses; `controllers/authController/users_Auth.ts` duplicates auth logic with weaker validation and is not routed; `EARLY_WINDOW_MIN` and `GET /admin/overview` are unused; dependency versions are very new (`typescript ^7`, `@types/node ^26`) and not audited |
| **Impact** | Regressions go unnoticed (e.g., the card-login route and firmware reason codes drifted unnoticed); larger supply-chain surface; hard to rebuild the database |
| **Fix** | Commit a baseline schema; tests for scan rules, scope, and validation; CI with `npm audit`; remove dead code |

---

## Functional defects that affect trust

Not security issues, but they produce wrong or confusing information (details in [[Implementation Tracker#Decisions Log]]).

| # | Defect | Where | Effect |
|---|--------|-------|--------|
| F-1 | Firmware looks for `no_event` reasons the backend never sends (D-14) | Firmware vs `/scan` | LCD always says "No event assigned" even when attendance is simply closed |
| F-2 | Live display shows "Present" for an absent/excused record that still has a time-in (D-22) | `attendance-display.js` | Misleading kiosk |
| F-3 | Student sees "Done" instead of "Absent" for finished events they missed (D-22) | `/students/me/events` | Missed attendance is hidden from the student |
| F-4 | Dashboard counters mix event sets: present/late/excused (any event today) vs absent (ended/open events) | `/attendance/overview` | Numbers do not add up to the roster |
| F-5 | An `excused` mark is overwritten by a later tap | Scan flow | Excuses can be lost silently |
| F-6 | README drift: time window, second-tap time-out, photo storage, `limit=5` (D-07, D-08, D-11, D-17) | READMEs | Operators follow wrong instructions |
| F-7 | Legacy `GET /admin/overview` uses UTC day and raw timestamps | `routes/admin_route.ts` | Different "today" than the dashboard |
| F-8 | Reader "online" window (65 s) vs 20 s heartbeat: three missed beats show Offline | Admin readers list | Flapping status on a weak Wi-Fi |

## Positive controls observed

Included so the list is balanced and so these are not accidentally removed.

- In the routes reviewed, user-supplied values are passed to SQL as parameters; dynamic SQL fragments are built only from fixed strings.
- Passwords are salted scrypt hashes with timing-safe comparison; login failures return one generic `invalid_credentials`.
- Token signature compared in constant time; role and active state re-checked on every request.
- Every `/api/admin/*` route sits behind one admin guard; teacher scope is applied server-side on directory, reports, and edits (except [[#V-06]]).
- Scan processing runs in a transaction with row locks, a 60 s double-tap guard, and a stored audit log.
- Output in the dashboard is escaped with a helper (`escapeHtml`) and CSV cells neutralise formula characters.
- Card-login (when mounted) stores only a SHA-256 hash and returns the link once.
- Photo uploads accept only JPEG/PNG/WebP data URLs (no SVG).

## Recommended remediation order

1. **Today:** V-01 (rotate Wi-Fi), V-02 (remove photos), V-06 (scope fix).
2. **This sprint:** V-03, V-21 (limits, headers, proxy), V-13 (cache bug), V-14 (photo/body), V-04 (HTTPS + hashed keys).
3. **Next:** V-11, V-15, V-16, V-10, V-05, V-09, V-12, V-19.
4. **Cleanup:** V-07, V-17, V-18, V-20, V-08 (decide), and the functional defects above.

Track completion in [[Implementation Tracker#P7 — Security Hardening]].
