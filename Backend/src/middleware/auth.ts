import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { required } from "../config/index.js";
import pool from "../config/db.js";
import type { UserRole } from "../types/users_type.js";
import { HttpError } from "./errorHandler.js";

export interface AuthUser {
    userId: number;
    role: UserRole;
}

declare global {
    namespace Express {
        interface Request {
            authUser?: AuthUser;
        }
    }
}

function signature(value: string): Buffer {
    const secret = required("JWT_SECRET");
    if (Buffer.byteLength(secret) < 32) {
        throw new Error("JWT_SECRET must contain at least 32 bytes.");
    }
    return createHmac("sha256", secret).update(value).digest();
}

export function createToken(user: AuthUser): string {
    const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 12;
    const payload = Buffer.from(JSON.stringify({ ...user, exp: expiresAt })).toString("base64url");
    const value = `v1.${payload}`;
    return `${value}.${signature(value).toString("base64url")}`;
}

function decodeToken(token: string): AuthUser {
    const [version, payload, suppliedSignature, extra] = token.split(".");
    if (version !== "v1" || !payload || !suppliedSignature || extra) {
        throw new HttpError(401, "invalid_token");
    }

    const value = `${version}.${payload}`;
    const expected = signature(value);
    const actual = Buffer.from(suppliedSignature, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
        throw new HttpError(401, "invalid_token");
    }

    let claims: { userId?: unknown; role?: unknown; exp?: unknown };
    try {
        claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as typeof claims;
    } catch {
        throw new HttpError(401, "invalid_token");
    }

    const roles: UserRole[] = ["student", "teacher", "admin", "team_leader"];
    if (
        !Number.isSafeInteger(claims.userId) ||
        typeof claims.exp !== "number" ||
        claims.exp <= Math.floor(Date.now() / 1000) ||
        !roles.includes(claims.role as UserRole)
    ) {
        throw new HttpError(401, "invalid_or_expired_token");
    }

    return { userId: claims.userId as number, role: claims.role as UserRole };
}

export function authenticate(request: Request, _response: Response, next: NextFunction): void {
    try {
        const authorization = request.header("authorization");
        if (!authorization?.startsWith("Bearer ")) {
            throw new HttpError(401, "authentication_required");
        }
        const tokenUser = decodeToken(authorization.slice(7).trim());
        void pool.query<{ role: UserRole }>(
            "SELECT role FROM users WHERE user_id = $1 AND is_active = TRUE",
            [tokenUser.userId],
        ).then((result) => {
            if (!result.rowCount) {
                next(new HttpError(401, "account_inactive_or_not_found"));
                return;
            }
            request.authUser = { userId: tokenUser.userId, role: result.rows[0].role };
            next();
        }).catch(next);
    } catch (error) {
        next(error);
    }
}

export function allowRoles(...roles: UserRole[]) {
    return (request: Request, _response: Response, next: NextFunction): void => {
        if (!request.authUser) {
            next(new HttpError(401, "authentication_required"));
            return;
        }
        if (!roles.includes(request.authUser.role)) {
            next(new HttpError(403, "forbidden"));
            return;
        }
        next();
    };
}
