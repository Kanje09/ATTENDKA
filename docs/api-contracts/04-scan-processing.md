# Contract 04 — Scan Processing

> **Last synced with codebase:** ATTENDKA-main.zip snapshot (2026-11-06) · `routes/attendance_route.ts` (`POST /scan`), `PlatformIO/Projects/rfid/src/main.cpp`
> Envelope & errors: [[API Contracts/00-conventions]] · Business rules: [[System Documentation#6. RFID Scan Processing]] · Flow diagram: [[Wireframe & Flows#Flow 3 — Card tap]]

| # | Method | Path | Access | Purpose |
|---|--------|------|--------|---------|
| 4.1 | POST | `/api/scan` | Reader key | Process one card tap |

## 4.1 `POST /api/scan`

**Request**
```http
POST /api/scan
x-device-key: <reader device_key>
Content-Type: application/json

{ "card_uid": "04:D4:E5:F6" }
```
`card_uid` is normalised (spaces, `:`, `-` removed; upper-cased) and must be 1–50 characters after normalisation.

### Response matrix

| HTTP | Body | Meaning | Logged as | Points |
|------|------|---------|-----------|--------|
| 400 | `{ok:false, error:"card_uid_and_device_key_required"}` | Header or `card_uid` missing, or UID > 50 chars | — | — |
| 401 | `{ok:false, result:"bad_device"}` | Unknown device key | — | — |
| 403 | `{ok:false, result:"reader_paused"}` | Reader `is_active = false` (still updates `last_seen_at`) | — | — |
| 200 | `{ok:false, result:"unknown_card"}` | UID not in `rfid_cards` | `unknown_card` | — |
| 200 | `{ok:false, result:"inactive_card"}` | Card status ≠ `active`, or owner inactive, or card unassigned | `inactive_card` | — |
| 200 | `{ok:true, result:"accepted", name, role}` | Valid non-student card (teacher/admin) | `accepted` | — |
| 200 | `{ok:true, result:"accepted", name, status, event}` | **Time-in** recorded (`status` = `present` or `late`) | `accepted` | `event.points` (if > 0) |
| 200 | `{ok:true, result:"time_out", name, status, event, time_out}` | **Time-out** recorded | `accepted` | — |
| 200 | `{ok:true, result:"duplicate", name, event}` | Repeat tap (see rules) | `duplicate` | — |
| 200 | `{ok:true, result:"no_event", name, reason}` | Valid student but nothing to time in/out of | `no_event` | — |
| 500 | `{ok:false, error:"server_error"}` | DB failure; transaction rolled back, nothing saved | — | — |

`name` = first + middle + last name joined by spaces.

### `no_event.reason` values

| `reason` | Meaning |
|----------|---------|
| `attendance_closed` | Closest candidate event has `attendance_open = false` |
| `event_done` / `event_moved` / `event_cancelled` | Closest candidate is in that lifecycle state |
| `no_open_time_in_for_student` | Reader is in `time_out` mode and the student has no open time-in |
| `event_did_not_match_scan_query` | Candidate exists but failed another filter |
| `no_matching_attendance_event` | No attendance event applies to the student's department |

The firmware currently looks for `event_not_ongoing`, `time_in_window_not_open`, `event_time_window_closed`, which the backend **never sends** — see [[Implementation Tracker#Decisions Log]] (D-14).

### Decision order

1. Authenticate reader → update `last_seen_at` → open transaction.
2. Look up card, then owner. Unknown / inactive / non-student exits above.
3. Resolve today's reader assignment → `assignedEventId` (or none) and `mode` (`auto` if none).
4. **Time-in step** (skipped in `time_out` mode): pick one event where `requires_attendance`, the event is school-wide or the student's department, `attendance_open = true`, status ∉ {`moved`,`cancelled`,`done`}, the event equals the assignment (if any), and — in `auto` mode only — the student has no `time_in` yet. Preference: events whose window contains *now*, then nearest start.
5. **Time-out step** (skipped in `time_in` mode, and only if step 4 found nothing): pick the event where this student has `time_in` and no `time_out`, status ∉ {`moved`,`cancelled`}, honouring the assignment. Most recent `time_in` first. Works whether or not attendance is open and whether the event is `done`.
6. Nothing found → if the student already has a completed (in+out) record on an open event → `duplicate`; else `no_event`.
7. Time-out: if the existing `time_in` is **< 60 s** old → `duplicate` (double-tap guard); else set `time_out = now()`.
8. Time-in: insert attendance (`late` if `now > start + 15 min`, otherwise `present`; early taps are `present`). If a row already exists with no `time_in` and status `absent`/`excused`, it is **converted** to `present`/`late` (an `excused` status is overwritten). Any other existing row → `duplicate`.
9. Award `event.points` once, at time-in. Commit.

Every outcome after reader authentication is written to `attendance_logs` in the same transaction (except `reader_paused`). Time-out is logged as `accepted`.

### Side effects & idempotency

- Concurrent time-ins for the same student/event are safe: the unique `(event_id, student_id)` insert makes the loser a `duplicate`; time-out rows are locked `FOR UPDATE`.
- The scan is **not** idempotent for different phases: in `auto` mode the second valid tap after 60 s is a time-out.
- The firmware additionally ignores the same UID for 5 s locally.
