# Contract 05 — Attendance, Reports & Live Display

> **Last synced with codebase:** ATTENDKA-main.zip snapshot (2026-11-06) · `routes/attendance_route.ts`, `routes/admin_route.ts`
> Envelope & errors: [[API Contracts/00-conventions]] · Business rules: [[System Documentation#7. Attendance Management]], [[System Documentation#8. Reports & Dashboards]], [[System Documentation#9. Live Check-in Display]]

| # | Method | Path | Access | Purpose |
|---|--------|------|--------|---------|
| 5.1 | GET | `/api/attendance/overview` | Staff (teacher-scoped) | Dashboard counters + 30-day heatmap |
| 5.2 | GET | `/api/attendance/report` | Staff (teacher-scoped) | Report summary + rows |
| 5.3 | GET | `/api/attendance/events/:eventId/roster` | Staff (teacher-scoped) | Full roster incl. students with no record |
| 5.4 | GET | `/api/events/:eventId/attendance` | Staff | Recorded attendance only |
| 5.5 | PUT | `/api/admin/events/:eventId/students/:studentId/attendance` | Staff | Set status/remarks (admin: times too) |
| 5.6 | PATCH | `/api/admin/attendance/:attendanceId` | Admin | Correct an existing record |
| 5.7 | GET | `/api/attendance/recent` | Staff (teacher-scoped) | Latest check-ins (live display / dashboard) |
| 5.8 | POST | `/api/admin/attendance/live/reset` | Admin | Hide earlier activity from live views |
| 5.9 | GET | `/api/admin/attendance/logs` | Admin | Raw scan audit trail |
| 5.10 | GET | `/api/admin/overview` | Admin | Legacy counters (unused by the UI) |

Teacher scope: see [[API Contracts/00-conventions#Teacher Scoping]].

---

## 5.1 `GET /api/attendance/overview`

**Response `200`**
```json
{ "ok": true,
  "overview": { "total_students": 320, "attendance_today": 210, "present_today": 190,
                "late_today": 20, "excused_today": 4, "absent_today": 60, "events_in_progress": 2 },
  "heatmap": [ { "activity_date": "2026-11-05", "check_ins": 87 } ] }
```
- `total_students`: active students in scope.
- `present/late/excused/attendance_today`: distinct students with a record on any attendance event that **starts today** (school time zone).
- `absent_today`: roster rows (student × attendance event starting today) with no record, counting only events that have ended, are `ongoing`, or have `attendance_open = true`; `moved`/`cancelled` excluded.
- `events_in_progress`: events with status `ongoing` and not yet ended.
- `heatmap`: check-ins per local day for the last 30 days (only days with data).

**Errors:** `403 teacher_profile_not_found`.

## 5.2 `GET /api/attendance/report`

**Query**

| Param | Required | Rule |
|-------|----------|------|
| `from`, `to` | ✔ | Parseable datetimes, `to` strictly after `from`; filter on event **start** in `[from, to)` |
| `department_id` | | Integer ≥ 1 |
| `year_level` | | Integer 1–10 |
| `event_id` | | Integer ≥ 1 |
| `search` | | Substring of student number, first/last/full name, or event title |
| `include_current` | | `"true"` to include events that have started/are ongoing but not ended. Default: **only ended events** |

A teacher is forced to their department and year; asking for a different `department_id` → `403 forbidden`.

**Response `200`**
```json
{ "ok": true,
  "summary": { "total": 640, "present": 480, "late": 60, "excused": 20, "absent": 80, "attendance_rate": 90.5 },
  "attendance": [ {
    "event_id": 12, "event_title": "Foundation Day", "start_datetime": "2026-11-10T01:00:00.000Z",
    "attendance_id": 301, "time_in": "…", "time_out": null, "remarks": null, "status": "present",
    "student_id": 17, "student_no": "2026-0001", "year_level": 1, "section": "A",
    "user_id": 42, "first_name": "Alex", "last_name": "Student",
    "department_id": 1, "department_code": "BSIT" } ] }
```
- One row per **student × attendance event** in scope; no record ⇒ `status: "absent"`, `attendance_id: null`.
- `attendance_rate = round((present + late) / (total − excused) × 100, 1)`; `0` when the denominator is 0.
- Rows are capped at **10,000** (newest event first) but `summary` is computed over **all** matching rows — a truncated list will not add up to the summary.

**Errors:** `400 invalid_report_filters` · `403 forbidden` · `403 teacher_profile_not_found`.

## 5.3 `GET /api/attendance/events/:eventId/roster`

**Response `200`:** `{ "ok": true, "attendance": [ { "event_id", "event_title", "start_datetime", "student_id", "student_no", "year_level", "section", "first_name", "last_name", "attendance_id", "time_in", "time_out", "status", "remarks", "checklist_status" } ] }`
`checklist_status` = `status` or `"absent"` when no record. Only active students; ordered by year, last name, first name.
**Errors:** `400 invalid_event_id` · `403 teacher_profile_not_found` · `404 attendance_event_not_found` (only when the roster is empty **and** no attendance-requiring event has that ID; an event that exists but has no in-scope students returns an empty list).

## 5.4 `GET /api/events/:eventId/attendance`

Returns only rows that exist in `event_attendance`: `attendance_id, event_id, student_id, student_no, first_name, last_name, time_in, time_out, status, remarks`, ordered by `time_in` (nulls last).
- Admin: any event.
- Teacher: any event that is school-wide **or** in the teacher's department. **Student rows are not filtered by department or year**, so a teacher can see other departments' students on a school-wide event (see [[List of Vulnerabilities#V-06]]).

**Errors:** `400 invalid_event_id`.

---

## 5.5 `PUT /api/admin/events/:eventId/students/:studentId/attendance`

Upserts one student's record for one event.

**Request**
```json
{ "status": "excused", "remarks": "Medical certificate", "time_in": null, "time_out": null }
```

| Field | Rule |
|-------|------|
| `status` | **Required**: `present`, `late`, `absent`, `excused` |
| `remarks` | string ≤ 255 or `null`; trimmed, blank → `null` |
| `time_in`, `time_out` | **Admin only.** ISO string or `null`. Key *presence* matters: omitted = leave unchanged, `null` = clear. If both are strings, `time_out` must be ≥ `time_in` |

Behaviour:
- Student must be in the event's scope (school-wide event, or same department) and, for a teacher, in the teacher's department/year. The event must have `requires_attendance = true`.
- Teachers may change an absent student to `present`, including when the absent row is implicit because no attendance record exists. Other status changes remain admin-only.
- No time supplied and status is `present`/`late` and no `time_in` exists ⇒ `time_in = now()`.
- Setting `absent`/`excused` does **not** clear existing times.
- Event status/dates are **not** checked (future, cancelled, or done events can be edited).
- Points are **not** created or reversed.
- When only one of the two times is sent, it is not compared with the stored other time.

**Response `200`:** `{ "ok": true, "attendance": { "attendance_id", "event_id", "student_id", "time_in", "time_out", "status", "remarks", … } }`

**Errors**

| HTTP | `error` | When |
|------|---------|------|
| 400 | `invalid_attendance_update` | Bad IDs, status, remarks, time format, or `time_out` < `time_in` |
| 403 | `time_edits_are_admin_only` | Teacher sent `time_in` or `time_out` (even `null`) |
| 403 | `teacher_profile_not_found` | Teacher without profile |
| 404 | `event_or_student_not_found` | Event missing / not attendance-based / student out of scope |

## 5.6 `PATCH /api/admin/attendance/:attendanceId`

**Request:** any of `status`, `time_in`, `time_out`, `remarks` (same value rules as 5.5; at least one). The merged final `time_in`/`time_out` are compared, so `time_out` can never end up before `time_in`.
**Response `200`:** `{ "ok": true, "attendance": { … } }`
**Errors:** `400 invalid_attendance_update` · `400 time_out_before_time_in` · `404 attendance_not_found`.

---

## 5.7 `GET /api/attendance/recent`

**Query:** `limit` integer **1–12**, default **3** (the live display sends 5, the dashboard 3).

**Response `200`**
```json
{ "ok": true, "attendance": [ {
  "attendance_id": 301, "event_id": 12, "event_title": "Foundation Day",
  "time_in": "…", "time_out": null, "status": "present",
  "student_id": 17, "student_no": "2026-0001", "year_level": 1, "section": "A",
  "user_id": 42, "first_name": "Alex", "last_name": "Student",
  "photo": "data:image/jpeg;base64,…", "department_code": "BSIT",
  "last_activity": "…" } ] }
```
Ordered by `GREATEST(time_in, time_out)` descending. Only rows with activity **after** the last live reset are returned. `photo` is the full data URL (up to ~300 KB each).
**Errors:** `400 limit_must_be_between_1_and_12` · `403 teacher_profile_not_found`.

## 5.8 `POST /api/admin/attendance/live/reset`

Non-destructive: stores a reset timestamp; no attendance rows are deleted. Applies **globally** (all viewers, including teachers). Creates the `attendance_live_display_state` table/column if missing at call time.

**Request:** empty body. **Response `200`:** `{ "ok": true, "reset_at": "2026-11-06T02:00:00.000Z" }`

## 5.9 `GET /api/admin/attendance/logs`

**Query (all optional):** `result` ∈ {`accepted`,`unknown_card`,`inactive_card`,`no_event`,`duplicate`}; `reader_id` ≥ 1; `from` (inclusive), `to` (exclusive) datetimes. Newest first, max 500.

**Response `200`**
```json
{ "ok": true, "logs": [ { "log_id": "881", "card_uid": "04D4E5F6", "card_id": 9, "reader_id": 1,
  "reader_name": "Main Gate", "event_id": 12, "event_title": "Foundation Day",
  "scanned_at": "…", "result": "accepted" } ] }
```
`reader_name` is `null` for deleted readers. `bad_device` and `reader_paused` are never logged.
**Errors:** `400 invalid_log_result` · `400 invalid_log_filter`.

## 5.10 `GET /api/admin/overview`

Legacy. Returns `{ "ok": true, "overview": { "total_students", "attendance_today", "events_in_progress" } }` using **server/UTC day** and **raw** timestamps (not the school time zone, no active-user filter). Not called by the frontend; prefer 5.1.
