#!/usr/bin/env python3
import asyncio
import aiohttp
import logging
import json
import os
import time
import argparse
from collections import deque
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from urllib.parse import urljoin, urlparse, urlunparse
from typing import Optional

from bs4 import BeautifulSoup

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("crawler")

DEFAULT_MAX_PAGES = int(os.environ.get("MAX_PAGES", 30))
DEFAULT_MAX_DEPTH = int(os.environ.get("MAX_DEPTH", 2))
DEFAULT_DELAY = float(os.environ.get("CRAWL_DELAY", 0.0))
DEFAULT_CONCURRENCY = int(os.environ.get("CONCURRENCY", 12))
DEFAULT_RETRIES = int(os.environ.get("MAX_RETRIES", 3))
DEFAULT_REQUEST_TIMEOUT = float(os.environ.get("REQUEST_TIMEOUT", 15.0))

SKIP_PREFIXES = ("mailto:", "tel:", "javascript:", "#", "data:")
SKIP_EXTENSIONS = (
    ".pdf", ".jpg", ".png", ".jpeg", ".svg", ".gif", ".zip",
    ".doc", ".docx", ".xlsx", ".xls", ".pptx", ".ppt", ".ics",
    ".mp3", ".mp4", ".avi", ".mov", ".wmv", ".css", ".js"
)

def normalize_url(url: str) -> str:
    parsed = urlparse(url)
    scheme = parsed.scheme.lower() or "https"
    netloc = parsed.netloc.lower()
    path = parsed.path.rstrip("/") or "/"
    return urlunparse((scheme, netloc, path, "", "", ""))

def is_same_domain(url: str, domain: str) -> bool:
    if not url:
        return False
    parsed = urlparse(url)
    url_domain = parsed.netloc.lower().replace("www.", "")
    target_domain = domain.lower().replace("www.", "")
    if not url_domain or not target_domain:
        return False

    # Allow subdomains of the target (e.g., *.tum.de) so linked sub-sites are reachable.
    return url_domain == target_domain or url_domain.endswith("." + target_domain)

def is_valid_url(url: str, domain: str) -> bool:
    if not url:
        return False

    for prefix in SKIP_PREFIXES:
        if url.startswith(prefix):
            return False

    lower = url.lower()
    for ext in SKIP_EXTENSIONS:
        if lower.endswith(ext):
            return False

    return is_same_domain(url, domain)

def fallback_title_from_url(url: str) -> str:
    parsed = urlparse(url)
    path = parsed.path.strip("/")
    if not path:
        return parsed.netloc
    last = path.split("/")[-1]
    return last.replace("-", " ").replace("_", " ").title()

def extract_title_from_html(html: str, url: str) -> str:
    try:
        soup = BeautifulSoup(html, "html.parser")
        title_tag = soup.find("title")
        if title_tag and title_tag.string:
            title = title_tag.string.strip()
            if title:
                return title[:180]
    except Exception:
        pass
    return fallback_title_from_url(url)

async def fetch_page(
    session: aiohttp.ClientSession,
    url: str,
    retries: int = DEFAULT_RETRIES
) -> tuple[Optional[str], str]:
    """
    Fetch a URL and return HTML plus the final URL after redirects.
    Be lenient with content types and retry transient upstream failures.
    """
    for attempt in range(retries):
        try:
            async with session.get(
                url,
                timeout=aiohttp.ClientTimeout(
                    total=DEFAULT_REQUEST_TIMEOUT,
                    connect=min(DEFAULT_REQUEST_TIMEOUT, 5),
                    sock_connect=min(DEFAULT_REQUEST_TIMEOUT, 5),
                    sock_read=DEFAULT_REQUEST_TIMEOUT,
                ),
            ) as resp:
                final_url = normalize_url(str(resp.url))

                if resp.status in {408, 425, 429, 500, 502, 503, 504}:
                    raise aiohttp.ClientResponseError(
                        resp.request_info,
                        resp.history,
                        status=resp.status,
                        message=f"Retryable status {resp.status}",
                        headers=resp.headers,
                    )

                if resp.status >= 400:
                    return None, final_url

                content_type = resp.headers.get("Content-Type", "")
                lower_type = content_type.lower()
                if content_type and "text/html" not in lower_type and "application/xhtml+xml" not in lower_type:
                    return None, final_url

                raw = await resp.read()
                encoding = resp.charset or "utf-8"
                try:
                    return raw.decode(encoding, errors="replace"), final_url
                except LookupError:
                    return raw.decode("utf-8", errors="replace"), final_url
        except Exception:
            if attempt < retries - 1:
                await asyncio.sleep(2 ** attempt)

    return None, normalize_url(url)

def extract_links(html: str, base_url: str, domain: str) -> set:
    soup = BeautifulSoup(html, "html.parser")
    links = set()

    for a in soup.select("a[href]"):
        href = a.get("href") or ""
        if not href:
            continue

        absolute = urljoin(base_url, href)
        normalized = normalize_url(absolute)

        if is_valid_url(normalized, domain):
            links.add(normalized)

    return links

def fetch_page_urllib(
    url: str,
    retries: int = DEFAULT_RETRIES,
) -> tuple[Optional[str], str]:
    for attempt in range(retries):
        try:
            request = Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; TUMSearchCrawler/1.0)"})
            with urlopen(request, timeout=DEFAULT_REQUEST_TIMEOUT) as resp:
                final_url = normalize_url(resp.geturl())
                status_code = getattr(resp, "status", 200)
                content_type = (resp.headers.get("Content-Type") or "").lower()

                if status_code >= 400:
                    return None, final_url

                if content_type and "text/html" not in content_type and "application/xhtml+xml" not in content_type:
                    return None, final_url

                raw = resp.read()
                charset = resp.headers.get_content_charset() or "utf-8"
                try:
                    return raw.decode(charset, errors="replace"), final_url
                except LookupError:
                    return raw.decode("utf-8", errors="replace"), final_url
        except HTTPError as exc:
            final_url = normalize_url(exc.geturl() or url)
            if exc.code in {408, 425, 429, 500, 502, 503, 504} and attempt < retries - 1:
                time.sleep(2 ** attempt)
                continue
            return None, final_url
        except URLError:
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
        except Exception:
            if attempt < retries - 1:
                time.sleep(2 ** attempt)

    return None, normalize_url(url)

def crawl_site_fallback(
    start_url: str,
    max_pages: int = DEFAULT_MAX_PAGES,
    max_depth: int = DEFAULT_MAX_DEPTH,
    keyword_filter: str = "",
    delay: float = DEFAULT_DELAY,
) -> dict:
    start_time = time.time()
    start_url = normalize_url(start_url)
    domain = urlparse(start_url).netloc
    keyword = keyword_filter.lower().strip()

    queue = deque([(start_url, 0)])
    seen = {start_url}
    graph = {}
    titles = {}
    fetched_pages = 0

    while queue and len(graph) < max_pages:
        url, depth = queue.popleft()
        if depth > max_depth or url in graph:
            continue

        if delay:
            time.sleep(delay)

        html, fetched_url = fetch_page_urllib(url)
        current_url = fetched_url or url

        if current_url in graph:
            continue

        if not is_same_domain(current_url, domain):
            titles[url] = fallback_title_from_url(url)
            graph[url] = []
            continue

        if html:
            fetched_pages += 1
            titles[current_url] = extract_title_from_html(html, current_url)
        else:
            titles[current_url] = fallback_title_from_url(current_url)
        graph[current_url] = []

        if not html:
            continue

        links = extract_links(html, current_url, domain)
        graph[current_url] = sorted(links)

        if keyword and (keyword not in html.lower() and keyword not in current_url.lower()):
            continue

        next_depth = depth + 1
        if next_depth > max_depth:
            continue

        for link in links:
            if link in seen or link in graph or len(seen) >= max_pages:
                continue
            seen.add(link)
            queue.append((link, next_depth))

    elapsed = time.time() - start_time

    return {
        "graph": graph,
        "titles": titles,
        "crawl_info": {
            "start_url": start_url,
            "domain": domain,
            "max_pages": max_pages,
            "pages_crawled": len(graph),
            "max_depth": max_depth,
            "keyword_filter": keyword or None,
            "delay": delay,
            "concurrency": 1,
            "mode": "urllib-fallback",
            "fetched_pages": fetched_pages,
            "total_time": round(elapsed, 2),
        },
    }

async def crawl_site(
    start_url: str,
    max_pages: int = DEFAULT_MAX_PAGES,
    max_depth: int = DEFAULT_MAX_DEPTH,
    keyword_filter: str = "",
    delay: float = DEFAULT_DELAY,
    concurrency: int = DEFAULT_CONCURRENCY,
) -> dict:
    start_time = time.time()
    start_url = normalize_url(start_url)
    domain = urlparse(start_url).netloc
    keyword = keyword_filter.lower().strip()

    visited = set()
    seen = {start_url}
    queue: asyncio.Queue = asyncio.Queue()
    queue.put_nowait((start_url, 0))

    graph = {}
    titles = {}
    fetched_pages = 0

    stop_event = asyncio.Event()

    concurrency = max(1, concurrency)

    connector = aiohttp.TCPConnector(
        limit=max(concurrency * 2, 20),
        limit_per_host=max(1, min(concurrency, 6)),
        ttl_dns_cache=300,
    )
    headers = {"User-Agent": "Mozilla/5.0 (compatible; TUMSearchCrawler/1.0)"}

    async with aiohttp.ClientSession(connector=connector, headers=headers) as session:
        async def worker():
            nonlocal fetched_pages
            while True:
                item = await queue.get()
                if item is None:
                    queue.task_done()
                    break

                url, depth = item

                if (
                    stop_event.is_set()
                    or url in visited
                    or depth > max_depth
                    or len(graph) >= max_pages
                ):
                    queue.task_done()
                    continue

                if delay:
                    await asyncio.sleep(delay)

                html, fetched_url = await fetch_page(session, url)
                current_url = fetched_url or url

                if current_url in visited:
                    visited.add(url)
                    queue.task_done()
                    continue

                visited.add(url)
                visited.add(current_url)
                if not is_same_domain(current_url, domain):
                    titles[url] = fallback_title_from_url(url)
                    graph[url] = []
                    queue.task_done()
                    continue

                if len(graph) >= max_pages:
                    stop_event.set()

                if html:
                    fetched_pages += 1
                    titles[current_url] = extract_title_from_html(html, current_url)
                else:
                    titles[current_url] = fallback_title_from_url(current_url)
                graph[current_url] = []

                if html:
                    links = extract_links(html, current_url, domain)
                    graph[current_url] = sorted(links)

                    # If keyword filtering is enabled, still record links, but only follow matches.
                    if keyword and (keyword not in html.lower() and keyword not in current_url.lower()):
                        queue.task_done()
                        continue

                    next_depth = depth + 1
                    if next_depth <= max_depth:
                        for link in links:
                            if link in visited or link in seen or len(graph) + queue.qsize() >= max_pages:
                                continue
                            seen.add(link)
                            queue.put_nowait((link, next_depth))

                queue.task_done()

        workers = [asyncio.create_task(worker()) for _ in range(concurrency)]
        await queue.join()
        for _ in workers:
            queue.put_nowait(None)
        await asyncio.gather(*workers, return_exceptions=True)

    elapsed = time.time() - start_time

    return {
        "graph": graph,
        "titles": titles,
        "crawl_info": {
            "start_url": start_url,
            "domain": domain,
            "max_pages": max_pages,
            "pages_crawled": len(graph),
            "max_depth": max_depth,
            "keyword_filter": keyword or None,
            "delay": delay,
            "concurrency": concurrency,
            "mode": "aiohttp",
            "fetched_pages": fetched_pages,
            "total_time": round(elapsed, 2),
        },
    }

def parse_args():
    parser = argparse.ArgumentParser(description="Async site crawler")
    parser.add_argument("start_url")
    parser.add_argument("--max-pages", type=int, default=DEFAULT_MAX_PAGES)
    parser.add_argument("--max-depth", type=int, default=DEFAULT_MAX_DEPTH)
    parser.add_argument("--keyword", type=str, default="")
    parser.add_argument("--delay", type=float, default=DEFAULT_DELAY)
    parser.add_argument("--concurrency", type=int, default=DEFAULT_CONCURRENCY)
    return parser.parse_args()

async def main_async(args):
    try:
        result = await crawl_site(
            start_url=args.start_url,
            max_pages=args.max_pages,
            max_depth=args.max_depth,
            keyword_filter=args.keyword,
            delay=args.delay,
            concurrency=args.concurrency,
        )
    except Exception:
        logger.exception("Async crawl crashed, falling back to requests crawler")
        result = crawl_site_fallback(
            start_url=args.start_url,
            max_pages=args.max_pages,
            max_depth=args.max_depth,
            keyword_filter=args.keyword,
            delay=args.delay,
        )
    else:
        if result["crawl_info"].get("fetched_pages", 0) == 0:
            logger.warning("Async crawl fetched no HTML pages, falling back to requests crawler")
            result = crawl_site_fallback(
                start_url=args.start_url,
                max_pages=args.max_pages,
                max_depth=args.max_depth,
                keyword_filter=args.keyword,
                delay=args.delay,
            )
    print(json.dumps(result))

def main():
    args = parse_args()
    asyncio.run(main_async(args))

if __name__ == "__main__":
    main()
