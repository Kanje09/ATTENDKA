# ATTENDKA System Guide

ATTENDKA is an RFID attendance system. The ESP32 reads a card and sends its UID to the backend. The backend checks the reader, card, student, and current event in PostgreSQL, then records attendance and points.

## How the parts work together

```text
Postman or HTML/CSS/JS frontend ── HTTP API + bearer token ──┐
                                                     ├── Express backend ── PostgreSQL
ESP32 RFID reader ─────── HTTP API + reader key ─────┘
```

- **PostgreSQL** stores accounts, student and teacher profiles, departments, events, RFID readers and cards, attendance, points, masterlists, and teams.
- **The backend** is a Node.js/TypeScript application using Express and `pg`. It validates requests, checks permissions, runs database queries, and returns JSON.
- **Postman** is useful for manually testing the API. The static frontend can call the same API from a browser.
- **The ESP32** reads a card UID and sends it to the scan endpoint. It authenticates as a registered RFID reader, not as a user.

Names and login accounts are stored in `users`. Student-specific information is in `students`; teacher-specific information is in `teachers`; admin-specific information, such as position, is in `admins`. The profile tables link to `users` using `user_id`. Passwords are stored as salted hashes, never as readable passwords.

## Start the backend

Use the PostgreSQL database you already created in pgAdmin 4. The backend connects to it using the database settings in `Backend/.env`; it does not create a database for you.

Open PowerShell:

```powershell
cd C:\Users\lenovo\Downloads\ATTENDKA\Backend
npm run build
npm run dev
```

Keep the terminal open while using the API. By default, the server listens on port `5000`.

Check the server in a browser or Postman:

- `GET http://localhost:5000/` — checks that the API is running.
- `GET http://localhost:5000/health/db` — checks that it can connect to PostgreSQL.

If the database health check fails, verify PostgreSQL is running and the existing database connection values in `.env` are correct. The database must already have the ATTENDKA tables from the schema you created in pgAdmin. This repository does not include a full base schema; do not recreate tables that already exist. After applying your existing schema, run these migrations in order in pgAdmin or `psql`:

1. `database/migrations/002_rfid_event_assignments.sql` creates daily RFID event assignments.
2. `database/migrations/003_student_event_checklist.sql` creates the separate student personal event checklist.
3. `database/migrations/004_event_lifecycle_and_rfid_mode.sql` adds event lifecycle status, RFID check-in/out modes, and teacher year-level scope.
4. `database/migrations/005_event_venue.sql` ensures the event API's venue, lifecycle status, and status-note columns exist.
5. `database/migrations/006_repair_rfid_event_assignments.sql` safely ensures the reader assignment table and its attendance mode column/check constraint exist.
6. `database/migrations/007_rfid_reader_heartbeat.sql` adds the reader last-seen timestamp used by online/offline detection.
7. `database/migrations/008_live_attendance_reset.sql` adds a non-destructive live-display reset cursor.
8. `database/migrations/009_event_attendance_open.sql` adds the explicit event attendance open/closed switch.

Migrations 004–009 are safe to rerun. Migration 006 is a repair migration for databases where the earlier assignment-table/mode migration did not finish or was skipped. Existing events become `pending`; admins can use **Open attendance now** to activate an event early or set its status to `ongoing`.

Apply migration 007 to add `rfid_readers.last_seen_at`. The reader list remains compatible with databases before migration 007 (readers will appear offline), but authenticated heartbeats and recording last-seen scan times require the migration.

Apply migration 008 to enable **Reset live display**. It hides prior check-ins from the live screen without deleting the underlying attendance records; new check-ins continue to appear.

Apply migration 009 before using event attendance open/close controls or RFID scans. The open flag is separate from event lifecycle status, allowing an admin to close new time-ins while retaining the event and allowing assigned manual time-outs.

The `.env` file contains private database credentials and the token-signing secret. Do not share it or commit it to Git.

For a production build:

```powershell
npm run build
npm start
```

## Accounts, login, and permissions

The supported roles are `student`, `teacher`, `admin`, and `team_leader`.

1. The first admin account is created from the backend command line with `npm run create-admin`, using `ADMIN_USERNAME` and `ADMIN_PASSWORD` configured in `.env`. Admins can create additional admin or teacher accounts using the API.
2. Students can register through `POST /api/auth/register`.
3. Accounts log in using `POST /api/auth/login`, with either username or email and their password.
4. Login returns an access token. In Postman, open the **Authorization** tab, select the **Bearer** authentication scheme, and paste the access token for protected routes.
5. Tokens expire after 12 hours. Protected requests also verify that the account is still active and use its current database role.

Never send a user's password hash in an API response. The plain password is only supplied at registration/login; the backend stores a salted scrypt hash.

## API routes

Use `http://localhost:5000` as the base URL during local Postman testing. Routes marked **Login required** require the access token from a logged-in user. Routes marked **Reader key** require the reader's `x-device-key` header.

### Health and authentication

| Method | Route | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/` | Public | Confirm the API is running |
| `GET` | `/health/db` | Public | Check the PostgreSQL connection |
| `POST` | `/api/auth/register` | Public | Register a student account and student profile |
| `POST` | `/api/auth/login` | Public | Log in using username or email and password |
| `GET` | `/api/auth/me` | Login required | Return the current user's profile |
| `PATCH` | `/api/auth/me` | Admin/teacher | Update your own name or email |
| `POST` | `/api/auth/password` | Login required | Change your password |

Student registration JSON example:

```json
{
  "username": "student01",
  "password": "a-strong-password",
  "first_name": "Alex",
  "last_name": "Student",
  "email": "alex@example.com",
  "student_no": "2026-0001",
  "department_id": 1,
  "year_level": 1,
  "section": "A"
}
```

The `department_id` must refer to a department that already exists. Admins and teachers are created by an administrator, not by student self-registration.

### Events and departments

| Method | Route | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/departments` | Public | List active departments |
| `GET` | `/api/events` | Public | List events; optional `date` (school-local day), `from`, `to`, `department_id`, and `type` query filters |
| `GET` | `/api/events/:eventId` | Public | Get one event |
| `POST` | `/api/events` | Admin | Create an event |
| `PATCH` | `/api/events/:eventId` | Admin | Update an event |
| `DELETE` | `/api/events/:eventId` | Admin | Delete an event |

Event types: `academic`, `seminar`, `sports`, `intramurals`, `meeting`, `holiday`, `other`. Dates must include a timezone, for example `2026-10-20T09:00:00+08:00`. Events can be school-wide (`department_id: null`) or department-specific. Only admins can create or edit events.

### Student attendance and reports

| Method | Route | Access | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/scan` | Reader key | Process a card tap |
| `POST` | `/api/reader/heartbeat` | Reader key | Update the reader last-seen time |
| `GET` | `/api/admin/readers` | Admin | List RFID readers, active state, and online status |
| `PATCH` | `/api/admin/readers/:readerId` | Admin | Pause/resume card scans for a reader |
| `DELETE` | `/api/admin/readers/:readerId` | Admin | Remove a reader and its event assignments while keeping attendance logs |
| `GET` | `/api/admin/cards` | Admin | List assigned RFID cards |
| `PATCH` | `/api/admin/cards/:cardId` | Admin | Change the student assignment or unassign/deactivate a card |
| `GET` | `/api/students/me/points` | Student/team leader | View own points total |
| `GET` | `/api/students/me/events` | Student/team leader | View own event checklist |
| `PUT` | `/api/students/me/events/:eventId/checklist` | Student/team leader | Update own personal event checklist |
| `GET` | `/api/students` | Admin/teacher | Search students; optional `department_id`, `year_level`, and `search` |
| `GET` | `/api/attendance/overview` | Admin/teacher | Dashboard counts; teacher results are department-scoped |
| `GET` | `/api/attendance/report?from=...&to=...` | Admin/teacher | Attendance summary and rows; optional department, year, event, and search filters |
| `GET` | `/api/attendance/events/:eventId/roster` | Admin/teacher | Get the event checklist roster; teacher results are department-scoped |
| `PUT` | `/api/admin/events/:eventId/students/:studentId/attendance` | Admin/teacher | Edit attendance status and remarks; admins may also set time-in/time-out |
| `GET` | `/api/events/:eventId/attendance` | Admin/teacher | View attendance for one event |
| `GET` | `/api/attendance/recent?limit=5` | Admin/teacher | Fetch the newest attendance activity for the live screen |

The scan endpoint accepts:

```http
POST /api/scan
x-device-key: YOUR_READER_KEY
Content-Type: application/json
```

The ESP32 also posts to `/api/reader/heartbeat` every 20 seconds using the same `x-device-key`. A reader is shown as online when its last heartbeat or scan was within the previous 65 seconds. This connectivity indicator is separate from the reader's enabled/paused state. Apply migration 007 before using online status.

```json
{
  "card_uid": "04D4E5F6"
}
```

The API normalizes the UID by removing spaces, colons, and hyphens and converting it to uppercase. It checks that the reader is active, the card is registered and active, and the linked account is active. An inactive reader returns HTTP `403` with `{"ok":false,"result":"reader_paused"}`; an unknown reader key returns HTTP `401` with `bad_device`. If the card belongs to a student, the API finds an attendance-required event that applies to the student's department.

Attendance is available during the event's time window. An administrator can explicitly open an event early by setting it to `ongoing`; this enables time-in immediately until the event end. A scan more than 15 minutes after the scheduled start is marked `late`; earlier valid scans are `present`. Event timestamps are normalized to UTC instants before RFID time-window comparisons, matching the events API even when PostgreSQL stores them as `timestamp without time zone`. A reader being active means scanning is enabled; the event must separately be marked `ongoing`. A `no_event` scan logs the current reader assignment and candidate event statuses/times in the backend terminal, and includes a reason such as `event_not_ongoing` or `event_time_window_closed` in the response. Time-out is controlled by an admin-assigned reader mode or event lifecycle, not by a student's second tap. Points are awarded only once, at time-in. A valid staff/admin card is logged as accepted, but does not create student event attendance.

Admins manage event lifecycle as `pending`, `ongoing`, `moved`, `done`, or `cancelled`, separately from the attendance-open switch. The reader's `auto` and `time_in` modes record a time-in only while attendance is open and through the event end; admins can open attendance early from event management. The `auto` mode records time-out after an assigned event is marked `done`. Explicit `time_out` mode records checkout for the assigned event while it is pending, ongoing, or done, provided it is not moved or cancelled; it does not require the event's original time window or an open check-in state.

To pin a reader to an event for a selected date, an admin can call `GET /api/admin/rfid/event-assignments?date=YYYY-MM-DD` and `PUT /api/admin/rfid/event-assignments` with `{ "reader_id": 1, "event_id": 2, "attendance_date": "YYYY-MM-DD", "attendance_mode": "auto" }`. The event must be an attendance event whose start instant falls inside that calendar day in `ATTENDANCE_TIME_ZONE` (default `Asia/Manila`). The assignment API, reader event options, and event date filter use the same timezone-aware half-open day range: local midnight inclusive through the next local midnight exclusive. UTC values stored in a `timestamp without time zone` column are explicitly interpreted as UTC; `timestamp with time zone` values are compared as instants. A rejected assignment logs the reader/event, requested date, computed local-day boundaries, and reason in the backend terminal. Without an assignment, `auto` chooses a matching ongoing event for time-in; it cannot infer which completed event should receive a time-out.

Admin routes require an admin bearer token. A direct browser visit to an `/api/admin/...` URL without a token returns `authentication_required` by design. In Postman, log in at `/api/auth/login`, then set **Authorization → Bearer Token** to the returned `token`. The frontend includes its logged-in token automatically.

Administrators and teachers can edit attendance status and remarks from Course Attendance. The Live Check-in display shows timestamps as read-only. The protected attendance APIs still allow admins to edit time-in and time-out by sending ISO 8601 values such as `{ "status": "present", "time_in": "2026-10-21T08:02:00+08:00", "time_out": "2026-10-21T12:00:00+08:00", "remarks": null }`; clearing a time uses `null`. The API rejects teacher requests that include time fields.

The student and teacher school calendars are read-only event views. The student events API retains a personal checklist endpoint for compatibility, but the frontend calendar does not show per-student completion controls. Admins manage the school calendar by creating events, editing event details and dates, changing lifecycle status, or deleting events.

`GET /api/attendance/recent?limit=5` provides the latest five check-ins for authorized admins/teachers, including each student's account `user_id`. The screen `Frontend/attendance-display.html` refreshes this route every three seconds and looks for a local JPG at `Frontend/images/students/<user_id>.jpg` (for example, `Frontend/images/students/42.jpg`). Copy each student's JPG into that folder using the account ID shown in the admin Accounts list as the filename. No photo URL or photo database column is needed. If the image is missing, the display shows the student's initials. The screen needs an admin/teacher login token in the same browser storage, so open it from the dashboard after signing in. Times are displayed without edit controls.

Possible scan `result` values include `accepted`, `time_out`, `duplicate`, `no_event`, `unknown_card`, `inactive_card`, `reader_paused`, and `bad_device`. Administrators can pause or resume a reader from **RFID devices** in the dashboard; pausing prevents the ESP32 scans from being recorded until resumed.

### Masterlists and teams

| Method | Route | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/masterlists` | Admin/teacher | List masterlists; teachers only see their department |
| `POST` | `/api/masterlists` | Admin | Create a masterlist for a school year and semester |
| `GET` | `/api/masterlists/:masterlistId/students` | Admin/teacher | View a masterlist roster |
| `GET` | `/api/admin/masterlists/:masterlistId/candidates` | Admin | List department students and indicate existing roster members |
| `GET` | `/api/teams` | Admin/teacher/team leader | List teams; leaders only see their own team(s) |
| `GET` | `/api/teams/:teamId/attendance` | Admin/teacher/team leader | View intramurals attendance |
| `GET` | `/api/teams/:teamId/advisers` | Admin/teacher/team leader | View team advisers |

Existing `team_leader` accounts can still view teams where their membership is marked as leader for compatibility. New team assignment in the admin UI does not promote student accounts; teams use teacher advisers instead.

### Admin management

Every `/api/admin/...` route requires an admin bearer token.

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/admin/users` | Search accounts; optional `role` and `search` filters |
| `POST` | `/api/admin/users` | Create an admin or teacher account |
| `PATCH` | `/api/admin/users/:userId/active` | Activate/deactivate a user |
| `POST` | `/api/admin/departments` | Create a department |
| `GET`, `POST` | `/api/admin/readers` | List/create RFID readers |
| `PATCH` | `/api/admin/readers/:readerId` | Activate/deactivate a reader |
| `GET`, `POST` | `/api/admin/cards` | List cards or assign a card UID using `student_id` |
| `PATCH` | `/api/admin/cards/:cardId` | Change a card's status |
| `GET` | `/api/admin/attendance/logs` | Search raw scan logs |
| `PATCH` | `/api/admin/attendance/:attendanceId` | Correct attendance status, time-out, or remarks |
| `POST` | `/api/admin/points` | Add or deduct points with a reason |
| `POST` | `/api/admin/masterlists` | Create a masterlist |
| `POST` | `/api/admin/masterlists/:masterlistId/students` | Add students to a masterlist |
| `POST` | `/api/admin/teams` | Create a team |
| `POST` | `/api/admin/teams/:teamId/members` | Add one student to a team |
| `POST` | `/api/admin/teams/:teamId/members/bulk` | Add selected students from a masterlist to a team |
| `POST` | `/api/admin/teams/:teamId/advisers` | Assign a teacher as team adviser |

When a new reader is created, the API returns its `device_key` once. Keep the key secret. To revoke a lost key, deactivate the reader and create a replacement. Admins can select department students into masterlists, bulk-assign selected roster students to teams, and assign a teacher as team adviser. Team membership no longer promotes students to the `team_leader` role.

### RFID communication troubleshooting

In `PlatformIO/Projects/rfid/src/main.cpp`, replace the `YOUR_COMPUTER_LAN_IP` and `PASTE_READER_DEVICE_KEY_HERE` placeholders with the backend computer's LAN IP and the active reader key. The ESP32 must send requests to the backend computer's LAN IP address, not `localhost`, and use the active reader's `device_key` as `x-device-key`. Put the computer and ESP32 on a network that allows device-to-device traffic, allow the backend port through Windows Firewall, and inspect the ESP32 Serial Monitor for Wi-Fi status, HTTP status, and API result. A `bad_device` response means the key is missing, incorrect, or inactive; `unknown_card` means the UID has not been assigned to an active student; `no_event` means no active attendance event applies to that student's department and time. Confirm the API works first at `http://<computer-lan-ip>:5000/health/db`.

## Test with Postman

1. Start the backend and check `GET http://localhost:5000/health/db`.
2. Log in using `POST http://localhost:5000/api/auth/login`, with **Body → raw → JSON**:

   ```json
   {
     "username": "your_username",
     "password": "your_password"
   }
   ```

3. Copy `token` from the response. Use **Authorization → Bearer Token** for protected requests.
4. Use `GET /api/auth/me` to verify the token and see which account is logged in.
5. For RFID testing, an admin should create a reader (`POST /api/admin/readers`) and assign an actual card UID to a student (`POST /api/admin/cards`). Create an event whose attendance window includes the current time, then send `POST /api/scan` with the reader key and UID as shown above.
6. Log in as that student and request `GET /api/students/me/points` or `GET /api/students/me/events` to check the result.

Postman does not need the frontend or ESP32 running. It can send the same HTTP requests directly.

## Configure the ESP32

In `PlatformIO/Projects/rfid/src/main.cpp`:

1. Set `API_URL` to the server's reachable address, for example `http://192.168.1.20:5000/api/scan` when the ESP32 and computer are on the same local network.
2. Set `DEVICE_KEY` to the key returned when its reader was created.
3. Set the Wi-Fi network name and password in the sketch, then upload it to the ESP32.

The ESP32 must be able to reach the computer running the backend. Allow inbound TCP port `5000` through the computer's firewall if needed. The API uses the reader key to authenticate scans; keep it out of screenshots and public repositories.

## Database records and views

The base schema is the one already installed in your PostgreSQL database; this repository includes incremental RFID assignment, student checklist, event lifecycle, and event venue migrations. Main tables:

- `users`: usernames, password hashes, roles, names, and email addresses.
- `students`, `teachers`, `admins`: role-specific profiles linked to `users`.
- `departments`: department directory.
- `rfid_cards`, `rfid_readers`: cards assigned to users and authorized scan devices.
- `events`: the school calendar and attendance settings.
- `attendance_logs`: raw tap audit trail, including failed or duplicate scans.
- `event_attendance`: one attendance row per student per event.
- `attendance_points`: points ledger, including automatic event awards and admin adjustments.
- `masterlists`, `masterlist_students`: department rosters by term.
- `teams`, `team_members`, `team_advisers`: intramurals teams and relationships.

The student dashboard's points and event checklist, and staff attendance roster/reports, query the underlying tables directly. Existing views such as `v_department_masterlist`, `v_team_leader_teams`, and `v_team_attendance` may still be used by other routes.

The admin photo manager stores selected student photos in that browser's local storage; the API/database does not store photo URLs or image data. To share a photo across browsers, put it in the frontend's static `images/students/` folder and enter its filename in the photo manager.

## Errors and troubleshooting

API errors generally return JSON with `ok: false` and an `error` code. Common HTTP statuses:

- `400`: invalid request body, parameter, or filter.
- `401`: missing/invalid/expired user token, inactive account, or invalid reader key.
- `403`: the role is not allowed to perform that action.
- `404`: requested record was not found.
- `409`: a unique value such as username, email, department code, card UID, or student number already exists.
- `500`: unexpected API or database error; see the backend terminal for server-side details.

If login returns `invalid_credentials`, verify that the user exists, `is_active` is true, and the password is the original password used at account creation. A password hash in pgAdmin cannot be used as a password. If a scan returns `no_event`, verify that an attendance-required event is active for that student and within the configured time window.
