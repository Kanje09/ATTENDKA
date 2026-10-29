import express from "express";
import pool from "../config/db.js";
import authRouter from "../routes/users_route.js";
import attendanceRouter from "../routes/attendance_route.js";
import eventsRouter from "../routes/events_route.js";
import directoryRouter from "../routes/directory_route.js";
import adminRouter from "../routes/admin_route.js";
import { errorHandler } from "../middleware/errorHandler.js";

const app = express();

app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));
app.use((req, res, next) => {
    const origin = req.header("origin");
    const allowedOrigins = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        ...(process.env.FRONTEND_ORIGIN || "").split(","),
    ]
        .map((value) => value.trim());
    if (origin && allowedOrigins.includes(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
        res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Device-Key");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    }
    if (req.method === "OPTIONS") {
        res.sendStatus(204);
        return;
    }
    next();
});

app.get("/", (_req, res) => {
    res.json({ ok: true, service: "ATTENDKA API" });
});

app.get("/health/db", async (_req, res, next) => {
    try {
        await pool.query("SELECT 1");
        res.json({ ok: true, database: "connected" });
    } catch (error) {
        next(error);
    }
});

app.use("/api/auth", authRouter);
app.use("/auth", authRouter);
app.use("/api", attendanceRouter);
app.use("/api", eventsRouter);
app.use("/api", directoryRouter);
app.use("/api/admin", adminRouter);


app.use((_req, res) => {
    res.status(404).json({ ok: false, error: "not_found" });
});

app.use(errorHandler);

export default app;