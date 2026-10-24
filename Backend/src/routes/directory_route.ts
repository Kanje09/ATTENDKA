import { Router } from "express";
import pool from "../config/db.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { allowRoles, authenticate } from "../middleware/auth.js";
import { HttpError } from "../middleware/errorHandler.js";

const directoryRouter = Router();

directoryRouter.get(
    "/departments",
    asyncHandler(async (_req, res) => {
        const result = await pool.query(
            "SELECT department_id, code, name FROM departments WHERE is_active = TRUE ORDER BY name",
        );
        res.json({ ok: true, departments: result.rows });
    }),
);

directoryRouter.get(
    "/students",
    authenticate,
    allowRoles("admin", "teacher"),
    asyncHandler(async (req, res) => {
        const departmentId = req.query.department_id === undefined ? undefined : Number(req.query.department_id);
        if (departmentId !== undefined && (!Number.isSafeInteger(departmentId) || departmentId < 1)) {
            throw new HttpError(400, "invalid_department_id");
        }
        const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
        const yearLevel = req.query.year_level === undefined ? null : Number(req.query.year_level);
        if (yearLevel !== null && (!Number.isSafeInteger(yearLevel) || yearLevel < 1 || yearLevel > 10)) {
            throw new HttpError(400, "invalid_year_level");
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
            `SELECT s.student_id, s.student_no, s.department_id, s.user_id, d.code AS department_code,
                    s.year_level, s.section, u.first_name, u.middle_name, u.last_name, u.email
             FROM students s
             JOIN users u ON u.user_id = s.user_id
             JOIN departments d ON d.department_id = s.department_id
             WHERE u.is_active = TRUE
               AND ($1::int IS NULL OR s.department_id = $1)
               AND ($3::int IS NULL OR s.department_id = $3)
               AND ($4::int IS NULL OR s.year_level = $4)
               AND ($5::int IS NULL OR s.year_level = $5)
               AND ($2::text = '' OR s.student_no ILIKE '%' || $2 || '%'
                    OR u.first_name ILIKE '%' || $2 || '%'
                    OR u.last_name ILIKE '%' || $2 || '%'
                    OR concat_ws(' ', u.first_name, u.middle_name, u.last_name) ILIKE '%' || $2 || '%')
             ORDER BY u.last_name, u.first_name
             LIMIT 500`,
            [
                departmentId ?? null,
                search,
                teacherDepartment?.rows[0]?.department_id ?? null,
                yearLevel,
                teacherDepartment?.rows[0]?.year_level ?? null,
            ],
        );
        res.json({ ok: true, students: result.rows });
    }),
);

directoryRouter.get(
    "/masterlists",
    authenticate,
    allowRoles("admin", "teacher"),
    asyncHandler(async (req, res) => {
        const teacherDepartment = req.authUser!.role === "teacher"
            ? await pool.query<{ department_id: number }>(
                "SELECT department_id FROM teachers WHERE user_id = $1",
                [req.authUser!.userId],
            )
            : null;
        if (teacherDepartment && !teacherDepartment.rowCount) {
            throw new HttpError(403, "teacher_profile_not_found");
        }
        const result = await pool.query(
            `SELECT ml.masterlist_id, ml.department_id, d.code AS department, ml.school_year, ml.semester,
                    ml.created_by, ml.created_at, count(ms.student_id)::int AS student_count
             FROM masterlists ml
             JOIN departments d ON d.department_id = ml.department_id
             LEFT JOIN masterlist_students ms ON ms.masterlist_id = ml.masterlist_id
             WHERE ($1::int IS NULL OR ml.department_id = $1)
             GROUP BY ml.masterlist_id, d.code
             ORDER BY ml.school_year DESC, ml.semester, d.code`,
            [teacherDepartment?.rows[0]?.department_id ?? null],
        );
        res.json({ ok: true, masterlists: result.rows });
    }),
);

directoryRouter.post(
    "/masterlists",
    authenticate,
    allowRoles("admin"),
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
        res.status(201).json({ ok: true, masterlist: result.rows[0] });
    }),
);

directoryRouter.get(
    "/teams/advising",
    authenticate,
    allowRoles("teacher"),
    asyncHandler(async (req, res) => {
        const result = await pool.query(
            `SELECT t.team_id, t.name, t.school_year,
                    count(tm.student_id)::int AS member_count
             FROM teachers teacher
             JOIN team_advisers ta ON ta.teacher_id = teacher.teacher_id
             JOIN teams t ON t.team_id = ta.team_id
             LEFT JOIN team_members tm ON tm.team_id = t.team_id
             WHERE teacher.user_id = $1
             GROUP BY t.team_id
             ORDER BY t.school_year DESC, t.name`,
            [req.authUser!.userId],
        );
        res.json({ ok: true, teams: result.rows });
    }),
);

directoryRouter.get(
    "/teams/:teamId/roster",
    authenticate,
    allowRoles("admin", "teacher"),
    asyncHandler(async (req, res) => {
        const teamId = Number(req.params.teamId);
        if (!Number.isSafeInteger(teamId) || teamId < 1) {
            throw new HttpError(400, "invalid_team_id");
        }
        if (req.authUser!.role === "teacher") {
            const adviser = await pool.query(
                `SELECT 1
                 FROM team_advisers ta
                 JOIN teachers t ON t.teacher_id = ta.teacher_id
                 WHERE ta.team_id = $1 AND t.user_id = $2`,
                [teamId, req.authUser!.userId],
            );
            if (!adviser.rowCount) {
                throw new HttpError(403, "team_adviser_required");
            }
        }
        const result = await pool.query(
            `SELECT t.team_id, t.name AS team_name,
                    s.student_id, s.student_no, s.year_level, s.section,
                    u.first_name, u.last_name
             FROM teams t
             JOIN team_members tm ON tm.team_id = t.team_id
             JOIN students s ON s.student_id = tm.student_id
             JOIN users u ON u.user_id = s.user_id
             WHERE t.team_id = $1
             ORDER BY s.year_level, u.last_name, u.first_name`,
            [teamId],
        );
        if (!result.rowCount) {
            const team = await pool.query("SELECT 1 FROM teams WHERE team_id = $1", [teamId]);
            if (!team.rowCount) {
                throw new HttpError(404, "team_not_found");
            }
        }
        res.json({ ok: true, members: result.rows });
    }),
);

directoryRouter.get(
    "/teams",
    authenticate,
    allowRoles("admin", "teacher", "team_leader"),
    asyncHandler(async (req, res) => {
        const isLeader = req.authUser!.role === "team_leader";
        const result = await pool.query(
            `SELECT DISTINCT t.team_id, t.name, t.logo_url, t.school_year,
                    count(tm.student_id)::int AS member_count
             FROM teams t
             LEFT JOIN team_members tm ON tm.team_id = t.team_id
             ${isLeader ? "JOIN v_team_leader_teams l ON l.team_id = t.team_id AND l.user_id = $1" : ""}
             GROUP BY t.team_id
             ORDER BY t.school_year DESC, t.name`,
            isLeader ? [req.authUser!.userId] : [],
        );
        res.json({ ok: true, teams: result.rows });
    }),
);

directoryRouter.get(
    "/teams/:teamId/attendance",
    authenticate,
    allowRoles("admin", "teacher", "team_leader"),
    asyncHandler(async (req, res) => {
        const teamId = Number(req.params.teamId);
        if (!Number.isSafeInteger(teamId) || teamId < 1) {
            throw new HttpError(400, "invalid_team_id");
        }
        const isLeader = req.authUser!.role === "team_leader";
        if (req.authUser!.role === "teacher") {
            const adviser = await pool.query(
                `SELECT 1
                 FROM team_advisers ta
                 JOIN teachers t ON t.teacher_id = ta.teacher_id
                 WHERE ta.team_id = $1 AND t.user_id = $2`,
                [teamId, req.authUser!.userId],
            );
            if (!adviser.rowCount) {
                throw new HttpError(403, "team_adviser_required");
            }
        }
        const result = await pool.query(
            `SELECT t.team_id, t.name AS team_name, e.event_id,
                    e.title AS event_title, e.start_datetime, s.student_no,
                    concat_ws(' ', u.first_name, u.last_name) AS student_name,
                    ea.time_in, ea.time_out, ea.status
             FROM teams t
             JOIN team_members tm ON tm.team_id = t.team_id
             JOIN students s ON s.student_id = tm.student_id
             JOIN users u ON u.user_id = s.user_id
             JOIN events e ON e.requires_attendance = TRUE
               AND (e.department_id IS NULL OR e.department_id = s.department_id)
             LEFT JOIN event_attendance ea
               ON ea.event_id = e.event_id AND ea.student_id = s.student_id
             ${isLeader ? "JOIN v_team_leader_teams l ON l.team_id = t.team_id AND l.user_id = $2" : ""}
             WHERE t.team_id = $1
             ORDER BY e.start_datetime, student_name`,
            isLeader ? [teamId, req.authUser!.userId] : [teamId],
        );
        res.json({ ok: true, attendance: result.rows });
    }),
);

directoryRouter.get(
    "/teams/:teamId/advisers",
    authenticate,
    allowRoles("admin", "teacher", "team_leader"),
    asyncHandler(async (req, res) => {
        const teamId = Number(req.params.teamId);
        if (!Number.isSafeInteger(teamId) || teamId < 1) {
            throw new HttpError(400, "invalid_team_id");
        }
        if (req.authUser!.role === "team_leader") {
            const allowed = await pool.query(
                "SELECT 1 FROM v_team_leader_teams WHERE user_id = $1 AND team_id = $2",
                [req.authUser!.userId, teamId],
            );
            if (!allowed.rowCount) {
                throw new HttpError(403, "forbidden");
            }
        }
        const result = await pool.query(
            `SELECT u.user_id, u.first_name, u.last_name, t.employee_no
             FROM team_advisers ta
             JOIN teachers t ON t.teacher_id = ta.teacher_id
             JOIN users u ON u.user_id = t.user_id
             WHERE ta.team_id = $1
             ORDER BY u.last_name, u.first_name`,
            [teamId],
        );
        res.json({ ok: true, advisers: result.rows });
    }),
);

directoryRouter.get(
    "/masterlists/:masterlistId/students",
    authenticate,
    allowRoles("admin", "teacher"),
    asyncHandler(async (req, res) => {
        const masterlistId = Number(req.params.masterlistId);
        if (!Number.isSafeInteger(masterlistId) || masterlistId < 1) {
            throw new HttpError(400, "invalid_masterlist_id");
        }
        const teacherDepartment = req.authUser!.role === "teacher"
            ? await pool.query<{ department_id: number }>(
                "SELECT department_id FROM teachers WHERE user_id = $1",
                [req.authUser!.userId],
            )
            : null;
        if (teacherDepartment && !teacherDepartment.rowCount) {
            throw new HttpError(403, "teacher_profile_not_found");
        }
        const result = await pool.query(
            `SELECT ml.masterlist_id, s.student_id, d.code AS department, ml.school_year, ml.semester,
                    s.student_no, u.user_id, u.last_name, u.first_name, s.year_level, s.section
             FROM masterlists ml
             JOIN departments d ON d.department_id = ml.department_id
             JOIN masterlist_students ms ON ms.masterlist_id = ml.masterlist_id
             JOIN students s ON s.student_id = ms.student_id
             JOIN users u ON u.user_id = s.user_id
             WHERE ml.masterlist_id = $1
               AND ($2::int IS NULL OR ml.department_id = $2)
             ORDER BY u.last_name, u.first_name`,
            [masterlistId, teacherDepartment?.rows[0]?.department_id ?? null],
        );
        res.json({ ok: true, students: result.rows });
    }),
);

directoryRouter.get(
    "/admin/masterlists/:masterlistId/candidates",
    authenticate,
    allowRoles("admin"),
    asyncHandler(async (req, res) => {
        const masterlistId = Number(req.params.masterlistId);
        if (!Number.isSafeInteger(masterlistId) || masterlistId < 1) {
            throw new HttpError(400, "invalid_masterlist_id");
        }
        const result = await pool.query(
            `SELECT ml.masterlist_id, s.student_id, u.user_id, s.student_no,
                    u.first_name, u.last_name, s.year_level, s.section,
                    d.code AS department_code,
                    EXISTS (
                        SELECT 1 FROM masterlist_students ms
                        WHERE ms.masterlist_id = ml.masterlist_id
                          AND ms.student_id = s.student_id
                    ) AS selected
             FROM masterlists ml
             JOIN students s ON s.department_id = ml.department_id
             JOIN users u ON u.user_id = s.user_id AND u.is_active = TRUE
             JOIN departments d ON d.department_id = s.department_id
             WHERE ml.masterlist_id = $1
             ORDER BY u.last_name, u.first_name`,
            [masterlistId],
        );
        if (!result.rowCount) {
            const masterlist = await pool.query("SELECT 1 FROM masterlists WHERE masterlist_id = $1", [masterlistId]);
            if (!masterlist.rowCount) {
                throw new HttpError(404, "masterlist_not_found");
            }
        }
        res.json({ ok: true, students: result.rows });
    }),
);

export default directoryRouter;
