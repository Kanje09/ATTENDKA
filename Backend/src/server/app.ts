import express from "express";
import pool from "../config/db.js";

const app = express();

app.get("/", (req, res) => {
    try {
        res.send("Backend is running!");
    } catch (err) {
        res.status(404);
    };
});

app.get("/Database",async (req, res) => {
    try {
    await pool.query("SELECT NOW()");
        res.send("Database Connected.")
    } catch (err) {
        res.status(500).json("Database not connected.");
    }
})
export default app;