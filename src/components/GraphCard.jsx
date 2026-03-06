import React, { useEffect, useCallback, useRef, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";
import CrawlerControls from "./CrawlerControls";

function GraphCard({
  graphData,
  graphRef,
  hoverNode,
  setHoverNode,
  selectedNode,
  setSelectedNode,
  isNodeHighlighted,
  isLinkHighlighted,
  getNodeBaseColor,
  siteUrl,
  setSiteUrl,
  loading,
  crawlError,
  onCrawl
}) {
  const lastFitKey = useRef(null);
  const wrapperRef = useRef(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });

  // Treat URL-like IDs and bare domains/subdomains as interactive website nodes.
  const isWebsiteNode = useCallback((node) => {
    const value = typeof node?.id === "string" ? node.id.trim() : "";
    if (!value) return false;

    try {
      const parsed = new URL(value);
      return !!parsed.hostname;
    } catch {
      return /^(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/.*)?$/i.test(value);
    }
  }, []);

  // Manual hit detection - find node at wrapper-relative coordinates
  const getNodeAtCoords = useCallback((x, y) => {
    const fg = graphRef.current;
    if (!fg || !graphData?.nodes?.length) return null;

    // Convert wrapper-local coordinates to graph coordinates
    const graphCoords = fg.screen2GraphCoords(x, y);
    if (!graphCoords || !Number.isFinite(graphCoords.x) || !Number.isFinite(graphCoords.y)) {
      return null;
    }

    const { x: gx, y: gy } = graphCoords;
    const zoom = fg.zoom?.() || 1;

    // Find closest node within a URL-aware hit radius.
    let closest = null;
    let closestDist = Infinity;

    for (const node of graphData.nodes) {
      if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) continue;
      const websiteNode = isWebsiteNode(node);

      const dx = node.x - gx;
      const dy = node.y - gy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Keep website/subdomain nodes extra easy to hit.
      const baseRadius = websiteNode ? 34 : 25;
      const hitRadius = baseRadius / Math.max(zoom, 0.3);

      if (dist < hitRadius && dist < closestDist) {
        closestDist = dist;
        closest = node;
      }
    }

    return closest;
  }, [graphData, graphRef, isWebsiteNode]);

  const getLocalPointerCoords = useCallback((e) => {
    const wrapperEl = wrapperRef.current;
    if (!wrapperEl) return null;
    const rect = wrapperEl.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }, []);

  // Mouse move handler for hover
  const handleMouseMove = useCallback((e) => {
    const coords = getLocalPointerCoords(e);
    if (!coords) return;

    const node = getNodeAtCoords(coords.x, coords.y);
    const newId = node?.id ?? null;
    const currentId = hoverNode?.id ?? null;
    if (newId !== currentId) {
      setHoverNode(node);
    }
  }, [getLocalPointerCoords, getNodeAtCoords, hoverNode, setHoverNode]);

  // Click handler
  const handleClick = useCallback((e) => {
    // Ignore clicks on the button
    if (e.target.tagName === 'BUTTON') return;

    const coords = getLocalPointerCoords(e);
    if (!coords) return;

    const node = getNodeAtCoords(coords.x, coords.y);
    
    if (node) {
      // CMD/CTRL + click opens link
      if (e.metaKey || e.ctrlKey) {
        if (node.id && typeof node.id === "string") {
          window.open(node.id, "_blank", "noopener,noreferrer");
        }
        return;
      }
      
      // Normal click selects node
      setSelectedNode(node);
      setHoverNode(null);
      
      const fg = graphRef.current;
      if (fg && Number.isFinite(node.x) && Number.isFinite(node.y)) {
        const currentZoom = fg.zoom?.() || 1;
        fg.centerAt(node.x, node.y, 400);
        fg.zoom(currentZoom * 1.5, 400);
      }
    } else {
      // Click on background deselects
      setSelectedNode(null);
      setHoverNode(null);
    }
  }, [getLocalPointerCoords, getNodeAtCoords, setSelectedNode, setHoverNode, graphRef]);

  useEffect(() => {
    if (graphRef.current) {
      const fg = graphRef.current;
      fg.d3Force("charge").strength(-800);
    }
  }, [graphData, graphRef]);

  useEffect(() => {
    if (!wrapperRef.current) return;
    const measure = () => {
      const rect = wrapperRef.current.getBoundingClientRect();
      setDims({ w: rect.width, h: rect.height });
    };

    measure();

    let observer;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(measure);
      observer.observe(wrapperRef.current);
    } else {
      window.addEventListener("resize", measure);
    }

    return () => {
      if (observer) observer.disconnect();
      else window.removeEventListener("resize", measure);
    };
  }, []);

  useEffect(() => {
    if (!graphRef.current || !graphData?.nodes?.length || dims.w <= 0 || dims.h <= 0) {
      return;
    }

    const key = `${graphData.nodes.length}-${graphData.links?.length || 0}-${dims.w}x${dims.h}-${loading ? "L" : "D"}`;
    if (lastFitKey.current === key) return;
    lastFitKey.current = key;

    const pad = loading
      ? Math.max(80, Math.min(dims.w, dims.h) * 0.3 || 160)
      : Math.max(100, Math.min(dims.w, dims.h) * 0.2 || 140);

    requestAnimationFrame(() => {
      if (graphRef.current) {
        graphRef.current.zoomToFit(700, pad);
      }
    });
  }, [graphData, graphRef, dims, loading]);

  const handleAutoFit = useCallback(() => {
    if (!graphRef.current || !graphData?.nodes?.length || dims.w <= 0 || dims.h <= 0) return;
    const pad = Math.max(80, Math.min(dims.w, dims.h) * 0.14 || 110);
    graphRef.current.zoomToFit(700, pad);
  }, [graphData, dims, graphRef]);

  const getNodeValue = useCallback(
    (node) => {
      const base = loading
        ? 1.5 + (node.pagerank || 0) * 50
        : 4 + (node.pagerank || 0) * 160;
      const isHovered = hoverNode && hoverNode.id === node.id;
      return isHovered ? base * 1.2 : base;
    },
    [hoverNode, loading]
  );

  return (
    <section className="card graph-card">
      <CrawlerControls
        siteUrl={siteUrl}
        setSiteUrl={setSiteUrl}
        loading={loading}
        error={crawlError}
        onCrawl={onCrawl}
      />

      <div 
        ref={wrapperRef} 
        className="graph-wrapper" 
        style={{ cursor: hoverNode ? "pointer" : "default" }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverNode(null)}
        onClick={handleClick}
      >
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); handleAutoFit(); }}
          style={{
            position: "absolute",
            right: 12,
            bottom: 12,
            zIndex: 5,
            border: "1px solid rgba(148,181,233,0.7)",
            background: "rgba(6,14,26,0.9)",
            color: "#E8EEF9",
            borderRadius: 10,
            padding: "0.35rem 0.65rem",
            fontSize: "0.8rem",
            cursor: "pointer",
            boxShadow: "0 10px 18px rgba(2,10,24,0.6)",
            backdropFilter: "blur(4px)"
          }}
        >
          Auto-fit
        </button>

        <ForceGraph2D
          ref={graphRef}
          backgroundColor="#050827"
          graphData={graphData}
          width={dims.w > 0 ? dims.w : undefined}
          height={dims.h > 0 ? dims.h : undefined}
          linkDistance={150}
          cooldownTicks={120}
          nodeRelSize={loading ? 4 : 5}
          nodeVal={getNodeValue}
          // Disable library's pointer interaction - we handle it manually
          enablePointerInteraction={false}
          nodeColor={(node) => {
            const base = getNodeBaseColor(node);

            if (loading && !hoverNode && !selectedNode) {
              return base.replace("rgb", "rgba").replace(")", ",0.8)");
            }

            if (!hoverNode && !selectedNode) return base;
            if (isNodeHighlighted(node)) return base;
            return "rgba(148,163,184,0.1)";
          }}
          linkColor={(link) => {
            const highlighted = isLinkHighlighted(link);

            if (!hoverNode && !selectedNode) {
              return "rgba(148,163,184,0.22)";
            }

            return highlighted ? "rgba(255,203,5,0.8)" : "rgba(148,163,184,0.12)";
          }}
          linkWidth={(link) => (isLinkHighlighted(link) ? 2 : 1)}
          linkDirectionalParticles={2}
          linkDirectionalParticleWidth={(link) => (isLinkHighlighted(link) ? 2.5 : 0)}
          initialZoom={0.6}
        />
      </div>
    </section>
  );
}

export default GraphCard;
