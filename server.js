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

function normalizeInputUrl(input) {
  let value = String(input || "").trim();

  if (!value) {
    return null;
  }

  if (value.startsWith("//")) {
    value = `https:${value}`;
  } else if (!/^[a-z][a-z\d+.-]*:\/\//i.test(value)) {
    value = `https://${value}`;
  }

  try {
    const parsed = new URL(value);
    parsed.hostname = parsed.hostname.toLowerCase();
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

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

  const normalizedUrl = normalizeInputUrl(url);
  if (!normalizedUrl) {
    return res.status(400).json({ error: "Invalid ?url parameter" });
  }

  const crawlerPath = path.join(PROJECT_ROOT, "crawler", "crawler.py");
  const crawlTimeout = process.env.CRAWL_TIMEOUT || "5";

  const py = spawn(
    PYTHON_CMD,
    [
      crawlerPath,
      normalizedUrl,
      "--max-pages",
      process.env.MAX_PAGES || "20",
      "--max-depth",
      process.env.MAX_DEPTH || "2",
      "--concurrency",
      process.env.CONCURRENCY || "15",
      "--timeout",
      crawlTimeout
    ],
    { cwd: PROJECT_ROOT }
  );
  
  // Server-side timeout to kill crawler if it hangs
  const serverTimeout = setTimeout(() => {
    console.error("Crawler process exceeded server timeout, killing...");
    py.kill("SIGTERM");
  }, (parseFloat(crawlTimeout) + 3) * 1000);  // Extra 3s grace period

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
    clearTimeout(serverTimeout);
    
    // Even if exit code is non-zero, try to parse partial results
    try {
      const json = JSON.parse(out);
      // Return whatever we got, even if timed out
      if ((json?.crawl_info?.pages_crawled ?? 0) > 0) {
        return res.json(json);
      }
      if ((json?.crawl_info?.fetched_pages ?? 0) === 0) {
        return res.status(502).json({
          error: "Crawler could not fetch any HTML pages",
          detail: "The target site may block crawlers, require JavaScript rendering, or be temporarily unreachable."
        });
      }
      return res.json(json);
    } catch (e) {
      if (code !== 0) {
        console.error("Crawler error:", err);
        return res.status(500).json({
          error: "Crawler failed",
          detail: err || "Process exited with code " + code
        });
      }
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
