import app from "./app.js";
import pool from "../config/db.js";

const PORT = Number(process.env.PORT || "5000");

const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`ATTENDKA API listening on port ${PORT}`);
});

const shutdown = () => {
    server.close(() => {
        void pool.end().then(() => {
            console.log("HTTP server closed.");
        }).catch((error: unknown) => {
            console.error("Failed to close PostgreSQL pool:", error);
            process.exitCode = 1;

        });
    });};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
