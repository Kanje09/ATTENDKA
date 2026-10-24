import type { RequestHandler } from "express";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { HttpError } from "../../middleware/errorHandler.js";
import { loginUserService, registerUserService } from "../../services/users_service.js";

export const loginUserController: RequestHandler = asyncHandler(async (req, res) => {
    const { email, username, password } = req.body ?? {};
    if (
        typeof password !== "string" ||
        (typeof email !== "string" && typeof username !== "string")
    ) {
        throw new HttpError(400, "email_or_username_and_password_required");
    }
    res.json({ ok: true, ...(await loginUserService({ email, username, password })) });
});

export const registerUserController: RequestHandler = asyncHandler(async (req, res) => {
    const {
        username, password, first_name, middle_name, last_name, email,
        student_no, department_id, year_level, section,
    } = req.body ?? {};
    if (
        typeof username !== "string" || typeof password !== "string" ||
        typeof first_name !== "string" || typeof last_name !== "string" ||
        typeof student_no !== "string" || !Number.isSafeInteger(Number(department_id)) ||
        !Number.isSafeInteger(Number(year_level))
    ) {
        throw new HttpError(400, "invalid_registration");
    }
    const result = await registerUserService({
        username,
        password,
        first_name,
        middle_name,
        last_name,
        email,
        student_no,
        department_id: Number(department_id),
        year_level: Number(year_level),
        section,
    });
    res.status(201).json({ ok: true, ...result });
});
