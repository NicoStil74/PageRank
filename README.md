# TUMSearch – PageRank Explorer
### *Hackathon Project by Team Bandersnatchers*

TUMSearch is an interactive web application that crawls a website, constructs its internal link graph, computes PageRank across all discovered pages, and visualizes the network with an interactive force-directed graph. It was built during the TUM Hackathon by **Team Bandersnatchers**.

---

## ⭐ Features
### 🔍 Website Crawler
- Crawls the `cit.tum.de` domain (subdomains allowed) with polite delays
   - user can also crawl any other website, but some will block the crawl / not work 
- Extracts internal hyperlinks and detects page titles
- Filters non-HTML assets (PDFs, images, binaries, etc.)

### 📊 PageRank Computation
- Builds a directed hyperlink graph
- Computes PageRank scores server-side (Python) and returns node scores to the UI

### 🎨 Interactive Visualization
- Hover to preview; click to explore incoming/outgoing links
- Smooth force-directed layout powered by `react-force-graph-2d`

### 🧭 Keyword Search
- Search discovered pages by title or URL
- Jump directly to nodes in the visualization

---

## 🧱 Tech Stack
- **Frontend:** React, `react-force-graph-2d`, custom CSS
- **Backend:** Node.js, Express; spawns the Python crawler
- **Crawler:** Python 3, `requests`, `beautifulsoup4`

### Architecture (high level)
- **Frontend** (`src/`): React app with graph view, keyword search, and link neighborhood panel. It consumes PageRank-scored nodes/links directly from the backend response.
- **Backend** (`server.js`): Express API on port `5001` exposing `/api/crawl`, which shells out to the Python crawler in `src/search.py`.
- **Crawler** (`src/search.py`): Domain-scoped crawler for `cit.tum.de` that returns titles, adjacency, PageRank, and a force-graph-friendly `nodes`/`links` payload. A standalone PageRank helper exists at `crawler/pagerank_calc.py`.

---

## 📁 Project Structure
```
project/
├── server.js              # Node backend API
├── crawler/
│   └── pagerank_calc.py   # Standalone PageRank helper (optional/offline)
├── src/
│   ├── search.py          # Python crawler (cit.tum.de), emits nodes/links with PageRank
│   ├── components/        # Sidebar, GraphCard, Controls, Neighborhood
│   ├── hooks/
│   ├── App.js / App.css
│   └── graphUtils.js      # Legacy helpers (not used for PageRank in the UI)
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
pip install requests beautifulsoup4
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
2. Enter a URL in the `cit.tum.de` domain (e.g., `https://www.cit.tum.de`) and click **Crawl**.
3. After crawling:
   - Graph appears in the center.
   - Sidebar shows top PageRank pages.
   - Right panel shows incoming/outgoing links.

**Interactions:** drag to move, scroll to zoom, hover for PageRank/title, click to view link neighborhood.

---

## 🔌 API Quick Reference
`GET http://localhost:5001/api/crawl?url=https://www.cit.tum.de`

Example response:
```json
{
  "graph": { "https://www.cit.tum.de": ["https://www.cit.tum.de/page"] },
  "titles": { "https://www.cit.tum.de": "Department of Computer Science" },
  "nodes": [
    {
      "id": "https://www.cit.tum.de",
      "title": "Department of Computer Science",
      "pagerank": 0.12
    }
  ],
  "links": [
    { "source": "https://www.cit.tum.de", "target": "https://www.cit.tum.de/page" }
  ],
  "crawl_info": {
    "start_url": "https://www.cit.tum.de",
    "domain": "www.cit.tum.de",
    "max_pages": 30,
    "pages_crawled": 12,
    "delay": 0.0,
    "total_time": 2.4
  }
}
```
Defaults (max pages, delay) live in `src/search.py`.

---

## 🕷️ Python Crawler Overview
- Normalizes URLs and accepts subdomains (`*.tum.de`)
- Ignores PDFs, images, videos, etc.; checks HTML via `Content-Type`
- Handles redirects/bot-detection pages gracefully
- Uses concurrent workers for speed
- Returns JSON with `graph`, `titles`, and `crawl_info`

Manual test:
```bash
python3 src/search.py https://www.cit.tum.de --max-pages 30 --delay 0.2
```
Standalone PageRank helper:
```bash
python3 crawler/pagerank_calc.py input_graph.json output_pr.json
```

---

## 🛠️ Troubleshooting
- **Crawler failed to start:** Set `PYTHON` to your interpreter (`export PYTHON=python` on mac/Linux, `set PYTHON=python` on Windows).
- **Graph is empty:** Backend not running, invalid URL, or domain blocks bots.
- **Windows SSL issues:** Try `pip install certifi` or test another site.

---

## 📜 License
MIT License.

---

## 👥 Team
**Bandersnatchers** — TUM Hackathon Project
