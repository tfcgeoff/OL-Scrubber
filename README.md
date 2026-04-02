# OL-Scrubber

Electron app for automating Onland.ca web scraping with a REST API for remote control. Browse land registry books, accumulate pages into PDFs, and drive everything from a browser, script, or the built-in secondary display.

## Features

- Embedded webview browsing onland.ca
- AI-style navigation commands (`+5`, `-3`, `50%`, `0`, etc.)
- REST API for remote control from any browser or script (GET or POST)
- PDF page accumulation (save individual pages, auto-combine into single PDF)
- Search automation for LRO/Plan/Concession/Section/Condo/Parcel
- Screenshot capture of book pages via CDP/fetch interception
- Smart page estimation from book description (range/list parsing)
- Book title and description scraped from Onland DOM
- Stateless API — state cleared on every new search
- Business hours enforcement for Onland API

## Installation

```bash
npm install && npm start        # Production mode (no API, no logging)
npm run dev                      # Debug mode (API server on :3001, file logging)
```

## Configuration

| CLI Argument | Description |
|---|---|
| `--dev` | Enable REST API server on port 3001 and file logging (`npm run dev`) |
| `--port=XXXX` | Set REST API port (default: `3001`, requires `--dev`) |
| `--inspect` | Enable CDP debugger for attaching DevTools externally |

---

## REST API Server (requires `--dev`)

The REST API server handles all commands (search, navigation, PDF) and returns screenshots and state. 

| | |
|---|---|
| **Default port** | `3001` |
| **Secondary display UI** | `http://localhost:3001` (browser-based testing frontend) |
| **Health check** | `GET /api/status` |
| **Commands (GET)** | `GET /api?param=value&...` |
| **Commands (POST)** | `POST /api` with JSON body |

Both `GET /api` and `POST /api` accept the same parameters and return the same response format. GET uses URL query parameters; POST uses a JSON body.

There is a secondary website available at localhost:3001 for testing also when starting service with a --dev switch.

---

### Parameters

All parameters are optional, but at least one action parameter must be provided.

```json
{
    "lro": "55",
    "descType": "Plan",
    "descNumber": "608",
    "descType2": "Lot",
    "descNumber2": "5",
    "filter": "Georgian",
    "incAmt": "+5",
    "DL": true,
    "confirm": true,
    "nextBook": true,
    "prevBook": true
}
```

| Parameter | Type | Action |
|---|---|---|
| `lro` | string | LRO number (triggers a search) |
| `descType` | string | Description type: `Concession`, `Plan`, `Section`, `Condo`, `Parcel` |
| `descNumber` | string | Description number (triggers a search with `lro` + `descType`) |
| `descType2` | string | Optional secondary search type: `Lot`, `Parklot`, `Gore`, `Gorelot`, `Broken front` |
| `descNumber2` | string | Optional secondary search number |
| `filter` | string | Optional township filter |
| `incAmt` | string | Navigation command (see below) |
| `DL` | boolean | Download accumulated PDF (returns PDF data in response) |
| `confirm` | boolean | Delete accumulated PDF after confirmed download |
| `nextBook` | boolean | Open next book in search results |
| `prevBook` | boolean | Open previous book in search results |

### Navigation (`incAmt`) Values

| Value | Action |
|---|---|
| `+N` | Advance N pages |
| `-N` | Go back N pages |
| `+N%` | Advance N% of remaining pages |
| `-N%` | Go back N% of remaining pages |
| `N` | Jump directly to page N |
| `0` | Add current page to accumulated PDF (no navigation) |

### Search Requirements

A search requires all three: `lro`, `descType`, and `descNumber`. Optional extras: `descType2`, `descNumber2`, `filter`.

---

### Response Format

All commands return JSON with this structure:

```json
{
    "screenshot": "base64_encoded_png_or_pdf...",
    "state": {
        "lro": "55",
        "descType": "Plan",
        "descNumber": "608",
        "currentPage": 68,
        "totalPages": 262,
        "currentBook": 1,
        "totalBooks": 2,
        "bookTitle": "THUNDER BAY (55), MCINTYRE, Book 7",
        "bookField": "PLAN 606, 608, 624, 625",
        "filter": ""
    }
}
```

| Field | Type | Description |
|---|---|---|
| `screenshot` | string/null | Base64-encoded PNG screenshot or PDF capture. `null` if capture failed or timed out. |
| `state` | object | Current application state snapshot |
| `state.currentPage` | number | Current page being viewed |
| `state.totalPages` | number | Total pages in current book |
| `state.currentBook` | number | Current book number in search results |
| `state.totalBooks` | number | Total books found in search |
| `state.bookTitle` | string/null | Scraped book header (e.g., "THUNDER BAY (55), MCINTYRE, Book 7") |
| `state.bookField` | string/null | Scraped book description (e.g., "PLAN 606, 608, 624, 625") |
| `timeout` | boolean | `true` if the 30-second capture timeout was reached |

### PDF Download Response

When `DL=true` (without `incAmt` or `lro`), the response returns accumulated PDF data:

```json
{
    "success": true,
    "pdf": {
        "base64Data": "JVBERi0...",
        "filename": "LRO55_Plan606.pdf",
        "pageCount": 5,
        "size": 245760
    },
    "state": { ... }
}
```

### PDF Confirm Response

When `confirm=true`, the response returns immediately:

```json
{
    "success": true,
    "message": "PDF deleted after confirmed download"
}
```

---

### Error Responses

| Status | Condition |
|---|---|
| `400` | No action parameter provided |
| `400` | POST body is not a valid JSON object |
| `403` | Onland business hours check failed |
| `503` | Electron main window not available |
| `503` | PDF accumulator not installed |

### Business Hours (EST)

Onland API is only available during these hours:
- Mon–Thu: 4:00 AM – Midnight
- Friday: 4:00 AM – 9:00 PM
- Saturday: 9:00 AM – 6:00 PM
- Sunday: 9:00 AM – 9:00 PM

Search requests outside these hours return `403`.

---

### Health Check

`GET /api/status` returns immediately without waiting for a screenshot:

```json
{
    "connected": true,
    "state": {
        "currentPage": 12,
        "totalPages": 200,
        "currentBook": 3,
        "totalBooks": 8
    }
}
```

---

## Usage Examples

### GET requests (query parameters)

```bash
# Search for Plan 606 in LRO 55
curl "http://localhost:3001/api?lro=55&descType=Plan&descNumber=606"

# Search with filter and secondary description
curl "http://localhost:3001/api?lro=55&descType=Concession&descNumber=12&descType2=Lot&descNumber2=5&filter=Georgian"

# Advance 5 pages
curl "http://localhost:3001/api?incAmt=%2B5"

# Go back 3 pages
curl "http://localhost:3001/api?incAmt=-3"

# Add current page to PDF accumulator
curl "http://localhost:3001/api?incAmt=0"

# Jump to 50% of remaining pages
curl "http://localhost:3001/api?incAmt=50%25"

# Jump directly to page 150
curl "http://localhost:3001/api?incAmt=150"

# Next book / Previous book
curl "http://localhost:3001/api?nextBook=true"
curl "http://localhost:3001/api?prevBook=true"

# Download accumulated PDF
curl "http://localhost:3001/api?DL=true"

# Confirm PDF deletion after download
curl "http://localhost:3001/api?confirm=true"
```

### POST requests (JSON body)

```bash
# Search
curl -X POST http://localhost:3001/api \
  -H "Content-Type: application/json" \
  -d '{"lro":"55","descType":"Plan","descNumber":"606"}'

# Navigate +5 pages
curl -X POST http://localhost:3001/api \
  -H "Content-Type: application/json" \
  -d '{"incAmt":"+5"}'

# Add page to PDF
curl -X POST http://localhost:3001/api \
  -H "Content-Type: application/json" \
  -d '{"incAmt":"0"}'

# Next book
curl -X POST http://localhost:3001/api \
  -H "Content-Type: application/json" \
  -d '{"nextBook":true}'
```

---

## Notes

- Only one command can be processed at a time. Concurrent requests cancel the previous pending request.
- Search commands (`lro` + `descType` + `descNumber`) automatically delete any previously accumulated PDF.
- The screenshot capture has a 30-second timeout. If exceeded, `timeout: true` is set in the response.
- `GET /api/status` returns immediately and does not require any parameters.

Full endpoint documentation, architecture details, and scripts reference: see [SCRIPTS_DOCUMENTATION.md](SCRIPTS_DOCUMENTATION.md).
