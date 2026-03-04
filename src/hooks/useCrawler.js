// src/hooks/useCrawler.js
import { useState, useCallback } from "react";

const API_BASE = "http://localhost:5001";

// --------------------------
// URL NORMALIZER
// --------------------------
function normalizeUrl(input) {
  let url = (input || "").trim();

  // Add protocol if missing but otherwise leave host/path intact so non-TUM
  // sites are not rewritten into 404s.
  if (!/^https?:\/\//i.test(url)) {
    url = "https://" + url;
  }

  try {
    return new URL(url).toString();
  } catch {
    return null; // invalid URL
  }
}

// --------------------------
// CHECK IF SITE IS REACHABLE
// --------------------------
async function checkReachable(url) {
  return true; // Browser can't check. Let the backend validate.
}


function useCrawler(initialUrl = "https://www.cit.tum.de") {
  const [siteUrl, setSiteUrl] = useState(initialUrl);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [crawlResult, setCrawlResult] = useState(null);

  const runCrawl = useCallback(async () => {
    const normalized = normalizeUrl(siteUrl);

    if (!normalized) {
      setError("Invalid URL format.");
      return;
    }

    setLoading(true);
    setError("");
    setCrawlResult(null);

    // -----------------------
    // REACHABILITY CHECK
    // -----------------------
    const ok = await checkReachable(normalized);

    if (!ok) {
      setLoading(false);
      setError("Site is unreachable or not an HTML page.");
      return;
    }

    let lastError = "";

    try {
      for (let attempt = 1; attempt <= 5; attempt++) {
        try {
          const resp = await fetch(
            `${API_BASE}/api/crawl?url=${encodeURIComponent(normalized)}`
          );

          if (!resp.ok) {
            let msg = `Crawler failed with status ${resp.status}`;
            try {
              const body = await resp.json();
              if (body?.error && body?.detail) {
                msg = `${body.error}: ${body.detail}`;
              } else if (body?.error) {
                msg = body.error;
              }
            } catch {}
            throw new Error(msg);
          }

          const json = await resp.json();
          setCrawlResult(json);
          lastError = "";
          break;
        } catch (e) {
          lastError = e.message || "Something went wrong while crawling.";
          if (attempt === 5) {
            throw e;
          }
          // brief backoff
          await new Promise((res) => setTimeout(res, 400));
        }
      }
    } catch (e) {
      console.error("Crawler request error:", e);
      setError(
        lastError ||
          e.message ||
          "Something went wrong while crawling."
      );
    } finally {
      setLoading(false);
    }
  }, [siteUrl]);

  return {
    siteUrl,
    setSiteUrl,
    loading,
    error,
    crawlResult,
    runCrawl
  };
}

export default useCrawler;
