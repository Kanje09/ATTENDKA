import { Router } from "express";
import pool from "../config/db.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate } from "../middleware/auth.js";
import { HttpError } from "../middleware/errorHandler.js";
import { changePassword, getCurrentUser, login, registerStudent } from "../services/auth_service.js";

const authRouter = Router();

authRouter.post(
    "/register",
    asyncHandler(async (req, res) => {
        const {
            username,
            password,
            first_name,
            middle_name,
            last_name,
            email,
            student_no,
            department_id,
            year_level,
            section,
        } = req.body ?? {};

        if (
            typeof username !== "string" || username.trim().length < 3 || username.length > 50 ||
            typeof password !== "string" || password.length < 8 || password.length > 200 ||
            typeof first_name !== "string" || !first_name.trim() || first_name.length > 80 ||
            typeof last_name !== "string" || !last_name.trim() || last_name.length > 80 ||
            typeof student_no !== "string" || !student_no.trim() || student_no.length > 30 ||
            !Number.isInteger(Number(department_id)) || Number(department_id) < 1 ||
            !Number.isInteger(Number(year_level)) || Number(year_level) < 1 || Number(year_level) > 10 ||
            (email !== undefined && email !== null && (typeof email !== "string" || email.length > 150)) ||
            (section !== undefined && section !== null && (typeof section !== "string" || section.length > 20)) ||
            (middle_name !== undefined && middle_name !== null && (typeof middle_name !== "string" || middle_name.length > 80))
        ) {
            throw new HttpError(400, "invalid_registration");
        }

        const result = await registerStudent({
            username,
            password,
            first_name,
            middle_name: middle_name ?? undefined,
            last_name,
            email: email ?? undefined,
            student_no,
            department_id: Number(department_id),
            year_level: Number(year_level),
            section: section ?? undefined,
        });
        res.status(201).json({ ok: true, ...result });
    }),
);

authRouter.post(
    "/login",
    asyncHandler(async (req, res) => {
        const { email, username, password } = req.body ?? {};
        if (
            typeof password !== "string" ||
            password.length === 0 ||
            password.length > 200 ||
            (typeof email !== "string" && typeof username !== "string")
        ) {
            throw new HttpError(400, "email_or_username_and_password_required");
        }
        res.json({ ok: true, ...(await login({ email, username, password })) });
    }),
);

authRouter.get(
    "/me",
    authenticate,
    asyncHandler(async (req, res) => {
        res.json({ ok: true, user: await getCurrentUser(req.authUser!.userId) });
    }),
);

authRouter.patch(
    "/me",
    authenticate,
    asyncHandler(async (req, res) => {
        if (req.authUser!.role === "student" || req.authUser!.role === "team_leader") {
            throw new HttpError(403, "students_cannot_update_profile");
        }
        const { first_name, last_name, email } = req.body ?? {};
        const fields = ["first_name", "last_name", "email"];
        if (!fields.some((field) => Object.prototype.hasOwnProperty.call(req.body ?? {}, field))) {
            throw new HttpError(400, "no_profile_fields_to_update");
        }
        if (
            (first_name !== undefined && (typeof first_name !== "string" || !first_name.trim() || first_name.length > 80)) ||
            (last_name !== undefined && (typeof last_name !== "string" || !last_name.trim() || last_name.length > 80)) ||
            (email !== undefined && email !== null && (typeof email !== "string" || email.length > 150))
        ) {
            throw new HttpError(400, "invalid_profile_update");
        }
        const updates: string[] = [];
        const values: Array<string | number | null> = [];
        for (const [key, column] of [
            ["first_name", "first_name"],
            ["last_name", "last_name"],
            ["email", "email"],
        ]) {
            if (Object.prototype.hasOwnProperty.call(req.body, key)) {
                values.push(typeof req.body[key] === "string" ? req.body[key].trim() : null);
                updates.push(`${column} = $${values.length}`);
            }
        }
        values.push(req.authUser!.userId);
        const result = await pool.query(
            `UPDATE users SET ${updates.join(", ")}
             WHERE user_id = $${values.length} AND is_active = TRUE
             RETURNING user_id, username, role, first_name, last_name, email`,
            values,
        );
        if (!result.rowCount) {
            throw new HttpError(404, "user_not_found");
        }
        res.json({ ok: true, user: result.rows[0] });
    }),
);

authRouter.post(
    "/password",
    authenticate,
    asyncHandler(async (req, res) => {
        const { current_password, new_password } = req.body ?? {};
        if (
            typeof current_password !== "string" ||
            typeof new_password !== "string" ||
            new_password.length < 8 ||
            new_password.length > 200
        ) {
            throw new HttpError(400, "current_and_new_password_required");
        }
        await changePassword(req.authUser!.userId, current_password, new_password);
        res.json({ ok: true, message: "password_updated" });
    }),
);

export default authRouter;
