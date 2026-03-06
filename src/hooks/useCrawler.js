// src/hooks/useCrawler.js
import { useState, useCallback } from "react";

const API_BASE = "http://localhost:5001";
const CRAWL_TIME_LIMIT_SECONDS = 8;
const CLIENT_TIMEOUT_MS = (CRAWL_TIME_LIMIT_SECONDS + 4) * 1000;

// --------------------------
// URL NORMALIZER
// --------------------------
export function normalizeUrl(input) {
  let url = (input || "").trim();

  if (!url) {
    return null;
  }

  if (/^\/\//.test(url)) {
    url = `https:${url}`;
  } else if (!/^[a-z][a-z\d+.-]*:\/\//i.test(url)) {
    url = `https://${url}`;
  }

  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    if (!hostname) {
      return null;
    }

    parsed.hostname = hostname;
    parsed.protocol = parsed.protocol || "https:";
    parsed.hash = "";

    return parsed.toString();
  } catch {
    return null;
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

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);

    try {
      const resp = await fetch(
        `${API_BASE}/api/crawl?url=${encodeURIComponent(normalized)}&timeout=${CRAWL_TIME_LIMIT_SECONDS}`,
        { signal: controller.signal }
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
    } catch (e) {
      console.error("Crawler request error:", e);
      if (e?.name === "AbortError") {
        setError(`Crawl exceeded ${CRAWL_TIME_LIMIT_SECONDS}s limit. Try a smaller site or lower depth.`);
      } else {
        setError(e.message || "Something went wrong while crawling.");
      }
    } finally {
      clearTimeout(timer);
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
