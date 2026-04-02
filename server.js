/**
 * REST API Server - Single endpoint for all commands
 *
 * GET /              - serves secondary display HTML
 * GET /api/status    - health check (returns connection status + public state)
 * GET /api           - sends command via query parameters, waits for screenshot, returns JSON
 * POST /api          - sends command via JSON body, waits for screenshot, returns JSON
 *
 * Parameters (GET as query params, POST as JSON body):
 *   lro, descType, descNumber     - trigger a search (also deletes any accumulated PDF)
 *   descType2, descNumber2       - optional secondary search (e.g., Lot, Parklot with Concession)
 *   filter                       - optional township filter
 *   incAmt  (+5, -3, 50%, 0)      - navigate pages (0 = add current page + PDF capture)
 *   DL (boolean)                 - return accumulated combined PDF as base64 in response
 *   confirm (boolean)            - delete accumulated PDF after confirmed download
 *   nextBook (boolean)           - open next book in search results
 *   prevBook (boolean)           - open previous book in search results
 */

const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
let server = null;
let mainWindow = null;

// API debug log — all request/response traffic both ways
const API_LOG_PATH = path.join(__dirname, 'shared', 'api-debug.log');

function apiLog(direction, data) {
    const ts = new Date().toISOString();
    const entry = `[${ts}] ${direction} ${typeof data === 'string' ? data : JSON.stringify(data)}\n`;
    fs.appendFileSync(API_LOG_PATH, entry);
}

// PDF Accumulator — runs in main process, accessed via require (shared module cache)
let pdfAccumulator = null;
try {
    pdfAccumulator = require('./src/pdf-accumulator.cjs');
} catch (e) {
    // Will be null if pdf-lib not installed — PDF features disabled
}

// Current state
let currentState = {};

// Pending promise resolver - the handler creates a promise,
// updateScreenshot() resolves it when the renderer captures
let pendingResolve = null;
let pendingTimeout = null;

// Fields that are internal to the renderer and should not be exposed in API responses
const INTERNAL_STATE_KEYS = ['pageApiBaseUrl', 'transactionId', 'bookRangeStart', 'bookRangeEnd', 'searchUrl'];

// Timeout for screenshot capture (30s — full flow: search → results → book → page → capture)
const CAPTURE_TIMEOUT = 30000;

/**
 * Return a copy of currentState with internal implementation details stripped out
 * @returns {Object} Filtered state safe for API responses
 */
function getPublicState() {
    const public = {};
    for (const key of Object.keys(currentState)) {
        if (!INTERNAL_STATE_KEYS.includes(key)) {
            public[key] = currentState[key];
        }
    }
    return public;
}

app.use(express.json());

// Status endpoint — lets secondary display verify connection on load
app.get('/api/status', (req, res) => {
    apiLog('GET /api/status', { query: req.query });
    const response = {
        connected: !!(mainWindow && !mainWindow.isDestroyed()),
        state: getPublicState()
    };
    apiLog('RESPONSE /api/status', response);
    res.json(response);
});

// Serve secondary display HTML
app.get('/', (req, res) => {
    const htmlPath = path.join(__dirname, 'src', 'secondary-display', 'index.html');
    if (fs.existsSync(htmlPath)) {
        res.sendFile(htmlPath);
    } else {
        res.status(404).send('Secondary display not found');
    }
});

/**
 * Core API handler — shared by GET and POST /api
 * @param {Object} params - Command parameters (lro, descType, descNumber, incAmt, DL, confirm, nextBook, prevBook, etc.)
 * @param {Object} res - Express response object
 */
function handleApiCommand(params, res, req) {
    apiLog('REQUEST /api', { method: req.method, params });

    // Wrap res.json to log all responses
    const originalJson = res.json.bind(res);
    res.json = function(data) {
        // Log screenshot summary (don't dump huge base64 strings)
        const logData = { ...data };
        if (logData.screenshot) {
            const prefix = logData.screenshot.substring(0, 40);
            logData.screenshot = `${prefix}... (${logData.screenshot.length} chars)`;
        }
        if (logData.pdf && logData.pdf.base64Data) {
            logData.pdf = { ...logData.pdf, base64Data: `(${logData.pdf.base64Data.length} chars)` };
        }
        apiLog('RESPONSE /api', logData);
        originalJson(data);
    };

    const { lro, descType, descNumber, descType2, descNumber2, filter, incAmt, DL, confirm, nextBook, prevBook } = params;

    // Must have some action
    if (!lro && !incAmt && !DL && !confirm && !nextBook && !prevBook) {
        res.status(400).json({ error: 'No action specified' });
        return;
    }

    // Handle PDF confirm/delete (called after successful download to clean up)
    // This returns immediately without waiting for a screenshot
    if (confirm) {
        if (pdfAccumulator) {
            try {
                pdfAccumulator.deleteCombined();
                return res.json({ success: true, message: 'PDF deleted after confirmed download' });
            } catch (err) {
                return res.status(500).json({ success: false, error: err.message });
            }
        } else {
            return res.json({ success: true, message: 'PDF accumulator not available' });
        }
    }

    // Handle PDF download request (DL=true) — return accumulated combined PDF
    // This returns immediately without waiting for a screenshot
    if (DL && !incAmt && !lro) {
        if (pdfAccumulator) {
            try {
                const pdfData = pdfAccumulator.getCombinedPdfBase64();
                if (pdfData) {
                    return res.json({
                        success: true,
                        pdf: {
                            base64Data: pdfData.base64Data,
                            filename: pdfData.filename,
                            pageCount: pdfData.pageCount,
                            size: pdfData.size
                        },
                        state: getPublicState()
                    });
                } else {
                    return res.json({
                        success: false,
                        error: 'No accumulated PDF available',
                        state: getPublicState()
                    });
                }
            } catch (err) {
                return res.status(500).json({ success: false, error: err.message });
            }
        } else {
            return res.status(503).json({ success: false, error: 'PDF accumulator not available' });
        }
    }

    // Check Onland business hours (EST) for search requests
    if (lro) {
        const estNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
        const day = estNow.getDay();
        const hour = estNow.getHours();
        const withinHours =
            (day >= 1 && day <= 4 && hour >= 4) ||
            (day === 5 && hour >= 4 && hour < 21) ||
            (day === 6 && hour >= 9 && hour < 18) ||
            (day === 0 && hour >= 9 && hour < 21);
        if (!withinHours) {
            res.status(403).json({ error: 'Onland is closed — business hours: Mon-Thu 4am-midnight, Fri 4am-9pm, Sat 9am-6pm, Sun 9am-9pm (EST)' });
            return;
        }
    }

    if (!mainWindow || mainWindow.isDestroyed()) {
        res.status(503).json({ error: 'Main window not available' });
        return;
    }

    // Set up pending promise to wait for screenshot
    if (pendingResolve) {
        pendingResolve(null); // Cancel any previous pending request
    }

    const result = new Promise((resolve) => {
        pendingResolve = resolve;

        // Safety timeout
        pendingTimeout = setTimeout(() => {
            resolve({ screenshot: null, state: getPublicState(), timeout: true });
        }, CAPTURE_TIMEOUT);
    });

    // Forward search command — also delete any existing accumulated PDF
    // (new search means we're starting fresh, discard old accumulation)
    if (lro && descType && descNumber) {
        // Delete any previously accumulated PDF (new search session)
        if (pdfAccumulator) {
            try {
                pdfAccumulator.deleteCombined();
            } catch (e) {
                // Ignore cleanup errors
            }
        }
        const searchData = { lro, descType, descNumber };
        if (descType2) searchData.descType2 = descType2;
        if (descNumber2) searchData.descNumber2 = descNumber2;
        if (filter) searchData.filter = filter;
        mainWindow.webContents.send('search:execute', searchData);
    }

    // Forward nav command
    if (incAmt) {
        mainWindow.webContents.send('nav:execute', String(incAmt));
    }

    // Forward download command (only if not already handled above as PDF download)
    if (DL && (incAmt || lro)) {
        mainWindow.webContents.send('nav:execute', 'download');
    }

    // Forward next book command
    if (nextBook) {
        mainWindow.webContents.send('next-book:execute', {});
    }

    // Forward prev book command
    if (prevBook) {
        mainWindow.webContents.send('prev-book:execute', {});
    }

    // Wait for screenshot (resolved by updateScreenshot) or timeout
    result.then(data => {
        pendingResolve = null;
        if (pendingTimeout) {
            clearTimeout(pendingTimeout);
            pendingTimeout = null;
        }
        res.json(data);
    });
}

// GET /api - command via query parameters
app.get('/api', (req, res) => {
    handleApiCommand(req.query, res, req);
});

// POST /api - command via JSON body
app.post('/api', (req, res) => {
    if (!req.body || typeof req.body !== 'object') {
        res.status(400).json({ error: 'Request body must be JSON object' });
        return;
    }
    handleApiCommand(req.body, res, req);
});

/**
 * Start the REST API server
 * @param {number} port - Port to listen on
 * @param {BrowserWindow} win - Reference to the main Electron window
 */
function startServer(port, win) {
    mainWindow = win;
    server = app.listen(port, () => {
        console.log(`REST API server listening on port ${port}`);
    });

    if (win) {
        win.on('closed', () => {
            mainWindow = null;
        });
    }
}

/**
 * Stop the REST API server
 */
function stopServer() {
    if (server) {
        server.close();
        server = null;
    }
}

/**
 * Update the current state (called by renderer)
 * @param {Object} state - The global state object
 */
function updateState(state) {
    currentState = state;
}

/**
 * Update screenshot and resolve pending API request (called by renderer)
 * @param {string} base64Data - Base64-encoded PNG data
 */
function updateScreenshot(base64Data) {
    if (pendingResolve) {
        const resolve = pendingResolve;
        pendingResolve = null;
        if (pendingTimeout) {
            clearTimeout(pendingTimeout);
            pendingTimeout = null;
        }
        resolve({ screenshot: base64Data, state: getPublicState() });
    }
}

module.exports = {
    startServer,
    stopServer,
    updateState,
    updateScreenshot
};
