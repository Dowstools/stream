# ⚽ Football Live Streams — Stremio Addon

A Stremio addon that pulls live and upcoming football matches from **streamed.pk**, including Premier League, Champions League, La Liga, Bundesliga, Serie A, and more.

---

## Features

- 🔴 **Live Now** catalog — only matches currently in progress
- 📅 **All Matches** catalog — all football matches (live + upcoming + recent)
- Multiple stream sources and quality options per match
- HD/SD stream labeling and language info
- Team badges as posters

---

## Requirements

- [Node.js](https://nodejs.org/) v14+
- [Stremio](https://www.stremio.com/) desktop app

---

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Start the addon
node index.js
```

The addon will start on **http://127.0.0.1:7000**

---

## Add to Stremio

**Option A — Desktop:**
1. Open Stremio
2. Click the puzzle piece icon (Addons) in the top bar
3. Click **"+ Install addon from URL"**
4. Paste: `http://127.0.0.1:7000/manifest.json`
5. Click Install

**Option B — Browser shortcut:**  
Navigate to: `http://127.0.0.1:7000/manifest.json`  
Stremio should prompt you to install automatically.

---

## Notes

- Streams use `embedUrl` from streamed.pk — playback depends on your Stremio player's ability to handle those URLs.
- If streams don't play directly, you may need a browser-based player since some embed URLs require web context.
- The addon is for **personal, private use only**. Respect streamed.pk's terms of service.

---

## Running on a different port

```bash
PORT=8080 node index.js
```
