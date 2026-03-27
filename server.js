/**
 * REST API Server - Single endpoint for all commands
 *
 * GET / - serves secondary display HTML
 * GET /api - sends command to Electron, waits for screenshot, returns JSON:
 *          { screenshot: "base64...", state: { lro, descType, ... } }
 *
 * Query params:
 *   lro, descType, descNumber  - trigger a search
 *   incAmt  (+5, -3, 50%, 0)     - navigate pages
 *   DL=true                    - download selected pages
 *   nextBook=true              - open next book in search results
 */

const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
let server = null;
let mainWindow = null;

// Current state
let currentState = {};

// Pending promise resolver - the GET /api handler creates a promise,
// updateScreenshot() resolves it when the renderer captures
let pendingResolve = null;
let pendingTimeout = null;

// Timeout for screenshot capture (20s max)
const CAPTURE_TIMEOUT = 20000;

app.use(express.json());

// Serve secondary display HTML
app.get('/', (req, res) => {
    const htmlPath = path.join(__dirname, 'src', 'secondary-display', 'index.html');
    if (fs.existsSync(htmlPath)) {
        res.sendFile(htmlPath);
    } else {
        res.status(404).send('Secondary display not found');
    }
});

// Single API endpoint - forwards command, waits for screenshot, returns JSON
app.get('/api', (req, res) => {
    const { lro, descType, descNumber, incAmt, DL, nextBook } = req.query;

    // Must have some action
    if (!lro && !incAmt && !DL && !nextBook) {
        res.status(400).json({ error: 'No action specified' });
        return;
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
            resolve({ screenshot: null, state: currentState, timeout: true });
        }, CAPTURE_TIMEOUT);
    });

    // Forward search command
    if (lro && descType && descNumber) {
        mainWindow.webContents.send('search:execute', { lro, descType, descNumber });
    }

    // Forward nav command
    if (incAmt) {
        mainWindow.webContents.send('nav:execute', incAmt);
    }

    // Forward download command
    if (DL) {
        mainWindow.webContents.send('nav:execute', 'download');
    }

    // Forward next book command
    if (nextBook) {
        mainWindow.webContents.send('next-book:execute', {});
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
        resolve({ screenshot: base64Data, state: currentState });
    }
}

module.exports = {
    startServer,
    stopServer,
    updateState,
    updateScreenshot
};
