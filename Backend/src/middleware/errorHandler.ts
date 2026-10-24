import type { ErrorRequestHandler } from "express";

export class HttpError extends Error {
    constructor(
        public readonly status: number,
        public readonly code: string,
        message = code,
    ) {
        super(message);
    }
}

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof HttpError) {
        res.status(error.status).json({ ok: false, error: error.code, message: error.message });
        return;
    }

    const pgError = typeof error === "object" && error !== null
        ? error as { code?: string }
        : {};
    if (error instanceof SyntaxError && "body" in error) {
        res.status(400).json({ ok: false, error: "invalid_json" });
        return;
    }
    if (pgError.code === "23505") {
        res.status(409).json({ ok: false, error: "already_exists" });
        return;
    }
    if (
        pgError.code === "23503" ||
        pgError.code === "23514" ||
        pgError.code?.startsWith("22")
    ) {
        res.status(400).json({ ok: false, error: "invalid_reference_or_value" });
        return;
    }

    console.error("Unhandled API error:", error);
    res.status(500).json({ ok: false, error: "server_error" });
};
