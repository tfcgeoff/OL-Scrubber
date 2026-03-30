# OL-Scrubber

Electron app for automating Onland.ca web scraping with remote control via REST API. Browse land registry books, accumulate pages into PDFs, and control everything from a browser or script.

## Features

- Embedded webview browsing onland.ca
- AI-style navigation commands (`+5`, `-3`, `50%`, `0`, etc.)
- REST API for remote control from any browser or script
- PDF page accumulation (save individual pages, auto-combine into single PDF)
- Search automation for LRO/Plan/Concession/Section/Condo/Parcel
- Screenshot capture of book pages via CDP/fetch interception
- Business hours enforcement for Onland API

## Installation

```bash
npm install && npm start
```

## REST API

The app runs an Express server alongside Electron for remote control.

| | |
|---|---|
| **Default port** | `3001` |
| **Remote control UI** | http://localhost:3001 |
| **Commands** | `GET /api` (query params: `lro`, `descType`, `descNumber`, `incAmt`, `DL`, `nextBook`) |
| **Health check** | `GET /api/status` |

Full endpoint documentation, response formats, and examples: see [SCRIPTS_DOCUMENTATION.md](SCRIPTS_DOCUMENTATION.md).

## Usage

```bash
# Search for Plan 606 in LRO 55
curl "http://localhost:3001/api?lro=55&descType=Plan&descNumber=606"

# Advance 5 pages
curl "http://localhost:3001/api?incAmt=%2B5"

# Add current page to PDF and advance
curl "http://localhost:3001/api?incAmt=0"

# Jump to 50% of remaining pages
curl "http://localhost:3001/api?incAmt=50%25"

# Download accumulated PDF
curl "http://localhost:3001/api?DL=true"
```

## Configuration

| CLI Argument | Description |
|---|---|
| `--port=XXXX` | Set REST API port (default: `3001`) |
| `--dev` | Enable dev mode (`npm run dev`) |
