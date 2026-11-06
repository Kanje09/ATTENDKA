import app from "./app.js";
import pool from "../config/db.js";
import { eventTimestampInstantSql } from "../utils/zonedDateRange.js";

const PORT = Number(process.env.PORT || "5000");

const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`ATTENDKA API listening on port ${PORT}`);
});

const closeExpiredAttendance = async () => {
    const eventEnd = await eventTimestampInstantSql(pool, "end_datetime");
    const result = await pool.query(
        `UPDATE events e
         SET attendance_open = FALSE
         WHERE e.attendance_open = TRUE AND ${eventEnd} <= now()`,
    );
    if (result.rowCount) {
        console.info(`Automatically closed attendance for ${result.rowCount} expired event(s).`);
    }
};

const attendanceClosureTimer = setInterval(() => {
    void closeExpiredAttendance().catch((error: unknown) => {
        console.error("Failed to close expired event attendance:", error);
    });
}, 15_000);
attendanceClosureTimer.unref();
void closeExpiredAttendance().catch((error: unknown) => {
    console.error("Failed to close expired event attendance:", error);
});

const shutdown = () => {
    clearInterval(attendanceClosureTimer);
    server.close(() => {
        void pool.end().then(() => {
            console.log("HTTP server closed.");
        }).catch((error: unknown) => {
            console.error("Failed to close PostgreSQL pool:", error);
            process.exitCode = 1;
        });
    });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
