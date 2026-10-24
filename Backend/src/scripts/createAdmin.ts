import pool from "../config/db.js";
import { hashPassword } from "../services/auth_service.js";
import { required } from "../config/index.js";

async function createAdmin(): Promise<void> {
    const username = required("ADMIN_USERNAME").trim();
    const password = required("ADMIN_PASSWORD");
    const firstName = process.env.ADMIN_FIRST_NAME?.trim() || "System";
    const lastName = process.env.ADMIN_LAST_NAME?.trim() || "Administrator";
    const email = process.env.ADMIN_EMAIL?.trim().toLowerCase() || null;
    const position = process.env.ADMIN_POSITION?.trim() || null;

    if (username.length < 3 || password.length < 12) {
        throw new Error("ADMIN_USERNAME must have 3+ characters and ADMIN_PASSWORD must have 12+ characters.");
    }

    const db = await pool.connect();
    try {
        await db.query("BEGIN");
        const result = await db.query<{ user_id: number }>(
            `INSERT INTO users (username, password_hash, role, first_name, last_name, email)
             VALUES ($1, $2, 'admin', $3, $4, $5)
             RETURNING user_id`,
            [username, await hashPassword(password), firstName, lastName, email],
        );
        await db.query(
            "INSERT INTO admins (user_id, position) VALUES ($1, $2)",
            [result.rows[0].user_id, position],
        );
        await db.query("COMMIT");
        console.log(`Admin account created (user_id=${result.rows[0].user_id}).`);
    } catch (error) {
        await db.query("ROLLBACK").catch((rollbackError: unknown) => {
            console.error("Failed to roll back admin creation:", rollbackError);
        });
        throw error;
    } finally {
        db.release();
    }
}

void createAdmin()
    .catch((error: unknown) => {
        console.error("Could not create admin account:", error);
        process.exitCode = 1;
    })
    .finally(() => pool.end());
