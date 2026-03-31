# Onland Web Data Entry - Scripts Documentation

## REST API Documentation

The OL-Scrubber REST API server (`server.js`) provides HTTP endpoints for remote control of the Electron app. It runs alongside the Electron app and serves a secondary display (remote control) web page.

**Default port:** `3001` (configurable via `--port=XXXX` CLI argument)

### GET /
Serves the secondary display (remote control) HTML page from `src/secondary-display/index.html`. This page provides:
- Search form (LRO, Description Type, Description Number)
- Quick navigation buttons (-10, -1, +1, +10, +25%, 50%, +75%)
- Custom navigation input (e.g., `0`, `+5`, `-3`, `+50%`, `200`)
- "Next Book", "Add Page", and "Download Selected" buttons
- Screenshot/image display area (supports PNG and PDF formats)

### GET /api
Single endpoint for all commands. Uses query parameters to determine the action. The server forwards the command to the Electron renderer, waits for a screenshot response (up to 20 seconds), and returns JSON.

**Query Parameters:**

| Parameter | Required | Description |
|-----------|----------|-------------|
| `lro` | Yes (for search) | Land Registration Office number (e.g., `"55"`, `"80"`) |
| `descType` | Yes (for search) | Primary description type: `"Concession"`, `"Plan"`, `"Section"`, `"Condo"`, `"Parcel"` |
| `descNumber` | Yes (for search) | Primary description number (e.g., `"606"`, `"3"`, `"1000"`) |
| `descType2` | No | Secondary search type for combined searches: `"Lot"`, `"Parklot"`, `"Parcel"`, `"Section"` |
| `descNumber2` | No | Secondary search value (required when descType2 is set) |
| `filter` | No | Township filter (e.g., `"CITY OF FORT WILLIAM"`, `"MCINTYRE"`, `"BLAKE"`) |
| `incAmt` | Yes (for navigation) | Page navigation command (see below) |
| `DL` | Yes (for download) | Set to `"true"` to download accumulated pages |
| `nextBook` | Yes (for book nav) | Set to `"true"` to open the next book in search results |

**`incAmt` values:**
- `+N` (e.g., `+5`) -- advance forward N pages
- `-N` (e.g., `-3`) -- go back N pages
- `N%` or `+N%` (e.g., `50%`, `+25%`) -- jump to N% mark of remaining pages (from current toward end)
- `-N%` (e.g., `-25%`) -- jump back N% of remaining pages (from current toward start)
- `N` (bare number, e.g., `200`) -- go directly to page N
- `0` -- add current page to PDF accumulator and advance to next page

**Response (JSON):**
```json
{
  "screenshot": "base64_encoded_page_image_or_null",
  "state": {
    "lro": "55",
    "descType": "Plan",
    "descNumber": "606",
    "currentBook": 1,
    "totalBooks": 2,
    "currentPage": 15,
    "totalPages": 300,
    "pagesSelected": 5
  },
  "timeout": false
}
```

**Real-World Example Requests:**

These URLs can be typed directly into a browser, used with `curl`, or called from any HTTP client. Note that `+` must be URL-encoded as `%2B` in query strings.

```
# Search for Plan 606 in LRO 55
GET http://localhost:3001/api?lro=55&descType=Plan&descNumber=606

# Search for Parcel 1000 with township filter in LRO 55
GET http://localhost:3001/api?lro=55&descType=Parcel&descNumber=1000&filter=CITY%20OF%20FORT%20WILLIAM

# Search for Section 10 in LRO 55
GET http://localhost:3001/api?lro=55&descType=Section&descNumber=10

# Search for Section 10 with township MCINTYRE in LRO 55
GET http://localhost:3001/api?lro=55&descType=Section&descNumber=10&filter=MCINTYRE

# Combined search: Section 10 + Parcel 10 in LRO 55
GET http://localhost:3001/api?lro=55&descType=Section&descNumber=10&descType2=Parcel&descNumber2=10

# Search for Concession 3 in LRO 55
GET http://localhost:3001/api?lro=55&descType=Concession&descNumber=3

# Search for Concession 3 with township BLAKE in LRO 55
GET http://localhost:3001/api?lro=55&descType=Concession&descNumber=3&filter=BLAKE

# Combined search: Concession 3 + Lot 1 in LRO 55
GET http://localhost:3001/api?lro=55&descType=Concession&descNumber=3&descType2=Lot&descNumber2=1

# Combined search: Concession 3 + Lot 1 with township PAIPOONGE in LRO 55
GET http://localhost:3001/api?lro=55&descType=Concession&descNumber=3&descType2=Lot&descNumber2=1&filter=PAIPOONGE

# Combined search: Concession 1 + Parklot 1 in LRO 80
GET http://localhost:3001/api?lro=80&descType=Concession&descNumber=1&descType2=Parklot&descNumber2=1

# Advance 5 pages forward
GET http://localhost:3001/api?incAmt=%2B5

# Go back 3 pages
GET http://localhost:3001/api?incAmt=-3

# Jump to 50% of remaining pages
GET http://localhost:3001/api?incAmt=50%25

# Go directly to page 200
GET http://localhost:3001/api?incAmt=200

# Add current page to PDF and advance to next
GET http://localhost:3001/api?incAmt=0

# Open next book in search results
GET http://localhost:3001/api?nextBook=true

# Open last book in search results
GET http://localhost:3001/api?lastBook=true

# Download accumulated PDF
GET http://localhost:3001/api?DL=true

# Download accumulated PDF and confirm (delete server copy)
GET http://localhost:3001/api?DL=true&confirm=true
```

### Headless Mode (API-only, no UI)

The app can run headlessly with `--headless` flag. This hides the Electron window but keeps the REST API and webview fully functional. Ideal for automation pipelines.

```bash
# Windows (natively headless)
ol-scrubber.exe --headless --port 3001

# Linux (uses xvfb-run for virtual display if needed)
xvfb-run --auto-servernum npx electron . --headless --port 3001
```

In headless mode:
- The Electron window is created hidden (`show: false`)
- The REST API (`/api`, `/api/status`) works exactly the same
- The webview still loads onland.ca and performs all searches/page navigation
- Screenshots are still captured and returned via the API
- No GUI is shown — all interaction is through HTTP requests

### Smart Page Estimation

When opening a book, the app scrapes the book title for a numeric range (e.g., "PARCEL 952 TO 1029"). If found, it estimates the best starting page based on the target number:

```
estimated_page = round((target - rangeStart) / (rangeEnd - rangeStart) * (totalPages - 1)) + 1
```

This significantly reduces the number of page jumps and OCR inferences compared to the previous blind 50% approach. If no range is found in the book title, it falls back to 50%.

```

**Error responses:**
- `400` -- No action parameter provided
- `403` -- Search requested outside Onland business hours
- `503` -- Main Electron window not available

### Business Hours

Search requests are only accepted during Onland business hours (EST):
- **Monday-Thursday:** 4:00 AM - Midnight
- **Friday:** 4:00 AM - 9:00 PM
- **Saturday:** 9:00 AM - 6:00 PM
- **Sunday:** 9:00 AM - 9:00 PM

Returns `403` with an error message outside business hours. Navigation and download commands are not restricted.

### IPC Flow

1. REST API receives HTTP request
2. Server forwards command to Electron renderer via `mainWindow.webContents.send()`
3. Renderer executes the command (search, navigate, download, etc.)
4. Renderer captures screenshot and calls `window.electronAPI.pushScreenshot()`
5. Preload script bridges to main process via `screenshot:update` IPC
6. Main process resolves the pending promise, HTTP response is sent to client

### State Synchronization

The renderer pushes global state changes to the main process via `window.electronAPI.pushState()`. This ensures the REST API always returns the current application state in responses.

---

## Main Process Files

### main.js
**Purpose**: Electron app bootstrap, window management, and IPC handlers

**Key responsibilities**:
- GPU auto-detection (Linux DRI nodes, Windows hardware GPU, fallback)
- Create BrowserWindow with webview support
- IPC handlers: `state:update`, `screenshot:update`, `search:execute`, `nav:execute`, `next-book:execute`, `page:fetch`, `dialog:openSearchConfig`, download management
- Network filter to intercept Onland page API URLs and capture auth tokens
- Start/stop REST API server (`server.js`)
- Parse `--port=XXXX` CLI argument for REST API port (default 3001)

### preload.js
**Purpose**: Expose safe IPC APIs from main process to renderer

**Exposed APIs** (`window.electronAPI`):
- `captureWebviewScreenshot(webviewId)` -- deprecated, replaced by fetch interceptor
- `loadSearchConfig()` -- open file dialog for JSON search config
- `getDownloadDir()`, `setDownloadDir()`, `getLastDownload()` -- download directory management
- `onDownloadComplete(callback)` -- listen for download completion events
- `pushState(state)` -- sync renderer state to main process
- `pushScreenshot(base64Data)` -- push captured screenshot for REST API response
- `onNavCommand(callback)` -- receive nav commands from REST API
- `onSearchCommand(callback)` -- receive search commands from REST API
- `onNextBookCommand(callback)` -- receive next-book commands from REST API
- `onPageApiUrl(callback)` -- receive intercepted page API URLs from network filter
- `fetchPageImage(pageNumber)` -- direct page image fetch via Onland API (uses captured auth)
- `getLogs(since)`, `clearLogs()` -- log management

### server.js
**Purpose**: Express HTTP server for REST API (see [REST API Documentation](#rest-api-documentation) above)

**Exports**: `startServer(port, win)`, `stopServer()`, `updateState(state)`, `updateScreenshot(base64)`

---

## Renderer Scripts

### scripts/variables.js
**Purpose**: Centralized timing constants, configuration, and global application state

**State keys**: `lro`, `descType`, `descNumber`, `totalBooks`, `currentBook`, `totalPages`, `currentPage`, `pagesSelected`, `pageApiBaseUrl`, `transactionId`

**Functions**:
- `setState(key, value)` -- update state, auto-sync to main process via `electronAPI.pushState()`
- `getState(key)` -- read a state value
- `getAllState()` -- return a copy of the full state object
- `resetState()` -- reset all state keys to null

**Constants**:
- `SCREENSHOT_SPINNER_APPEAR_MAX` (2000ms) -- max wait for screenshot spinner to appear
- `SCREENSHOT_SPINNER_GONE_MAX` (10000ms) -- max wait for spinner to disappear
- `SCREENSHOT_POLL_INTERVAL` (10ms) -- poll interval for spinner checks
- `SCREENSHOT_BUFFER` (500ms) -- extra wait after spinner disappears
- `PAGE_COUNT_MAX_POLLS` (30) -- max poll attempts for page count detection
- `PAGE_COUNT_POLL_INTERVAL` (500ms) -- poll interval for page count
- `SEARCH_FORM_MAX_POLLS` (60) -- max poll attempts for search results
- `SEARCH_FORM_POLL_INTERVAL` (500ms) -- poll interval for search results
- `STATUS_MESSAGE_DURATION` (5000ms) -- auto-clear duration for status messages

---

### scripts/logger.js
**Purpose**: Display log messages in the UI sidebar with file:line source tracking

**Functions**:
- `initLogger(logsElem, clearBtn)` -- initialize logger, set up clear button
- `addLog(level, message, data, screenshot)` -- add a log entry with timestamp, source (file:line from stack trace), message, optional JSON data, and optional screenshot (screenshots no longer displayed in log panel, view via remote control instead).

---

### scripts/webview-manager.js
**Purpose**: Initialize the webview element and handle its ready state

**Functions**:
- `initWebview(webviewElem, browserStatusElem, screenshotElem)` -- set up dom-ready event listener, update browser status, show screenshot card when ready
- `getWebview()` -- return the webview element

---

### scripts/ui.js
**Purpose**: UI helper functions

**Functions**:
- `initUI(statusElem)` -- initialize UI module
- `showStatus(message, type)` -- display a status message (success/error/warning/info) that auto-clears after `STATUS_MESSAGE_DURATION` (5 seconds)

---

### scripts/search-config.js
**Purpose**: Load search parameters from JSON files via file dialog

**Functions**:
- `setupLoadSearch(loadBtn)` -- set up the Load Search button to open a file dialog, read a JSON config file, and populate the search form fields (`LRO`, `Description`, `DescriptionNumber`)

**Note**: This module exists but is not currently wired into the main UI HTML. Available for future use.

---

### scripts/form-filler.js
**Purpose**: Generate JavaScript code to fill the Onland search form (currently unused)

**Functions**:
- `generateFormFillScript(descType, descNumber)` -- returns a JavaScript IIFE string that:
  - Selects description type from `<select id="lct1">`
  - Fills description number into `<input id="lcv1">` (after dropdown enables it)
  - Clicks `#searchButton`
  - Returns a log of all actions taken

**Note**: Marked as unused -- `search-handler.js` now navigates directly to the search URL with query parameters instead of filling the form. Uses `FORM_DROPDOWN_WAIT` constant (import commented out).

---

### scripts/page-navigator.js
**Purpose**: Detect page count and navigate to specific pages in the book viewer

**Functions**:
- `pollForPageCount(webview, onScreenshotReady)` -- poll for `.page-count` elements every 500ms (max 30 attempts = 15 seconds):
  - Extracts "of X" from element text to get total page count
  - Sets state: `totalPages`, `currentPage` (starts at 1)
  - Triggers initial navigation to 50% via `executeNavCommand('50%')`
  - Also runs `probePDFjs()` debug function to test direct page API fetch
- `navigateToPage(webview, pageNumber)` -- navigate to a specific page by finding the "Jump to Page" input (`input[aria-label="Jump to Page"]`), setting its value, dispatching input/change events, and pressing Enter
- `probePDFjs(webview)` -- debug function that probes for the Onland page API URL pattern, extracts transaction IDs, and tests fetching page images directly

---

### scripts/navigation-handler.js
**Purpose**: Parse AI-style navigation commands and execute page movements

**Command parsing** (`parseNavCommand`):
| Input | Action | Description |
|-------|--------|-------------|
| `0` | `add` | Add current page to selection, advance to next page |
| `+N` | `forward` | Move forward N pages |
| `-N` | `back` | Move back N pages |
| `N%` / `+N%` | `percent-forward` | Jump forward N% of remaining pages |
| `-N%` | `percent-back` | Jump back N% of remaining pages |
| `N` (bare) | `goto` | Go directly to page N |

**Functions**:
- `executeNavCommand(rawInput)` -- programmatic entry point (used by page-navigator and REST API). Makes navigation controls visible and executes the command.
- `setupNavigationHandler(navInput, navBtn)` -- set up UI event listeners (button click, Enter key)
- `setNavigationVisible(visible)` -- show or hide the navigation controls card
- `addCurrentPage(webview)` -- click "Add Current Page" button in Onland, increment `pagesSelected` state, show Download button, then click "Next Page" button and take a screenshot after 1 second

---

### scripts/screenshot.js
**Purpose**: Capture page images via fetch interceptor injected into the webview

**Approach**: Injects a fetch/XHR interceptor into the webview that captures page image responses from the Onland API as they flow through. Stores them in `window.__onlandPageImages[pageNumber]`. No separate API call needed for captures.

**Previous approaches** (documented in source):
- `canvas.toDataURL()` -- fails on cross-origin tainted canvases
- `webContents.capturePage()` -- captures entire page including UI chrome
- Direct API fetch (`page:fetch` IPC) -- auth token timing issues

**Functions**:
- `installFetchInterceptor(webview)` -- inject fetch and XMLHttpRequest interceptors into the webview. Handles both JSON responses (extracts `content` field) and binary responses (ArrayBuffer to base64). Checks `window.__fetchInterceptorInstalled` to avoid double-install.
- `captureScreenshot(webview, callback)` -- capture a page image:
  1. Read from webview's fetch interceptor cache (`window.__onlandPageImages[currentPage]`)
  2. Fallback: direct API fetch via `window.electronAPI.fetchPageImage(pageNumber)` (uses captured auth token from main process network filter)
  3. Push result to REST API via `window.electronAPI.pushScreenshot()`
  4. Call `callback(base64Data)` with the result (or `null` on failure)

---

### scripts/search-handler.js
**Purpose**: Orchestrate the entire search workflow

**Functions**:
- `setupSearchHandler(searchForm)` -- set up submit event listener on search form
- `executeSearch(lro, descType, descNumber)` -- main workflow:
  1. Check Onland business hours (EST) -- reject if outside hours
  2. Navigate webview directly to search URL: `https://www.onland.ca/ui/{lro}/books/search/1?lcv1={descNumber}&lct1={descType}&page=1`
  3. Set state: `lro`, `descType`, `descNumber`, clear `totalBooks`/`totalPages`/`currentPage`
  4. Call `waitForResults()` after dom-ready
- `waitForResults(webview)` -- poll for search results (max 60 attempts x 500ms = 30 seconds):
  - Detects: server error ("unable to perform this request"), no results, or found results (View Details buttons)
  - On found: count books, set state, click "View Details", install fetch interceptor, wait for book viewer URL, call `pollForPageCount()`

---

### scripts/download-handler.js
**Purpose**: Execute the Onland download flow for selected pages

**Download flow**:
1. Click "Request Selected Pages" button
2. Poll for "Continue" popup (`button[aria-describedby="reviewFooterNote"]`), click it
3. Poll for "Download" link (`button.link-appearance`), click it
4. Main process intercepts the download via `will-download` event

**Functions**:
- `setupDownloadHandler(downloadBtn)` -- set up the Download Selected button click handler
- `executeDownloadFlow(webview)` -- execute the 3-step download flow in the webview
- `pollAndClick(webview, selector, label, timeout)` -- poll for an element matching a CSS selector and click it when found (500ms intervals, configurable timeout)

---

## Data Flow

### Search Flow
1. User fills form (or REST API sends search command)
2. **search-handler.js**: Check business hours, navigate webview to search URL
3. **search-handler.js**: Poll for search results (View Details / no results / error)
4. **search-handler.js**: Click "View Details", install fetch interceptor
5. **page-navigator.js**: Poll for page count, navigate to 50% mark
6. **screenshot.js**: Capture page image from interceptor cache
7. Screenshot pushed to REST API for secondary display

### Navigation Flow
1. User enters command (or REST API sends `incAmt` parameter)
2. **navigation-handler.js**: Parse command (relative, percentage, goto, add)
3. **page-navigator.js**: Execute page navigation via "Jump to Page" input
4. **navigation-handler.js**: Update state, take screenshot after 1 second
5. **screenshot.js**: Capture page image, push to REST API

### Download Flow
1. User clicks "Add Page" (command `0`) to accumulate pages
2. User clicks "Download Selected" (parameter `DL=true`)
3. **download-handler.js**: Execute 3-step Onland download flow
4. Main process intercepts file download via Electron `will-download`

---

## Architecture

```
main.js (Electron main process)
  |-- server.js (Express REST API on port 3001)
  |-- preload.js (IPC bridge)
  |
  +-- renderer (index.html + ES modules)
       |-- variables.js (state + constants)
       |-- logger.js (log display + source tracking)
       |-- ui.js (status messages)
       |-- webview-manager.js (webview lifecycle)
       |-- search-handler.js (search orchestration)
       |-- search-config.js (JSON config loading)
       |-- form-filler.js (form fill generation, unused)
       |-- page-navigator.js (page count + navigation)
       |-- navigation-handler.js (command parsing + execution)
       |-- screenshot.js (fetch interceptor + image capture)
       |-- download-handler.js (download flow)
```

## Known Issues

- **search-config.js**: Module exists but is not imported in `index.html` -- not currently accessible from the UI
- **form-filler.js**: Marked as unused -- search-handler navigates directly to URL instead
- **page-navigator.js**: `probePDFjs()` is a debug function that should be removed after confirming direct API fetch works
- **screenshot.js**: Module-level `interceptorInstalled` flag can be stale after webview reloads (mitigated by checking `window.__fetchInterceptorInstalled` in the webview)
- **server.js**: Only one pending API request at a time -- concurrent requests will cancel the previous one
