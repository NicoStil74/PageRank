// server.js
const express = require("express");
const cors = require("cors");
const { spawn } = require("child_process");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

const PROJECT_ROOT = __dirname;
const PYTHON_CMD = process.env.PYTHON || path.join(__dirname, "venv", "bin", "python3");

// ✅ Health check route
app.get("/api/ping", (req, res) => {
  res.json({ ok: true, message: "backend alive" });
});

// GET /api/crawl?url=https://www.tum.de
app.get("/api/crawl", (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: "Missing ?url parameter" });
  }

  const crawlerPath = path.join(PROJECT_ROOT, "crawler", "crawler.py");

  const py = spawn(
    PYTHON_CMD,
    [
      crawlerPath,
      url,
      "--max-pages",
      process.env.MAX_PAGES || "30",
      "--max-depth",
      process.env.MAX_DEPTH || "2",
      "--concurrency",
      process.env.CONCURRENCY || "12"
    ],
    { cwd: PROJECT_ROOT }
  );

  let out = "";
  let err = "";

  py.stdout.on("data", (chunk) => {
    out += chunk.toString();
  });

  py.stderr.on("data", (chunk) => {
    err += chunk.toString();
  });

  py.on("error", (spawnErr) => {
    console.error("Failed to start crawler process", spawnErr);
    return res.status(500).json({
      error: "Crawler failed to start",
      detail: spawnErr.message
    });
  });

  py.on("close", (code) => {
    if (code !== 0) {
      console.error("Crawler error:", err);
      return res.status(500).json({
        error: "Crawler failed",
        detail: err
      });
    }

    try {
      const json = JSON.parse(out);
      return res.json(json);
    } catch (e) {
      console.error("Failed to parse crawler JSON:", e);
      console.error("Raw output:", out.slice(0, 500));
      return res.status(500).json({ error: "Invalid JSON from crawler" });
    }
  });
});

const PORT = 5001;
app.listen(PORT, () => {
  console.log(`Crawler backend running at http://localhost:${PORT}`);
});
