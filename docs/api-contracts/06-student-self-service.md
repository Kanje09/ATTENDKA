# Contract 06 — Student Self-Service & Points

> **Last synced with codebase:** ATTENDKA-main.zip snapshot (2026-11-06) · `routes/attendance_route.ts`, `routes/admin_route.ts`
> Envelope & errors: [[API Contracts/00-conventions]] · Business rules: [[System Documentation#10. Points Ledger]], [[System Documentation#11. Student Self-Service]]

| # | Method | Path | Access | Purpose |
|---|--------|------|--------|---------|
| 6.1 | GET | `/api/students/me/points` | Student | Own total and daily activity |
| 6.2 | GET | `/api/students/me/events` | Student | Own event list with attendance state |
| 6.3 | PUT | `/api/students/me/events/:eventId/checklist` | Student | Personal "done" tick (compatibility; UI no longer uses it) |
| 6.4 | POST | `/api/admin/points` | Admin | Add/deduct points manually |

"Student" = roles `student` and `team_leader`; the caller must have a `students` profile.

---

## 6.1 `GET /api/students/me/points`

**Response `200`**
```json
{ "ok": true,
  "points": { "student_id": 17, "total_points": 25 },
  "activity": [ { "activity_date": "2026-11-05", "points": 5,
     "entries": [ { "event_title": "Foundation Day", "points": 5, "reason": "Attended: Foundation Day" } ] } ] }
```
`total_points` = sum of the ledger (can be negative after deductions). `activity` is grouped by school-local day, oldest first.
**Errors:** `404 student_profile_not_found`.

## 6.2 `GET /api/students/me/events`

**Query (optional):** `from`, `to` (datetimes; overlap filter: event end ≥ `from`, start < `to`; `to` must be after `from`).

Returns every event that is school-wide or in the student's department — **including events that do not require attendance**.

**Response `200`**
```json
{ "ok": true, "events": [ {
  "event_id": 12, "title": "Foundation Day", "description": null, "event_type": "other", "venue": "Gym",
  "start_datetime": "…", "end_datetime": "…", "requires_attendance": true, "points": 5,
  "event_status": "ongoing", "attendance_open": true, "status_note": null,
  "time_in": "…", "time_out": null, "status": "present", "checklist_status": "Checked in" } ] }
```

`checklist_status` is the first matching row:

| Order | Condition | Label |
|-------|-----------|-------|
| 1 | attendance `status = excused` | `Excused` |
| 2 | `present`/`late` and no `time_out` | `Checked in` |
| 3 | `present`/`late` with `time_out` | `Complete` |
| 4 | event `moved` | `Moved` |
| 5 | event `cancelled` | `Not continuing` |
| 6 | event `done` | `Done` ← also shown to students who were absent |
| 7 | event does not require attendance | `School event` |
| 8 | event ended | `Absent` |
| 9 | otherwise | `Upcoming` |

**Errors:** `400 invalid_event_date_range`.

## 6.3 `PUT /api/students/me/events/:eventId/checklist`

**Request:** `{ "is_done": true }` (strict boolean). Upserts a private tick in `student_event_checklist`; it never affects attendance or points.
**Response `200`:** `{ "ok": true, "checklist": { "event_id": 12, "is_done": true, "completed_at": "…" } }` (`completed_at` is `null` when `is_done` is false).
**Errors:** `400 event_id_and_checklist_status_required` · `404 student_or_event_not_found` (event missing or not in the student's department/school-wide).

## 6.4 `POST /api/admin/points`

**Request**

| Field | Rule |
|-------|------|
| `student_id` | Integer ≥ 1; must exist |
| `event_id` | Optional; `null` or integer ≥ 1 (must exist) |
| `points` | Non-zero **integer**; negative = deduction; no magnitude limit |
| `reason` | Non-blank string ≤ 255 |

**Response `201`:** `{ "ok": true, "point": { "student_id", "event_id", "points", "reason", "awarded_by", "created_at", … } }` (`awarded_by` = admin's `user_id`).
**Errors:** `400 invalid_point_adjustment` · `400 invalid_reference_or_value` (unknown student/event).
Entries are append-only; there is no edit or delete endpoint, and no duplicate check.
