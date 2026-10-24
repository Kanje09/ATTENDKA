import { Router } from "express";
import pool from "../config/db.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { allowRoles, authenticate } from "../middleware/auth.js";
import { HttpError } from "../middleware/errorHandler.js";
import {
    eventTimestampInstantSql,
    requireDateOnly,
    zonedDayRangeSql,
} from "../utils/zonedDateRange.js";

const eventsRouter = Router();

eventsRouter.get(
    "/events",
    asyncHandler(async (req, res) => {
        const { from, to, department_id, type } = req.query;
        const date = req.query.date === undefined ? null : requireDateOnly(req.query.date);
        const filters: string[] = [];
        const values: unknown[] = [];
        const eventStart = await eventTimestampInstantSql(pool, "start_datetime");
        const eventEnd = await eventTimestampInstantSql(pool, "end_datetime");
        if (date) {
            const dateParameter = `$${values.push(date)}`;
            const timeZoneParameter = `$${values.push(process.env.ATTENDANCE_TIME_ZONE || "Asia/Manila")}`;
            const dayRange = zonedDayRangeSql(dateParameter, timeZoneParameter);
            filters.push(`${eventStart} >= ${dayRange.start}`);
            filters.push(`${eventStart} < ${dayRange.end}`);
        }
        if (from) {
            if (typeof from !== "string" || Number.isNaN(Date.parse(from))) {
                throw new HttpError(400, "invalid_from_date");
            }
            values.push(from);
            filters.push(`${eventEnd} >= $${values.length}::timestamptz`);
        }
        if (to) {
            if (typeof to !== "string" || Number.isNaN(Date.parse(to))) {
                throw new HttpError(400, "invalid_to_date");
            }
            values.push(to);
            filters.push(`${eventStart} < $${values.length}::timestamptz`);
        }
        if (department_id) {
            if (typeof department_id !== "string") {
                throw new HttpError(400, "invalid_department_id");
            }
            const departmentId = Number(department_id);
            if (!Number.isSafeInteger(departmentId) || departmentId < 1) {
                throw new HttpError(400, "invalid_department_id");
            }
            values.push(departmentId);
            filters.push(`(e.department_id IS NULL OR e.department_id = $${values.length})`);
        }
        if (type) {
            if (
                typeof type !== "string" ||
                !["academic", "seminar", "sports", "intramurals", "meeting", "holiday", "other"].includes(type)
            ) {
                throw new HttpError(400, "invalid_event_type");
            }
            values.push(type);
            filters.push(`event_type = $${values.length}`);
        }

        const result = await pool.query(
            `SELECT e.event_id, e.title, e.description, e.event_type, e.venue,
                    e.start_datetime, e.end_datetime, e.department_id,
                    d.code AS department_code, e.requires_attendance, e.points,
                    e.event_status, e.attendance_open, e.status_note, e.created_by, e.created_at
             FROM events e LEFT JOIN departments d ON d.department_id = e.department_id
             ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
             ORDER BY e.start_datetime
             LIMIT 500`,
            values,
        );
        res.json({ ok: true, events: result.rows });
    }),
);

eventsRouter.get(
    "/events/:eventId",
    asyncHandler(async (req, res) => {
        const eventId = Number(req.params.eventId);
        if (!Number.isSafeInteger(eventId) || eventId < 1) {
            throw new HttpError(400, "invalid_event_id");
        }
        const result = await pool.query(
            `SELECT e.*, d.code AS department_code
             FROM events e LEFT JOIN departments d ON d.department_id = e.department_id
             WHERE e.event_id = $1`,
            [eventId],
        );
        if (!result.rowCount) {
            throw new HttpError(404, "event_not_found");
        }
        res.json({ ok: true, event: result.rows[0] });
    }),
);

eventsRouter.post(
    "/events",
    authenticate,
    allowRoles("admin"),
    asyncHandler(async (req, res) => {
        const {
            title, description, event_type, venue, start_datetime, end_datetime,
            department_id, requires_attendance = true, points = 0,
        } = req.body ?? {};
        if (
            typeof title !== "string" || !title.trim() || title.length > 200 ||
            !["academic", "seminar", "sports", "intramurals", "meeting", "holiday", "other"].includes(event_type) ||
            typeof start_datetime !== "string" || Number.isNaN(Date.parse(start_datetime)) ||
            typeof end_datetime !== "string" || Number.isNaN(Date.parse(end_datetime)) ||
            Date.parse(end_datetime) <= Date.parse(start_datetime) ||
            typeof requires_attendance !== "boolean" ||
            !Number.isInteger(points) || points < 0 ||
            (department_id !== undefined && department_id !== null && (!Number.isSafeInteger(Number(department_id)) || Number(department_id) < 1))
        ) {
            throw new HttpError(400, "invalid_event");
        }
        if (req.authUser!.role === "teacher") {
            const teacher = await pool.query<{ department_id: number }>(
                "SELECT department_id FROM teachers WHERE user_id = $1",
                [req.authUser!.userId],
            );
            if (!teacher.rowCount || Number(department_id) !== teacher.rows[0].department_id) {
                throw new HttpError(403, "teacher_can_only_create_events_for_their_department");
            }
        }
        const result = await pool.query(
            `INSERT INTO events
             (title, description, event_type, venue, start_datetime, end_datetime,
              department_id, requires_attendance, points, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             RETURNING *`,
            [
                title.trim(), description ?? null, event_type, venue ?? null,
                start_datetime, end_datetime, department_id ?? null,
                requires_attendance, points, req.authUser!.userId,
            ],
        );
        res.status(201).json({ ok: true, event: result.rows[0] });
    }),
);

eventsRouter.patch(
    "/events/:eventId",
    authenticate,
    allowRoles("admin"),
    asyncHandler(async (req, res) => {
        const eventId = Number(req.params.eventId);
        if (!Number.isSafeInteger(eventId) || eventId < 1) {
            throw new HttpError(400, "invalid_event_id");
        }
        const fields: Record<string, string> = {
            title: "title",
            description: "description",
            event_type: "event_type",
            venue: "venue",
            start_datetime: "start_datetime",
            end_datetime: "end_datetime",
            department_id: "department_id",
            requires_attendance: "requires_attendance",
            points: "points",
            event_status: "event_status",
            attendance_open: "attendance_open",
            status_note: "status_note",
        };
        const changes = Object.entries(fields).filter(([key]) =>
            Object.prototype.hasOwnProperty.call(req.body ?? {}, key),
        );
        if (!changes.length) {
            throw new HttpError(400, "no_event_fields_to_update");
        }
        const validTypes = ["academic", "seminar", "sports", "intramurals", "meeting", "holiday", "other"];
        for (const [key] of changes) {
            const value = req.body[key];
            if (
                (key === "title" && (typeof value !== "string" || !value.trim() || value.length > 200)) ||
                (key === "event_type" && (typeof value !== "string" || !validTypes.includes(value))) ||
                (key === "description" && value !== null && typeof value !== "string") ||
                (key === "venue" && value !== null && (typeof value !== "string" || value.length > 150)) ||
                ((key === "start_datetime" || key === "end_datetime") &&
                    (typeof value !== "string" || Number.isNaN(Date.parse(value)))) ||
                (key === "department_id" && value !== null &&
                    (!Number.isSafeInteger(Number(value)) || Number(value) < 1)) ||
                (key === "requires_attendance" && typeof value !== "boolean") ||
                (key === "points" && (!Number.isInteger(value) || Number(value) < 0))
                || (key === "event_status" &&
                    (typeof value !== "string" || !["pending", "ongoing", "moved", "done", "cancelled"].includes(value)))
                || (key === "attendance_open" && typeof value !== "boolean")
                || (key === "status_note" && value !== null &&
                    (typeof value !== "string" || value.length > 255))
            ) {
                throw new HttpError(400, "invalid_event_update");
            }
        }
        const [eventStart, eventEnd] = await Promise.all([
            eventTimestampInstantSql(pool, "start_datetime"),
            eventTimestampInstantSql(pool, "end_datetime"),
        ]);
        const currentEvent = await pool.query<{ start_datetime: Date; end_datetime: Date }>(
            `SELECT ${eventStart} AS start_datetime, ${eventEnd} AS end_datetime
             FROM events e WHERE e.event_id = $1`,
            [eventId],
        );
        if (!currentEvent.rowCount) {
            throw new HttpError(404, "event_not_found");
        }
        const nextStart = req.body.start_datetime ?? currentEvent.rows[0].start_datetime;
        const nextEnd = req.body.end_datetime ?? currentEvent.rows[0].end_datetime;
        if (new Date(nextEnd).getTime() <= new Date(nextStart).getTime()) {
            throw new HttpError(400, "event_end_must_follow_start");
        }
        if (req.authUser!.role === "teacher" && Object.prototype.hasOwnProperty.call(req.body, "department_id")) {
            const teacher = await pool.query<{ department_id: number }>(
                "SELECT department_id FROM teachers WHERE user_id = $1",
                [req.authUser!.userId],
            );
            if (!teacher.rowCount || Number(req.body.department_id) !== teacher.rows[0].department_id) {
                throw new HttpError(403, "teacher_can_only_manage_their_department_events");
            }
        }
        const assignments = changes.map(([key, column], index) => `${column} = $${index + 1}`).join(", ");
        const values = changes.map(([key]) => req.body[key]);
        const user = req.authUser!;
        values.push(eventId);
        const ownershipCondition = user.role === "admin"
            ? ""
            : ` AND created_by = $${values.push(user.userId)}`;
        const result = await pool.query(
            `UPDATE events SET ${assignments}
             WHERE event_id = $${changes.length + 1}${ownershipCondition}
             RETURNING *`,
            values,
        );
        if (!result.rowCount) {
            throw new HttpError(404, "event_not_found_or_not_owned");
        }
        res.json({ ok: true, event: result.rows[0] });
    }),
);

eventsRouter.delete(
    "/events/:eventId",
    authenticate,
    allowRoles("admin"),
    asyncHandler(async (req, res) => {
        const eventId = Number(req.params.eventId);
        if (!Number.isSafeInteger(eventId) || eventId < 1) {
            throw new HttpError(400, "invalid_event_id");
        }
        const result = await pool.query("DELETE FROM events WHERE event_id = $1 RETURNING event_id", [eventId]);
        if (!result.rowCount) {
            throw new HttpError(404, "event_not_found");
        }
        res.json({ ok: true, deleted: true });
    }),
);

export default eventsRouter;
