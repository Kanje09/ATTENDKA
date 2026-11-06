# Contract 07 — Directory, Photos, Masterlists & Teams

> **Last synced with codebase:** ATTENDKA-main.zip snapshot (2026-11-06) · `routes/directory_route.ts`, `routes/admin_route.ts`
> Envelope & errors: [[API Contracts/00-conventions]] · Business rules: [[System Documentation#3. Student Directory & Photos]], [[System Documentation#12. Masterlists & Teams]]

| # | Method | Path | Access | Purpose |
|---|--------|------|--------|---------|
| 7.1 | GET | `/api/students` | Staff (teacher-scoped) | Search students |
| 7.2 | PUT | `/api/admin/students/:studentId` | Admin | Edit a student (full replace) |
| 7.3 | PATCH | `/api/admin/teachers/:teacherId/department` | Admin | Set a teacher's department/year scope |
| 7.4 | GET | `/api/admin/students/:userId/photo` | Admin | Read stored photo |
| 7.5 | PUT | `/api/admin/students/:userId/photo` | Admin | Set/clear photo |
| 7.6 | GET | `/api/masterlists` | Staff (teacher: own dept) | List masterlists |
| 7.7 | POST | `/api/masterlists` | Admin | Create masterlist |
| 7.8 | POST | `/api/admin/masterlists` | Admin | Create masterlist (duplicate of 7.7) |
| 7.9 | PATCH | `/api/admin/masterlists/:masterlistId` | Admin | Edit masterlist |
| 7.10 | GET | `/api/masterlists/:masterlistId/students` | Staff (teacher: own dept) | Roster |
| 7.11 | GET | `/api/admin/masterlists/:masterlistId/candidates` | Admin | Department students + `selected` flag |
| 7.12 | POST | `/api/admin/masterlists/:masterlistId/students` | Admin | Add students |
| 7.13 | DELETE | `/api/admin/masterlists/:masterlistId/students` | Admin | Remove students |
| 7.14 | POST | `/api/admin/teams` | Admin | Create team |
| 7.15 | POST | `/api/admin/teams/:teamId/members` | Admin | Add one member |
| 7.16 | POST | `/api/admin/teams/:teamId/members/bulk` | Admin | Add masterlist students |
| 7.17 | POST | `/api/admin/teams/:teamId/advisers` | Admin | Assign adviser |
| 7.18 | GET | `/api/teams` | Staff + Leader | List teams |
| 7.19 | GET | `/api/teams/advising` | Teacher | Teams I advise |
| 7.20 | GET | `/api/teams/:teamId/roster` | Staff (teacher: adviser only) | Team members |
| 7.21 | GET | `/api/teams/:teamId/attendance` | Staff + Leader | Member attendance matrix |
| 7.22 | GET | `/api/teams/:teamId/advisers` | Staff + Leader | Team advisers |

---

## 7.1 `GET /api/students`

**Query (optional):** `department_id` (≥ 1), `year_level` (1–10), `search` (substring of student no., first, last, or full name).
Teachers are forced to their department/year. Only students with an **active** account; max 500; ordered by last/first name.

**Response `200`**
```json
{ "ok": true, "students": [ { "student_id": 17, "student_no": "2026-0001", "department_id": 1, "user_id": 42,
  "department_code": "BSIT", "year_level": 1, "section": "A",
  "first_name": "Alex", "middle_name": null, "last_name": "Student", "email": "alex@example.com" } ] }
```
**Errors:** `400 invalid_department_id` · `400 invalid_year_level` · `403 teacher_profile_not_found`.

## 7.2 `PUT /api/admin/students/:studentId`

Full replace (all required fields must be sent). Updates `users` and `students` in one transaction.

| Field | Rule |
|-------|------|
| `student_no` | Non-blank, ≤ 30 |
| `first_name`, `last_name` | Non-blank, ≤ 80 |
| `middle_name` | string ≤ 80 or `null` |
| `email` | string ≤ 150 or `null` (lower-cased) |
| `department_id` | Integer ≥ 1 (accepts numeric strings) |
| `year_level` | **Number** 1–10 (a numeric string is rejected) |
| `section` | string ≤ 30 or `null` (registration allows only 20) |

Changing `department_id` does not touch existing masterlist or team memberships.
**Response `200`:** `{ "ok": true, "student": { "student_id", "student_no", "department_id", "year_level", "section" } }`
**Errors:** `400 invalid_student_update` · `404 student_not_found` · `409 already_exists` · `400 invalid_reference_or_value`.

## 7.3 `PATCH /api/admin/teachers/:teacherId/department`

**Request:** `{ "department_id": 2, "year_level": null }` — `year_level` integer 1–10 or `null`/omitted (= all years).
**Response `200`:** `{ "ok": true, "teacher": { "teacher_id", "user_id", "department_id", "year_level" } }`
**Errors:** `400 teacher_department_and_optional_year_required` · `404 teacher_not_found`.
Note: path uses `teacher_id`, whereas photo paths below use `user_id`.

## 7.4 `GET /api/admin/students/:userId/photo`

**Response `200`:** `{ "ok": true, "photo": "data:image/jpeg;base64,…" | null }`
**Errors:** `400 invalid_user_id` · `404 user_not_found`.

## 7.5 `PUT /api/admin/students/:userId/photo`

**Request:** `{ "photo": "data:image/jpeg;base64,…" }` or `{ "photo": null }` to remove.
Rules: must match `data:image/(jpeg|png|webp);base64,` and be ≤ **300,000 characters**. The route accepts any `user_id` (not only students).
⚠ The global 32 KB body limit applies first, so a photo larger than roughly 32 KB of JSON fails with `500 server_error` before reaching these checks. The dashboard downsizes to 320 px JPEG (quality 0.7) before upload.

**Response `200`:** `{ "ok": true }`
**Errors:** `400 invalid_photo` · `404 user_not_found`.

---

## Masterlists

A masterlist = department + school year + semester roster.

## 7.6 `GET /api/masterlists`

**Response `200`:** `{ "ok": true, "masterlists": [ { "masterlist_id", "department_id", "department", "school_year", "semester", "created_by", "created_at", "student_count" } ] }` — newest school year first. Teachers see only their department.

## 7.7 / 7.8 `POST /api/masterlists` · `POST /api/admin/masterlists`

Identical behaviour; both Admin-only. The dashboard uses 7.8.

| Field | Rule |
|-------|------|
| `department_id` | Integer ≥ 1 |
| `school_year` | `^\d{4}-\d{4}$` |
| `semester` | `1st`, `2nd`, `summer` |

**Response `201`:** `{ "ok": true, "masterlist": { … } }`
**Errors:** `400 invalid_masterlist` · `400 invalid_reference_or_value` · `409 already_exists` (if the database has a uniqueness rule for the combination).

## 7.9 `PATCH /api/admin/masterlists/:masterlistId`

Same three fields, **all required**. Existing roster rows are kept even if the department changes.
**Errors:** `400 invalid_masterlist` · `404 masterlist_not_found`.

## 7.10 `GET /api/masterlists/:masterlistId/students`

**Response `200`:** `{ "ok": true, "students": [ { "masterlist_id", "student_id", "department", "school_year", "semester", "student_no", "user_id", "last_name", "first_name", "year_level", "section" } ] }`
Teachers: restricted to their department (no year filter); a masterlist outside scope returns an empty list, not an error. **Errors:** `400 invalid_masterlist_id`.

## 7.11 `GET /api/admin/masterlists/:masterlistId/candidates`

All **active** students of the masterlist's department with `selected: true|false`. **Errors:** `400 invalid_masterlist_id` · `404 masterlist_not_found` (only when the result is empty and the masterlist is missing).

## 7.12 `POST /api/admin/masterlists/:masterlistId/students`

**Request:** `{ "student_ids": [17, 18] }` — array of integers ≥ 1, length ≤ 1000 (empty allowed).
Only students **in the masterlist's department** are inserted; others are silently skipped; existing members are ignored.
**Response `201`:** `{ "ok": true, "added": 2 }` — may be lower than requested. An unknown masterlist yields `added: 0`, not `404`.
**Errors:** `400 invalid_masterlist_students`.

## 7.13 `DELETE /api/admin/masterlists/:masterlistId/students`

**Request body (on DELETE):** `{ "student_ids": [17] }` (same rules, duplicates collapsed).
**Response `200`:** `{ "ok": true, "removed": 1 }`. **Errors:** `400 invalid_masterlist_students`.

---

## Teams

## 7.14 `POST /api/admin/teams`

| Field | Rule |
|-------|------|
| `name` | Non-blank, ≤ 100 |
| `school_year` | `^\d{4}-\d{4}$` |
| `logo_url` | string ≤ 255 or `null` (not fetched or validated as a URL) |

**Response `201`:** `{ "ok": true, "team": { "team_id", "name", "logo_url", "school_year", … } }` · **Errors:** `400 invalid_team`.

## 7.15 `POST /api/admin/teams/:teamId/members`

**Request:** `{ "student_id": 17 }`. **Response `201`:** `{ "ok": true, "member": { "team_id", "student_id", … } }`
**Errors:** `400 invalid_team_member` · `400 invalid_reference_or_value` (unknown team/student) · `409 already_exists` (already a member).

## 7.16 `POST /api/admin/teams/:teamId/members/bulk`

**Request:** `{ "masterlist_id": 3, "student_ids": [17, 18] }` — 1–1000 IDs; duplicates collapsed.
Every ID **must** be on that masterlist, otherwise the whole call is rejected. Existing members are skipped.
**Response `201`:** `{ "ok": true, "added": 2 }`
**Errors:** `400 invalid_bulk_team_members` · `400 students_must_belong_to_selected_masterlist` · `404 team_not_found`.
Membership no longer changes a student's role.

## 7.17 `POST /api/admin/teams/:teamId/advisers`

**Request:** `{ "teacher_id": 5 }`. **Response `201`:** `{ "ok": true, "adviser": { "team_id", "teacher_id", … } }`
**Errors:** `400 team_id_and_teacher_id_required` · `400 invalid_reference_or_value` · `409 already_exists`. There is no endpoint to remove members or advisers, or to delete a team.

## 7.18 `GET /api/teams`

Admins and teachers: **all** teams. `team_leader`: only teams where they are marked leader (via the legacy view `v_team_leader_teams`).
**Response `200`:** `{ "ok": true, "teams": [ { "team_id", "name", "logo_url", "school_year", "member_count" } ] }`

## 7.19 `GET /api/teams/advising`

**Access:** Teacher only. Teams the caller advises: `{ team_id, name, school_year, member_count }`.

## 7.20 `GET /api/teams/:teamId/roster`

**Response `200`:** `{ "ok": true, "members": [ { "team_id", "team_name", "student_id", "student_no", "year_level", "section", "first_name", "last_name" } ] }`
**Errors:** `400 invalid_team_id` · `403 team_adviser_required` (teacher who is not an adviser of this team) · `404 team_not_found`.

## 7.21 `GET /api/teams/:teamId/attendance`

For every member × every attendance-requiring event that applies to the member (school-wide or their department) — **not** limited to events tied to the team. Fields: `team_id, team_name, event_id, event_title, start_datetime, student_no, student_name, time_in, time_out, status` (`status` is `null` when no record).
Teacher must be an adviser (`403 team_adviser_required`); a `team_leader` who is not leader of the team receives an empty list. **Errors:** `400 invalid_team_id`.

## 7.22 `GET /api/teams/:teamId/advisers`

**Response `200`:** `{ "ok": true, "advisers": [ { "user_id", "first_name", "last_name", "employee_no" } ] }`
**Errors:** `400 invalid_team_id` · `403 forbidden` (a `team_leader` not leading this team). Any teacher may read any team's advisers.
