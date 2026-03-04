import React from "react";

function CrawlerControls({
  siteUrl,
  setSiteUrl,
  loading,
  error,
  onCrawl
}) {
  return (
    <div
      style={{
        marginBottom: "0.9rem",
        display: "flex",
        alignItems: "center",
        gap: "0.6rem",
        padding: "0.65rem 0.8rem",
        borderRadius: "0.9rem",
        background: "#050827",
        border: "1px solid rgba(32, 51, 81, 0.7)"
      }}
    >
      <span
        style={{
          fontSize: "0.82rem",
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          color: "#A8B3C4"
        }}
      >
        Website to crawl
      </span>
      <input
        type="text"
        inputMode="url"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        value={siteUrl}
        onChange={(e) => setSiteUrl(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !loading) {
            e.preventDefault();
            onCrawl();
          }
        }}
        placeholder="tum.de or https://www.tum.de"
        style={{
          flex: 1,
          maxWidth: 420,
          padding: "0.45rem 0.75rem",
          borderRadius: 10,
          border: "1px solid rgba(80, 110, 150, 0.6)",
          background: "#050827",
          color: "#F9FAFB",
          fontSize: "0.82rem",
          boxShadow: "0 0 0 1px rgba(10,25,45,0.35) inset"
        }}
      />
      <button
        type="button"
        onClick={onCrawl}
        disabled={loading}
        style={{
          padding: "0.42rem 0.95rem",
          borderRadius: 999,
          border: "none",
          background: "#FFCB05",
          color: "#02101F",
          fontSize: "0.82rem",
          fontWeight: 600,
          cursor: loading ? "default" : "pointer",
          opacity: loading ? 0.6 : 1
        }}
      >
        {loading ? "Crawling..." : "Crawl"}
      </button>
      {error && (
        <span
          style={{
            marginLeft: "0.4rem",
            fontSize: "0.78rem",
            color: "#FCA5A5"
          }}
        >
          {error}
        </span>
      )}
    </div>
  );
}

export default CrawlerControls;
