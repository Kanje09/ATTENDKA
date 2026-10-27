import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import pool from "../config/db.js";
import { HttpError } from "../middleware/errorHandler.js";
import { createToken } from "../middleware/auth.js";
import type { LoginInput, StudentRegisterInput } from "../types/users_type.js";

const scrypt = promisify(scryptCallback);

interface UserRow {
    user_id: number;
    username: string;
    password_hash: string;
    role: "student" | "teacher" | "admin" | "team_leader";
    first_name: string;
    middle_name: string | null;
    last_name: string;
    email: string | null;
    student_id?: number | null;
}

export async function hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16);
    const hash = (await scrypt(password, salt, 64)) as Buffer;
    return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
    const [algorithm, saltHex, hashHex] = stored.split("$");
    if (algorithm !== "scrypt" || !saltHex || !hashHex) {
        return false;
    }
    const expected = Buffer.from(hashHex, "hex");
    const actual = (await scrypt(password, Buffer.from(saltHex, "hex"), expected.length)) as Buffer;
    return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function registerStudent(input: StudentRegisterInput) {
    const db = await pool.connect();
    try {
        await db.query("BEGIN");
        const inserted = await db.query<UserRow>(
            `INSERT INTO users (username, password_hash, role, first_name, middle_name, last_name, email)
             VALUES ($1, $2, 'student', $3, $4, $5, $6)
             RETURNING user_id, username, role, first_name, middle_name, last_name, email`,
            [
                input.username.trim(),
                await hashPassword(input.password),
                input.first_name.trim(),
                input.middle_name?.trim() || null,
                input.last_name.trim(),
                input.email?.trim().toLowerCase() || null,
            ],
        );
        const profile = await db.query<{ student_id: number }>(
            `INSERT INTO students (user_id, student_no, department_id, year_level, section)
             VALUES ($1, $2, $3, $4, $5) RETURNING student_id`,
            [
                inserted.rows[0].user_id,
                input.student_no.trim(),
                input.department_id,
                input.year_level,
                input.section?.trim() || null,
            ],
        );
        await db.query("COMMIT");
        const user = inserted.rows[0];
        return {
            user: { ...user, student_id: profile.rows[0].student_id },
            token: createToken({ userId: user.user_id, role: user.role }),
        };
    } catch (error) {
        await db.query("ROLLBACK").catch(() => undefined);
        throw error;
    } finally {
        db.release();
    }
}

export async function login(input: LoginInput) {
    const identifier = (input.email || input.username || "").trim();
    const result = await pool.query<UserRow>(
        `SELECT u.user_id, u.username, u.password_hash, u.role, u.first_name,
                u.middle_name, u.last_name, u.email, s.student_id
         FROM users u
         LEFT JOIN students s ON s.user_id = u.user_id
         WHERE (lower(u.email) = lower($1) OR lower(u.username) = lower($1))
           AND u.is_active = TRUE`,
        [identifier],
    );
    const user = result.rows[0];
    if (!user || !(await verifyPassword(input.password, user.password_hash))) {
        throw new HttpError(401, "invalid_credentials");
    }

    await pool.query("UPDATE users SET last_login = now() WHERE user_id = $1", [user.user_id]);
    const { password_hash: _passwordHash, ...publicUser } = user;
    return {
        user: publicUser,
        token: createToken({ userId: user.user_id, role: user.role }),
    };
}

export async function getCurrentUser(userId: number) {
    const result = await pool.query(
        `SELECT u.user_id, u.username, u.role, u.first_name, u.middle_name, u.last_name, u.email, u.photo,
        s.student_id, s.student_no, s.department_id, s.year_level, s.section,
        t.teacher_id, t.employee_no, t.department_id AS teaching_department_id,
        t.year_level AS teaching_year_level
 FROM users u
 LEFT JOIN students s ON s.user_id = u.user_id
 LEFT JOIN teachers t ON t.user_id = u.user_id
 WHERE u.user_id = $1 AND u.is_active = TRUE`,
        [userId],
    );
    if (!result.rowCount) {
        throw new HttpError(404, "user_not_found");
    }
    return result.rows[0];
}

export async function changePassword(userId: number, currentPassword: string, newPassword: string): Promise<void> {
    const result = await pool.query<{ password_hash: string }>(
        "SELECT password_hash FROM users WHERE user_id = $1 AND is_active = TRUE",
        [userId],
    );
    if (!result.rowCount || !(await verifyPassword(currentPassword, result.rows[0].password_hash))) {
        throw new HttpError(400, "current_password_incorrect");
    }
    await pool.query(
        "UPDATE users SET password_hash = $1 WHERE user_id = $2",
        [await hashPassword(newPassword), userId],
    );
}
