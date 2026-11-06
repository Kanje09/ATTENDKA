# Contract 02 — Departments & Events

> **Last synced with codebase:** ATTENDKA-main.zip snapshot (2026-11-06) · `routes/directory_route.ts` (departments), `routes/events_route.ts`, `routes/admin_route.ts` (department create)
> Envelope & errors: [[API Contracts/00-conventions]] · Business rules: [[System Documentation#4. Events & School Calendar]]

| # | Method | Path | Access | Purpose |
|---|--------|------|--------|---------|
| 2.1 | GET | `/api/departments` | Public | Active departments |
| 2.2 | POST | `/api/admin/departments` | Admin | Create department |
| 2.3 | GET | `/api/events` | Public | List/filter events |
| 2.4 | GET | `/api/events/:eventId` | Public | One event |
| 2.5 | POST | `/api/events` | Admin | Create event |
| 2.6 | PATCH | `/api/events/:eventId` | Admin | Update event / lifecycle / attendance switch |
| 2.7 | DELETE | `/api/events/:eventId` | Admin | Delete event |

---

## 2.1 `GET /api/departments`

**Response `200`** — only `is_active = true`, ordered by name.
```json
{ "ok": true, "departments": [ { "department_id": 1, "code": "BSIT", "name": "BS Information Technology" } ] }
```

## 2.2 `POST /api/admin/departments`

**Request**

| Field | Rule |
|-------|------|
| `code` | `^[A-Za-z0-9_-]{2,10}$`; stored **upper-cased** |
| `name` | Non-blank, ≤ 150 |

**Response `201`**
```json
{ "ok": true, "department": { "department_id": 4, "code": "BSED", "name": "BS Education", "is_active": true } }
```
**Errors:** `400 invalid_department` · `409 already_exists`.
There is no endpoint to rename or deactivate a department.

---

## 2.3 `GET /api/events`

**Access:** Public (no token). Max 500 rows, ordered by `start_datetime`.

**Query (all optional, combined with AND)**

| Param | Rule |
|-------|------|
| `date` | `YYYY-MM-DD`; events whose **start** falls in that school-local day |
| `from` | Datetime; events whose **end** ≥ `from` (overlap semantics) |
| `to` | Datetime; events whose **start** < `to` |
| `department_id` | Integer ≥ 1; returns that department's events **plus school-wide** events |
| `type` | One of the seven event types |

**Response `200`**
```json
{ "ok": true, "events": [ {
  "event_id": 12, "title": "Foundation Day", "description": null,
  "event_type": "other", "venue": "Gym",
  "start_datetime": "2026-11-10T01:00:00.000Z", "end_datetime": "2026-11-10T09:00:00.000Z",
  "department_id": null, "department_code": null,
  "requires_attendance": true, "points": 5,
  "event_status": "pending", "attendance_open": false, "status_note": null,
  "created_by": 1, "created_at": "2026-10-01T02:00:00.000Z" } ] }
```

**Errors:** `400 valid_date_required` · `400 invalid_from_date` · `400 invalid_to_date` · `400 invalid_department_id` · `400 invalid_event_type`.

## 2.4 `GET /api/events/:eventId`

**Access:** Public · returns every events column plus `department_code`.

**Response `200`:** `{ "ok": true, "event": { … } }`
**Errors:** `400 invalid_event_id` · `404 event_not_found`.

---

## 2.5 `POST /api/events`

**Access:** Admin

**Request**

| Field | Type | Required | Rule |
|-------|------|----------|------|
| `title` | string | ✔ | Non-blank, ≤ 200 |
| `event_type` | string | ✔ | One of the seven types |
| `start_datetime` | string | ✔ | Parseable datetime — send an offset |
| `end_datetime` | string | ✔ | Parseable and strictly **after** start |
| `requires_attendance` | boolean | | Default `true`; must be a real boolean |
| `points` | integer | | Default `0`; ≥ 0; no upper bound |
| `department_id` | integer \| null | | `null`/omitted = school-wide; else ≥ 1 and must exist |
| `description` | string \| null | | Not length-checked |
| `venue` | string \| null | | Not length-checked on create (≤ 150 enforced on update) |

New events start as `event_status = "pending"`, `attendance_open = false`. `created_by` = caller.

**Response `201`:** `{ "ok": true, "event": { …all columns… } }`
**Errors:** `400 invalid_event` · `400 invalid_reference_or_value` (unknown department).

---

## 2.6 `PATCH /api/events/:eventId`

**Access:** Admin · partial update; at least one field.

| Field | Rule |
|-------|------|
| `title` | Non-blank, ≤ 200 |
| `description` | string or `null` |
| `event_type` | One of the seven types |
| `venue` | string ≤ 150 or `null` |
| `start_datetime`, `end_datetime` | Parseable. After merging with stored values, end must be strictly after start |
| `department_id` | integer ≥ 1 or `null` |
| `requires_attendance` | boolean |
| `points` | integer ≥ 0 |
| `event_status` | `pending`, `ongoing`, `moved`, `done`, `cancelled` — **no transition rules**; any value may follow any other |
| `attendance_open` | boolean — the explicit "scans may record time-in" switch |
| `status_note` | string ≤ 255 or `null` |

Changing `event_status` does **not** change `attendance_open` on the server. The dashboard sends `attendance_open: false` itself when saving `done`/`moved`/`cancelled`.
Changing `points` later does not alter points already awarded.

**Response `200`:** `{ "ok": true, "event": { … } }`

**Errors**

| HTTP | `error` | When |
|------|---------|------|
| 400 | `invalid_event_id` | Bad ID |
| 400 | `no_event_fields_to_update` | Empty/unknown fields only |
| 400 | `invalid_event_update` | A field fails its rule |
| 400 | `event_end_must_follow_start` | Merged end ≤ start |
| 400 | `invalid_reference_or_value` | Unknown department |
| 404 | `event_not_found` | No such event |

## 2.7 `DELETE /api/events/:eventId`

**Access:** Admin · **hard delete**.

**Response `200`:** `{ "ok": true, "deleted": true }`
**Errors:** `400 invalid_event_id` · `404 event_not_found` · `400 invalid_reference_or_value` if the database refuses deletion because dependent rows exist. Reader assignments and personal checklist rows are removed by cascade (migrations 002/003); behaviour for `event_attendance`/`attendance_points` depends on the base schema, which is not in the repository.
