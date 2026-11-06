# Contract 03 — RFID Devices & Cards

> **Last synced with codebase:** ATTENDKA-main.zip snapshot (2026-11-06) · `routes/admin_route.ts`, `routes/attendance_route.ts` (heartbeat)
> Envelope & errors: [[API Contracts/00-conventions]] · Business rules: [[System Documentation#5. RFID Readers, Cards & Assignments]] · Scan flow: [[API Contracts/04-scan-processing]]

| # | Method | Path | Access | Purpose |
|---|--------|------|--------|---------|
| 3.1 | GET | `/api/admin/readers` | Admin | List readers with online state and today's assignment |
| 3.2 | POST | `/api/admin/readers` | Admin | Register a reader (returns its key once) |
| 3.3 | PATCH | `/api/admin/readers/:readerId` | Admin | Pause / resume |
| 3.4 | DELETE | `/api/admin/readers/:readerId` | Admin | Remove reader |
| 3.5 | POST | `/api/reader/heartbeat` | Reader key | Mark reader online |
| 3.6 | GET | `/api/admin/cards` | Admin | List all cards |
| 3.7 | POST | `/api/admin/cards` | Admin | Assign a card UID to a student |
| 3.8 | PATCH | `/api/admin/cards/:cardId` | Admin | Reassign / unassign / change status |
| 3.9 | GET | `/api/admin/rfid/event-assignments` | Admin | Reader→event assignments for a date |
| 3.10 | PUT | `/api/admin/rfid/event-assignments` | Admin | Assign (or re-assign) a reader to an event for a date |

---

## 3.1 `GET /api/admin/readers`

**Response `200`** — ordered by name.
```json
{ "ok": true, "readers": [ {
  "reader_id": 1, "reader_name": "Main Gate", "location": "Gate 1",
  "is_active": true, "last_seen_at": "2026-11-06T01:00:10.000Z", "is_online": true,
  "assigned_event_title": "Foundation Day", "assigned_event_status": "ongoing",
  "assigned_event_start": "2026-11-06T00:00:00.000Z", "assigned_event_end": "2026-11-06T09:00:00.000Z" } ] }
```
- `is_online` = `last_seen_at` within the last **65 seconds** (heartbeat or any scan). `false` if never seen or the column is missing.
- `assigned_*` come from today's assignment (school time zone); `null` if none. `device_key` is **never** returned here.

## 3.2 `POST /api/admin/readers`

**Request:** `reader_name` (required, non-blank, ≤ 80), `location` (optional string; blank → `null`).

**Response `201`**
```json
{ "ok": true,
  "reader": { "reader_id": 3, "reader_name": "Hall A", "location": null, "is_active": true },
  "device_key": "kF3…43-char-base64url" }
```
`device_key` (32 random bytes) is shown **only in this response** and cannot be retrieved later. Lost key → delete or pause the reader and create a new one.

**Errors:** `400 invalid_reader_name`.

## 3.3 `PATCH /api/admin/readers/:readerId`

**Request:** `{ "is_active": false }` (boolean required).
**Response `200`:** `{ "ok": true, "reader": { "reader_id", "reader_name", "location", "is_active" } }`
**Errors:** `400 reader_id_and_is_active_required` · `404 reader_not_found`.
A paused reader still answers heartbeats (`is_active:false`) but every scan returns `403 reader_paused`.

## 3.4 `DELETE /api/admin/readers/:readerId`

Transaction: sets `attendance_logs.reader_id = NULL` for that reader (logs are kept), then deletes the reader; its assignments cascade away.
**Response `200`:** `{ "ok": true, "reader": { "reader_id": 3, "reader_name": "Hall A" } }`
**Errors:** `400 invalid_reader_id` · `404 reader_not_found`.

---

## 3.5 `POST /api/reader/heartbeat`

**Access:** Reader key · called by firmware every **20 s**.

**Request:** header `x-device-key`; empty body.

**Response `200`**
```json
{ "ok": true, "reader_id": 1, "is_active": true }
```
Side effect: `rfid_readers.last_seen_at = now()`.

**Errors**

| HTTP | Body | When |
|------|------|------|
| 400 | `{ "ok": false, "error": "device_key_required" }` | Header missing |
| 401 | `{ "ok": false, "result": "bad_device" }` | Unknown key |

---

## 3.6 `GET /api/admin/cards`

**Response `200`** — newest first, **not limited**.
```json
{ "ok": true, "cards": [ {
  "card_id": 9, "card_uid": "04D4E5F6", "user_id": 42, "status": "active",
  "issued_at": "2026-10-02T03:00:00.000Z", "deactivated_at": null,
  "first_name": "Alex", "last_name": "Student", "student_id": 17, "student_no": "2026-0001" } ] }
```
Unassigned cards have `user_id`, names, `student_id` = `null`.

## 3.7 `POST /api/admin/cards`

**Request:** `student_id` (integer ≥ 1) and `card_uid` (normalised per [[API Contracts/00-conventions#Data Formats]]; 1–50 chars after normalisation).

**Response `201`**
```json
{ "ok": true, "card": { "card_id": 9, "card_uid": "04D4E5F6", "user_id": 42, "status": "active", "issued_at": "…" } }
```
Cards are bound to `student_id`, which the API resolves to the student's `user_id`. A student can hold several cards.

**Errors:** `400 student_id_and_card_uid_required` · `404 student_not_found` · `409 already_exists` (UID already registered, even to someone else or unassigned).

## 3.8 `PATCH /api/admin/cards/:cardId`

**Request** — at least one of:

| Field | Rule |
|-------|------|
| `status` | `active`, `inactive`, `lost`, `blocked` |
| `student_id` | Integer ≥ 1 to (re)assign; `null` to unassign |

State effects:

| Request | Resulting card |
|---------|----------------|
| `student_id: null` | `user_id = NULL`, `status = inactive`, `deactivated_at = now()` (a `status` in the same call is ignored) |
| `student_id: n` | Re-linked; `status` = given status or `active`; `deactivated_at` cleared when `active` |
| `status` only | Status changed; `deactivated_at = now()` unless `active` (then cleared) |

**Response `200`:** `{ "ok": true, "card": { "card_id", "card_uid", "user_id", "status", "issued_at", "deactivated_at" } }`
**Errors:** `400 invalid_card_update` · `404 student_not_found` · `404 card_not_found`.

---

## 3.9 `GET /api/admin/rfid/event-assignments?date=YYYY-MM-DD`

`date` is required (`400 valid_date_required`). Returns assignments for that date whose event **starts** in that school-local day.

**Response `200`**
```json
{ "ok": true, "assignments": [ {
  "reader_id": 1, "attendance_date": "2026-11-06", "event_id": 12, "attendance_mode": "auto",
  "reader_name": "Main Gate", "event_title": "Foundation Day",
  "local_day_start": "2026-11-05T16:00:00.000Z", "local_day_end": "2026-11-06T16:00:00.000Z" } ] }
```

## 3.10 `PUT /api/admin/rfid/event-assignments`

One assignment per reader per date; a second `PUT` for the same reader+date **overwrites**. There is no delete.

**Request**
```json
{ "reader_id": 1, "event_id": 12, "attendance_date": "2026-11-06", "attendance_mode": "auto" }
```

| Field | Rule |
|-------|------|
| `reader_id` | Integer ≥ 1; reader must exist **and be active** |
| `event_id` | Integer ≥ 1; event must exist, `requires_attendance = true`, and **start within** `attendance_date` (school-local day) |
| `attendance_date` | Real `YYYY-MM-DD` |
| `attendance_mode` | `auto` (default), `time_in`, `time_out` |

**Response `200`**
```json
{ "ok": true, "assignment": { "reader_id": 1, "attendance_date": "2026-11-06", "event_id": 12, "attendance_mode": "auto" } }
```

**Errors**

| HTTP | `error` | When |
|------|---------|------|
| 400 | `valid_date_required` | Bad date |
| 400 | `reader_event_and_attendance_mode_required` | Bad IDs or mode |
| 400 | `reader_not_found_or_inactive` | Unknown or paused reader |
| 400 | `event_not_found` | Unknown event |
| 400 | `event_does_not_require_attendance` | Event has no attendance |
| 400 | `event_not_on_selected_local_date` | Event starts outside that day |
| 409 | `reader_or_event_changed_during_assignment` | Row vanished between validation and insert |

The assignment is only consulted on its `attendance_date` (compared with *today* in the school time zone at scan time).
