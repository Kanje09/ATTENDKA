import { randomBytes } from "node:crypto";
import { Router } from "express";
import pool from "../config/db.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { allowRoles, authenticate } from "../middleware/auth.js";
import { HttpError } from "../middleware/errorHandler.js";
import { hashPassword } from "../services/auth_service.js";
import {
    eventTimestampInstantSql,
    requireDateOnly,
    zonedDayRangeSql,
} from "../utils/zonedDateRange.js";

const adminRouter = Router();
adminRouter.use(authenticate, allowRoles("admin"));

adminRouter.get(
    "/overview",
    asyncHandler(async (_req, res) => {
        const result = await pool.query(
            `SELECT
                (SELECT count(*)::int FROM students) AS total_students,
                (SELECT count(*)::int FROM event_attendance
                 WHERE time_in >= date_trunc('day', now())) AS attendance_today,
                (SELECT count(*)::int FROM events
                 WHERE now() BETWEEN start_datetime AND end_datetime) AS events_in_progress`,
        );
        res.json({ ok: true, overview: result.rows[0] });
    }),
);

adminRouter.get(
    "/users",
    asyncHandler(async (req, res) => {
        const role = typeof req.query.role === "string" ? req.query.role : null;
        if (role && !["student", "teacher", "admin", "team_leader"].includes(role)) {
            throw new HttpError(400, "invalid_role");
        }
        const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
        const result = await pool.query(
            `SELECT u.user_id, u.username, u.role, u.first_name, u.middle_name, u.last_name,
                    u.email, u.is_active, u.last_login, u.created_at,
                    s.student_id, s.student_no, s.department_id,
                    t.teacher_id, t.employee_no, t.department_id AS teaching_department_id,
                    t.year_level AS teaching_year_level
             FROM users u
             LEFT JOIN students s ON s.user_id = u.user_id
             LEFT JOIN teachers t ON t.user_id = u.user_id
             WHERE ($1::text IS NULL OR u.role = $1)
               AND ($2::text = '' OR u.username ILIKE '%' || $2 || '%'
                    OR u.first_name ILIKE '%' || $2 || '%'
                    OR u.last_name ILIKE '%' || $2 || '%'
                    OR s.student_no ILIKE '%' || $2 || '%'
                    OR t.employee_no ILIKE '%' || $2 || '%')
             ORDER BY u.created_at DESC
             LIMIT 500`,
            [role, search],
        );
        res.json({ ok: true, users: result.rows });
    }),
);

adminRouter.post(
    "/departments",
    asyncHandler(async (req, res) => {
        const { code, name } = req.body ?? {};
        if (
            typeof code !== "string" || !/^[A-Za-z0-9_-]{2,10}$/.test(code) ||
            typeof name !== "string" || !name.trim() || name.length > 150
        ) {
            throw new HttpError(400, "invalid_department");
        }
        const result = await pool.query(
            "INSERT INTO departments (code, name) VALUES ($1, $2) RETURNING department_id, code, name, is_active",
            [code.toUpperCase(), name.trim()],
        );
        res.status(201).json({ ok: true, department: result.rows[0] });
    }),
);

adminRouter.get(
    "/attendance/logs",
    asyncHandler(async (req, res) => {
        const resultFilter = typeof req.query.result === "string" ? req.query.result : null;
        if (
            resultFilter &&
            !["accepted", "unknown_card", "inactive_card", "no_event", "duplicate"].includes(resultFilter)
        ) {
            throw new HttpError(400, "invalid_log_result");
        }
        const readerId = req.query.reader_id === undefined ? null : Number(req.query.reader_id);
        const from = typeof req.query.from === "string" ? req.query.from : null;
        const to = typeof req.query.to === "string" ? req.query.to : null;
        if (
            (readerId !== null && (!Number.isSafeInteger(readerId) || readerId < 1)) ||
            (req.query.from !== undefined && (!from || Number.isNaN(Date.parse(from)))) ||
            (req.query.to !== undefined && (!to || Number.isNaN(Date.parse(to))))
        ) {
            throw new HttpError(400, "invalid_log_filter");
        }
        const result = await pool.query(
            `SELECT l.log_id, l.card_uid, l.card_id, l.reader_id, r.reader_name,
                    l.event_id, e.title AS event_title, l.scanned_at, l.result
             FROM attendance_logs l
             LEFT JOIN rfid_readers r ON r.reader_id = l.reader_id
             LEFT JOIN events e ON e.event_id = l.event_id
             WHERE ($1::text IS NULL OR l.result = $1)
               AND ($2::int IS NULL OR l.reader_id = $2)
               AND ($3::timestamptz IS NULL OR l.scanned_at >= $3)
               AND ($4::timestamptz IS NULL OR l.scanned_at < $4)
             ORDER BY l.scanned_at DESC
             LIMIT 500`,
            [
                resultFilter,
                readerId,
                from,
                to,
            ],
        );

        res.json({ ok: true, logs: result.rows });
    }),
);

adminRouter.post(
    "/attendance/live/reset",
    asyncHandler(async (_req, res) => {
        await pool.query(
            `CREATE TABLE IF NOT EXISTS attendance_live_display_state (
                singleton_id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton_id),
                reset_after_attendance_id BIGINT NOT NULL DEFAULT 0,
                reset_at TIMESTAMPTZ,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )`,
        );
        await pool.query(
            "ALTER TABLE attendance_live_display_state ADD COLUMN IF NOT EXISTS reset_at TIMESTAMPTZ",
        );
        const result = await pool.query(
            `INSERT INTO attendance_live_display_state
                (singleton_id, reset_after_attendance_id, reset_at, updated_at)
             SELECT TRUE, COALESCE(MAX(attendance_id), 0), now(), now()
             FROM event_attendance
             ON CONFLICT (singleton_id) DO UPDATE
               SET reset_after_attendance_id = EXCLUDED.reset_after_attendance_id,
                   reset_at = EXCLUDED.reset_at,
                   updated_at = EXCLUDED.updated_at
             RETURNING updated_at`,
        );
        res.json({ ok: true, reset_at: result.rows[0].updated_at });
    }),
);

adminRouter.patch(
    "/attendance/:attendanceId",
    asyncHandler(async (req, res) => {
        const attendanceId = Number(req.params.attendanceId);
        const { status, time_in, time_out, remarks } = req.body ?? {};
        if (
            !Number.isSafeInteger(attendanceId) || attendanceId < 1 ||
            (status !== undefined && !["present", "late", "absent", "excused"].includes(status)) ||
            (time_in !== undefined && time_in !== null && (typeof time_in !== "string" || Number.isNaN(Date.parse(time_in)))) ||
            (time_out !== undefined && time_out !== null && (typeof time_out !== "string" || Number.isNaN(Date.parse(time_out)))) ||
            (remarks !== undefined && remarks !== null && (typeof remarks !== "string" || remarks.length > 255)) ||
            (status === undefined && time_in === undefined && time_out === undefined && remarks === undefined)
        ) {
            throw new HttpError(400, "invalid_attendance_update");
        }
        const existing = await pool.query<{ time_in: Date | null; time_out: Date | null }>(
            "SELECT time_in, time_out FROM event_attendance WHERE attendance_id = $1",
            [attendanceId],
        );
        if (!existing.rowCount) {
            throw new HttpError(404, "attendance_not_found");
        }
        const finalTimeIn = time_in === undefined ? existing.rows[0].time_in : time_in;
        const finalTimeOut = time_out === undefined ? existing.rows[0].time_out : time_out;
        if (finalTimeIn && finalTimeOut && new Date(finalTimeOut).getTime() < new Date(finalTimeIn).getTime()) {
            throw new HttpError(400, "time_out_before_time_in");
        }
        const columns: Record<string, string> = {
            status: "status",
            time_in: "time_in",
            time_out: "time_out",
            remarks: "remarks",
        };
        const updates = Object.entries(columns).filter(([key]) =>
            Object.prototype.hasOwnProperty.call(req.body ?? {}, key),
        );
        const values = updates.map(([key]) => req.body[key]);
        values.push(attendanceId);
        const assignments = updates.map(([, column], index) => `${column} = $${index + 1}`).join(", ");
        const result = await pool.query(
            `UPDATE event_attendance SET ${assignments}
             WHERE attendance_id = $${values.length}
             RETURNING *`,
            values,
        );
        if (!result.rowCount) {
            throw new HttpError(404, "attendance_not_found");
        }
        res.json({ ok: true, attendance: result.rows[0] });
    }),
);

adminRouter.post(
    "/points",
    asyncHandler(async (req, res) => {
        const { student_id, event_id = null, points, reason } = req.body ?? {};
        const studentId = Number(student_id);
        const eventId = event_id === null ? null : Number(event_id);
        if (
            !Number.isSafeInteger(studentId) || studentId < 1 ||
            (eventId !== null && (!Number.isSafeInteger(eventId) || eventId < 1)) ||
            !Number.isInteger(points) || points === 0 ||
            typeof reason !== "string" || !reason.trim() || reason.length > 255
        ) {
            throw new HttpError(400, "invalid_point_adjustment");
        }
        const result = await pool.query(
            `INSERT INTO attendance_points (student_id, event_id, points, reason, awarded_by)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [studentId, eventId, points, reason.trim(), req.authUser!.userId],
        );
        res.status(201).json({ ok: true, point: result.rows[0] });
    }),
);

adminRouter.post(
    "/users",
    asyncHandler(async (req, res) => {
        const { username, password, first_name, middle_name, last_name, email, role } = req.body ?? {};
        const employeeNo = req.body?.employee_no;
        const departmentId = Number(req.body?.department_id);
        const yearLevel = req.body?.year_level === undefined || req.body?.year_level === null
            ? null
            : Number(req.body.year_level);
        const position = req.body?.position;
        if (
            typeof username !== "string" || username.trim().length < 3 || username.length > 50 ||
            typeof password !== "string" || password.length < 8 || password.length > 200 ||
            typeof first_name !== "string" || !first_name.trim() || first_name.length > 80 ||
            typeof last_name !== "string" || !last_name.trim() || last_name.length > 80 ||
            !["teacher", "admin"].includes(role) ||
            (email !== undefined && email !== null && (typeof email !== "string" || email.length > 150)) ||
            (middle_name !== undefined && middle_name !== null && (typeof middle_name !== "string" || middle_name.length > 80)) ||
            (role === "teacher" && (
                typeof employeeNo !== "string" || !employeeNo.trim() || employeeNo.length > 30 ||
                !Number.isSafeInteger(departmentId) || departmentId < 1 ||
                (yearLevel !== null && (!Number.isSafeInteger(yearLevel) || yearLevel < 1 || yearLevel > 10))
            )) ||
            (role === "admin" && position !== undefined && position !== null && (typeof position !== "string" || position.length > 100))
        ) {
            throw new HttpError(400, "invalid_user");
        }

        const db = await pool.connect();
        try {
            await db.query("BEGIN");
            const user = await db.query<{ user_id: number; username: string; role: string }>(
                `INSERT INTO users (username, password_hash, role, first_name, middle_name, last_name, email)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)
                 RETURNING user_id, username, role, first_name, last_name, email`,
                [
                    username.trim(), await hashPassword(password), role, first_name.trim(),
                    middle_name?.trim() || null, last_name.trim(), email?.trim().toLowerCase() || null,
                ],
            );
            if (role === "teacher") {
                await db.query(
                    "INSERT INTO teachers (user_id, employee_no, department_id, year_level) VALUES ($1, $2, $3, $4)",
                    [user.rows[0].user_id, employeeNo.trim(), departmentId, yearLevel],
                );
            } else {
                await db.query(
                    "INSERT INTO admins (user_id, position) VALUES ($1, $2)",
                    [user.rows[0].user_id, position?.trim() || null],
                );
            }
            await db.query("COMMIT");
            res.status(201).json({ ok: true, user: user.rows[0] });
        } catch (error) {
            await db.query("ROLLBACK").catch((rollbackError: unknown) => {
                console.error("Failed to roll back user creation:", rollbackError);
            });
            throw error;
        } finally {
            db.release();
        }
    }),
);

adminRouter.patch(
    "/users/:userId/active",
    asyncHandler(async (req, res) => {
        const userId = Number(req.params.userId);
        if (!Number.isSafeInteger(userId) || userId < 1 || typeof req.body?.is_active !== "boolean") {
            throw new HttpError(400, "user_id_and_is_active_required");
        }
        if (userId === req.authUser!.userId && req.body.is_active === false) {
            throw new HttpError(400, "cannot_deactivate_current_user");
        }
        const result = await pool.query(
            `UPDATE users SET is_active = $1 WHERE user_id = $2
             RETURNING user_id, username, role, is_active`,
            [req.body.is_active, userId],
        );
        if (!result.rowCount) {
            throw new HttpError(404, "user_not_found");
        }
        res.json({ ok: true, user: result.rows[0] });
    }),
);

adminRouter.get(
    "/readers",
    asyncHandler(async (_req, res) => {
        const timeZone = process.env.ATTENDANCE_TIME_ZONE || "Asia/Manila";
        const result = await pool.query(
            `SELECT r.reader_id, r.reader_name, r.location, r.is_active,
                    NULLIF(to_jsonb(r)->>'last_seen_at', '') AS last_seen_at,
                    COALESCE(
                        NULLIF(to_jsonb(r)->>'last_seen_at', '')::timestamptz >= now() - interval '65 seconds',
                        FALSE
                    ) AS is_online,
                    e.title AS assigned_event_title, e.event_status AS assigned_event_status,
                    e.start_datetime AS assigned_event_start, e.end_datetime AS assigned_event_end
             FROM rfid_readers r
             LEFT JOIN rfid_event_assignments a
               ON a.reader_id = r.reader_id
              AND a.attendance_date = (now() AT TIME ZONE $1)::date
             LEFT JOIN events e ON e.event_id = a.event_id
             ORDER BY r.reader_name`,
            [timeZone],
        );
        res.json({ ok: true, readers: result.rows });
    }),
);

adminRouter.post(
    "/readers",
    asyncHandler(async (req, res) => {
        const { reader_name, location } = req.body ?? {};
        if (typeof reader_name !== "string" || !reader_name.trim() || reader_name.length > 80) {
            throw new HttpError(400, "invalid_reader_name");
        }
        const deviceKey = randomBytes(32).toString("base64url");
        const result = await pool.query(
            `INSERT INTO rfid_readers (reader_name, location, device_key)
             VALUES ($1, $2, $3)
             RETURNING reader_id, reader_name, location, is_active`,
            [reader_name.trim(), typeof location === "string" ? location.trim() || null : null, deviceKey],
        );
        res.status(201).json({ ok: true, reader: result.rows[0], device_key: deviceKey });
    }),
);

adminRouter.get(
    "/rfid/event-assignments",
    asyncHandler(async (req, res) => {
        const date = requireDateOnly(req.query.date);
        const timeZone = process.env.ATTENDANCE_TIME_ZONE || "Asia/Manila";
        const dayRange = zonedDayRangeSql("$1", "$2");
        const eventStart = await eventTimestampInstantSql(pool, "start_datetime");
        const result = await pool.query(
            `SELECT a.reader_id, a.attendance_date, a.event_id, a.attendance_mode,
                    r.reader_name, e.title AS event_title,
                    ${dayRange.start} AS local_day_start,
                    ${dayRange.end} AS local_day_end
             FROM rfid_event_assignments a
             JOIN rfid_readers r ON r.reader_id = a.reader_id
             JOIN events e ON e.event_id = a.event_id
             WHERE a.attendance_date = $1::date
               AND ${eventStart} >= ${dayRange.start}
               AND ${eventStart} < ${dayRange.end}
             ORDER BY r.reader_name`,
            [date, timeZone],
        );
        res.json({ ok: true, assignments: result.rows });
    }),
);

adminRouter.put(
    "/rfid/event-assignments",
    asyncHandler(async (req, res) => {
        const readerId = Number(req.body?.reader_id);
        const eventId = Number(req.body?.event_id);
        const date = requireDateOnly(req.body?.attendance_date);
        const attendanceMode = req.body?.attendance_mode ?? "auto";
        if (
            !Number.isSafeInteger(readerId) || readerId < 1 ||
            !Number.isSafeInteger(eventId) || eventId < 1 ||
            !["auto", "time_in", "time_out"].includes(attendanceMode)
        ) {
            throw new HttpError(400, "reader_event_and_attendance_mode_required");
        }
        const timeZone = process.env.ATTENDANCE_TIME_ZONE || "Asia/Manila";
        const dayRange = zonedDayRangeSql("$1", "$2");
        const eventStart = await eventTimestampInstantSql(pool, "start_datetime");
        const [readerResult, eventResult] = await Promise.all([
            pool.query<{ reader_id: number; reader_name: string; is_active: boolean }>(
                `SELECT reader_id, reader_name, is_active
                 FROM rfid_readers WHERE reader_id = $1`,
                [readerId],
            ),
            pool.query<{
                event_id: number;
                title: string;
                requires_attendance: boolean;
                start_datetime: Date;
                start_of_day: Date;
                end_of_day: Date;
                starts_on_selected_date: boolean;
            }>(
                `SELECT event_id, title, requires_attendance, ${eventStart} AS start_datetime,
                        ${dayRange.start} AS start_of_day,
                        ${dayRange.end} AS end_of_day,
                        ${eventStart} >= ${dayRange.start}
                            AND ${eventStart} < ${dayRange.end} AS starts_on_selected_date
                 FROM events e WHERE e.event_id = $3`,
                [date, timeZone, eventId],
            ),
        ]);
        const reader = readerResult.rows[0] ?? null;
        const event = eventResult.rows[0] ?? null;
        if (!reader || !reader.is_active) {
            console.info("RFID event assignment rejected", {
                reader,
                event,
                incomingDate: date,
                timeZone,
                computedDayStart: event?.start_of_day ?? null,
                computedDayEnd: event?.end_of_day ?? null,
                reason: !reader ? "reader_not_found" : "reader_inactive",
            });
            throw new HttpError(400, "reader_not_found_or_inactive");
        }
        if (!event || !event.requires_attendance || !event.starts_on_selected_date) {
            const reason = !event
                ? "event_not_found"
                : !event.requires_attendance
                    ? "event_does_not_require_attendance"
                    : "event_start_outside_selected_local_day";
            console.info("RFID event assignment rejected", {
                reader,
                event,
                incomingDate: date,
                timeZone,
                computedDayStart: event?.start_of_day ?? null,
                computedDayEnd: event?.end_of_day ?? null,
                reason,
            });
            throw new HttpError(
                400,
                reason === "event_start_outside_selected_local_day"
                    ? "event_not_on_selected_local_date"
                    : reason,
            );
        }
        const insertRange = zonedDayRangeSql("$3", "$5");
        const result = await pool.query(
            `INSERT INTO rfid_event_assignments
                (reader_id, attendance_date, event_id, assigned_by, attendance_mode)
             SELECT r.reader_id, $3::date, e.event_id, $4, $6
             FROM rfid_readers r
             JOIN events e ON e.event_id = $2
             WHERE r.reader_id = $1
               AND r.is_active = TRUE
               AND e.requires_attendance = TRUE
               AND ${eventStart} >= ${insertRange.start}
               AND ${eventStart} < ${insertRange.end}
             ON CONFLICT (reader_id, attendance_date) DO UPDATE
               SET event_id = EXCLUDED.event_id,
                   assigned_by = EXCLUDED.assigned_by,
                   attendance_mode = EXCLUDED.attendance_mode,
                   created_at = now()
             RETURNING reader_id, attendance_date, event_id, attendance_mode`,
            [
                readerId,
                eventId,
                date,
                req.authUser!.userId,
                process.env.ATTENDANCE_TIME_ZONE || "Asia/Manila",
                attendanceMode,
            ],
        );
        if (!result.rowCount) {
            console.info("RFID event assignment changed during validation", {
                reader,
                event,
                incomingDate: date,
                timeZone,
                computedDayStart: event.start_of_day,
                computedDayEnd: event.end_of_day,
                reason: "reader_or_event_changed_before_insert",
            });
            throw new HttpError(409, "reader_or_event_changed_during_assignment");
        }
        res.json({ ok: true, assignment: result.rows[0] });
    }),
);

adminRouter.patch(
    "/readers/:readerId",
    asyncHandler(async (req, res) => {
        const readerId = Number(req.params.readerId);
        if (!Number.isSafeInteger(readerId) || readerId < 1 || typeof req.body?.is_active !== "boolean") {
            throw new HttpError(400, "reader_id_and_is_active_required");
        }
        const result = await pool.query(
            `UPDATE rfid_readers SET is_active = $1
             WHERE reader_id = $2
             RETURNING reader_id, reader_name, location, is_active`,
            [req.body.is_active, readerId],
        );

        if (!result.rowCount) {
            throw new HttpError(404, "reader_not_found");
        }
        res.json({ ok: true, reader: result.rows[0] });
    }),
);

adminRouter.patch(
    "/teachers/:teacherId/department",
    asyncHandler(async (req, res) => {
        const teacherId = Number(req.params.teacherId);
        const departmentId = Number(req.body?.department_id);
        const yearLevel = req.body?.year_level === null || req.body?.year_level === undefined
            ? null
            : Number(req.body.year_level);
        if (
            !Number.isSafeInteger(teacherId) || teacherId < 1 ||
            !Number.isSafeInteger(departmentId) || departmentId < 1 ||
            (yearLevel !== null && (!Number.isSafeInteger(yearLevel) || yearLevel < 1 || yearLevel > 10))
        ) {
            throw new HttpError(400, "teacher_department_and_optional_year_required");
        }
        const result = await pool.query(
            `UPDATE teachers SET department_id = $1, year_level = $2
             WHERE teacher_id = $3
             RETURNING teacher_id, user_id, department_id, year_level`,
            [departmentId, yearLevel, teacherId],
        );
        if (!result.rowCount) {
            throw new HttpError(404, "teacher_not_found");
        }
        res.json({ ok: true, teacher: result.rows[0] });
    }),
);

adminRouter.put(
    "/students/:studentId",
    asyncHandler(async (req, res) => {
        const studentId = Number(req.params.studentId);
        const { student_no, first_name, middle_name, last_name, email, department_id, year_level, section } = req.body ?? {};
        const departmentId = Number(department_id);
        if (
            !Number.isSafeInteger(studentId) || studentId < 1 ||
            typeof student_no !== "string" || !student_no.trim() || student_no.length > 30 ||
            typeof first_name !== "string" || !first_name.trim() || first_name.length > 80 ||
            (middle_name !== undefined && middle_name !== null && (typeof middle_name !== "string" || middle_name.length > 80)) ||
            typeof last_name !== "string" || !last_name.trim() || last_name.length > 80 ||
            (email !== undefined && email !== null && (typeof email !== "string" || email.length > 150)) ||
            !Number.isSafeInteger(departmentId) || departmentId < 1 ||
            !Number.isSafeInteger(year_level) || year_level < 1 || year_level > 10 ||
            (section !== undefined && section !== null && (typeof section !== "string" || section.length > 30))
        ) {
            throw new HttpError(400, "invalid_student_update");
        }
        const db = await pool.connect();
        try {
            await db.query("BEGIN");
            const student = await db.query<{ user_id: number }>(
                "SELECT user_id FROM students WHERE student_id = $1 FOR UPDATE",
                [studentId],
            );
            if (!student.rowCount) {
                throw new HttpError(404, "student_not_found");
            }
            await db.query(
                `UPDATE users
                 SET first_name = $1, middle_name = $2, last_name = $3, email = $4
                 WHERE user_id = $5`,
                [
                    first_name.trim(),
                    middle_name?.trim() || null,
                    last_name.trim(),
                    email?.trim().toLowerCase() || null,
                    student.rows[0].user_id,
                ],
            );
            const updated = await db.query(
                `UPDATE students
                 SET student_no = $1, department_id = $2, year_level = $3, section = $4
                 WHERE student_id = $5
                 RETURNING student_id, student_no, department_id, year_level, section`,
                [student_no.trim(), departmentId, year_level, section?.trim() || null, studentId],
            );
            await db.query("COMMIT");
            res.json({ ok: true, student: updated.rows[0] });
        } catch (error) {
            await db.query("ROLLBACK").catch((rollbackError: unknown) => {
                console.error("Failed to roll back student update:", rollbackError);
            });
            throw error;
        } finally {
            db.release();
        }
    }),
);

adminRouter.post(
    "/cards",
    asyncHandler(async (req, res) => {
        const { student_id, card_uid } = req.body ?? {};
        const uid = typeof card_uid === "string" ? card_uid.trim().replace(/[\s:-]/g, "").toUpperCase() : "";
        const studentId = Number(student_id);
        if (!uid || uid.length > 50 || !Number.isSafeInteger(studentId) || studentId < 1) {
            throw new HttpError(400, "student_id_and_card_uid_required");
        }
        const result = await pool.query(
            `INSERT INTO rfid_cards (card_uid, user_id)
             SELECT $1, s.user_id FROM students s WHERE s.student_id = $2
             RETURNING card_id, card_uid, user_id, status, issued_at`,
            [uid, studentId],
        );
        if (!result.rowCount) {
            throw new HttpError(404, "student_not_found");
        }
        res.status(201).json({ ok: true, card: result.rows[0] });
    }),
);

adminRouter.delete(
    "/readers/:readerId",
    asyncHandler(async (req, res) => {
        const readerId = Number(req.params.readerId);
        if (!Number.isSafeInteger(readerId) || readerId < 1) {
            throw new HttpError(400, "invalid_reader_id");
        }
        const db = await pool.connect();
        try {
            await db.query("BEGIN");
            await db.query(
                "UPDATE attendance_logs SET reader_id = NULL WHERE reader_id = $1",
                [readerId],
            );
            const result = await db.query(
                "DELETE FROM rfid_readers WHERE reader_id = $1 RETURNING reader_id, reader_name",
                [readerId],
            );
            if (!result.rowCount) {
                throw new HttpError(404, "reader_not_found");
            }
            await db.query("COMMIT");
            res.json({ ok: true, reader: result.rows[0] });
        } catch (error) {
            await db.query("ROLLBACK").catch((rollbackError: unknown) => {
                console.error("Failed to roll back RFID reader deletion:", rollbackError);
            });
            throw error;
        } finally {
            db.release();
        }
    }),
);

adminRouter.get(
    "/cards",
    asyncHandler(async (_req, res) => {
        const result = await pool.query(
            `SELECT c.card_id, c.card_uid, c.user_id, c.status, c.issued_at, c.deactivated_at,
                    u.first_name, u.last_name, s.student_id, s.student_no
             FROM rfid_cards c
             LEFT JOIN users u ON u.user_id = c.user_id
             LEFT JOIN students s ON s.user_id = u.user_id
             ORDER BY c.issued_at DESC`,
        );
        res.json({ ok: true, cards: result.rows });
    }),
);

adminRouter.patch(
    "/cards/:cardId",
    asyncHandler(async (req, res) => {
        const cardId = Number(req.params.cardId);
        const statuses = ["active", "inactive", "lost", "blocked"];
        const status = req.body?.status;
        const hasStudentId = Object.prototype.hasOwnProperty.call(req.body ?? {}, "student_id");
        const studentId = req.body?.student_id === null ? null : Number(req.body?.student_id);
        if (
            !Number.isSafeInteger(cardId) || cardId < 1 ||
            (status !== undefined && !statuses.includes(status)) ||
            (!hasStudentId && status === undefined) ||
            (hasStudentId && studentId !== null && (!Number.isSafeInteger(studentId) || studentId < 1))
        ) {
            throw new HttpError(400, "invalid_card_update");
        }
        const userId = !hasStudentId || studentId === null ? null : (await pool.query<{ user_id: number }>(
            "SELECT user_id FROM students WHERE student_id = $1",
            [studentId],
        )).rows[0]?.user_id;
        if (hasStudentId && studentId !== null && !userId) {
            throw new HttpError(404, "student_not_found");
        }
        const result = await pool.query(
            `UPDATE rfid_cards
             SET user_id = CASE WHEN $1::boolean THEN $2::int ELSE user_id END,
                 status = CASE
                     WHEN $1::boolean AND $2::int IS NULL THEN 'inactive'
                     WHEN $1::boolean AND $2::int IS NOT NULL THEN COALESCE($3::text, 'active')
                     ELSE COALESCE($3::text, status)
                 END,
                 deactivated_at = CASE
                     WHEN $1::boolean AND $2::int IS NULL THEN now()
                     WHEN $1::boolean AND $2::int IS NOT NULL
                          AND COALESCE($3::text, 'active') = 'active' THEN NULL
                     WHEN COALESCE($3::text, status) = 'active' THEN NULL
                     WHEN $3::text IS NOT NULL THEN now()
                     ELSE deactivated_at
                 END
             WHERE card_id = $4
             RETURNING card_id, card_uid, user_id, status, issued_at, deactivated_at`,
            [hasStudentId, userId ?? null, status ?? null, cardId],
        );
        if (!result.rowCount) {
            throw new HttpError(404, "card_not_found");
        }
        res.json({ ok: true, card: result.rows[0] });
    }),
);

adminRouter.post(
    "/masterlists",
    asyncHandler(async (req, res) => {
        const { department_id, school_year, semester } = req.body ?? {};
        const departmentId = Number(department_id);
        if (
            !Number.isSafeInteger(departmentId) || departmentId < 1 ||
            typeof school_year !== "string" || !/^\d{4}-\d{4}$/.test(school_year) ||
            !["1st", "2nd", "summer"].includes(semester)
        ) {
            throw new HttpError(400, "invalid_masterlist");
        }
        const result = await pool.query(
            `INSERT INTO masterlists (department_id, school_year, semester, created_by)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [departmentId, school_year, semester, req.authUser!.userId],
        );

        adminRouter.patch(
            "/masterlists/:masterlistId",
            asyncHandler(async (req, res) => {
                const masterlistId = Number(req.params.masterlistId);
                const { department_id, school_year, semester } = req.body ?? {};
                if (
                    !Number.isSafeInteger(masterlistId) || masterlistId < 1 ||
                    !Number.isSafeInteger(Number(department_id)) || Number(department_id) < 1 ||
                    typeof school_year !== "string" || !/^\d{4}-\d{4}$/.test(school_year) ||
                    !["1st", "2nd", "summer"].includes(semester)
                ) {
                    throw new HttpError(400, "invalid_masterlist");
                }
                const result = await pool.query(
                    `UPDATE masterlists
                     SET department_id = $1, school_year = $2, semester = $3
                     WHERE masterlist_id = $4
                     RETURNING *`,
                    [Number(department_id), school_year, semester, masterlistId],
                );
                if (!result.rowCount) {
                    throw new HttpError(404, "masterlist_not_found");
                }
                res.json({ ok: true, masterlist: result.rows[0] });
            }),
        );
        res.status(201).json({ ok: true, masterlist: result.rows[0] });
    }),
);

adminRouter.post(
    "/masterlists/:masterlistId/students",
    asyncHandler(async (req, res) => {
        const masterlistId = Number(req.params.masterlistId);
        const studentIds: unknown = req.body?.student_ids;
        if (
            !Number.isSafeInteger(masterlistId) || masterlistId < 1 ||
            !Array.isArray(studentIds) || studentIds.length > 1000 ||
            studentIds.some((id) => !Number.isSafeInteger(id) || (id as number) < 1)
        ) {
            throw new HttpError(400, "invalid_masterlist_students");
        }
        const result = await pool.query(
            `INSERT INTO masterlist_students (masterlist_id, student_id)
             SELECT $1, s.student_id
             FROM students s
             JOIN masterlists ml ON ml.masterlist_id = $1 AND ml.department_id = s.department_id
             WHERE s.student_id = ANY($2::int[])
             ON CONFLICT (masterlist_id, student_id) DO NOTHING
             RETURNING student_id`,
            [masterlistId, studentIds],
        );

        adminRouter.delete(
            "/masterlists/:masterlistId/students",
            asyncHandler(async (req, res) => {
                const masterlistId = Number(req.params.masterlistId);
                const studentIds: unknown = req.body?.student_ids;
                if (
                    !Number.isSafeInteger(masterlistId) || masterlistId < 1 ||
                    !Array.isArray(studentIds) || studentIds.length > 1000 ||
                    studentIds.some((id) => !Number.isSafeInteger(id) || (id as number) < 1)
                ) {
                    throw new HttpError(400, "invalid_masterlist_students");
                }
                const result = await pool.query(
                    `DELETE FROM masterlist_students
                     WHERE masterlist_id = $1 AND student_id = ANY($2::int[])
                     RETURNING student_id`,
                    [masterlistId, [...new Set(studentIds as number[])]],
                );
                res.json({ ok: true, removed: result.rowCount });
            }),
        );
        res.status(201).json({ ok: true, added: result.rowCount });
    }),
);

adminRouter.post(
    "/teams",
    asyncHandler(async (req, res) => {
        const { name, logo_url, school_year } = req.body ?? {};
        if (
            typeof name !== "string" || !name.trim() || name.length > 100 ||
            typeof school_year !== "string" || !/^\d{4}-\d{4}$/.test(school_year) ||
            (logo_url !== undefined && logo_url !== null && (typeof logo_url !== "string" || logo_url.length > 255))
        ) {
            throw new HttpError(400, "invalid_team");
        }
        const result = await pool.query(
            `INSERT INTO teams (name, logo_url, school_year)
             VALUES ($1, $2, $3) RETURNING *`,
            [name.trim(), logo_url ?? null, school_year],
        );
        res.status(201).json({ ok: true, team: result.rows[0] });
    }),
);

adminRouter.post(
    "/teams/:teamId/members",
    asyncHandler(async (req, res) => {
        const teamId = Number(req.params.teamId);
        const { student_id } = req.body ?? {};
        const studentId = Number(student_id);
        if (
            !Number.isSafeInteger(teamId) || teamId < 1 ||
            !Number.isSafeInteger(studentId) || studentId < 1
        ) {
            throw new HttpError(400, "invalid_team_member");
        }
        const result = await pool.query(
            `INSERT INTO team_members (team_id, student_id)
             VALUES ($1, $2) RETURNING *`,
            [teamId, studentId],
        );
        res.status(201).json({ ok: true, member: result.rows[0] });
    }),
);

adminRouter.post(
    "/teams/:teamId/members/bulk",
    asyncHandler(async (req, res) => {
        const teamId = Number(req.params.teamId);
        const masterlistId = Number(req.body?.masterlist_id);
        const studentIds: unknown = req.body?.student_ids;
        if (
            !Number.isSafeInteger(teamId) || teamId < 1 ||
            !Number.isSafeInteger(masterlistId) || masterlistId < 1 ||
            !Array.isArray(studentIds) || studentIds.length < 1 || studentIds.length > 1000 ||
            studentIds.some((id) => !Number.isSafeInteger(id) || (id as number) < 1)
        ) {
            throw new HttpError(400, "invalid_bulk_team_members");
        }
        const uniqueStudentIds = [...new Set(studentIds as number[])];
        const [team, valid] = await Promise.all([
            pool.query("SELECT 1 FROM teams WHERE team_id = $1", [teamId]),
            pool.query<{ count: number }>(
                `SELECT count(DISTINCT student_id)::int AS count
                 FROM masterlist_students
                 WHERE masterlist_id = $1 AND student_id = ANY($2::int[])`,
                [masterlistId, uniqueStudentIds],
            ),
        ]);
        if (!team.rowCount) {
            throw new HttpError(404, "team_not_found");
        }
        if (valid.rows[0].count !== uniqueStudentIds.length) {
            throw new HttpError(400, "students_must_belong_to_selected_masterlist");
        }
        const result = await pool.query(
            `INSERT INTO team_members (team_id, student_id)
             SELECT $1, selected.student_id
             FROM unnest($3::int[]) AS selected(student_id)
            JOIN masterlist_students ms
              ON ms.masterlist_id = $2 AND ms.student_id = selected.student_id
            ON CONFLICT (team_id, student_id) DO NOTHING
             RETURNING student_id`,
            [teamId, masterlistId, uniqueStudentIds],
        );
        res.status(201).json({ ok: true, added: result.rowCount });
    }),
);

adminRouter.post(
    "/teams/:teamId/advisers",
    asyncHandler(async (req, res) => {
        const teamId = Number(req.params.teamId);
        const teacherId = Number(req.body?.teacher_id);
        if (!Number.isSafeInteger(teamId) || teamId < 1 || !Number.isSafeInteger(teacherId) || teacherId < 1) {
            throw new HttpError(400, "team_id_and_teacher_id_required");
        }
        const result = await pool.query(
            `INSERT INTO team_advisers (team_id, teacher_id)
             VALUES ($1, $2) RETURNING *`,
            [teamId, teacherId],
        );
        res.status(201).json({ ok: true, adviser: result.rows[0] });
    }),
);

export default adminRouter;
