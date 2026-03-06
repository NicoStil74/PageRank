# TUMSearch – PageRank Explorer
### *Hackathon Project by Team Bandersnatchers*

TUMSearch is an interactive web application that crawls a website, constructs its internal link graph, computes PageRank across all discovered pages, and visualizes the network with an interactive force-directed graph. It was built during the TUM Hackathon by **Team Bandersnatchers**.

---

## ⭐ Features
### 🔍 Website Crawler
- Crawls the `cit.tum.de` domain (subdomains allowed) with polite delays
- Extracts internal hyperlinks and detects page titles
- Filters non-HTML assets (PDFs, images, binaries, etc.)

### 📊 PageRank Computation
- Builds a directed hyperlink graph
- Computes PageRank scores server-side (Python) and returns node scores to the UI

### 🎨 Interactive Visualization
- Node size/color reflect PageRank score (blue → yellow)
- Hover to preview; click to explore incoming/outgoing links
- Smooth force-directed layout powered by `react-force-graph-2d`

### 🧭 Keyword Search
- Search discovered pages by title or URL
- Jump directly to nodes in the visualization

---

## 🧱 Tech Stack
- **Frontend:** React, `react-force-graph-2d`, custom CSS
- **Backend:** Node.js, Express; spawns the Python crawler
- **Crawler:** Python 3, `aiohttp`, `beautifulsoup4` (with `urllib` fallback)

### Architecture (high level)
- **Frontend** (`src/`): React app with graph view, keyword search, and link neighborhood panel. It consumes `graph` + `titles` from the backend, then builds force-graph `nodes`/`links` in the UI.
- **Backend** (`server.js`): Express API on port `5001` exposing `/api/crawl`, which shells out to the Python crawler in `crawler/crawler.py`.
- **Crawler** (`crawler/crawler.py`): Domain-scoped async crawler (subdomains allowed) that returns adjacency (`graph`), page titles, and crawl metadata. A standalone PageRank helper exists at `crawler/pagerank_calc.py`.

---

## 📁 Project Structure
```
project/
├── server.js              # Node backend API
├── crawler/
│   ├── crawler.py         # Runtime Python crawler used by backend
│   └── pagerank_calc.py   # Standalone PageRank helper (optional/offline)
├── src/
│   ├── search.py          # Legacy/standalone crawler script
│   ├── components/        # Sidebar, GraphCard, Controls, Neighborhood
│   ├── hooks/
│   ├── App.js / App.css
│   └── graphUtils.js      # Graph/PageRank helpers for frontend transformation
├── public/
└── package.json
```

---

## ⚙️ Installation & Setup
### 1) Install Node dependencies
```bash
npm install
```
### 2) Install Python dependencies
```bash
pip install aiohttp beautifulsoup4
```
### 3) Start the backend (uses `PYTHON` env var if set, otherwise `python3`)
```bash
node server.js
```
Backend runs at `http://localhost:5001`.

### 4) Start the frontend
```bash
npm start
```
Frontend runs at `http://localhost:3000`.

Optional: use a virtualenv for Python
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install aiohttp beautifulsoup4
```

---

## 🚀 Using the Application
1. Open `http://localhost:3000`.
2. Enter a website URL (e.g., `https://www.cit.tum.de`) and click **Crawl**.
3. Some websites block bots/crawlers; if so, try another site.
4. After crawling:
   - Graph appears in the center.
   - Sidebar shows top PageRank pages.
   - Right panel shows incoming/outgoing links.

**Interactions:** drag to move, scroll to zoom, hover for PageRank/title, click to view link neighborhood.

---

## 🔌 API Quick Reference
`GET http://localhost:5001/api/crawl?url=https://www.cit.tum.de&timeout=8`

Query params:
- `url` (required): target website URL
- `timeout` (optional): crawl time limit in seconds, clamped to `2..30` by backend
- `max_depth` (fixed by backend default): how many link hops away from the start URL the crawler may follow

Example response:
```json
{
  "graph": { "https://www.cit.tum.de": ["https://www.cit.tum.de/page"] },
  "titles": { "https://www.cit.tum.de": "Department of Computer Science" },
  "crawl_info": {
    "start_url": "https://www.cit.tum.de",
    "domain": "www.cit.tum.de",
    "max_pages": 30,
    "pages_crawled": 12,
    "max_depth": 2,
    "concurrency": 15,
    "mode": "aiohttp",
    "fetched_pages": 10,
    "timed_out": false,
    "delay": 0.0,
    "total_time": 2.4
  }
}
```
Defaults (max pages, depth, concurrency, timeout) live in `crawler/crawler.py` and environment variables.

`max_depth` meaning:
- `0`: only the start page is crawled
- `1`: start page + pages directly linked from it
- `2`: up to two hops from start page (current default)
- Higher depth: broader graph coverage, but more crawl time, more pages/edges, and higher timeout risk

---

## 🕷️ Python Crawler Overview
- Normalizes URLs and accepts same-domain + subdomains (e.g., `*.tum.de` when starting from `tum.de`)
- Ignores PDFs, images, videos, etc.; checks HTML via `Content-Type`
- Handles redirects/bot-detection pages gracefully
- Uses concurrent workers for speed
- Enforces overall crawl timeout and returns JSON with `graph`, `titles`, and `crawl_info`

Depth behavior (`max_depth`):
- The crawler starts at depth `0` on the input URL
- Each followed link increases depth by `1`
- Once a page reaches `max_depth`, it is included in the graph but its outgoing links are not followed further
- Increasing `max_depth` increases coverage and PageRank quality, but can significantly increase crawl duration and timeout probability

Manual test:
```bash
python3 crawler/crawler.py https://www.cit.tum.de --max-pages 30 --max-depth 2 --concurrency 12 --timeout 8
```
Standalone PageRank helper:
```bash
python3 crawler/pagerank_calc.py input_graph.json output_pr.json
```

---

## 🛠️ Troubleshooting
- **Crawler failed to start:** Set `PYTHON` to your interpreter (`export PYTHON=python` on mac/Linux, `set PYTHON=python` on Windows).
- **Graph is empty:** Backend not running, invalid URL, crawl timed out quickly, or domain blocks bots.
- **Windows SSL issues:** Try `pip install certifi` or test another site.

---

## 📜 License
MIT License.

---

## 👥 Team
**Bandersnatchers** — TUM Hackathon Project
