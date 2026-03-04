#!/usr/bin/env python3
import argparse
import json
import sys
import time
from collections import deque
from urllib import robotparser
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen

from bs4 import BeautifulSoup


def fallback_title(url: str) -> str:
    parsed = urlparse(url)
    path = parsed.path.strip("/")
    if not path:
        return parsed.netloc or url
    last = path.split("/")[-1]
    return last.replace("-", " ").replace("_", " ").title()


def compute_pagerank(graph, damping=0.85, tol=1e-6, max_iter=200):
    nodes = list(graph.keys())
    n = len(nodes)
    if n == 0:
        return {}
    idx = {u: i for i, u in enumerate(nodes)}
    outdeg = [len(graph.get(u, [])) for u in nodes]
    pr = [1.0 / n] * n

    for _ in range(max_iter):
        nxt = [(1 - damping) / n] * n
        for u_idx, u in enumerate(nodes):
            targets = graph.get(u, [])
            if not targets:
                share = damping * pr[u_idx] / n
                for j in range(n):
                    nxt[j] += share
            else:
                share = damping * pr[u_idx] / max(outdeg[u_idx], 1)
                for v in targets:
                    if v not in idx:
                        continue
                    nxt[idx[v]] += share
        delta = sum(abs(nxt[i] - pr[i]) for i in range(n))
        pr = nxt
        if delta < tol:
            break

    return {nodes[i]: pr[i] for i in range(n)}


class Crawler:
    def __init__(self, base_url, delay=1.0, max_pages=30):
        self.base_url = base_url.rstrip("/")
        self.visited = set()
        self.delay = delay
        self.graph = {}
        self.titles = {}
        self.max_pages = max_pages
        self.rp = robotparser.RobotFileParser()
        self.rp.set_url(urljoin(self.base_url, "/robots.txt"))
        try:
            self.rp.read()
        except Exception:
            pass

    def is_valid(self, url):
        parsed = urlparse(url)
        host = parsed.netloc.lower()
        base_host = urlparse(self.base_url).netloc.lower().replace("www.", "")
        if not host.replace("www.", "").endswith(base_host):
            return False
        if hasattr(self, "rp") and not self.rp.can_fetch("*", url):
            return False
        return parsed.scheme in {"http", "https"}

    def fetch(self, url):
        try:
            time.sleep(self.delay)
            request = Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; TUMSearchCrawler/1.0)"})
            with urlopen(request, timeout=10) as resp:
                ctype = (resp.headers.get("Content-Type") or "").lower()
                if ctype and "text/html" not in ctype and "application/xhtml+xml" not in ctype:
                    return None
                raw = resp.read()
                charset = resp.headers.get_content_charset() or "utf-8"
                try:
                    return raw.decode(charset, errors="replace")
                except LookupError:
                    return raw.decode("utf-8", errors="replace")
        except (HTTPError, URLError, TimeoutError, ValueError):
            return None
        except Exception:
            return None

    def parse_links(self, html, current_url):
        try:
            soup = BeautifulSoup(html, "html.parser")
        except Exception:
            return set()
        links = set()
        for a in soup.find_all("a", href=True):
            url = urljoin(current_url, a["href"]).split("#")[0]
            if self.is_valid(url):
                links.add(url.rstrip("/") or url)
        return links

    def extract_title(self, html, url):
        try:
            soup = BeautifulSoup(html, "html.parser")
            t = soup.find("title")
            if t and t.string:
                title = t.string.strip()
                if title:
                    return title[:180]
        except Exception:
            pass
        return fallback_title(url)

    def crawl(self, url=None):
        queue = deque([url or self.base_url])

        while queue and len(self.visited) < self.max_pages:
            current = queue.popleft()
            if current in self.visited or not self.is_valid(current):
                continue

            self.visited.add(current)
            html = self.fetch(current)
            if not html:
                self.titles[current] = fallback_title(current)
                self.graph[current] = []
                continue

            self.titles[current] = self.extract_title(html, current)
            links = self.parse_links(html, current)
            self.graph[current] = sorted(links)

            for link in links:
                if link not in self.visited:
                    queue.append(link)

    def as_graph_payload(self, start_url, elapsed):
        graph = {k: list(v) for k, v in self.graph.items()}
        for targets in list(graph.values()):
            for dst in targets:
                if dst not in graph:
                    graph[dst] = []

        pr = compute_pagerank(graph)
        nodes = []
        for url in graph.keys():
            nodes.append(
                {
                    "id": url,
                    "title": self.titles.get(url, fallback_title(url)),
                    "pagerank": pr.get(url, 0.0),
                }
            )
        links = []
        for src, targets in graph.items():
            for dst in targets:
                links.append({"source": src, "target": dst})

        return {
            "graph": graph,
            "titles": self.titles,
            "pagerank": pr,
            "nodes": nodes,
            "links": links,
            "crawl_info": {
                "start_url": start_url,
                "pages_crawled": len(self.graph),
                "max_pages": self.max_pages,
                "delay": self.delay,
                "domain": urlparse(start_url).netloc,
                "mode": "legacy-urllib",
                "total_time": round(elapsed, 2),
            },
        }


def main():
    parser = argparse.ArgumentParser(description="Simple site crawler with PageRank output")
    parser.add_argument("start_url")
    parser.add_argument("--delay", type=float, default=1.0)
    parser.add_argument("--max-pages", type=int, default=30)
    args = parser.parse_args()

    start = time.time()
    crawler = Crawler(args.start_url, delay=args.delay, max_pages=args.max_pages)
    crawler.crawl()
    elapsed = time.time() - start

    payload = crawler.as_graph_payload(args.start_url, elapsed)
    json.dump(payload, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
