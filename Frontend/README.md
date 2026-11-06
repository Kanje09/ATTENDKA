# ATTENDKA Frontend

The frontend is a responsive, static HTML/CSS/JavaScript interface for the ATTENDKA RFID attendance backend. It keeps the existing PTCI look and calls the Express API for account, event, student, and attendance data.

## Pages

| Page | File | Purpose |
| --- | --- | --- |
| Sign in | `public/index.html` | Authenticate using a username or email and password |
| Student registration | `public/register.html` | Register a student with a department, student number, and year |
| Dashboard | `public/app.html` | Show role-specific information and access profile/settings and management pages |
| Live check-in | `public/attendance-display.html` | Show the latest five student check-ins, with time-in/out and a photo or initials |

## Run locally

1. Start the backend using the instructions in [`../Backend/README.md`](../Backend/README.md). By default, the API listens on `http://localhost:5000`.
2. Serve this folder over HTTP. Do not open the HTML files directly using a `file://` URL.

   With the VS Code Live Server extension, right-click `index.html` and select **Open with Live Server**. The default Live Server port (`5500`) is allowed by the backend CORS settings.

   Alternatively, open PowerShell at the repository root and run:

   ```powershell
   cd Frontend
   python -m http.server 5500
   ```

3. Open `http://localhost:5500/public/index.html` and sign in or register as a student.

No frontend package installation or build is required; the frontend uses browser-native JavaScript.

## API connection and sessions

[`js/api.js`](js/api.js) sends requests to `http://localhost:5000/api` by default. To use a different backend address, define `window.ATTENDKA_API_BASE` before loading `../js/api.js` in the public HTML pages, for example:

```html
<script>window.ATTENDKA_API_BASE = 'http://192.168.1.20:5000/api';</script>
<script src="../js/api.js"></script>
```

The backend must allow the frontend's origin through CORS. Configure `FRONTEND_ORIGIN` in the backend environment if the frontend runs on a different host or port.

On successful sign-in or registration, the browser stores the access token and user profile in `localStorage`. The API helper attaches the token as a bearer credential to protected requests. Signing out clears the saved session. Do not use a shared or public computer for an authenticated session; sign out when finished.

## Role behavior

- **Student:** can self-register and view department/school events in the read-only school calendar. Students cannot edit events, profile details, or manage photos.
- **Teacher:** can access their assigned department and optional year-level student, attendance, report, team-adviser, and school calendar views; teachers can edit their own profile and browser-local avatar.
- **Admin:** can provision teacher/admin accounts, manage departments and advisors, readers, student cards, events, attendance statuses, teams, and advisers.
- **Legacy team leader:** existing accounts with this role remain supported, but new teams use teacher advisers and team membership no longer changes student roles.

The UI hides dashboard sections that do not apply to the signed-in role. The backend remains responsible for enforcing access permissions. Public registration is intentionally limited to students; administrators create privileged staff accounts.

## Database-driven attendance and administration

The admin and teacher dashboards load overview counts, attendance statuses, upcoming events, recent check-ins, and report summaries from the API. The global search filters the student directory and attendance results. Course Attendance filters by month and event; administrators and teachers can change a student's status to present, late, absent, or excused and add an explanation in the remarks field. Reports support a date range, department, year-level, and search filters, and can be downloaded as Excel-compatible CSV.

The **Events** panel contains the school calendar and event controls. It shows wide event cards for the selected month instead of a full month grid. Students and teachers can view events and status notes; administrators can edit or remove events and use **Time-In**/**Time-Out** to open or close attendance. Attendance automatically closes at the event's end time, and the student view shows the same open/closed state. Apply migrations `002_rfid_event_assignments.sql` through `010_department_advisors_and_team_logos.sql` in order before using these workflows. Migration 005 also repairs missing lifecycle columns required by the events API, and migration 006 repairs missing RFID assignment table/mode schema. Events start as `pending`; attendance state is managed independently of lifecycle status.

Attendance status and remarks are managed in Course Attendance. The Live Check-in display shows recorded time-in/time-out values without editing controls or photo-removal controls. Admins can use **Reset live attendance** in the dashboard header to hide previous activity from the live screen without deleting attendance records; apply migration `008_live_attendance_reset.sql` first. In **RFID devices**, admins can pause or resume each reader; a paused reader returns `reader_paused` to the ESP32 and does not record scans. The page separately shows Online/Offline based on an ESP32 heartbeat. Apply migration `007_rfid_reader_heartbeat.sql` before using this indicator. Admins can also remove a reader and edit/unassign a student's RFID card. RFID event assignment uses the default automatic scan mode; the Reader Mode selector has been removed. The ESP32 uses the assignment date in `ATTENDANCE_TIME_ZONE` (default `Asia/Manila`); without an assignment, automatic mode selects a matching open event.

The **Student Directory** presents one student table per department with its assigned teachers shown as department advisors. This uses the existing `teachers.department_id` relationship and does not require a separate advisor table or department advisor column. Editing the advisor changes the teacher's department assignment. Administrators can use the table-level edit mode to update, transfer, or permanently remove a selected student. Permanent removal deletes the student's attendance, points, checklist, team, masterlist, RFID card, and card-scan records. Student year levels are limited to Years 1–5. The **Teams** page replaces the old masterlist-based assignment workflow: teams can be created with an uploaded logo, assigned students directly from a department, edited, assigned a teacher adviser, and deleted with confirmation. Apply migration `010_department_advisors_and_team_logos.sql` before using team logos.

The teacher Team Adviser attendance table shows both recorded time-in and time-out for each student/event. RFID cards are assigned by the database `student_id`, not the account `user_id`.

Admin and teacher avatars are stored in that browser's local storage, not in the API or database, and therefore do not automatically sync to other browsers/devices. An admin can select a student image file directly from the photo manager; it is resized and saved in that browser's local storage, and appears on the live check-in screen in the same browser. This photo override does not sync to other browsers/devices. Alternatively, enter a filename and place the image under `images/students/`; the filename is loaded by the frontend but is not uploaded to the server. No photo URL or photo database column is used.

## Live attendance display

Open **Live Check-in** from the dashboard while signed in as an admin or teacher. The display requests `GET /api/attendance/recent?limit=5` every three seconds and replaces the cards with the latest five student check-ins. It shows read-only time-in/time-out, event, student number, department, and a local student photo; if the file is missing, it displays initials. Photos and timestamps cannot be edited on this display.

Student photos are matched by the student's account user ID. In the dashboard's **Admin** page, use **Set student photo** to select a student and either choose an image from the file manager or enter a filename. Uploaded selections are stored only in the current browser. For shared static images, place the file in `Frontend/images/students/` and enter its filename; use `42.jpg` for account user ID `42` if using the default convention. No photo URL is stored in the database.

For example, copy a dummy student image to:

```text
Frontend/images/students/42.jpg
```

The live display loads that file from `http://localhost:5500/images/students/42.jpg` when Live Server is running on port 5500, unless the current browser has a saved photo override for that student. For another display device, serve the frontend from an address reachable by that device. The `images/students` folder ignores local files in Git so photos are not accidentally committed. Use dummy images or images you have permission to use.

## Frontend files

- `js/api.js`: shared API requests and browser session storage.
- `js/auth.js`: login and student registration forms.
- `js/app.js`: role-aware dashboard, data loading, management forms, profile and password actions.
- `js/attendance-display.js`: live attendance polling and card rendering.
- `css/auth.css`, `css/app.css`, `css/attendance-display.css`: page styling and responsive layouts.
- `js/lamp.js`, `css/lamp.css`: sign-in page lamp interaction.

Backend-connected attendance, profile, event, report, and admin actions require the API and PostgreSQL database to be running.
