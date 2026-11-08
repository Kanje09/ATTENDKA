# ATTENDKA — System Documentation

> **Last synced with codebase:** `ATTENDKA-main.zip` snapshot, 2026-11-06 (no git history in the archive, so no commit hash). Backend migrations `002`–`009` applied; base schema is **not** in the repository.
> Companion docs: [[Wireframe & Flows]] · [[Implementation Tracker]] · [[API Contracts/00-conventions]] · [[List of Vulnerabilities]]

## Assumptions

1. **Source of truth is the code**, not the READMEs. Where they disagree, this document follows the code and the difference is logged in [[Implementation Tracker#Decisions Log]] (D-07, D-08, D-11, D-17).
2. **No reference document reached me.** The second message carried only the zip, so structure and tone follow your written style rules.
3. **The base database schema is not in the repo.** Tables, columns, and constraints are inferred from queries and migrations `002`–`009`. Anything the code cannot prove (e.g., unique keys, `ON DELETE` rules on `event_attendance`) is marked *unverified*.
4. **"Product-level" means behaviour and rules, not code.** Exact validation limits and error codes are included because they are product behaviour.
5. **Institution:** the UI is branded for **PTCI** ("ATTENDKA?"). Default school time zone is `Asia/Manila` (UTC+8).
6. **Roles:** `student`, `teacher`, `admin`, plus a **legacy** `team_leader` that no screen or API can still create. The ESP32 **reader** is a fifth, non-human actor.
7. **Not live ≠ not planned.** Card-tap login exists as code but is not mounted; it is documented, marked ⛔, and kept out of "In Scope".

---

## Overview

| Item | Value |
|------|-------|
| Product | **ATTENDKA** — RFID event-attendance and points system for a school |
| Problem solved | Replace paper sign-in for school events: students tap an ID card on a reader; staff see check-ins live, correct records, and export reports |
| Actors | Student · Teacher · Admin · Legacy team leader · ESP32 RFID reader |
| Frontend | Static HTML/CSS/vanilla JavaScript (no build step); `index`, `register`, `app` (single-page dashboard), `attendance-display`, `card-login` pages |
| Backend | Node.js (ESM), TypeScript, Express 5, `pg`; stateless HMAC tokens; `express-rate-limit` installed (used only by the unmounted card-login route) |
| Database | PostgreSQL (accessed with raw SQL via `pg`; Prisma is listed in `package.json` but not used) |
| Hardware | ESP32 + PN5180 NFC reader + 16×2 I²C LCD + buzzer, firmware built with PlatformIO/Arduino |
| Hosting (observed) | Backend and frontend defaults point to Render (`attendka.onrender.com`); local dev on ports 5000 (API) and 5500 (static frontend) |
| API surface | 64 live endpoints; 2 more in an unmounted file — see [[API Contracts/00-conventions#Contract Index]] |
| Time handling | All "today" and daily-roster logic uses `ATTENDANCE_TIME_ZONE` (default `Asia/Manila`) |
| Configuration | `.env`: `DATABASE_URL` *or* `DB_USER/DB_HOST/DB_NAME/DB_PASSWORD/DB_PORT`; `DATABASE_SSL`; `JWT_SECRET` (≥ 32 bytes); `PORT`; `FRONTEND_ORIGIN`; `ATTENDANCE_TIME_ZONE`; `CARD_LOGIN_URL`; admin bootstrap vars |
| Tests | None in the repository (`npm test` runs Node's runner against zero test files) |

### Roles at a glance

| Role | Created by | Can do |
|------|------------|--------|
| **Student** | Self-registration | View own points, own event list; see school calendar |
| **Teacher** | Admin | Department-scoped (+ optional year) student directory, attendance, reports, manual status edits; view advised teams |
| **Admin** | `npm run create-admin` or another admin | Everything: events, readers, cards, accounts, photos, masterlists, teams, corrections, time edits, points |
| **Team leader** *(legacy)* | Pre-existing data only | Same as student, plus read-only view of teams they lead |
| **Reader (device)** | Admin registers it; receives a one-time key | Send scans and heartbeats only |

---

## Module Index

| # | Module | Section | API contract | Key screens ([[Wireframe & Flows]]) | Status |
|---|--------|---------|--------------|--------------------------------------|--------|
| 1 | Authentication & Sessions | [[#1. Authentication & Sessions]] | [[API Contracts/01-auth-and-accounts]] | Sign in, Register, Settings | ✅ |
| 2 | Account & Department Administration | [[#2. Account & Department Administration]] | [[API Contracts/01-auth-and-accounts]], [[API Contracts/02-departments-and-events]] | Accounts | ✅ |
| 3 | Student Directory & Photos | [[#3. Student Directory & Photos]] | [[API Contracts/07-directory-masterlists-teams]] | Student directory, Student photos | ✅ |
| 4 | Events & School Calendar | [[#4. Events & School Calendar]] | [[API Contracts/02-departments-and-events]] | Events, School calendar | ✅ |
| 5 | RFID Readers, Cards & Assignments | [[#5. RFID Readers, Cards & Assignments]] | [[API Contracts/03-rfid-devices-and-cards]] | RFID devices | ✅ |
| 6 | RFID Scan Processing | [[#6. RFID Scan Processing]] | [[API Contracts/04-scan-processing]] | (device LCD) | ✅ |
| 7 | Attendance Management | [[#7. Attendance Management]] | [[API Contracts/05-attendance-and-reports]] | Course Attendance | ✅ |
| 8 | Reports & Dashboards | [[#8. Reports & Dashboards]] | [[API Contracts/05-attendance-and-reports]] | Dashboard, Reports | ✅ |
| 9 | Live Check-in Display | [[#9. Live Check-in Display]] | [[API Contracts/05-attendance-and-reports]] | Live display | ✅ |
| 10 | Points Ledger | [[#10. Points Ledger]] | [[API Contracts/06-student-self-service]] | Student dashboard | 🟨 |
| 11 | Student Self-Service | [[#11. Student Self-Service]] | [[API Contracts/06-student-self-service]] | Student dashboard, Upcoming events | ✅ |
| 12 | Masterlists & Teams | [[#12. Masterlists & Teams]] | [[API Contracts/07-directory-masterlists-teams]] | Masterlists, Team adviser | 🟨 |
| 13 | Card-Tap Web Login | [[#13. Card-Tap Web Login]] | [[API Contracts/08-card-login-not-live]] | Card-login landing | ⛔ |
| 14 | Reader Firmware (ESP32) | [[#14. Reader Firmware (ESP32)]] | [[API Contracts/04-scan-processing]] | Reader LCD & buzzer | 🟨 |

---

## 1. Authentication & Sessions

**Features**
- Student self-registration at `register.html`; the new student is signed in immediately.
- Sign in with **username or email** plus password.
- Session = bearer token held in the browser's `localStorage` (`ptci_access_token`, `ptci_user`); sign-out clears them.
- Profile view (all roles), profile edit (teacher/admin), password change (all roles).
- First admin created from the command line, never through the web.

**Business Rules**
- **Registration is student-only.** `role` is fixed to `student`; teachers and admins are created by an admin (§2).
- **Registration limits:** username trimmed ≥ 3 and ≤ 50; password 8–200; first/last name non-blank ≤ 80; middle name ≤ 80; email ≤ 150 (format not checked, stored lower-case); student number non-blank ≤ 30; section ≤ 20; `department_id` must exist; `year_level` integer 1–10 (UI offers 1–5). Any failure → `400 invalid_registration`; duplicate username/email/student number → `409 already_exists`. The student number is **not** verified against any official list.
- **Login:** `email` and `username` are interchangeable (the form sends `email` if the text contains `@`, else `username`); if both are sent, `email` wins. Matching is case-insensitive. Inactive accounts cannot sign in. All of "unknown", "inactive", and "wrong password" return the same `401 invalid_credentials`. Password length 1–200, else `400`.
- **Passwords** are stored as salted scrypt hashes; hashes are never returned. Minimum length is 8 for users (12 for the bootstrap admin). There is no complexity rule, lockout, or reset-by-email flow.
- **Token:** HMAC-SHA256-signed `v1` token, 12 h lifetime, no refresh. Every protected request re-checks the account is active and uses the **database** role, so deactivation and demotion take effect immediately; individual tokens cannot be revoked and **password change does not invalidate existing tokens**.
- **Profile edit is staff-only.** Students and team leaders get `403 students_cannot_update_profile`. Editable: first name, last name, email (middle name is not editable). At least one field is required (`400 no_profile_fields_to_update`).
- **Password change:** new password 8–200; wrong current password → `400 current_password_incorrect` (not 401).
- **Edge:** if `JWT_SECRET` is missing or shorter than 32 bytes, token creation fails and login/register return `500 server_error`.
- **Edge:** an admin cannot deactivate their own account (`400 cannot_deactivate_current_user`), but nothing stops deactivating the *last* other admin.

## 2. Account & Department Administration

**Features**
- Admin creates **teacher** and **admin** accounts (teacher gets employee number, department, optional year level; admin gets optional position).
- Search accounts by role and text; activate/deactivate any account.
- Create departments.
- Assign or change a teacher's department/year scope (§3).

**Business Rules**
- **Creatable roles:** only `teacher` or `admin`; anything else → `400 invalid_user`. Teacher requires `employee_no` (≤ 30) and an existing `department_id`; `year_level` 1–10 or empty (= all years).
- Profile and user rows are created in **one transaction**; a failure leaves neither.
- Duplicate username, email, or employee number → `409 already_exists` (the response does not say which).
- **Deactivation** blocks sign-in, invalidates the user's tokens on their next call, and turns any of their cards into `inactive_card`. It does not delete data. There is no delete-account or reactivate-by-self path.
- Account list is capped at 500 rows, newest first.
- **Department code** must match `A–Z a–z 0–9 _ -`, 2–10 chars, and is stored upper-case; name ≤ 150. Duplicate → `409`. Departments cannot be renamed or deactivated through the API even though `is_active` exists; the public list shows only active ones.
- Newly created accounts keep the admin-chosen password; there is no "must change on first login" flag.

## 3. Student Directory & Photos

**Features**
- Staff search students by department, year level, and free text (student no., first/last/full name).
- Admin edits a student's name, email, student number, department, year, section.
- Admin sets/clears a student's photo (shown on the live display and the student's own avatar).
- Admin sets a teacher's department and year scope.

**Business Rules**
- **Teacher scope:** a teacher only ever sees students in their own department, and only their year level if one is set. A teacher with no teacher profile row gets `403 teacher_profile_not_found`.
- Directory lists **active** accounts only; capped at 500 with no paging — larger cohorts require filters.
- **Edit is a full replace:** every required field must be sent. `year_level` must be a JSON number 1–10; `section` ≤ 30 (registration allows 20). Duplicates → `409`. Moving a student to another department does **not** remove them from existing masterlists or teams.
- **Photo format:** `data:image/jpeg|png|webp;base64,…`, ≤ 300,000 characters, or `null` to clear. Any other format → `400 invalid_photo`.
- **Edge:** the server's global 32 KB request-body limit is smaller than the photo limit, so photos above roughly 32 KB fail with `500 server_error`. The dashboard shrinks images to 320 px JPEG (quality 0.7) first, which usually fits but is not guaranteed.
- Staff avatars (admin/teacher) are stored **only in that browser's `localStorage`** and do not sync; student photos are stored in the database.
- The photo endpoints key on `user_id`, while student edit keys on `student_id`, and teacher scope keys on `teacher_id`; the UI hides this, API users must not mix them up.

## 4. Events & School Calendar

**Features**
- Admin creates, edits, reschedules, status-changes, and deletes events.
- Events are school-wide or limited to one department; each is an **attendance event** (students tap in) or a **plain calendar event**.
- Public read of the calendar; students and teachers see a read-only month view of event cards with status notes; admins can open/close attendance from each card.

**Business Rules**
- **Types:** `academic`, `seminar`, `sports`, `intramurals`, `meeting`, `holiday`, `other`.
- **Create validation:** title non-blank ≤ 200; valid type; start and end must parse and end must be **strictly after** start; `requires_attendance` must be a real boolean (default true); `points` integer ≥ 0 (default 0, no ceiling); `department_id` null (school-wide) or an existing department. Failure → `400 invalid_event`.
- **Update validation:** same rules per field, plus `venue` ≤ 150, `status_note` ≤ 255; merged start/end re-checked → `400 event_end_must_follow_start`; empty update → `400 no_event_fields_to_update`.
- **Datetimes should carry a UTC offset.** The server does not reject offset-less strings; the database interprets them, which can shift an event by hours.
- **Two independent switches** (migration 009 made this explicit):
  - `event_status`: `pending` (default) · `ongoing` · `moved` · `done` · `cancelled`. Any value may follow any other; there are no transition rules.
  - `attendance_open` (default **false**): the only gate that lets a scan record a **time-in**.
- Moving an event to `done`, `moved`, or `cancelled` from the dashboard also sends `attendance_open = false`; the API itself does not couple them, but the scan rules block time-in for those three statuses regardless.
- **Open/Close attendance** button: enabled for `pending`/`ongoing` events (and for any event that is currently open, so it can be closed); disabled and labelled "Attendance closed" for `done`/`moved`/`cancelled`. Closing stops new time-ins but **assigned time-outs still work**.
- Reading: `GET /events` returns at most 500 events; `date` filters on **start** day (school time zone), `from`/`to` use overlap semantics, `department_id` returns that department **plus** school-wide events.
- **Delete is permanent** and removes reader assignments and personal checklist ticks by cascade; consequences for attendance and points depend on the unseen base schema (*unverified*).
- Changing an event's `points` after the fact does not change points already awarded.
- The school calendar is **not** a per-student checklist any more; the personal-checklist endpoint remains only for compatibility (§11).

## 5. RFID Readers, Cards & Assignments

**Features**
- Admin registers readers (name, location) and receives a secret **device key** once.
- Pause/resume a reader; delete a reader; see Online/Offline.
- Assign, reassign, unassign, or change the status of student cards.
- Assign a reader to an event for a date with a mode (`auto`, `time_in`, `time_out`).

**Business Rules**
- **Reader name** required, ≤ 80. The 32-byte random key is returned **only** in the create response and is never shown again; a lost key means delete/replace the reader.
- **Paused reader** (`is_active = false`): every scan → `403 reader_paused`, nothing is recorded; heartbeats still succeed. **Online** means a heartbeat or scan arrived in the last **65 s**; the firmware heartbeats every **20 s**. Paused ≠ offline.
- **Deleting a reader** keeps its scan logs (reader reference set to empty) and removes its assignments.
- **Card UID** is normalised (spaces, `:`, `-` removed; upper-case) and must be 1–50 chars; duplicates anywhere → `409 already_exists`. Cards are bound to a **`student_id`** (not `user_id`); a student may hold several cards.
- **Card status:** `active`, `inactive`, `lost`, `blocked`. Only `active` cards scan successfully. Unassigning (`student_id: null`) forces status `inactive`; reassigning without a status sets `active`.
- **Assignment** is per reader **per calendar date** (school time zone) and is overwritten, never deleted. The reader must exist and be active; the event must exist, require attendance, and **start on that local day** — errors `reader_not_found_or_inactive`, `event_not_found`, `event_does_not_require_attendance`, `event_not_on_selected_local_date`. Only today's assignment affects scans.
- With **no assignment**, a reader runs in `auto` mode against any eligible open event for the tapping student.
- Rejected assignments are written to the server log with computed day boundaries (diagnostics only).

## 6. RFID Scan Processing

**Features**
- A card tap from an authorised reader is turned into a time-in, a time-out, a duplicate notice, or a reason it was refused.
- Every outcome is stored in an audit log.
- Points are awarded automatically at time-in.

**Business Rules** (full response matrix in [[API Contracts/04-scan-processing]])
- **Reader checks first:** missing key/UID or UID > 50 chars → `400`; unknown key → `401 bad_device`; paused → `403 reader_paused`. Neither is logged.
- **Card checks:** unknown UID → `unknown_card` (logged, no owner). Card not `active`, owner inactive, or card unassigned → `inactive_card`. A valid **teacher/admin** card is logged `accepted` with name and role but creates **no attendance**.
- **Which event?** Only events that: require attendance, are school-wide or match the student's department, have `attendance_open = true`, are not `moved`/`cancelled`/`done` (for time-in), and match today's assignment if one exists. Events whose time window contains *now* are preferred, then the nearest start.
- **No clock window on time-in.** If an admin has opened attendance, a tap is accepted even before the scheduled start or after the end (README text describing a time window is out of date — D-07).
- **Present vs late:** late when `now` is more than **15 minutes after the start**; any earlier tap, including before the start, is `present`.
- **Modes:**
  - `time_in`: only records time-in; a repeat tap → `duplicate`.
  - `time_out`: only records time-out for an event where the student is timed in and not out; works for pending/ongoing/done events, needs no open attendance, never for `moved`/`cancelled`.
  - `auto` (also when no assignment): first tap = time-in; a later tap = time-out.
- **Double-tap guard:** a time-out tap less than **60 seconds** after time-in is `duplicate` and changes nothing. The firmware also ignores the same UID for 5 s.
- **Pre-filled rows:** if an admin/teacher already created an `absent` or `excused` row with no time-in, the student's tap **converts it** to `present`/`late` — an `excused` mark is overwritten.
- **After a full in+out cycle**, further taps on an open event return `duplicate`.
- **`no_event`** (HTTP 200, `ok: true`) carries a `reason` such as `attendance_closed`, `event_done`, `no_open_time_in_for_student`. The firmware does not read these reasons (§14).
- **Points** (`event.points` > 0) are written once, in the same transaction as time-in, with reason `Attended: <event title>`. Late students get full points. Time-out awards nothing.
- **Transactional:** a database failure rolls everything back and returns `500`; nothing is half-recorded.
- **Logging:** `attendance_logs.result` ∈ {`accepted`, `unknown_card`, `inactive_card`, `no_event`, `duplicate`}; time-out is logged as `accepted`. A time-in that turns out to be a duplicate is first written as `accepted`, then corrected to `duplicate`.

## 7. Attendance Management

**Features**
- **Course Attendance** page: filter by month and event, then edit each student's status and remarks.
- Admin can also edit time-in/time-out.
- Event roster: everyone who *should* have attended, including those with no record.
- Raw scan log search (admin).

**Business Rules**
- **Statuses:** `present`, `late`, `absent`, `excused`. A student with **no record** is reported as `absent`.
- **Who may edit what:** teachers set status and remarks only; sending any time field (even `null`) → `403 time_edits_are_admin_only`. Admins may also set or clear time-in/out.
- **Remarks** string ≤ 255, blank stored as empty; `time_out` must not precede `time_in` when both are supplied (`400 invalid_attendance_update`). The admin correction route also compares against stored values (`400 time_out_before_time_in`).
- **Scope:** an edit applies only if the event requires attendance, the student belongs to the event's department (or the event is school-wide) and, for teachers, to the teacher's department and year; otherwise `404 event_or_student_not_found`.
- **Auto time-in on edit:** setting `present`/`late` with no time supplied and none stored stamps `time_in = now`.
- **Not enforced:** event status/date (future, cancelled and done events can be edited), points (not created and not reversed), clearing of times when switching to `absent`/`excused`.
- **Edge:** when only one of the two times is sent, it is not compared with the stored other time, so an inconsistent pair is possible on that route.
- **Roster** shows active students only. `404 attendance_event_not_found` appears only when the roster is empty and the ID is not an attendance event.
- **Teacher view of "attendance for one event"** is not filtered by student department/year — see [[List of Vulnerabilities#V-06]].
- **Scan logs** filter by result, reader, and time range, newest first, capped at 500; `bad_device` and `reader_paused` are never stored.

## 8. Reports & Dashboards

**Features**
- Staff dashboard: counters, 30-day check-in heatmap, recent check-ins, upcoming events.
- Report page: date range + department, year, event, text search; table and **CSV download**.
- Global search box filters directory and attendance views.

**Business Rules**
- **Report window:** `from`/`to` required, parseable, `to` after `from`; events are included by **start** time in `[from, to)`. Default = **ended events only**; `include_current=true` (what the UI sends) adds events that have started or are ongoing.
- **Rows** are student × attendance-event combinations in scope; missing record = `absent`. Capped at **10,000 rows**, newest first, silently — but the summary is computed on the full set, so a truncated table/CSV will not add up to its totals.
- **Attendance rate** = (present + late) ÷ (total − excused) × 100, one decimal; `0` if the denominator is 0. Late counts as attended; excused is removed from both sides.
- **Teacher scope** is enforced server-side (own department, own year); asking for another department → `403 forbidden`.
- **Dashboard "today"** is the school-local day. *Present/late/excused* count distinct students with a record on any attendance event starting today; *absent* counts roster rows without a record for events that have ended, are ongoing, or are open. The two use different event sets, so they may not sum to the roster size.
- **Invalid filter** → `400 invalid_report_filters`. The year filter is 1–10.
- **CSV** is Excel-compatible (UTF-8 with BOM); cells starting with `=`, `+`, `-`, `@` are prefixed with an apostrophe to defuse spreadsheet formulas. Report range dates are interpreted as **UTC+8** midnights in the browser.
- A legacy `GET /admin/overview` exists with different (UTC-day, unfiltered) semantics and no UI.

## 9. Live Check-in Display

**Features**
- Full-screen page for a lobby monitor: latest **5** check-ins with photo (or initials), name, student no., department, status, time-in, time-out, event.
- Polls every **3 seconds**; shows "API unavailable" / "Sign in required" states; clock and full-screen button.
- Admin **Reset live attendance** hides earlier activity without deleting records.

**Business Rules**
- The display is an authenticated page: it needs an **admin or teacher** token in the same browser (opened from the dashboard). Teachers see only their scope.
- Ordering is by most recent activity (time-in or time-out). `limit` must be 1–12 (default 3; display asks for 5, dashboard card asks for 3) else `400 limit_must_be_between_1_and_12`.
- **Reset** stores a global cut-off time; activity at or before it disappears for **every** viewer (including teachers). New taps after the reset show normally. Nothing is deleted. The reset table is created on first use if migration 008 was skipped.
- Status label: **Timed out** if a time-out exists; else **Late** if late; else **Present** — so an `absent`/`excused` record that still has a time-in is displayed as "Present" (D-22).
- Photos come from the database (`users.photo`), not from `images/students/` (the README describing local JPG files is out of date — D-11). No photo → initials.
- Timestamps are read-only on this screen.

## 10. Points Ledger

**Features**
- Automatic points per attendance event at time-in.
- Admin manual add/deduct with a reason.
- Student sees total and a per-day contribution graph.

**Business Rules**
- Ledger is **append-only**: `student_id`, optional `event_id`, signed integer `points`, `reason`, `awarded_by` (null for automatic awards).
- **Automatic:** `event.points` at time-in only, once per accepted time-in (late = full points). Changing an attendance status afterwards **does not add or remove** points.
- **Manual:** points must be a non-zero integer (negative = deduction, no cap, balance may go negative); reason non-blank ≤ 255; unknown student/event → `400 invalid_reference_or_value`. No edit/delete/undo endpoint.
- Total = sum of all ledger rows. Daily activity is grouped by the school-local day.
- Whether the database forbids a second automatic award for the same student and event is *unverified*; the scan logic prevents it by only awarding on a newly created time-in.
- 🟨 Status: functional, but no reversal path or balance rules (tracker P5).

## 11. Student Self-Service

**Features**
- Student dashboard: total points, contribution graph, upcoming/past event cards with personal status.
- "Upcoming events" page and read-only school calendar by month.
- Own profile (read-only for students), password change.

**Business Rules**
- The student sees events that are **school-wide or in their department**, including events that don't require attendance (labelled `School event`).
- **Personal status label**, first match wins: `Excused` → `Checked in` / `Complete` → `Moved` → `Not continuing` (cancelled) → `Done` → `School event` → `Absent` (ended) → `Upcoming`. **Edge:** because `Done` is tested before `Absent`, a student who missed a finished event sees `Done`, not `Absent`.
- Students cannot edit events, attendance, profile details, or photos; they cannot see other students.
- A personal "done" tick per event (`PUT …/checklist`, strict boolean) exists for backward compatibility and no longer appears in the UI. It never affects attendance or points.
- Search bar and avatar actions are hidden for students; the Reports and Course Attendance pages are hidden (and the APIs are staff-only).

## 12. Masterlists & Teams

**Features**
- Admin creates **masterlists** (department + school year + semester) and selects students into them.
- Admin creates **teams** (e.g., intramurals), bulk-adds members from a masterlist, and assigns teacher **advisers**.
- Teachers view teams they advise: roster and a member × event attendance table (time-in and time-out).

**Business Rules**
- **Masterlist fields:** `school_year` `YYYY-YYYY` (second year not checked to be first + 1); `semester` `1st` | `2nd` | `summer`; `department_id` existing. Edit requires all three fields.
- **Adding students** inserts only those in the masterlist's department; others are **silently skipped**, so `added` can be lower than requested; list length ≤ 1000; an unknown masterlist returns `added: 0`.
- **Teacher scope on masterlists:** department only (no year filter).
- **Team:** name ≤ 100, school year `YYYY-YYYY`, optional logo URL ≤ 255 (not fetched). No API deletes or edits a team, removes a member, or removes an adviser.
- **Bulk add** accepts 1–1000 unique students and requires **all** of them to be on the chosen masterlist (`400 students_must_belong_to_selected_masterlist`); existing members are skipped; unknown team → `404`.
- **Single add** does not check existence first: unknown IDs → `400 invalid_reference_or_value`; already a member → `409`.
- **Visibility:** admins and teachers list **all** teams; a teacher can open the roster and attendance only for teams they **advise** (`403 team_adviser_required`) but can read the advisers of any team. A legacy team leader sees only teams where they are marked leader.
- Team attendance lists every attendance event that applies to each member — not just team-specific events.
- Team membership **no longer promotes** a student to `team_leader`; new teams rely on teacher advisers.
- 🟨 Status: create/assign flows complete; no edit/remove flows.

## 13. Card-Tap Web Login

**Features**
- Admin generates a private one-time-display link per student; opening it (e.g., from an NFC tag) signs the student in without a password.

**Business Rules**
- Only active `student`/`team_leader` accounts qualify (`400 students_only` otherwise).
- Generating a new link **revokes all earlier links** for that user. Only a SHA-256 hash is stored; the link is shown once.
- Exchange: token length 40–100, else `401 invalid_card`; 30 failed tries per 15 min per IP.
- The router is mounted at the API root and migration 011 creates `card_tokens`; apply the migration to the deployed database before use. Links do not expire, and the admin dashboard has no link-generation control. See [[API Contracts/08-card-login-not-live]].

## 14. Reader Firmware (ESP32)

**Features**
- Connects to Wi-Fi, syncs time (NTP, UTC+8), reads the card UID from a PN5180, posts it to `/api/scan`, shows the outcome on a 16×2 LCD, and beeps.
- Sends a heartbeat every 20 s so the dashboard can show Online/Offline.

**Business Rules**
- Identity is the **device key** sent as `x-device-key`; the card UID is the only credential for the student (no PIN or photo check).
- **Local debounce:** the same UID within 5 s is ignored.
- **Feedback:** one long beep for accepted / duplicate / time-out; five short beeps for anything else.
- **LCD messages** exist for: attendance saved, already recorded, time out saved, no event, unknown card, card inactive, time-in paused, Wi-Fi offline, API error.
- **Offline behaviour:** when Wi-Fi is down the tap is **dropped** ("Scan not sent") — there is no local queue or retry.
- 🟨 **Known mismatches:** the firmware matches `no_event` reasons the backend never sends (`event_not_ongoing`, `time_in_window_not_open`, `event_time_window_closed`), so every `no_event` shows "No event assigned". `API_URL`, `HEARTBEAT_URL`, and `DEVICE_KEY` are placeholders to edit before flashing; traffic is plain HTTP. The committed file also contains a real-looking Wi-Fi name and password — see [[List of Vulnerabilities#V-01]].
- Hardware: ESP32 dev board; PN5180 on pins NSS 5 / BUSY 16 / RST 17; LCD I²C `0x27` (use `0x3F` if blank) on SDA 21 / SCL 22; buzzer on pin 27 (HIGH = on).

---

## Cross-Cutting Rules

1. **Response shape:** `{ ok: true, …fields }` on success, `{ ok: false, error, message? }` on failure; scans use a `result` field. See [[API Contracts/00-conventions]].
2. **Authorization is server-side.** The dashboard hides screens by role, but only the API decides. Admin routes live under `/api/admin/*` and all require an admin token.
3. **Role is read from the database on every call.** Deactivation and role changes apply immediately; tokens are otherwise valid 12 h.
4. **Time zone:** school-local day boundaries (`[00:00, next 00:00)`) in `ATTENDANCE_TIME_ZONE`; stored event times may be `timestamp` or `timestamptz` — the code detects the type and treats offset-less values as UTC.
5. **Teacher scope** = department, plus year level when set; applied on directory, overview, reports, roster, recent check-ins, masterlists, and manual edits.
6. **Lists are not paged.** Lists cap at 500 (students, users, events, logs) or 10,000 (report rows) and truncate silently.
7. **Validation errors are specific; conflicts are not.** `already_exists` and `invalid_reference_or_value` never say which field.
8. **Audit:** every scan outcome is logged; manual edits record no editor or time; points record `awarded_by` for manual entries only.
9. **Ledgers and logs are never rewritten** by the app, except `attendance_logs.reader_id` being cleared when a reader is deleted.
10. **Secrets:** the reader device key is shown once; passwords and card tokens are hashed; `.env` holds the database credentials and signing secret.
11. **Schema management:** migrations `002`–`009` are idempotent and meant to be run in order. The base schema must exist already. One endpoint creates a table at request time (live reset).
12. **Language and format:** English UI; names are shown "first middle last"; IDs are integers; card UIDs are upper-case hex without separators.

## In Scope / Out of Scope

### In Scope (implemented or partially implemented)

| Area | Detail |
|------|--------|
| Accounts | Student self-registration; admin-created teacher/admin; activate/deactivate; password change; staff profile edit |
| Events | School calendar with types, venue, department scoping, lifecycle status, attendance open/close, points |
| RFID | Reader registry, heartbeat, pause/resume, card assignment, per-date reader→event assignment with modes |
| Attendance | Tap-in/tap-out, late rule, duplicate handling, audit log, manual status/remarks edits, admin time edits |
| Reporting | Dashboard counters, heatmap, filtered report, CSV export |
| Live display | 5-card kiosk with photo, 3 s refresh, global reset |
| Points | Automatic awards, manual adjustments, student view |
| Groups | Masterlists, teams, bulk add, adviser assignment, adviser views |
| Hardware | ESP32/PN5180 reader firmware |

### Out of Scope (not built — do not assume)

| Item | Note |
|------|------|
| Password reset / email verification / MFA | No email integration exists |
| Account deletion, department rename/deactivate, team edit/delete, member/adviser removal, assignment removal | No endpoints |
| Offline scan queue, OTA firmware updates, TLS on the device | Firmware limitation |
| Pagination, sorting, full-text search | Fixed caps instead |
| Notifications (SMS, email, push) | — |
| Excel/PDF native export | CSV only |
| Multi-school / multi-tenant support | Single institution |
| Per-class (course) attendance linked to timetables | "Course Attendance" is a page name; the data is event-based |
| Student-initiated corrections or excuse submissions | Staff only |
| Biometric or photo verification at the reader | Card UID only |
| Automated tests, CI, monitoring | None in repo |
| Card-tap web login | Code exists but is **not mounted** (§13) |

See [[Implementation Tracker]] for what remains and [[List of Vulnerabilities]] for risks in the current build.
