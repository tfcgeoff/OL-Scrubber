# Onland Web Data Entry - Scripts Documentation

## scripts/logger.js
**Purpose**: Display log messages in the UI sidebar

**Functions**:
- `initLogger(logsElem, clearBtn)` - Initialize logger, set up clear button
- `addLog(level, message, data, screenshot)` - Add a log entry to the logs container with timestamp, message, optional data, and optional screenshot image

---

## scripts/webview-manager.js
**Purpose**: Initialize the webview element and handle its ready state

**Functions**:
- `initWebview(webviewElem, browserStatusElem, screenshotElem)` - Set up dom-ready event listener, update browser status when webview loads
- `getWebview()` - Return the webview element
- `getWebContents()` - Return the webview webContents object

---

## scripts/ui.js
**Purpose**: UI helper functions

**Functions**:
- `initUI(statusElem)` - Initialize UI module
- `showStatus(message, type)` - Display a status message to the user (success/error/warning) that auto-clears after 5 seconds

---

## scripts/form-filler.js
**Purpose**: Generate JavaScript code to fill the Onland search form

**Functions**:
- `generateFormFillScript(descType, descNumber)` - Returns a JavaScript string that:
  - Analyzes all input fields on the page
  - Finds Description Type input by aria-label/placeholder
  - Finds Description Number input (excludes "Other Information" field)
  - Fills both inputs with provided values
  - Handles dropdown selection for Description Type
  - Clicks the Search button multiple times

---

## scripts/page-navigator.js
**Purpose**: Detect page count and navigate to middle page of book

**Functions**:
- `pollForPageCount(webview, onScreenshotReady)` - Poll for page count element every 500ms (max 30 attempts = 15 seconds):
  - Uses `getElementsByClassName('page-count')` to find the element
  - Extracts "of X" number from the `<p>` tag inside
  - Calculates middle page: `Math.floor(totalPages / 2)`
  - Navigates to middle page via URL parameter
  - Calls `onScreenshotReady()` callback when done
- `navigateToMiddlePage(webview, pageNumber)` - Navigate to specific page by adding `?page=X` to URL

---

## scripts/screenshot.js
**Purpose**: Capture page data (text-based information extraction)

**Functions**:
- `captureScreenshot(webview)` - Extract and log page information:
  - Page title, URL, timestamp
  - Count of inputs, buttons, links
  - First 5000 characters of body text
  - **Note: Only captures text data, NOT an image**

---

## scripts/search-handler.js
**Purpose**: Orchestrate the entire search workflow

**Functions**:
- `setupSearchHandler(searchForm)` - Set up submit event listener on search form
- `executeSearch(lro, descType, descNumber)` - Main workflow:
  - Navigate to `https://www.onland.ca/ui/{lro}/books/search`
  - Wait for form to load
  - Fill form and submit
- `waitForFormFill(webview, descType, descNumber)` - Wait for Angular rendering, execute form fill script
- `waitForViewDetails(webview)` - Wait for "View Details" button and click it
  - Then starts page count polling after 2.5 seconds

---

## Data Flow

1. User fills form → clicks Search
2. **search-handler.js**: Navigate to search URL
3. **form-filler.js**: Generate and execute form-filling JavaScript
4. **search-handler.js**: Wait 5 seconds, then click "View Details"
5. **page-navigator.js**: Poll for page count, navigate to middle page
6. **screenshot.js**: Capture page text data

---

## Known Issues

- **screenshot.js**: Does not capture an actual image, only text data
- **page-navigator.js**: Page count detection embedded in screenshot function (should be separate)
