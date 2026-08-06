import express from "express";

const app = express();

app.get("/", (req, res) => {
    try {
        res.send("Backend is running!");
    } catch (err) {
        res.status(404);
    };
});

export default app;