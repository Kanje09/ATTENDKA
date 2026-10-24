import pool from "../config/db.js";

export interface UserProfileUpdate {
    first_name?: string;
    middle_name?: string | null;
    last_name?: string;
    email?: string | null;
}

export async function getUsers() {
    return pool.query(
        `SELECT user_id, username, role, first_name, middle_name, last_name, email,
                is_active, last_login, created_at
         FROM users
         ORDER BY created_at DESC`,
    );
}

export async function updateUserProfile(userId: number, input: UserProfileUpdate) {
    const allowedColumns: Record<keyof UserProfileUpdate, string> = {
        first_name: "first_name",
        middle_name: "middle_name",
        last_name: "last_name",
        email: "email",
    };
    const fields = Object.entries(allowedColumns).filter(([key]) =>
        Object.prototype.hasOwnProperty.call(input, key),
    );
    if (!fields.length) {
        return pool.query(
            `SELECT user_id, username, first_name, middle_name, last_name, email
             FROM users WHERE user_id = $1`,
            [userId],
        );
    }

    const values: Array<string | number | null | undefined> = fields.map(
        ([key]) => input[key as keyof UserProfileUpdate],
    );
    values.push(userId);
    const assignments = fields
        .map(([, column], index) => `${column} = $${index + 1}`)
        .join(", ");
    return pool.query(
        `UPDATE users SET ${assignments}
         WHERE user_id = $${values.length} AND is_active = TRUE
         RETURNING user_id, username, first_name, middle_name, last_name, email`,
        values,
    );
}
