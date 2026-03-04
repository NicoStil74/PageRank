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

  const handleNodeHover = useCallback(
    (node) => {
      // Always update hover state to ensure all nodes are responsive
      setHoverNode(node || null);
    },
    [setHoverNode]
  );

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

      <div ref={wrapperRef} className="graph-wrapper" style={{ cursor: hoverNode ? "pointer" : "default" }}>
        <button
          type="button"
          onClick={handleAutoFit}
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
          // CRITICAL: Keep redrawing so hit-detection canvas stays in sync
          autoPauseRedraw={false}
          // Custom hit area - very generous to ensure all nodes are clickable
          nodePointerAreaPaint={(node, color, ctx, globalScale) => {
            // Skip nodes without valid finite positions
            if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) return;
            
            const nodeRelSize = loading ? 4 : 5;
            const baseVal = loading
              ? 1.5 + (node.pagerank || 0) * 50
              : 4 + (node.pagerank || 0) * 160;
            const visualRadius = Math.sqrt(Math.max(0, baseVal)) * nodeRelSize;
            
            // Very generous hit area: at least 18px in screen space, or 2x visual radius
            const scale = Math.max(globalScale || 1, 0.1);
            const minHitRadius = 18 / scale;
            const hitRadius = Math.max(visualRadius * 2, minHitRadius);

            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(node.x, node.y, hitRadius, 0, 2 * Math.PI, false);
            ctx.fill();
          }}
          onNodeHover={handleNodeHover}
          onNodeClick={(node, event) => {
            if (event.metaKey || event.ctrlKey) {
              if (node.id && typeof node.id === "string") {
                window.open(node.id, "_blank", "noopener,noreferrer");
              }
              return;
            }

            setSelectedNode(node);
            setHoverNode(null);
            const fg = graphRef.current;
            if (fg && typeof node.x === "number" && typeof node.y === "number") {
              const currentZoom = typeof fg.zoom === "function" ? fg.zoom() : 1;
              fg.centerAt(node.x, node.y, 400);
              fg.zoom(currentZoom * 1.5, 400);
            }
          }}
          onBackgroundClick={() => {
            setSelectedNode(null);
            setHoverNode(null);
          }}
          nodeLabel={(node) =>
            `${node.title || node.id}\nPageRank: ${
              node.pagerank != null ? Number(node.pagerank).toFixed(4) : "unknown"
            }`
          }
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
