# Web Data Entry

Playwright/Node.js application to enter extracted data into government land records websites.

## Purpose
Automate data entry into government land records site and provide UI for manual search requests.

## Setup

```bash
# Install dependencies
npm install

# Install Playwright browsers
npx playwright install chromium

# Run application
npm start
```

The UI will be available at http://localhost:8002

## API Endpoints

- `POST /api/search` - Manual search request from UI
- `POST /api/ocr-complete` - Notification from OCR app
- `GET /api/results/{search_id}` - Retrieve search results
- `GET /api/ocr-status` - Check OCR processing status

## Components

- `automation/land_site.py` - Government site interaction (Playwright)
- `automation/form_filler.py` - Form data entry logic
- `api/routes.js` - Express API endpoints
- `ui/server.js` - Web UI server (port 8002)
- `ui/public/index.html` - Simple web interface

## Usage

1. Open http://localhost:8002 in browser
2. Enter property owner name
3. Click "Search Records"
4. View results when complete

## Integration with OCR App

The OCR app (`ocr-transcriber`) notifies this app when processing is complete via:
- REST API callback to `/api/ocr-complete`
- File-based shared storage (`shared/extracted/` names JSON files)

This app then automatically searches for each extracted name.
