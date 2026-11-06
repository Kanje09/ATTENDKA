# Contract 01 — Auth & Accounts

> **Last synced with codebase:** ATTENDKA-main.zip snapshot (2026-11-06) · `routes/users_route.ts`, `routes/admin_route.ts`, `services/auth_service.ts`, `middleware/auth.ts`
> Envelope, auth, and global errors: [[API Contracts/00-conventions]] · Business rules: [[System Documentation#1. Authentication & Sessions]], [[System Documentation#2. Account & Department Administration]]

| # | Method | Path | Access | Purpose |
|---|--------|------|--------|---------|
| 1.1 | GET | `/` | Public | Liveness |
| 1.2 | GET | `/health/db` | Public | Database connectivity |
| 1.3 | POST | `/api/auth/register` | Public | Student self-registration (auto sign-in) |
| 1.4 | POST | `/api/auth/login` | Public | Sign in by username or email |
| 1.5 | GET | `/api/auth/me` | Login | Current profile |
| 1.6 | PATCH | `/api/auth/me` | Staff | Edit own name/email |
| 1.7 | POST | `/api/auth/password` | Login | Change own password |
| 1.8 | GET | `/api/admin/users` | Admin | Search accounts |
| 1.9 | POST | `/api/admin/users` | Admin | Create teacher or admin |
| 1.10 | PATCH | `/api/admin/users/:userId/active` | Admin | Activate / deactivate |

The first admin is **not** created through the API: run `npm run create-admin` with `ADMIN_USERNAME` (≥3 chars) and `ADMIN_PASSWORD` (≥12 chars) set; optional `ADMIN_FIRST_NAME`, `ADMIN_LAST_NAME`, `ADMIN_EMAIL`, `ADMIN_POSITION`.

---

## 1.1 `GET /`

**Access:** Public

**Response `200`**
```json
{ "ok": true, "service": "ATTENDKA API" }
```

## 1.2 `GET /health/db`

**Access:** Public

**Response `200`**
```json
{ "ok": true, "database": "connected" }
```
**Errors:** `500 server_error` if PostgreSQL is unreachable.

---

## 1.3 `POST /api/auth/register`

**Access:** Public · creates a `student` user and a `students` profile in one transaction.

**Request**

| Field | Type | Required | Rule |
|-------|------|----------|------|
| `username` | string | ✔ | Trimmed length ≥ 3; raw length ≤ 50 |
| `password` | string | ✔ | 8–200 characters |
| `first_name` | string | ✔ | Non-blank, ≤ 80 |
| `middle_name` | string \| null | | ≤ 80 |
| `last_name` | string | ✔ | Non-blank, ≤ 80 |
| `email` | string \| null | | ≤ 150 (format **not** validated); stored lower-cased |
| `student_no` | string | ✔ | Non-blank, ≤ 30 |
| `department_id` | integer | ✔ | ≥ 1, must exist |
| `year_level` | integer | ✔ | 1–10 (the registration form offers 1–5) |
| `section` | string \| null | | ≤ 20 |

**Response `201`**
```json
{
  "ok": true,
  "user": {
    "user_id": 42, "username": "student01", "role": "student",
    "first_name": "Alex", "middle_name": null, "last_name": "Student",
    "email": "alex@example.com", "student_id": 17
  },
  "token": "v1.eyJ…"
}
```

**Errors**

| HTTP | `error` | When |
|------|---------|------|
| 400 | `invalid_registration` | Any field above fails |
| 400 | `invalid_reference_or_value` | `department_id` does not exist |
| 409 | `already_exists` | Username, email, or student number already taken |

---

## 1.4 `POST /api/auth/login`

**Access:** Public

**Request**

| Field | Type | Rule |
|-------|------|------|
| `username` | string | One of `username` / `email` required |
| `email` | string | If both are sent, **`email` wins** |
| `password` | string | Required, 1–200 characters |

The identifier is compared case-insensitively against **both** the email and username columns, so either field name works for either value. Only active accounts match.

**Response `200`**
```json
{
  "ok": true,
  "user": { "user_id": 1, "username": "admin", "role": "admin",
            "first_name": "System", "middle_name": null, "last_name": "Administrator",
            "email": null, "student_id": null },
  "token": "v1.eyJ…"
}
```
Side effect: `users.last_login = now()`.

**Errors**

| HTTP | `error` | When |
|------|---------|------|
| 400 | `email_or_username_and_password_required` | Missing/ non-string fields, empty or >200-char password |
| 401 | `invalid_credentials` | Unknown, inactive, or wrong password (same code for all three) |

---

## 1.5 `GET /api/auth/me`

**Access:** Login

**Response `200`**
```json
{
  "ok": true,
  "user": {
    "user_id": 42, "username": "student01", "role": "student",
    "first_name": "Alex", "middle_name": null, "last_name": "Student",
    "email": "alex@example.com", "photo": "data:image/jpeg;base64,…",
    "student_id": 17, "student_no": "2026-0001", "department_id": 1,
    "year_level": 1, "section": "A",
    "teacher_id": null, "employee_no": null,
    "teaching_department_id": null, "teaching_year_level": null
  }
}
```
Fields for the other role are `null`. `photo` may be a large data URL.

**Errors:** `404 user_not_found` (account deactivated between auth check and query).

---

## 1.6 `PATCH /api/auth/me`

**Access:** Staff (admin, teacher). Students and legacy team leaders are rejected.

**Request** — at least one of:

| Field | Rule |
|-------|------|
| `first_name` | Non-blank, ≤ 80 |
| `last_name` | Non-blank, ≤ 80 |
| `email` | string ≤ 150, or `null` |

`middle_name` cannot be changed here. A non-string `email` is stored as `NULL`; an empty string `""` is stored as an empty string (not `NULL`), which can collide with another account's empty email (`409`).

**Response `200`**
```json
{ "ok": true, "user": { "user_id": 1, "username": "admin", "role": "admin",
                         "first_name": "System", "last_name": "Admin", "email": "a@x.edu" } }
```

**Errors**

| HTTP | `error` | When |
|------|---------|------|
| 400 | `no_profile_fields_to_update` | None of the three fields present |
| 400 | `invalid_profile_update` | Validation failed |
| 403 | `students_cannot_update_profile` | Caller is `student` or `team_leader` |
| 404 | `user_not_found` | Account no longer active |
| 409 | `already_exists` | Email in use |

---

## 1.7 `POST /api/auth/password`

**Access:** Login

**Request**
```json
{ "current_password": "old-secret", "new_password": "new-secret-123" }
```
`new_password`: 8–200 characters. It may equal the old password. Existing tokens stay valid after the change.

**Response `200`**
```json
{ "ok": true, "message": "password_updated" }
```

**Errors**

| HTTP | `error` | When |
|------|---------|------|
| 400 | `current_and_new_password_required` | Missing, non-string, or new password outside 8–200 |
| 400 | `current_password_incorrect` | Current password wrong (note: `400`, not `401`) |

---

## 1.8 `GET /api/admin/users`

**Access:** Admin

**Query**

| Param | Rule |
|-------|------|
| `role` | Optional; one of the four roles |
| `search` | Optional; case-insensitive substring of username, first/last name, student number, or employee number |

**Response `200`** — newest first, max 500.
```json
{ "ok": true, "users": [ {
  "user_id": 42, "username": "student01", "role": "student",
  "first_name": "Alex", "middle_name": null, "last_name": "Student",
  "email": "alex@example.com", "is_active": true,
  "last_login": "2026-11-05T01:00:00.000Z", "created_at": "2026-10-01T02:00:00.000Z",
  "student_id": 17, "student_no": "2026-0001", "department_id": 1,
  "teacher_id": null, "employee_no": null,
  "teaching_department_id": null, "teaching_year_level": null } ] }
```
**Errors:** `400 invalid_role`.

---

## 1.9 `POST /api/admin/users`

**Access:** Admin · creates a `teacher` or `admin` account plus the matching profile row, in one transaction.

**Request**

| Field | Type | Required | Rule |
|-------|------|----------|------|
| `username` | string | ✔ | Trimmed ≥ 3; raw ≤ 50 |
| `password` | string | ✔ | 8–200 |
| `first_name` / `last_name` | string | ✔ | Non-blank, ≤ 80 |
| `middle_name` | string \| null | | ≤ 80 |
| `email` | string \| null | | ≤ 150 |
| `role` | string | ✔ | `teacher` or `admin` only |
| `employee_no` | string | ✔ if teacher | Non-blank, ≤ 30 |
| `department_id` | integer | ✔ if teacher | ≥ 1, must exist |
| `year_level` | integer \| null | | Teacher only; 1–10; `null`/omitted = all years |
| `position` | string \| null | | Admin only; ≤ 100 |

**Response `201`**
```json
{ "ok": true, "user": { "user_id": 51, "username": "t.cruz", "role": "teacher",
                         "first_name": "Tess", "last_name": "Cruz", "email": null } }
```

**Errors:** `400 invalid_user` · `400 invalid_reference_or_value` (unknown department) · `409 already_exists` (username, email, or employee number).

---

## 1.10 `PATCH /api/admin/users/:userId/active`

**Access:** Admin

**Request**
```json
{ "is_active": false }
```

**Response `200`**
```json
{ "ok": true, "user": { "user_id": 42, "username": "student01", "role": "student", "is_active": false } }
```

**Errors**

| HTTP | `error` | When |
|------|---------|------|
| 400 | `user_id_and_is_active_required` | Bad ID or non-boolean |
| 400 | `cannot_deactivate_current_user` | Admin deactivating themselves |
| 404 | `user_not_found` | No such user |

Effect: the user's tokens are rejected on their next request (`401 account_inactive_or_not_found`), and their cards produce `inactive_card` on scans.
