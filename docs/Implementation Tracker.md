# ATTENDKA — Implementation Tracker

> **Last synced with codebase:** `ATTENDKA-main.zip` snapshot, 2026-11-06
> Companion docs: [[System Documentation]] · [[Wireframe & Flows]] · [[API Contracts/00-conventions]] · [[List of Vulnerabilities]]

## How to read this tracker

| Icon | Meaning |
|------|---------|
| ✅ | Present in the codebase and behaving as documented. *No automated tests exist, so nothing here is test-verified.* |
| 🟨 | Works but incomplete, or has a known defect (see Notes) |
| ⬜ | Not started — a gap, recommendation, or hardening task |
| ⛔ | Blocked: code exists but is unreachable or cannot work as shipped |

Phases are **retrospective**: the repository has no roadmap, so work is grouped by product capability and ordered by dependency (the migration numbers `002`→`009` show the real build order: RFID assignments → checklist → lifecycle → venue → repair → heartbeat → live reset → attendance switch). Phase P7 is the proposed hardening backlog derived from [[List of Vulnerabilities]].


## Progress Summary

| Phase | Name | Items | ✅ | 🟨 | ⬜ | ⛔ | % complete |
|-------|------|------:|---:|---:|---:|---:|-----------:|
| P0 | Foundation & Delivery | 10 | 4 | 3 | 3 | 0 | 40% |
| P1 | Accounts & Access | 13 | 9 | 1 | 3 | 0 | 69% |
| P2 | Events & Calendar | 8 | 5 | 0 | 3 | 0 | 62% |
| P3 | RFID Devices & Firmware | 13 | 6 | 1 | 6 | 0 | 46% |
| P4 | Attendance Operations | 9 | 4 | 2 | 3 | 0 | 44% |
| P5 | Reporting, Dashboards & Live Display | 7 | 1 | 4 | 2 | 0 | 14% |
| P6 | Groups, Points & Student Portal | 9 | 5 | 2 | 2 | 0 | 56% |
| P7 | Security Hardening | 11 | 0 | 0 | 11 | 0 | 0% |
| P8 | Blocked / Not Live | 5 | 0 | 0 | 0 | 5 | 0% |
| **All** | | **85** | **34** | **13** | **33** | **5** | **40%** |

- **Product capability (P0–P6, P8):** 74 items — 34 ✅, 13 🟨, 22 ⬜, 5 ⛔ → **46% fully done**, 64% at least working.
- **Core attendance loop** (register → assign card → open attendance → tap → report) is functional end to end; the gaps are in safety, polish, and missing admin tooling.
- **Top blockers before a production launch:** V-01 (committed Wi-Fi secret), V-06 (teacher data leak), V-03 (no rate limiting), and the base schema missing from source control (0.7).
- Percentages count items equally; they are a coverage indicator, not an effort estimate.

## P0 — Foundation & Delivery

*Project skeleton, configuration, schema management, quality gates*

| # | Item | Status | Notes / evidence | Ref |
|---|------|:------:|------------------|-----|
| 0.1 | Express 5 + TypeScript (ESM) API skeleton, graceful shutdown | ✅ | `server/app.ts`, `server.ts`; closes HTTP server and DB pool on SIGINT/SIGTERM | [[System Documentation#Overview]] |
| 0.2 | PostgreSQL pool via `DATABASE_URL` or discrete vars, optional SSL | ✅ | `config/db.ts`; `DATABASE_SSL=true` enables certificate checking | [[System Documentation#Overview]] |
| 0.3 | Environment validation (`JWT_SECRET` ≥ 32 bytes, DB vars) | 🟨 | Secret length is checked lazily on the first token operation, so a weak secret surfaces as `500` at first login, not at boot | [[API Contracts/00-conventions#Access Levels]] |
| 0.4 | CORS allow-list (+ `FRONTEND_ORIGIN`) | ✅ | Dev origins hard-coded; production origin must be supplied via env | [[API Contracts/00-conventions#Request Rules]] |
| 0.5 | Uniform success/error envelope and central error handler | 🟨 | Body > 32 KB returns `500`, not `413`; conflict errors do not name the field | [[API Contracts/00-conventions#Known Envelope Gaps]] |
| 0.6 | Idempotent migrations 002–009 | ✅ | Run in order; 006 repairs 002/004 gaps; 008's table is also created at request time | [[System Documentation#Cross-Cutting Rules]] |
| 0.7 | Base schema (migration 001 / DDL) in the repository | ⬜ | Not present; migrations assume tables `users`, `students`, `events`, `event_attendance`, … already exist; `Backend/.gitignore` also ignores `database` | [[List of Vulnerabilities#V-20]] |
| 0.8 | Automated tests (unit/integration) for scan, scope, validation | ⬜ | `npm test` finds no test files | [[List of Vulnerabilities#V-20]] |
| 0.9 | CI pipeline, dependency audit, lint | ⬜ | No workflow files | [[List of Vulnerabilities#V-20]] |
| 0.10 | Deployment configuration as code | 🟨 | Render hostnames hard-coded in `api.js`, `card-login.html`, `cardLogin_route.ts`; no Dockerfile/Render blueprint | [[Wireframe & Flows#Route Map]] |

## P1 — Accounts & Access

*Identity, roles, scope, department directory*

| # | Item | Status | Notes / evidence | Ref |
|---|------|:------:|------------------|-----|
| 1.1 | Student self-registration with profile row (transactional) | ✅ | Limits and error codes in contract | [[API Contracts/01-auth-and-accounts]] |
| 1.2 | Login by username or email; scrypt-hashed passwords | ✅ | Constant `invalid_credentials` for all failures | [[System Documentation#1. Authentication & Sessions]] |
| 1.3 | Signed 12 h bearer token with per-request account + role re-check | ✅ | No refresh, no revocation | [[API Contracts/00-conventions#Access Levels]] |
| 1.4 | Role guards (student / teacher / admin / reader key) | ✅ | All `/api/admin/*` behind one admin guard | [[API Contracts/00-conventions#Access Levels]] |
| 1.5 | Profile view, staff profile edit, password change | ✅ | Students cannot edit profile; password change does not end other sessions | [[API Contracts/01-auth-and-accounts]] |
| 1.6 | Admin bootstrap script (`npm run create-admin`) | ✅ | Password ≥ 12 chars | [[API Contracts/01-auth-and-accounts]] |
| 1.7 | Admin creates teacher/admin accounts; search accounts | ✅ | Teacher needs employee no., department; optional year | [[System Documentation#2. Account & Department Administration]] |
| 1.8 | Activate / deactivate accounts | 🟨 | API done; **no UI control** | [[Wireframe & Flows#Functions with API but no screen]] |
| 1.9 | Departments: create + public list | ✅ | Cannot rename or deactivate via API | [[API Contracts/02-departments-and-events]] |
| 1.10 | Teacher department/year scope management | ✅ | `PATCH /admin/teachers/:id/department` | [[API Contracts/07-directory-masterlists-teams]] |
| 1.11 | Login/registration rate limiting and lockout | ⬜ | `express-rate-limit` is installed but only used by the unmounted card-login route | [[List of Vulnerabilities#V-03]] |
| 1.12 | Password reset, email verification, forced first-login change | ⬜ | No email integration | [[List of Vulnerabilities#V-18]] |
| 1.13 | Registration identity check (match student no. to an official list) | ⬜ | Any value is accepted and then blocks the real student | [[List of Vulnerabilities#V-10]] |

## P2 — Events & Calendar

*School calendar, lifecycle, attendance gate*

| # | Item | Status | Notes / evidence | Ref |
|---|------|:------:|------------------|-----|
| 2.1 | Event create / read / update / delete | ✅ | Admin-only writes; public reads | [[API Contracts/02-departments-and-events]] |
| 2.2 | Lifecycle status (`pending`…`cancelled`) with status note | ✅ | No transition rules | [[System Documentation#4. Events & School Calendar]] |
| 2.3 | Explicit attendance open/close switch (migration 009) | ✅ | Gate for time-in; time-out survives close | [[Wireframe & Flows#Flow 4 — Event lifecycle and the attendance gate]] |
| 2.4 | School-local date, overlap, department, type filters | ✅ | Detects `timestamp` vs `timestamptz` column type | [[API Contracts/02-departments-and-events]] |
| 2.5 | Calendar UI: admin controls; student/teacher read-only | ✅ | Rectangular event cards per month | [[Wireframe & Flows#Wireframe 6 — Events (admin)]] |
| 2.6 | Enforce UTC offset on event datetimes | ⬜ | Offset-less strings pass validation | [[List of Vulnerabilities#V-17]] |
| 2.7 | Lifecycle transition rules and server-side coupling of status ↔ attendance_open | ⬜ | Frontend sets `attendance_open=false` itself on done/moved/cancelled | [[Implementation Tracker#Decisions Log]] |
| 2.8 | Soft delete / safeguards for events that have attendance | ⬜ | Delete is permanent | [[List of Vulnerabilities#V-19]] |

## P3 — RFID Devices & Firmware

*Readers, cards, assignments, ESP32*

| # | Item | Status | Notes / evidence | Ref |
|---|------|:------:|------------------|-----|
| 3.1 | Reader registry; one-time device key | ✅ | Key never retrievable | [[API Contracts/03-rfid-devices-and-cards]] |
| 3.2 | Heartbeat (20 s) and Online/Offline (65 s) indicator | ✅ | Dashboard polls every 15 s | [[System Documentation#5. RFID Readers, Cards & Assignments]] |
| 3.3 | Pause/resume and delete reader | ✅ | Logs kept on delete | [[API Contracts/03-rfid-devices-and-cards]] |
| 3.4 | Card assign / reassign / unassign / status | ✅ | Cards bound to `student_id`; UID unique | [[API Contracts/03-rfid-devices-and-cards]] |
| 3.5 | Per-date reader→event assignment with `auto`/`time_in`/`time_out` | ✅ | Overwrite only | [[API Contracts/03-rfid-devices-and-cards]] |
| 3.6 | Remove an assignment | ⬜ | No endpoint; only overwrite | [[API Contracts/03-rfid-devices-and-cards]] |
| 3.7 | ESP32 firmware: read UID, post scan, LCD, buzzer, heartbeat | ✅ | PN5180 + I²C LCD | [[System Documentation#14. Reader Firmware (ESP32)]] |
| 3.8 | Firmware understands backend `no_event` reasons | 🟨 | Firmware expects 3 reason codes the backend never sends | [[API Contracts/04-scan-processing]] |
| 3.9 | Remove Wi-Fi credentials from firmware source; rotate; external config | ⬜ | Credentials committed in plain text | [[List of Vulnerabilities#V-01]] |
| 3.10 | HTTPS between reader and API | ⬜ | Plain HTTP, key and UID in clear | [[List of Vulnerabilities#V-04]] |
| 3.11 | Offline queue and retry for taps | ⬜ | Taps are lost when Wi-Fi is down | [[List of Vulnerabilities#V-16]] |
| 3.12 | Hash device keys at rest | ⬜ | Stored and compared in plain text | [[List of Vulnerabilities#V-04]] |
| 3.13 | Stronger card authentication than UID alone | ⬜ | UID can be cloned | [[List of Vulnerabilities#V-09]] |

## P4 — Attendance Operations

*Scan engine, corrections, audit*

| # | Item | Status | Notes / evidence | Ref |
|---|------|:------:|------------------|-----|
| 4.1 | Scan: time-in with 15-minute late rule, points at time-in | ✅ | Transactional | [[API Contracts/04-scan-processing]] |
| 4.2 | Scan: time-out (auto second tap, or `time_out` mode) with 60 s guard | ✅ | README describes this differently | [[Implementation Tracker#Decisions Log]] |
| 4.3 | Duplicate handling, converting pre-filled absent/excused rows | ✅ | Overwrites an `excused` mark | [[System Documentation#6. RFID Scan Processing]] |
| 4.4 | Scan audit log (stored) | ✅ | `bad_device`/`reader_paused` not stored | [[API Contracts/05-attendance-and-reports]] |
| 4.5 | Scan-log viewer screen | ⬜ | API exists; no UI | [[Wireframe & Flows#Functions with API but no screen]] |
| 4.6 | Manual status/remarks edit (staff) and time edit (admin) | 🟨 | Does not clear times, touch points, or check event state; single-time edits skip order check | [[List of Vulnerabilities#V-11]] |
| 4.7 | Event roster and recorded-attendance views with teacher scope | 🟨 | `GET /events/:id/attendance` does not filter students for teachers | [[List of Vulnerabilities#V-06]] |
| 4.8 | Optional clock-window guard for time-in | ⬜ | Constant `EARLY_WINDOW_MIN` declared but unused | [[Implementation Tracker#Decisions Log]] |
| 4.9 | Edit audit trail (who/when/previous value) | ⬜ | None | [[List of Vulnerabilities#V-11]] |

## P5 — Reporting, Dashboards & Live Display

*Insight and kiosk*

| # | Item | Status | Notes / evidence | Ref |
|---|------|:------:|------------------|-----|
| 5.1 | Overview counters + 30-day heatmap (scoped) | 🟨 | Present/late/excused vs absent use different event sets | [[API Contracts/05-attendance-and-reports]] |
| 5.2 | Filtered report + CSV (formula-safe) | 🟨 | Rows truncated at 10,000 while summary counts all | [[List of Vulnerabilities#V-15]] |
| 5.3 | Live check-in kiosk (3 s refresh, photo/initials) | ✅ | Needs staff token in browser | [[Wireframe & Flows#Wireframe 13 — Live Check-in display (`attendance-display.html`)]] |
| 5.4 | Global live-display reset (non-destructive) | 🟨 | Creates a table at request time; shows absent/excused-with-time-in as "Present" | [[List of Vulnerabilities#V-12]] |
| 5.5 | Student photos in database | 🟨 | 300,000-char limit vs 32 KB body limit → large photos fail with `500` | [[List of Vulnerabilities#V-14]] |
| 5.6 | Pagination and truncation hints for lists | ⬜ | Silent caps: 500 / 10,000 | [[List of Vulnerabilities#V-15]] |
| 5.7 | Retire legacy `GET /admin/overview` | ⬜ | Unused; different time semantics | [[Implementation Tracker#Decisions Log]] |

## P6 — Groups, Points & Student Portal

*Masterlists, teams, ledger, student views*

| # | Item | Status | Notes / evidence | Ref |
|---|------|:------:|------------------|-----|
| 6.1 | Automatic points at time-in; student total + daily graph | ✅ | Late = full points | [[System Documentation#10. Points Ledger]] |
| 6.2 | Manual points adjustment | 🟨 | API only; no UI, no cap, no undo | [[API Contracts/06-student-self-service]] |
| 6.3 | Points reversal when attendance is corrected | ⬜ | Not implemented | [[List of Vulnerabilities#V-11]] |
| 6.4 | Student dashboard and event list with personal status | 🟨 | Missed finished events show "Done" instead of "Absent" | [[API Contracts/06-student-self-service]] |
| 6.5 | Masterlists: create, edit, add/remove students, candidates | ✅ | Department-matched inserts only | [[API Contracts/07-directory-masterlists-teams]] |
| 6.6 | Teams: create, bulk-add from masterlist, assign advisers | ✅ | No edit/delete/remove | [[System Documentation#12. Masterlists & Teams]] |
| 6.7 | Team edit/delete, member and adviser removal | ⬜ | No endpoints | [[System Documentation#In Scope / Out of Scope]] |
| 6.8 | Teacher adviser views (roster, attendance) | ✅ | Adviser-only; but any teacher can list all teams and read advisers | [[API Contracts/07-directory-masterlists-teams]] |
| 6.9 | Student directory + admin edit | ✅ | Full replace semantics | [[API Contracts/07-directory-masterlists-teams]] |

## P7 — Security Hardening

*Fixes from [[List of Vulnerabilities]] (all open)*

| # | Item | Status | Notes / evidence | Ref |
|---|------|:------:|------------------|-----|
| 7.1 | Fix teacher scope on `GET /events/:id/attendance` (department + year) | ⬜ | V-06 | [[List of Vulnerabilities#V-06]] |
| 7.2 | Remove student photos and Wi-Fi secrets from repository and history | ⬜ | V-01, V-02 | [[List of Vulnerabilities#V-02]] |
| 7.3 | Rate-limit login, register, scan, heartbeat; configure `trust proxy` | ⬜ | V-03, V-21 | [[List of Vulnerabilities#V-03]] |
| 7.4 | Security headers (CSP, HSTS, etc.), HTTPS-only, secure token storage review | ⬜ | V-05, V-21 | [[List of Vulnerabilities#V-21]] |
| 7.5 | Hash device keys; add key rotation | ⬜ | V-04 | [[List of Vulnerabilities#V-04]] |
| 7.6 | Restrict public event fields; protect `/health/db` details | ⬜ | V-07 | [[List of Vulnerabilities#V-07]] |
| 7.7 | Fix cached-rejection in event timestamp type lookup | ⬜ | V-13 | [[List of Vulnerabilities#V-13]] |
| 7.8 | Move runtime DDL into migrations; least-privilege DB role | ⬜ | V-12 | [[List of Vulnerabilities#V-12]] |
| 7.9 | Map body-too-large to `413`; raise limit for the photo route only | ⬜ | V-14 | [[List of Vulnerabilities#V-14]] |
| 7.10 | Tighten input validation (offsets, email format, empty strings, lengths) | ⬜ | V-17 | [[List of Vulnerabilities#V-17]] |
| 7.11 | Remove dead code and unused dependencies; add lockfile audit | ⬜ | V-20 | [[List of Vulnerabilities#V-20]] |

## P8 — Blocked / Not Live

*Built but unreachable or unfinished*

| # | Item | Status | Notes / evidence | Ref |
|---|------|:------:|------------------|-----|
| 8.1 | Card-tap web login: mount route in server | ✅ | Mounted at API root; admin link and card exchange paths match their callers | [[API Contracts/08-card-login-not-live]] |
| 8.2 | Card-tap web login: `card_tokens` migration | ✅ | Added migration 011; apply it to the deployed database | [[API Contracts/08-card-login-not-live]] |
| 8.3 | Card-tap web login: reconcile frontend path with router path and `CARD_LOGIN_URL` host | ✅ | Frontend calls `/auth/card-login`, now served by the mounted router | [[API Contracts/08-card-login-not-live]] |
| 8.4 | Card-tap web login: token expiry, `trust proxy` | ⛔ | Tokens never expire; rate limit keyed on proxy IP | [[List of Vulnerabilities#V-08]] |
| 8.5 | Admin UI to generate/revoke card links | ⛔ | No screen exists | [[Wireframe & Flows#Flow 10 — Card-tap web login (⛔ not live)]] |

## Decisions Log

Type: **Observed** = how the system behaves today · **Drift** = code differs from README · **Defect** = behaviour that looks unintended · **Open** = needs an owner decision.

| ID | Decision / finding | Context & consequence | Type | See |
|----|--------------------|-----------------------|------|-----|
| D-01 | Documentation treats **code as truth** over READMEs | Several README statements no longer match behaviour (D-07, D-08, D-11, D-17) | Observed | All docs |
| D-02 | Hand-rolled HMAC-SHA256 token (`v1.payload.sig`), 12 h, no refresh; role re-read from DB every request | Immediate deactivation/demotion at the cost of one DB hit per call; tokens still cannot be revoked individually | Observed | [[API Contracts/00-conventions#Access Levels]] |
| D-03 | Public registration creates **students only** | Privileged roles are provisioned by admins | Observed | [[System Documentation#1. Authentication & Sessions]] |
| D-04 | Passwords: salted scrypt (64-byte), min 8 (12 for bootstrap admin) | No complexity or breach checks | Observed | [[List of Vulnerabilities#V-18]] |
| D-05 | Teacher scope = one department + optional year level | Added by migration 004 | Observed | [[API Contracts/00-conventions#Teacher Scoping]] |
| D-06 | Lifecycle status and `attendance_open` are **independent** | `attendance_open` gates scans; closing it stops both new time-ins and time-outs. Migration 009 | Observed | [[Wireframe & Flows#Flow 4 — Event lifecycle and the attendance gate]] |
| D-07 | Time-in is gated by `attendance_open`, **not by a clock window** | README says scans are accepted within the event window; code accepts any time while open. `EARLY_WINDOW_MIN` (30) is declared but unused. **Open question:** restore a window guard? | Drift / Open | [[System Documentation#6. RFID Scan Processing]] |
| D-08 | In `auto` mode the **second tap is a time-out** (after a 60 s guard) | README says time-out is only controlled by reader mode or event completion | Drift | [[API Contracts/04-scan-processing]] |
| D-09 | Points are awarded once, at time-in, and never reversed by later corrections | Keeps the ledger append-only; creates drift between status and points. **Open question:** add compensating entries on correction? | Observed / Open | [[System Documentation#10. Points Ledger]] |
| D-10 | Reader device key is shown once and stored/compared in plain text | Simple provisioning; risk if the DB leaks | Observed | [[List of Vulnerabilities#V-04]] |
| D-11 | Student photos live in `users.photo` (data URL); display reads them from the API | README still describes local `images/students/<id>.jpg` files and browser-local storage; only staff avatars are browser-local | Drift | [[System Documentation#9. Live Check-in Display]] |
| D-12 | Live reset is a **global**, non-destructive cut-off timestamp, created on demand | Hides activity for all viewers; needs DDL rights at runtime | Observed | [[List of Vulnerabilities#V-12]] |
| D-13 | Card-tap login code is present but **not mounted** | Feature appears abandoned or paused; keep as ⛔ until a decision is made | Open | [[API Contracts/08-card-login-not-live]] |
| D-14 | Firmware parses `no_event` reasons the backend no longer emits | Backend sends `attendance_closed`, `event_done`, `no_open_time_in_for_student`, …; the LCD always shows "No event assigned" | Defect | [[Wireframe & Flows#Wireframe 14 — Reader LCD and buzzer]] |
| D-15 | Legacy `team_leader` role retained; team membership no longer promotes students | Backward compatibility; relies on a database view `v_team_leader_teams` not in the repo | Observed | [[System Documentation#12. Masterlists & Teams]] |
| D-16 | Personal event checklist kept for compatibility; calendar is read-only | UI no longer calls it | Observed | [[API Contracts/06-student-self-service]] |
| D-17 | `GET /attendance/recent` default limit is 3 (max 12) | README says `limit=5`; the display passes 5 explicitly, the dashboard 3 | Drift | [[API Contracts/05-attendance-and-reports]] |
| D-18 | Photo cap (300,000 chars) is larger than the global JSON limit (32 KB) | The route-level limit is unreachable for large images | Defect | [[List of Vulnerabilities#V-14]] |
| D-19 | Base schema is not in the repository; migrations start at `002` | Schema facts here are inferred. **Open question:** commit an `001` baseline | Open | [[System Documentation#Assumptions]] |
| D-20 | School time zone defaults to `Asia/Manila`; the browser hard-codes `+08:00` for report dates; firmware uses UTC+8 | Fine for one site; breaks if `ATTENDANCE_TIME_ZONE` changes | Observed | [[API Contracts/00-conventions#Data Formats]] |
| D-21 | Attendance rate = (present + late) ÷ (total − excused) | Late counts as attended; excused is neutral | Observed | [[System Documentation#8. Reports & Dashboards]] |
| D-22 | Wording inconsistencies: live display labels an absent/excused record with a time-in as "Present"; students see "Done" instead of "Absent" for finished events they missed | Status checks do not look at `absent` first | Defect | [[System Documentation#11. Student Self-Service]] |
| D-23 | Dead/legacy code: `controllers/authController`, Prisma packages, `nodemon`, `GET /admin/overview`, `EARLY_WINDOW_MIN` | Candidates for removal | Observed | [[List of Vulnerabilities#V-20]] |
| D-24 | Duplicate routes: `POST /masterlists` and `POST /admin/masterlists`; `/auth/*` alias of `/api/auth/*` | Dashboard uses the admin and `/api` variants | Observed | [[API Contracts/07-directory-masterlists-teams]] |
| D-25 | UI omits three admin capabilities that exist in the API: deactivate user, scan-log viewer, manual points | Prioritise with admins | Open | [[Wireframe & Flows#Functions with API but no screen]] |

## Suggested Order of Work

1. **Stop-ship:** 3.9 / 7.2 (secrets and photos in repo), 7.1 (teacher scope), 0.7 (commit the schema).
2. **Before real students use it:** 7.3 (rate limits), 7.4 (headers, HTTPS), 3.10 (device HTTPS), 7.9 (photo upload), 3.8 (LCD reasons), 1.8 and 6.2 (admin tools).
3. **Data trust:** 4.6 / 4.9 / 6.3 (edit consistency, audit, points reversal), 5.1 (counter definitions), D-22 wording fixes.
4. **Decide:** card-tap login (P8) — finish or delete; clock-window guard (D-07).
5. **Quality:** tests (0.8) covering the scan decision table in [[Wireframe & Flows#Flow 3 — Card tap]], then CI (0.9).
