import React, { useState, useMemo, useRef, useEffect } from "react";
import "./App.css";
import { buildForceGraphData, demoData } from "./graphUtils";
import Sidebar from "./components/Sidebar";
import useCrawler from "./hooks/useCrawler";
import GraphCard from "./components/GraphCard";
import LinkNeighborhood from "./components/LinkNeighborhood";

// Build a larger synthetic placeholder graph for loading animation
const buildLoadingPlaceholder = (count = 80) => {
    const nodes = [];
    const links = [];
    const n = Math.max(10, count);

    for (let i = 0; i < n; i++) {
        const id = `loading-${i}`;
        nodes.push({ id, title: `Loading ${i + 1}`, pagerank: 0 });

        if (i === 0) continue;

        const parentA = `loading-${Math.floor((i - 1) / 2)}`;
        links.push({ source: parentA, target: id });

        if (i > 2 && i % 3 === 0) {
            const parentB = `loading-${Math.max(0, i - 3)}`;
            links.push({ source: parentB, target: id });
        }

        if (i > 5 && i % 5 === 0) {
            const parentC = `loading-${i - 5}`;
            links.push({ source: parentC, target: id });
        }
    }

    return { nodes, links };
};

function App() {
    const [data, setData] = useState(demoData);

    const [hoverNode, setHoverNode] = useState(null);
    const [selectedNode, setSelectedNode] = useState(null);
    const [displayGraphData, setDisplayGraphData] = useState(demoData);

    const [keyword, setKeyword] = useState("");
    const [keywordResults, setKeywordResults] = useState([]);
    const [searchError, setSearchError] = useState("");

    const graphRef = useRef();

    const friendlyTitle = (id) => {
        if (!id) return "Unknown page";
        try {
            const u = new URL(id);
            const path = (u.pathname && u.pathname !== "/" ? u.pathname : "").replace(/\/$/, "");
            if (path) {
                const last = path.split("/").filter(Boolean).pop();
                if (last) return `${u.hostname} • ${last.replace(/[-_]/g, " ")}`;
            }
            return u.hostname;
        } catch {
            return id;
        }
    };

    // crawler hook
    const {
        siteUrl,
        setSiteUrl,
        loading: loadingCrawl,
        error: crawlError,
        crawlResult,
        runCrawl
    } = useCrawler("https://www.cit.tum.de");

    // when new crawl data arrives, rebuild graph
    useEffect(() => {
        if (!crawlResult) return;

        try {
            const built = buildForceGraphData(crawlResult.graph);

            built.nodes.forEach((n) => {
                if (crawlResult.titles && crawlResult.titles[n.id]) {
                    n.title = crawlResult.titles[n.id];
                } else {
                    n.title = friendlyTitle(n.id);
                }
            });

            built.nodes.forEach((n) => {
                delete n.x;
                delete n.y;
                delete n.vx;
                delete n.vy;
            });

            built.links.forEach((l) => {
                if (typeof l.source === "object") {
                    delete l.source.x;
                    delete l.source.y;
                    delete l.source.vx;
                    delete l.source.vy;
                }
                if (typeof l.target === "object") {
                    delete l.target.x;
                    delete l.target.y;
                    delete l.target.vx;
                    delete l.target.vy;
                }
            });

            built.links = built.links.map((l) => ({
                source: typeof l.source === "object" ? l.source.id : l.source,
                target: typeof l.target === "object" ? l.target.id : l.target
            }));

            setData(built);
        } catch (e) {
            console.error("Error building graph from crawlResult. Using demo graph.", e);
            setData(demoData);
        }
    }, [crawlResult]);

    const {
        graphData,
        neighbors,
        sortedNodes,
        maxPR,
        minPR,
        inDegree,
        outDegree,
        incoming,
        outgoing
    } = useMemo(() => {
        const MAX_EDGES = 3000;

        const renderedLinks = data.links.slice(0, MAX_EDGES);
        const degreeLinks = data.links;

        // Track which nodes appear in links (for degree calculations)
        const linkedNodeIds = new Set();
        renderedLinks.forEach((l) => {
            const src = typeof l.source === "object" ? l.source.id : l.source;
            const tgt = typeof l.target === "object" ? l.target.id : l.target;
            linkedNodeIds.add(src);
            linkedNodeIds.add(tgt);
        });

        // Include ALL nodes from the crawl, not just those with links
        // This ensures orphan pages (no incoming/outgoing links) are still visible and clickable
        const visibleNodes = data.nodes;

        const neighbors = new Map();
        const inDegree = new Map();
        const outDegree = new Map();
        const incoming = new Map();
        const outgoing = new Map();

        let maxPR = -Infinity;
        let minPR = Infinity;

        data.nodes.forEach((n) => {
            neighbors.set(n.id, new Set());
            inDegree.set(n.id, 0);
            outDegree.set(n.id, 0);
            incoming.set(n.id, new Set());
            outgoing.set(n.id, new Set());

            const pr = n.pagerank ?? 0;
            if (pr > maxPR) maxPR = pr;
            if (pr < minPR) minPR = pr;
        });

        degreeLinks.forEach((l) => {
            const src = typeof l.source === "object" ? l.source.id : l.source;
            const tgt = typeof l.target === "object" ? l.target.id : l.target;

            if (!neighbors.has(src) || !neighbors.has(tgt)) return;

            neighbors.get(src).add(tgt);
            neighbors.get(tgt).add(src);

            inDegree.set(tgt, inDegree.get(tgt) + 1);
            outDegree.set(src, outDegree.get(src) + 1);

            incoming.get(tgt).add(src);
            outgoing.get(src).add(tgt);
        });

        if (!isFinite(maxPR)) maxPR = 0.0001;
        if (!isFinite(minPR)) minPR = 0;

        const sortedNodes = [...visibleNodes].sort(
            (a, b) => (b.pagerank ?? 0) - (a.pagerank ?? 0)
        );

        const graphData = {
            nodes: visibleNodes.map((n) => ({ ...n, title: n.title || friendlyTitle(n.id) })),
            links: renderedLinks.map((l) => ({
                source: typeof l.source === "object" ? l.source.id : l.source,
                target: typeof l.target === "object" ? l.target.id : l.target
            }))
        };

        return {
            graphData,
            neighbors,
            sortedNodes,
            maxPR,
            minPR,
            inDegree,
            outDegree,
            incoming,
            outgoing
        };
    }, [data]);

    const focusOnNode = (node) => {
        if (!node || !graphRef.current) return;
        if (typeof node.x !== "number" || typeof node.y !== "number") return;
        graphRef.current.centerAt(node.x, node.y, 600);
        graphRef.current.zoom(4, 600);
    };

    const handleKeywordSearch = (e) => {
        e.preventDefault();
        const q = keyword.trim().toLowerCase();

        if (!q) {
            setKeywordResults([]);
            setSearchError("");
            return;
        }

        const matches = graphData.nodes
            .filter((n) => {
                const title = (n.title || "").toLowerCase();
                const id = (n.id || "").toLowerCase();
                return title.includes(q) || id.includes(q);
            })
            .sort((a, b) => (b.pagerank ?? 0) - (a.pagerank ?? 0));

        if (matches.length === 0) {
            setKeywordResults([]);
            setSearchError(`No pages found for "${keyword}".`);
            return;
        }

        setKeywordResults(matches.slice(0, 20));
        setSearchError("");
    };

    const handleResultClick = (node) => {
        setSelectedNode(node);
        setHoverNode(node);
        focusOnNode(node);
    };

    useEffect(() => {
        const handleKey = () => {
            setSelectedNode(null);
            setHoverNode(null);
        };

        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    }, [setSelectedNode, setHoverNode]);

    // ⭐ UPDATED: highlight logic (persistent selection + hover)
    const isNodeHighlighted = (node) => {
        const target = selectedNode || hoverNode;
        if (!target) return false;
        if (target.id === node.id) return true;

        const neigh = neighbors.get(target.id);
        return neigh?.has(node.id);
    };

    const isLinkHighlighted = (link) => {
        const target = selectedNode || hoverNode;
        if (!target) return false;

        const src = link.source.id ?? link.source;
        const tgt = link.target.id ?? link.target;
        return src === target.id || tgt === target.id;
    };

    const getNodeBaseColor = (node) => {
        const pr = node.pagerank ?? 0;
        if (maxPR === minPR) return "rgb(152,198,234)";

        let t = (pr - minPR) / (maxPR - minPR + 1e-12);
        t = Math.max(0, Math.min(1, t));

        const sky = [152, 198, 234];
        const blue = [0, 101, 189];
        const gold = [255, 203, 5];

        const t2 = Math.pow(t, 0.55);
        const segA = t2 < 0.65;

        const a = segA ? sky : blue;
        const b = segA ? blue : gold;
        const r = segA ? t2 / 0.65 : (t2 - 0.65) / 0.35;

        const mix = (u, v) => Math.round(u * (1 - r) + v * r);
        return `rgb(${mix(a[0], b[0])}, ${mix(a[1], b[1])}, ${mix(a[2], b[2])})`;
    };

    const topNodes = sortedNodes.slice(0, 5);

    const selectedIncoming = selectedNode
        ? Array.from(incoming.get(selectedNode.id) ?? [])
        : [];
    const selectedOutgoing = selectedNode
        ? Array.from(outgoing.get(selectedNode.id) ?? [])
        : [];

    const hasQuery = keyword.trim().length > 0;
    const visibleResults =
        hasQuery && keywordResults.length > 0
            ? keywordResults
            : !hasQuery
            ? sortedNodes.slice(0, 10)
            : [];

    // Simple live animation: while crawling, add nodes progressively (no looping/reset).
    // Once crawl finishes, show the full crawl graph immediately.
    useEffect(() => {
        const getId = (val) =>
            typeof val === "object" && val !== null ? val.id : val;

        let timer = null;
        let active = true;

        if (loadingCrawl) {
            // Use the real crawl target nodes if present; otherwise a larger placeholder
            const placeholder =
                graphData?.nodes?.length > 10 ? graphData : buildLoadingPlaceholder(80);
            const ordered = placeholder.nodes;
            if (!ordered.length) {
                setDisplayGraphData({ nodes: [], links: [] });
                return () => {};
            }

            let idx = 0;
            const step = () => {
                if (!active) return;

                if (idx >= ordered.length) {
                    // reached the end: keep the full placeholder visible
                    setDisplayGraphData((prev) => ({
                        nodes: ordered,
                        links: placeholder.links
                    }));
                    return;
                }

                const nextNode = ordered[idx];
                setDisplayGraphData((prev) => {
                    if (!active) return prev;
                    const nodes = [...prev.nodes, nextNode];
                    const nodeIds = new Set(nodes.map((n) => n.id));
                    const links = placeholder.links.filter((l) => {
                        const src = getId(l.source);
                        const tgt = getId(l.target);
                        return nodeIds.has(src) && nodeIds.has(tgt);
                    });
                    return { nodes, links };
                });

                idx += 1;
                timer = setTimeout(step, 220); // ~4.5 nodes/second
            };

            setDisplayGraphData({ nodes: [], links: [] });
            timer = setTimeout(step, 0);

            return () => {
                active = false;
                if (timer) clearTimeout(timer);
            };
        }

        // Not loading: show full graph data immediately
        setDisplayGraphData(graphData ?? { nodes: [], links: [] });

        return () => {
            active = false;
            if (timer) clearTimeout(timer);
        };
    }, [graphData, loadingCrawl]);

    return (
        <div className="app">
            <Sidebar
                data={graphData}
                keyword={keyword}
                setKeyword={setKeyword}
                hasQuery={hasQuery}
                visibleResults={visibleResults}
                searchError={searchError}
                handleKeywordSearch={handleKeywordSearch}
                handleResultClick={handleResultClick}
                topNodes={topNodes}
            />

            <main className="main">
                <GraphCard
                    graphData={displayGraphData}
                    graphRef={graphRef}
                    hoverNode={hoverNode}
                    setHoverNode={setHoverNode}
                    selectedNode={selectedNode}
                    setSelectedNode={setSelectedNode}
                    focusOnNode={focusOnNode}
                    isNodeHighlighted={isNodeHighlighted}
                    isLinkHighlighted={isLinkHighlighted}
                    getNodeBaseColor={getNodeBaseColor}
                    siteUrl={siteUrl}
                    setSiteUrl={setSiteUrl}
                    loading={loadingCrawl}
                    crawlError={crawlError}
                    onCrawl={runCrawl}
                />

                <LinkNeighborhood
                    selectedNode={selectedNode}
                    inDegree={inDegree}
                    outDegree={outDegree}
                    selectedIncoming={selectedIncoming}
                    selectedOutgoing={selectedOutgoing}
                />
            </main>
        </div>
    );
}

export default App;
