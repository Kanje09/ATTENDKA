import express from "express";

const app = express();

app.get("/", (req, res) => {
    res.send("Backend is working!");
});

export default app;