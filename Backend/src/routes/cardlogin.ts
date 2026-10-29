import { Router } from "express";
import { createHash, randomBytes } from "node:crypto";
import rateLimit from "express-rate-limit";
import pool from "../config/db.js";
import { authenticate, allowRoles, createToken } from "../middleware/auth.js";
import { HttpError } from "../middleware/errorHandler.js";
import type { UserRole } from "../types/users_type.js";

const router = Router();
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

const CARD_LOGIN_BASE =
    process.env.CARD_LOGIN_URL ?? "https://YOUR-FRONTEND.onrender.com/card-login.html";
const CARD_ROLES: UserRole[] = ["student", "team_leader"];

// Only failed attempts count, so a whole class on one Wi-Fi isn't locked out
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    skipSuccessfulRequests: true,
});

// ADMIN: generate (or regenerate) a card link for a student
router.post(
    "/admin/card-token/:userId",
    authenticate,
    allowRoles("admin"),
    async (req, res, next) => {
        try {
            const userId = Number(req.params.userId);
            if (!Number.isSafeInteger(userId)) throw new HttpError(400, "invalid_user_id");

            const target = await pool.query<{ role: UserRole }>(
                "SELECT role FROM users WHERE user_id = $1 AND is_active = TRUE",
                [userId],
            );
            if (!target.rowCount) throw new HttpError(404, "user_not_found");
            if (!CARD_ROLES.includes(target.rows[0].role)) {
                throw new HttpError(400, "students_only");
            }

            const token = randomBytes(32).toString("base64url");

            const client = await pool.connect();
            try {
                await client.query("BEGIN");
                await client.query("UPDATE card_tokens SET revoked = true WHERE user_id = $1", [userId]);
                await client.query(
                    "INSERT INTO card_tokens (user_id, token_hash) VALUES ($1, $2)",
                    [userId, sha256(token)],
                );
                await client.query("COMMIT");
            } catch (e) {
                await client.query("ROLLBACK");
                throw e;
            } finally {
                client.release();
            }

            // shown only once; can't be recovered later
            res.json({ url: `${CARD_LOGIN_BASE}#t=${token}` });
        } catch (error) {
            next(error);
        }
    },
);

// PUBLIC: card tap login
router.post("/auth/card-login", limiter, async (req, res, next) => {
    try {
        const token = String(req.body?.token ?? "");
        if (token.length < 40 || token.length > 100) throw new HttpError(401, "invalid_card");

        const hash = sha256(token);
        const { rows } = await pool.query<{ user_id: number; role: UserRole }>(
            `SELECT u.user_id, u.role
               FROM card_tokens c
               JOIN users u ON u.user_id = c.user_id
              WHERE c.token_hash = $1
                AND c.revoked = false
                AND u.is_active = TRUE`,
            [hash],
        );
        const user = rows[0];
        if (!user || !CARD_ROLES.includes(user.role)) throw new HttpError(401, "invalid_card");

        await pool.query("UPDATE card_tokens SET last_used_at = now() WHERE token_hash = $1", [hash]);

        res.json({ token: createToken({ userId: user.user_id, role: user.role }) });
    } catch (error) {
        next(error);
    }
});

export default router;