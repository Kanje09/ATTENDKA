import { Router } from "express";
import pool from "../config/db.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { allowRoles, authenticate } from "../middleware/auth.js";
import { HttpError } from "../middleware/errorHandler.js";
import { eventTimestampInstantSql, zonedDayRangeSql } from "../utils/zonedDateRange.js";

const attendanceRouter = Router();
const EARLY_WINDOW_MIN = 30;
const LATE_AFTER_MIN = 15;

attendanceRouter.get(
    "/attendance/overview",
    authenticate,
    allowRoles("admin", "teacher"),
    asyncHandler(async (req, res) => {
        const teacher = req.authUser!.role === "teacher"
            ? await pool.query<{ department_id: number; year_level: number | null }>(
                "SELECT department_id, year_level FROM teachers WHERE user_id = $1",
                [req.authUser!.userId],
            )
            : null;
        if (teacher && !teacher.rowCount) {
            throw new HttpError(403, "teacher_profile_not_found");
        }
        const departmentId = teacher?.rows[0]?.department_id ?? null;
        const timeZone = process.env.ATTENDANCE_TIME_ZONE || "Asia/Manila";
        const dayRange = zonedDayRangeSql("(now() AT TIME ZONE $3)::date", "$3");
        const eventStart = await eventTimestampInstantSql(pool, "start_datetime");
        const eventEnd = await eventTimestampInstantSql(pool, "end_datetime");
        const result = await pool.query(
            `WITH daily_roster AS (
                SELECT s.student_id, ea.time_in,
                       COALESCE(ea.status, 'absent') AS attendance_status
                FROM events e
                JOIN students s ON e.department_id IS NULL OR e.department_id = s.department_id
                JOIN users u ON u.user_id = s.user_id AND u.is_active = TRUE
                LEFT JOIN event_attendance ea
                  ON ea.event_id = e.event_id AND ea.student_id = s.student_id
                WHERE e.requires_attendance = TRUE
                  AND ${eventStart} >= ${dayRange.start}
                  AND ${eventStart} < ${dayRange.end}
                  AND (${eventStart} <= now() OR e.event_status = 'ongoing' OR e.attendance_open)
                  AND (${eventEnd} < now() OR e.event_status = 'ongoing' OR e.attendance_open)
                  AND e.event_status NOT IN ('moved', 'cancelled')
                  AND ($1::int IS NULL OR s.department_id = $1)
                  AND ($2::int IS NULL OR s.year_level = $2)
            )
            SELECT
                (SELECT count(*)::int FROM students s
                 JOIN users u ON u.user_id = s.user_id AND u.is_active = TRUE
                 WHERE ($1::int IS NULL OR s.department_id = $1)
                   AND ($2::int IS NULL OR s.year_level = $2)) AS total_students,
                (SELECT count(DISTINCT student_id)::int FROM daily_roster
                 WHERE time_in >= ${dayRange.start} AND time_in < ${dayRange.end}) AS attendance_today,
                count(*) FILTER (WHERE attendance_status = 'present')::int AS present_today,
                count(*) FILTER (WHERE attendance_status = 'late')::int AS late_today,
                count(*) FILTER (WHERE attendance_status = 'excused')::int AS excused_today,
                count(*) FILTER (WHERE attendance_status = 'absent')::int AS absent_today,
                (SELECT count(*)::int FROM events e
                 WHERE e.event_status = 'ongoing'
                   AND now() <= ${eventEnd}
                   AND (e.department_id IS NULL OR $1::int IS NULL OR e.department_id = $1)) AS events_in_progress
             FROM daily_roster`,
            [departmentId, teacher?.rows[0]?.year_level ?? null, timeZone],
        );
        const attendanceTimeType = await pool.query<{ data_type: string }>(
            `SELECT data_type
             FROM information_schema.columns
             WHERE table_schema = ANY(current_schemas(FALSE))
               AND table_name = 'event_attendance'
               AND column_name = 'time_in'
             ORDER BY array_position(current_schemas(FALSE), table_schema)
             LIMIT 1`,
        );
        const timeInType = attendanceTimeType.rows[0]?.data_type;
        const attendanceLocalDate = timeInType === "timestamp with time zone"
            ? "(ea.time_in AT TIME ZONE $2::text)::date"
            : timeInType === "timestamp without time zone"
                ? "((ea.time_in AT TIME ZONE 'UTC') AT TIME ZONE $2::text)::date"
                : null;
        if (!attendanceLocalDate) {
            throw new Error(`Unsupported event_attendance.time_in database type: ${timeInType ?? "column not found"}`);
        }
        const statusCounts = await pool.query(
            `SELECT
                count(DISTINCT ea.student_id) FILTER (WHERE ea.time_in IS NOT NULL)::int AS attendance_today,
                count(DISTINCT ea.student_id) FILTER (WHERE ea.status = 'present')::int AS present_today,
                count(DISTINCT ea.student_id) FILTER (WHERE ea.status = 'late')::int AS late_today,
                count(DISTINCT ea.student_id) FILTER (WHERE ea.status = 'excused')::int AS excused_today
             FROM event_attendance ea
             JOIN students s ON s.student_id = ea.student_id
             JOIN events e ON e.event_id = ea.event_id
             WHERE ${eventStart} >= ${zonedDayRangeSql("(now() AT TIME ZONE $2)::date", "$2").start}
               AND ${eventStart} < ${zonedDayRangeSql("(now() AT TIME ZONE $2)::date", "$2").end}
               AND ($1::int IS NULL OR s.department_id = $1)
               AND ($3::int IS NULL OR s.year_level = $3)`,
            [departmentId, timeZone, teacher?.rows[0]?.year_level ?? null],
        );
        const heatmap = await pool.query(
            `SELECT ${attendanceLocalDate}::text AS activity_date,
                    count(*)::int AS check_ins
             FROM event_attendance ea
             JOIN students s ON s.student_id = ea.student_id
             WHERE ea.time_in IS NOT NULL
               AND ($1::int IS NULL OR s.department_id = $1)
               AND ($3::int IS NULL OR s.year_level = $3)
               AND ${attendanceLocalDate} >= (now() AT TIME ZONE $2::text)::date - 29
               AND ${attendanceLocalDate} <= (now() AT TIME ZONE $2::text)::date
             GROUP BY ${attendanceLocalDate}
             ORDER BY activity_date`,
            [departmentId, timeZone, teacher?.rows[0]?.year_level ?? null],
        );
        res.json({
            ok: true,
            overview: { ...result.rows[0], ...statusCounts.rows[0] },
            heatmap: heatmap.rows,
        });
    }),
);

attendanceRouter.get(
    "/attendance/report",
    authenticate,
    allowRoles("admin", "teacher"),
    asyncHandler(async (req, res) => {
        const from = typeof req.query.from === "string" ? req.query.from : null;
        const to = typeof req.query.to === "string" ? req.query.to : null;
        const departmentId = req.query.department_id === undefined ? null : Number(req.query.department_id);
        const yearLevel = req.query.year_level === undefined ? null : Number(req.query.year_level);
        const eventId = req.query.event_id === undefined ? null : Number(req.query.event_id);
        const includeCurrent = req.query.include_current === "true";
        const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
        if (
            !from || Number.isNaN(Date.parse(from)) ||
            !to || Number.isNaN(Date.parse(to)) || Date.parse(to) <= Date.parse(from) ||
            (departmentId !== null && (!Number.isSafeInteger(departmentId) || departmentId < 1)) ||
            (yearLevel !== null && (!Number.isSafeInteger(yearLevel) || yearLevel < 1 || yearLevel > 10)) ||
            (eventId !== null && (!Number.isSafeInteger(eventId) || eventId < 1))
        ) {
            throw new HttpError(400, "invalid_report_filters");
        }
        const teacher = req.authUser!.role === "teacher"
            ? await pool.query<{ department_id: number; year_level: number | null }>(
                "SELECT department_id, year_level FROM teachers WHERE user_id = $1",
                [req.authUser!.userId],
            )
            : null;
        if (teacher && !teacher.rowCount) {
            throw new HttpError(403, "teacher_profile_not_found");
        }
        if (teacher && departmentId !== null && departmentId !== teacher.rows[0].department_id) {
            throw new HttpError(403, "forbidden");
        }
        const [eventStart, eventEnd] = await Promise.all([
            eventTimestampInstantSql(pool, "start_datetime"),
            eventTimestampInstantSql(pool, "end_datetime"),
        ]);
        const result = await pool.query(
            `WITH attendance_rows AS (
                SELECT e.event_id, e.title AS event_title, ${eventStart} AS start_datetime,
                       ea.attendance_id, ea.time_in, ea.time_out, ea.remarks,
                       COALESCE(ea.status, 'absent') AS status,
                       s.student_id, s.student_no, s.year_level, s.section,
                       u.user_id, u.first_name, u.last_name,
                       d.department_id, d.code AS department_code
                FROM events e
                JOIN students s ON e.department_id IS NULL OR e.department_id = s.department_id
                JOIN users u ON u.user_id = s.user_id AND u.is_active = TRUE
                JOIN departments d ON d.department_id = s.department_id
                LEFT JOIN event_attendance ea
                  ON ea.event_id = e.event_id AND ea.student_id = s.student_id
                WHERE e.requires_attendance = TRUE
                  AND (${eventEnd} < now() OR
                       ($8::boolean AND (${eventStart} <= now() OR e.event_status = 'ongoing')))
                  AND ${eventStart} >= $1::timestamptz
                  AND ${eventStart} < $2::timestamptz
                  AND ($3::int IS NULL OR s.department_id = $3)
                  AND ($4::int IS NULL OR s.year_level = $4)
                  AND ($5::int IS NULL OR s.department_id = $5)
                  AND ($6::int IS NULL OR e.event_id = $6)
                  AND ($7::text = '' OR s.student_no ILIKE '%' || $7 || '%'
                       OR u.first_name ILIKE '%' || $7 || '%'
                       OR u.last_name ILIKE '%' || $7 || '%'
                       OR concat_ws(' ', u.first_name, u.last_name) ILIKE '%' || $7 || '%'
                       OR e.title ILIKE '%' || $7 || '%')
                  AND ($9::int IS NULL OR s.year_level = $9)
            )
            SELECT attendance_rows.*,
                   count(*) OVER()::int AS total_records,
                   count(*) FILTER (WHERE status = 'present') OVER()::int AS present_count,
                   count(*) FILTER (WHERE status = 'late') OVER()::int AS late_count,
                   count(*) FILTER (WHERE status = 'excused') OVER()::int AS excused_count,
                   count(*) FILTER (WHERE status = 'absent') OVER()::int AS absent_count
            FROM attendance_rows
            ORDER BY start_datetime DESC, last_name, first_name
            LIMIT 10000`,
            [
                from,
                to,
                departmentId,
                yearLevel,
                teacher?.rows[0]?.department_id ?? null,
                eventId,
                search,
                includeCurrent,
                teacher?.rows[0]?.year_level ?? null,
            ],
        );
        const first = result.rows[0];
        const total = Number(first?.total_records ?? 0);
        const present = Number(first?.present_count ?? 0);
        const late = Number(first?.late_count ?? 0);
        const excused = Number(first?.excused_count ?? 0);
        const absent = Number(first?.absent_count ?? 0);
        const denominator = total - excused;
        res.json({
            ok: true,
            summary: {
                total,
                present,
                late,
                excused,
                absent,
                attendance_rate: denominator ? Math.round(((present + late) / denominator) * 1000) / 10 : 0,
            },
            attendance: result.rows.map((row) => {
                const {
                    total_records: _totalRecords,
                    present_count: _presentCount,
                    late_count: _lateCount,
                    excused_count: _excusedCount,
                    absent_count: _absentCount,
                    ...attendance
                } = row;
                return attendance;
            }),
        });
    }),
);

attendanceRouter.post(
    "/reader/heartbeat",
    asyncHandler(async (req, res) => {
        const deviceKey = req.header("x-device-key");
        if (!deviceKey) {
            throw new HttpError(400, "device_key_required");
        }
        const result = await pool.query<{ reader_id: number; is_active: boolean; last_seen_at: Date }>(
            `UPDATE rfid_readers
             SET last_seen_at = now()
             WHERE device_key = $1
             RETURNING reader_id, is_active, last_seen_at`,
            [deviceKey],
        );
        if (!result.rowCount) {
            res.status(401).json({ ok: false, result: "bad_device" });
            return;
        }
        res.json({ ok: true, reader_id: result.rows[0].reader_id, is_active: result.rows[0].is_active });
    }),
);

attendanceRouter.post(
    "/scan",
    asyncHandler(async (req, res) => {
        const deviceKey = req.header("x-device-key");
        const cardUid = typeof req.body?.card_uid === "string"
            ? req.body.card_uid.trim().replace(/[\s:-]/g, "").toUpperCase()
            : "";
        if (!deviceKey || !cardUid || cardUid.length > 50) {
            throw new HttpError(400, "card_uid_and_device_key_required");
        }

        const db = await pool.connect();
        let transactionStarted = false;
        try {
            const readerResult = await db.query<{ reader_id: number; is_active: boolean }>(
                "SELECT reader_id, is_active FROM rfid_readers WHERE device_key = $1",
                [deviceKey],
            );
            if (!readerResult.rowCount) {
                res.status(401).json({ ok: false, result: "bad_device" });
                return;
            }
            if (!readerResult.rows[0].is_active) {
                await db.query("UPDATE rfid_readers SET last_seen_at = now() WHERE reader_id = $1", [
                    readerResult.rows[0].reader_id,
                ]);
                res.status(403).json({ ok: false, result: "reader_paused" });
                return;
            }
            const readerId = readerResult.rows[0].reader_id;
            await db.query("UPDATE rfid_readers SET last_seen_at = now() WHERE reader_id = $1", [readerId]);
            await db.query("BEGIN");
            transactionStarted = true;
            const assignedEvent = await db.query<{ event_id: number; attendance_mode: string }>(
                `SELECT event_id, attendance_mode FROM rfid_event_assignments
                 WHERE reader_id = $1
                   AND attendance_date = (now() AT TIME ZONE $2)::date`,
                [readerId, process.env.ATTENDANCE_TIME_ZONE || "Asia/Manila"],
            );
            const [eventStart, eventEnd] = await Promise.all([
                eventTimestampInstantSql(pool, "start_datetime"),
                eventTimestampInstantSql(pool, "end_datetime"),
            ]);

            const cardResult = await db.query<{
                card_id: number;
                status: string;
                user_active: boolean | null;
                role: string | null;
                first_name: string | null;
                middle_name: string | null;
                last_name: string | null;
                student_id: number | null;
                department_id: number | null;
            }>(
                `SELECT c.card_id, c.status, u.is_active AS user_active, u.role,
                        u.first_name, u.middle_name, u.last_name, s.student_id, s.department_id
                 FROM rfid_cards c
                 LEFT JOIN users u ON u.user_id = c.user_id
                 LEFT JOIN students s ON s.user_id = u.user_id
                 WHERE c.card_uid = $1`,
                [cardUid],
            );

            const saveLog = async (
                cardId: number | null,
                eventId: number | null,
                result: "accepted" | "unknown_card" | "inactive_card" | "no_event" | "duplicate",
            ) => {
                const log = await db.query<{ log_id: string }>(
                    `INSERT INTO attendance_logs (card_uid, card_id, reader_id, event_id, result)
                     VALUES ($1, $2, $3, $4, $5) RETURNING log_id`,
                    [cardUid, cardId, readerId, eventId, result],
                );
                return log.rows[0].log_id;
            };

            if (!cardResult.rowCount) {
                await saveLog(null, null, "unknown_card");
                await db.query("COMMIT");
                transactionStarted = false;
                res.json({ ok: false, result: "unknown_card" });
                return;
            }

            const card = cardResult.rows[0];
            if (card.status !== "active" || card.user_active !== true || !card.first_name) {
                await saveLog(card.card_id, null, "inactive_card");
                await db.query("COMMIT");
                transactionStarted = false;
                res.json({ ok: false, result: "inactive_card" });
                return;
            }
            const name = [card.first_name, card.middle_name, card.last_name].filter(Boolean).join(" ");

            if (!card.student_id) {
                await saveLog(card.card_id, null, "accepted");
                await db.query("COMMIT");
                transactionStarted = false;
                res.json({ ok: true, result: "accepted", name, role: card.role });
                return;
            }

            const assignedEventId = assignedEvent.rows[0]?.event_id ?? null;
            const attendanceMode = assignedEvent.rows[0]?.attendance_mode ?? "auto";

            type ScanEvent = {
                event_id: number;
                title: string;
                start_datetime: Date;
                points: number;
                is_late: boolean;
                event_status: string;
            };

            let timeOutMode = false;
            let eventResult: { rowCount: number | null; rows: ScanEvent[] } = { rowCount: 0, rows: [] };

            // 1) Time in: any event the admin opened (attendance_open = TRUE).
            //    A manual "open" overrides the end time. Prefer the event happening now.
            if (attendanceMode !== "time_out") {
                eventResult = await db.query<ScanEvent>(
                    `SELECT e.event_id, e.title, ${eventStart} AS start_datetime,
                e.points, e.event_status,
                now() > ${eventStart} + ($3::int * interval '1 minute') AS is_late
         FROM events e
         WHERE e.requires_attendance = TRUE
           AND (e.department_id IS NULL OR e.department_id = $1)
           AND ($2::int IS NULL OR e.event_id = $2)
           AND e.attendance_open = TRUE
           AND e.event_status NOT IN ('moved', 'cancelled', 'done')
         ORDER BY (now() BETWEEN ${eventStart} AND ${eventEnd}) DESC,
                  abs(extract(epoch FROM (${eventStart} - now()))),
                  ${eventStart}
         LIMIT 1`,
                    [card.department_id, assignedEventId, LATE_AFTER_MIN],
                );
            }

            // 2) Time out: find the event where THIS student is timed in but not out.
            //    No reader assignment needed.
            //    - mode "time_out": any such event
            //    - mode "auto": only events marked "done"
            if (!eventResult.rowCount && attendanceMode !== "time_in") {
                eventResult = await db.query<ScanEvent>(
                    `SELECT e.event_id, e.title, ${eventStart} AS start_datetime,
                e.points, e.event_status, FALSE AS is_late
         FROM events e
         JOIN event_attendance ea
           ON ea.event_id = e.event_id
          AND ea.student_id = $3
          AND ea.time_in IS NOT NULL
          AND ea.time_out IS NULL
         WHERE e.requires_attendance = TRUE
           AND (e.department_id IS NULL OR e.department_id = $1)
           AND ($2::int IS NULL OR e.event_id = $2)
           AND e.event_status NOT IN ('moved', 'cancelled')
           AND ($4::text = 'time_out' OR e.event_status = 'done')
         ORDER BY ea.time_in DESC
         LIMIT 1`,
                    [card.department_id, assignedEventId, card.student_id, attendanceMode],
                );
                timeOutMode = Boolean(eventResult.rowCount);
            }

            if (!eventResult.rowCount) {
                const diagnosticResult = await db.query<{
                    event_id: number;
                    title: string;
                    event_status: string;
                    attendance_open: boolean;
                    start_datetime: Date;
                    end_datetime: Date;
                    scan_at: Date;
                }>(
                    `SELECT e.event_id, e.title, e.event_status, e.attendance_open,
                            ${eventStart} AS start_datetime,
                            ${eventEnd} AS end_datetime,
                            now() AS scan_at
                     FROM events e
                     WHERE e.requires_attendance = TRUE
                       AND (e.department_id IS NULL OR e.department_id = $1)
                       AND ($2::int IS NULL OR e.event_id = $2)
                     ORDER BY (e.event_status = 'ongoing') DESC,
                              abs(extract(epoch FROM (${eventStart} - now()))),
                              ${eventStart}
                     LIMIT 25`,
                    [card.department_id, assignedEvent.rows[0]?.event_id ?? null],
                );
                const scanAt = diagnosticResult.rows[0]?.scan_at;
                const mode = assignedEvent.rows[0]?.attendance_mode ?? "auto";
                const candidates = diagnosticResult.rows.map((candidate) => {
                    let reason: string;
                    if (mode === "time_out") {
                        reason = "no_open_time_in_for_student";
                    } else if (!candidate.attendance_open) {
                        reason = "attendance_closed";
                    } else if (["done", "moved", "cancelled"].includes(candidate.event_status)) {
                        reason = `event_${candidate.event_status}`;
                    } else {
                        reason = "event_did_not_match_scan_query";
                    }
                    return {
                        eventId: candidate.event_id,
                        title: candidate.title,
                        eventStatus: candidate.event_status,
                        attendanceOpen: candidate.attendance_open,
                        startDatetime: candidate.start_datetime,
                        endDatetime: candidate.end_datetime,
                        reason,
                    };
                });
                console.info("RFID scan found no eligible event", {
                    readerId,
                    studentId: card.student_id,
                    departmentId: card.department_id,
                    assignment: assignedEvent.rows[0] ?? null,
                    timeZone: process.env.ATTENDANCE_TIME_ZONE || "Asia/Manila",
                    scanAt,
                    candidates,
                });
                await saveLog(card.card_id, null, "no_event");
                await db.query("COMMIT");
                transactionStarted = false;
                res.json({
                    ok: true,
                    result: "no_event",
                    name,
                    reason: candidates[0]?.reason ?? "no_matching_attendance_event",
                });
                return;
            }

            const event = eventResult.rows[0];
            if (timeOutMode) {
                const existingAttendance = await db.query<{
                    attendance_id: number;
                    time_in: Date | null;
                    time_out: Date | null;
                    status: string;
                }>(
                    `SELECT attendance_id, time_in, time_out, status
                     FROM event_attendance
                     WHERE event_id = $1 AND student_id = $2
                     FOR UPDATE`,
                    [event.event_id, card.student_id],
                );
                const attendance = existingAttendance.rows[0];
                if (!attendance?.time_in || attendance.time_out) {
                    await saveLog(card.card_id, event.event_id, "duplicate");
                    await db.query("COMMIT");
                    transactionStarted = false;
                    res.json({ ok: true, result: "duplicate", name, event: event.title });
                    return;
                }
                const checkedOut = await db.query(
                    `UPDATE event_attendance SET time_out = now()
                     WHERE attendance_id = $1 AND time_out IS NULL
                     RETURNING time_out`,
                    [attendance.attendance_id],
                );
                await saveLog(card.card_id, event.event_id, "accepted");
                await db.query("COMMIT");
                transactionStarted = false;
                res.json({
                    ok: true,
                    result: "time_out",
                    name,
                    status: attendance.status,
                    event: event.title,
                    time_out: checkedOut.rows[0].time_out,
                });
                return;
            }

            const logId = await saveLog(card.card_id, event.event_id, "accepted");
            const insertedAttendance = await db.query<{ attendance_id: number }>(
                `INSERT INTO event_attendance (event_id, student_id, time_in, status, log_id)
                 VALUES ($1, $2, now(), $3, $4)
                 ON CONFLICT (event_id, student_id) DO NOTHING
                 RETURNING attendance_id`,
                [event.event_id, card.student_id, event.is_late ? "late" : "present", logId],
            );
            let attendanceAccepted = Boolean(insertedAttendance.rowCount);

            if (!insertedAttendance.rowCount) {
                const existingAttendance = await db.query<{
                    attendance_id: number;
                    time_in: Date | null;
                    time_out: Date | null;
                    status: string;
                }>(
                    `SELECT attendance_id, time_in, time_out, status
                     FROM event_attendance
                     WHERE event_id = $1 AND student_id = $2
                     FOR UPDATE`,
                    [event.event_id, card.student_id],
                );
                const priorAttendance = existingAttendance.rows[0];
                if (
                    priorAttendance &&
                    !priorAttendance.time_in &&
                    ["absent", "excused"].includes(priorAttendance.status)
                ) {
                    const checkedIn = await db.query(
                        `UPDATE event_attendance
                         SET time_in = now(), status = $2, log_id = $3
                         WHERE attendance_id = $1
                         RETURNING attendance_id`,
                        [priorAttendance.attendance_id, event.is_late ? "late" : "present", logId],
                    );
                    attendanceAccepted = Boolean(checkedIn.rowCount);
                }
            }
            if (!attendanceAccepted) {
                await db.query("UPDATE attendance_logs SET result = 'duplicate' WHERE log_id = $1", [logId]);
                await db.query("COMMIT");
                transactionStarted = false;
                res.json({ ok: true, result: "duplicate", name, event: event.title });
                return;
            }

            if (event.points > 0) {
                await db.query(
                    `INSERT INTO attendance_points (student_id, event_id, points, reason)
                     VALUES ($1, $2, $3, $4)`,
                    [card.student_id, event.event_id, event.points, `Attended: ${event.title}`],
                );
            }

            await db.query("COMMIT");
            transactionStarted = false;
            res.json({
                ok: true,
                result: "accepted",
                name,
                status: event.is_late ? "late" : "present",
                event: event.title,
            });
        } catch (error) {
            if (transactionStarted) {
                await db.query("ROLLBACK").catch((rollbackError: unknown) => {
                    console.error("Failed to roll back RFID scan transaction:", rollbackError);
                });
            }
            throw error;
        } finally {
            db.release();
        }
    }),
);

attendanceRouter.put(
    "/admin/events/:eventId/students/:studentId/attendance",
    authenticate,
    allowRoles("admin", "teacher"),
    asyncHandler(async (req, res) => {
        const eventId = Number(req.params.eventId);
        const studentId = Number(req.params.studentId);
        const { status, remarks } = req.body ?? {};
        const timeInProvided = Object.prototype.hasOwnProperty.call(req.body ?? {}, "time_in");
        const timeOutProvided = Object.prototype.hasOwnProperty.call(req.body ?? {}, "time_out");
        const timeIn = req.body?.time_in ?? null;
        const timeOut = req.body?.time_out ?? null;
        if (
            !Number.isSafeInteger(eventId) || eventId < 1 ||
            !Number.isSafeInteger(studentId) || studentId < 1 ||
            !["present", "late", "absent", "excused"].includes(status) ||
            (remarks !== undefined && remarks !== null && (typeof remarks !== "string" || remarks.length > 255)) ||
            (timeInProvided && timeIn !== null &&
                (typeof timeIn !== "string" || Number.isNaN(Date.parse(timeIn)))) ||
            (timeOutProvided && timeOut !== null &&
                (typeof timeOut !== "string" || Number.isNaN(Date.parse(timeOut)))) ||
            (typeof timeIn === "string" && typeof timeOut === "string" &&
                Date.parse(timeOut) < Date.parse(timeIn))
        ) {
            throw new HttpError(400, "invalid_attendance_update");
        }
        const teacherDepartment = req.authUser!.role === "teacher"
            ? await pool.query<{ department_id: number; year_level: number | null }>(
                "SELECT department_id, year_level FROM teachers WHERE user_id = $1",
                [req.authUser!.userId],
            )
            : null;
        if (teacherDepartment && !teacherDepartment.rowCount) {
            throw new HttpError(403, "teacher_profile_not_found");
        }
        if (req.authUser!.role === "teacher" && (timeInProvided || timeOutProvided)) {
            throw new HttpError(403, "time_edits_are_admin_only");
        }
        const result = await pool.query(
            `INSERT INTO event_attendance (event_id, student_id, time_in, time_out, status, remarks)
             SELECT e.event_id, s.student_id,
                    CASE WHEN $6::boolean THEN $7::timestamptz
                         WHEN $3 IN ('present', 'late') THEN now()
                         ELSE NULL END,
                    CASE WHEN $8::boolean THEN $9::timestamptz ELSE NULL END,
                    $3, $4
             FROM events e
             JOIN students s ON s.student_id = $2
             WHERE e.event_id = $1
               AND e.requires_attendance = TRUE
               AND (e.department_id IS NULL OR e.department_id = s.department_id)
               AND ($5::int IS NULL OR s.department_id = $5)
               AND ($10::int IS NULL OR s.year_level = $10)
             ON CONFLICT (event_id, student_id) DO UPDATE
               SET status = EXCLUDED.status,
                   remarks = EXCLUDED.remarks,
                   time_in = CASE
                       WHEN $6::boolean THEN $7::timestamptz
                       WHEN EXCLUDED.status IN ('present', 'late')
                            AND event_attendance.time_in IS NULL THEN now()
                       ELSE event_attendance.time_in
                   END,
                   time_out = CASE WHEN $8::boolean THEN $9::timestamptz
                                   ELSE event_attendance.time_out END
             RETURNING *`,
            [
                eventId,
                studentId,
                status,
                remarks?.trim() || null,
                teacherDepartment?.rows[0]?.department_id ?? null,
                timeInProvided,
                timeIn,
                timeOutProvided,
                timeOut,
                teacherDepartment?.rows[0]?.year_level ?? null,
            ],
        );
        if (!result.rowCount) {
            throw new HttpError(404, "event_or_student_not_found");
        }
        res.json({ ok: true, attendance: result.rows[0] });
    }),
);

attendanceRouter.get(
    "/attendance/recent",
    authenticate,
    allowRoles("admin", "teacher"),
    asyncHandler(async (req, res) => {
        const limit = req.query.limit === undefined ? 3 : Number(req.query.limit);
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 12) {
            throw new HttpError(400, "limit_must_be_between_1_and_12");
        }
        const teacher = req.authUser!.role === "teacher"
            ? await pool.query<{ department_id: number; year_level: number | null }>(
                "SELECT department_id, year_level FROM teachers WHERE user_id = $1",
                [req.authUser!.userId],
            )
            : null;
        if (teacher && !teacher.rowCount) {
            throw new HttpError(403, "teacher_profile_not_found");
        }
        const resetStateTable = await pool.query<{ exists: boolean }>(
            `SELECT to_regclass('attendance_live_display_state') IS NOT NULL
                    AND EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema = ANY(current_schemas(FALSE))
                          AND table_name = 'attendance_live_display_state'
                          AND column_name = 'reset_at'
                    ) AS exists`,
        );
        const resetFilter = resetStateTable.rows[0]?.exists
            ? `AND GREATEST(ea.time_in, COALESCE(ea.time_out, ea.time_in)) > COALESCE(
                   (SELECT reset_at
                    FROM attendance_live_display_state
                    WHERE singleton_id = TRUE),
                   '-infinity'::timestamptz
               )`
            : "";
        const result = await pool.query(
            `SELECT ea.attendance_id, ea.event_id, e.title AS event_title,
                    ea.time_in, ea.time_out, ea.status,
                    s.student_id, s.student_no, s.year_level, s.section, u.user_id,
                    u.first_name, u.last_name,
                    d.code AS department_code,
                    GREATEST(ea.time_in, COALESCE(ea.time_out, ea.time_in)) AS last_activity
             FROM event_attendance ea
             JOIN events e ON e.event_id = ea.event_id
             JOIN students s ON s.student_id = ea.student_id
             JOIN users u ON u.user_id = s.user_id
             JOIN departments d ON d.department_id = s.department_id
             WHERE ($1::int IS NULL OR s.department_id = $1)
               AND ($3::int IS NULL OR s.year_level = $3)
               ${resetFilter}
             ORDER BY last_activity DESC
             LIMIT $2`,
            [teacher?.rows[0]?.department_id ?? null, limit, teacher?.rows[0]?.year_level ?? null],
        );
        res.json({ ok: true, attendance: result.rows });
    }),
);

attendanceRouter.get(
    "/students/me/points",
    authenticate,
    allowRoles("student", "team_leader"),
    asyncHandler(async (req, res) => {
        const timeZone = process.env.ATTENDANCE_TIME_ZONE || "Asia/Manila";
        const result = await pool.query(
            `SELECT s.student_id, COALESCE(sum(ap.points), 0)::int AS total_points
             FROM students s
             LEFT JOIN attendance_points ap ON ap.student_id = s.student_id
             WHERE s.user_id = $1
             GROUP BY s.student_id`,
            [req.authUser!.userId],
        );
        if (!result.rowCount) {
            throw new HttpError(404, "student_profile_not_found");
        }
        const activity = await pool.query(
            `SELECT (ap.created_at AT TIME ZONE $2)::date::text AS activity_date,
                    COALESCE(sum(ap.points), 0)::int AS points,
                    json_agg(
                        json_build_object(
                            'event_title', e.title,
                            'points', ap.points,
                            'reason', ap.reason
                        )
                        ORDER BY ap.created_at, ap.event_id
                    ) AS entries
             FROM attendance_points ap
             JOIN students s ON s.student_id = ap.student_id
             LEFT JOIN events e ON e.event_id = ap.event_id
             WHERE s.user_id = $1
             GROUP BY (ap.created_at AT TIME ZONE $2)::date
             ORDER BY activity_date`,
            [req.authUser!.userId, timeZone],
        );
        res.json({ ok: true, points: result.rows[0], activity: activity.rows });
    }),
);

attendanceRouter.get(
    "/students/me/events",
    authenticate,
    allowRoles("student", "team_leader"),
    asyncHandler(async (req, res) => {
        const from = typeof req.query.from === "string" ? req.query.from : null;
        const to = typeof req.query.to === "string" ? req.query.to : null;
        if (
            (from !== null && Number.isNaN(Date.parse(from))) ||
            (to !== null && Number.isNaN(Date.parse(to))) ||
            (from !== null && to !== null && Date.parse(to) <= Date.parse(from))
        ) {
            throw new HttpError(400, "invalid_event_date_range");
        }
        const [eventStart, eventEnd] = await Promise.all([
            eventTimestampInstantSql(pool, "start_datetime"),
            eventTimestampInstantSql(pool, "end_datetime"),
        ]);
        const result = await pool.query(
            `SELECT e.event_id, e.title, e.description, e.event_type, e.venue,
                    ${eventStart} AS start_datetime, ${eventEnd} AS end_datetime,
                    e.requires_attendance,
                    e.points, e.event_status, e.attendance_open, e.status_note,
                    ea.time_in, ea.time_out, ea.status,
                    CASE
                        WHEN ea.status = 'excused' THEN 'Excused'
                        WHEN ea.status IN ('present', 'late') THEN
                            CASE WHEN ea.time_out IS NULL THEN 'Checked in' ELSE 'Complete' END
                        WHEN e.event_status = 'moved' THEN 'Moved'
                        WHEN e.event_status = 'cancelled' THEN 'Not continuing'
                        WHEN e.event_status = 'done' THEN 'Done'
                        WHEN NOT e.requires_attendance THEN 'School event'
                        WHEN ${eventEnd} < now() THEN 'Absent'
                        ELSE 'Upcoming'
                    END AS checklist_status
             FROM students s
             JOIN events e ON e.department_id IS NULL OR e.department_id = s.department_id
             LEFT JOIN event_attendance ea
               ON ea.event_id = e.event_id AND ea.student_id = s.student_id
             WHERE s.user_id = $1
               AND ($2::timestamptz IS NULL OR ${eventEnd} >= $2)
               AND ($3::timestamptz IS NULL OR ${eventStart} < $3)
             ORDER BY ${eventStart}`,
            [req.authUser!.userId, from, to],
        );
        res.json({ ok: true, events: result.rows });
    }),
);

attendanceRouter.put(
    "/students/me/events/:eventId/checklist",
    authenticate,
    allowRoles("student", "team_leader"),
    asyncHandler(async (req, res) => {
        const eventId = Number(req.params.eventId);
        const isDone = req.body?.is_done;
        if (!Number.isSafeInteger(eventId) || eventId < 1 || typeof isDone !== "boolean") {
            throw new HttpError(400, "event_id_and_checklist_status_required");
        }
        const result = await pool.query(
            `INSERT INTO student_event_checklist (student_id, event_id, is_done, completed_at)
             SELECT s.student_id, e.event_id, $3,
                    CASE WHEN $3 THEN now() ELSE NULL END
             FROM students s
             JOIN events e ON e.event_id = $2
               AND (e.department_id IS NULL OR e.department_id = s.department_id)
             WHERE s.user_id = $1
             ON CONFLICT (student_id, event_id) DO UPDATE
               SET is_done = EXCLUDED.is_done,
                   completed_at = EXCLUDED.completed_at,
                   updated_at = now()
             RETURNING event_id, is_done, completed_at`,
            [req.authUser!.userId, eventId, isDone],
        );
        if (!result.rowCount) {
            throw new HttpError(404, "student_or_event_not_found");
        }
        res.json({ ok: true, checklist: result.rows[0] });
    }),
);

attendanceRouter.get(
    "/attendance/events/:eventId/roster",
    authenticate,
    allowRoles("admin", "teacher"),
    asyncHandler(async (req, res) => {
        const eventId = Number(req.params.eventId);
        if (!Number.isSafeInteger(eventId) || eventId < 1) {
            throw new HttpError(400, "invalid_event_id");
        }
        const teacherDepartment = req.authUser!.role === "teacher"
            ? await pool.query<{ department_id: number; year_level: number | null }>(
                "SELECT department_id, year_level FROM teachers WHERE user_id = $1",
                [req.authUser!.userId],
            )
            : null;
        if (teacherDepartment && !teacherDepartment.rowCount) {
            throw new HttpError(403, "teacher_profile_not_found");
        }
        const result = await pool.query(
            `SELECT e.event_id, e.title AS event_title, e.start_datetime,
                    s.student_id, s.student_no, s.year_level, s.section,
                    u.first_name, u.last_name,
                    ea.attendance_id, ea.time_in, ea.time_out, ea.status, ea.remarks,
                    COALESCE(ea.status, 'absent') AS checklist_status
             FROM events e
             JOIN students s ON e.department_id IS NULL OR e.department_id = s.department_id
             JOIN users u ON u.user_id = s.user_id AND u.is_active = TRUE
             LEFT JOIN event_attendance ea
               ON ea.event_id = e.event_id AND ea.student_id = s.student_id
             WHERE e.event_id = $1
               AND e.requires_attendance = TRUE
               AND ($2::int IS NULL OR s.department_id = $2)
               AND ($3::int IS NULL OR s.year_level = $3)
             ORDER BY s.year_level, u.last_name, u.first_name`,
            [
                eventId,
                teacherDepartment?.rows[0]?.department_id ?? null,
                teacherDepartment?.rows[0]?.year_level ?? null,
            ],
        );
        if (!result.rowCount) {
            const eventExists = await pool.query("SELECT 1 FROM events WHERE event_id = $1 AND requires_attendance = TRUE", [eventId]);
            if (!eventExists.rowCount) {
                throw new HttpError(404, "attendance_event_not_found");
            }
        }
        res.json({ ok: true, attendance: result.rows });
    }),
);

attendanceRouter.get(
    "/events/:eventId/attendance",
    authenticate,
    allowRoles("admin", "teacher"),
    asyncHandler(async (req, res) => {
        const eventId = Number(req.params.eventId);
        if (!Number.isSafeInteger(eventId) || eventId < 1) {
            throw new HttpError(400, "invalid_event_id");
        }
        const result = await pool.query(
            `SELECT ea.attendance_id, ea.event_id, ea.student_id, s.student_no,
                    u.first_name, u.last_name, ea.time_in, ea.time_out, ea.status, ea.remarks
             FROM event_attendance ea
             JOIN students s ON s.student_id = ea.student_id
             JOIN users u ON u.user_id = s.user_id
             WHERE ea.event_id = $1
               AND (
                   $2::text = 'admin'
                   OR EXISTS (
                       SELECT 1 FROM events e
                       WHERE e.event_id = ea.event_id
                         AND (e.department_id IS NULL OR e.department_id = (
                             SELECT department_id FROM teachers WHERE user_id = $3
                         ))
                   )
               )
             ORDER BY ea.time_in NULLS LAST, u.last_name, u.first_name`,
            [eventId, req.authUser!.role, req.authUser!.userId],
        );
        res.json({ ok: true, attendance: result.rows });
    }),
);

export default attendanceRouter;
