/**
 * Electron Main Process - Onland Data Entry App
 *
 * Single Responsibility: Bootstrap Electron app and manage IPC
 */

const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');
const fs = require('fs');

// File-based logger — avoids EPIPE crashes from log when
// Electron's stdout pipe breaks (common on Linux when piped).
const logFile = path.join(__dirname, 'Errors.txt');
function log() {
    const msg = Array.from(arguments).map(a =>
        typeof a === 'object' ? JSON.stringify(a) : String(a)
    ).join(' ');
    const line = new Date().toISOString() + ' ' + msg + '\n';
    fs.appendFileSync(logFile, line);
}

// --- GPU Auto-Detection ---
// Tests available GPUs on startup, saves working config to avoid re-probing.
// Linux: enumerates /dev/dri/renderD* nodes, tries each for best performance.
// Windows: tries hardware GPU first, falls back to disable-gpu.

const gpuConfigPath = path.join(app.getPath('userData'), 'gpu-config.json');

/**
 * Load previously saved GPU config
 */
function loadGpuConfig() {
    try {
        if (fs.existsSync(gpuConfigPath)) {
            return JSON.parse(fs.readFileSync(gpuConfigPath, 'utf8'));
        }
    } catch (e) {
        // Ignore read errors
    }
    return null;
}

/**
 * Save working GPU config for future launches
 */
function saveGpuConfig(config) {
    try {
        fs.writeFileSync(gpuConfigPath, JSON.stringify(config, null, 2));
    } catch (e) {
        // Ignore write errors
    }
}

/**
 * Detect available DRI render nodes on Linux
 * @returns {string[]} Array of render node paths, sorted (highest number = typically discrete GPU)
 */
function detectLinuxRenderNodes() {
    const nodes = [];
    try {
        const driDir = '/dev/dri';
        if (fs.existsSync(driDir)) {
            const entries = fs.readdirSync(driDir);
            entries.forEach(entry => {
                if (entry.startsWith('renderD')) {
                    nodes.push(path.join(driDir, entry));
                }
            });
        }
    } catch (e) {
        // Ignore errors
    }
    // Sort by number — higher renderD numbers are typically discrete GPUs (AMD/NVIDIA)
    nodes.sort((a, b) => {
        const numA = parseInt(a.match(/\d+/)?.[0] || '0', 10);
        const numB = parseInt(b.match(/\d+/)?.[0] || '0', 10);
        return numB - numA; // Descending — try best GPU first
    });
    return nodes;
}

/**
 * Configure GPU settings based on platform and available hardware.
 * Falls back to disable-gpu if hardware acceleration causes crashes.
 */
function configureGpu() {
    const platform = process.platform;
    const saved = loadGpuConfig();

    // If we have a saved working config, use it
    if (saved && saved.working) {
        if (saved.device) {
            app.commandLine.appendSwitch('gpu-device', saved.device);
            log('GPU: Using saved config — device:', saved.device);
        } else if (saved.disabled) {
            app.commandLine.appendSwitch('disable-gpu');
            app.commandLine.appendSwitch('disable-software-rasterizer');
            log('GPU: Using saved config — software rendering');
        } else {
            log('GPU: Using saved config — default hardware');
        }

        // Listen for GPU crash — if it crashes, fall back and re-save
        app.on('gpu-process-crashed', () => {
            log('GPU: Saved config crashed, falling back to software rendering');
            app.commandLine.appendSwitch('disable-gpu');
            app.commandLine.appendSwitch('disable-software-rasterizer');
            saveGpuConfig({ working: true, disabled: true, device: null, platform, timestamp: Date.now() });
        });
        return;
    }

    // No saved config — probe for best GPU
    if (platform === 'linux') {
        const renderNodes = detectLinuxRenderNodes();
        if (renderNodes.length > 0) {
            // Try the highest-numbered render node (typically discrete GPU)
            const device = renderNodes[0];
            app.commandLine.appendSwitch('gpu-device', device);
            log('GPU: Found', renderNodes.length, 'render nodes, trying:', device);

            // Mark for validation — if no crash within 5s, save as working
            setTimeout(() => {
                log('GPU: No crash after 5s — saving config');
                saveGpuConfig({ working: true, disabled: false, device, platform, timestamp: Date.now() });
            }, 5000);

            app.on('gpu-process-crashed', () => {
                log('GPU:', device, 'crashed — trying next node or falling back');
                saveGpuConfig({ working: true, disabled: true, device: null, platform, timestamp: Date.now() });
                // Will use software rendering on next launch
            });
        } else {
            log('GPU: No DRI render nodes found — using software rendering');
            app.commandLine.appendSwitch('disable-gpu');
            app.commandLine.appendSwitch('disable-software-rasterizer');
            saveGpuConfig({ working: true, disabled: true, device: null, platform, timestamp: Date.now() });
        }
    } else if (platform === 'win32') {
        // Windows: try hardware GPU first (default Chromium behavior)
        log('GPU: Windows detected — trying hardware acceleration');
        // No flags needed — Chromium uses the best available GPU by default

        // If it crashes, fall back to software rendering
        setTimeout(() => {
            log('GPU: No crash after 5s — saving config');
            saveGpuConfig({ working: true, disabled: false, device: null, platform, timestamp: Date.now() });
        }, 5000);

        app.on('gpu-process-crashed', () => {
            log('GPU: Hardware acceleration crashed — falling back to software');
            app.commandLine.appendSwitch('disable-gpu');
            app.commandLine.appendSwitch('disable-software-rasterizer');
            saveGpuConfig({ working: true, disabled: true, device: null, platform, timestamp: Date.now() });
        });
    } else {
        // macOS or other — try hardware first
        log('GPU: Unknown platform (' + platform + ') — trying hardware acceleration');
        setTimeout(() => {
            saveGpuConfig({ working: true, disabled: false, device: null, platform, timestamp: Date.now() });
        }, 5000);

        app.on('gpu-process-crashed', () => {
            app.commandLine.appendSwitch('disable-gpu');
            app.commandLine.appendSwitch('disable-software-rasterizer');
            saveGpuConfig({ working: true, disabled: true, device: null, platform, timestamp: Date.now() });
        });
    }
}

configureGpu();

// Check for --dev flag before anything else
const isDev = process.argv.includes('--dev');

// Parse --port= CLI arg for REST API server
const portArg = process.argv.find(arg => arg.startsWith('--port='));
const restPort = portArg ? parseInt(portArg.split('=')[1], 10) : 3001;

// --debug-server / --useTest flags enable secondary display + REST API server (listens on port)
// When absent, no port is occupied — for production use
const isDebug = process.argv.includes('--debug-server') || process.argv.includes('--useTest');

let mainWindow = null;
const boundsPath = path.join(app.getPath('userData'), 'window-bounds.json');
const defaultBounds = { width: 1600, height: 900, x: 100, y: 0 };

// Download state
let downloadDirPath = path.join(__dirname, 'shared', 'pdf');
let lastDownload = null;

// Captured page API data for direct fetch (replaces screenshots)
let capturedAuthToken = null;
let capturedApiHeaders = {};
let capturedRequestBody = null;
let capturedPageApiUrl = null; // Full URL of last page API request

// CDP-captured page images { pageNumber: { base64Data, contentType, size } }
let cdpPageImages = {};

function loadBounds() {
    try {
        if (fs.existsSync(boundsPath)) {
            return JSON.parse(fs.readFileSync(boundsPath, 'utf8'));
        }
    } catch (e) {
        // Fall back to defaults
    }
    return defaultBounds;
}

function saveBounds() {
    try {
        if (mainWindow && !mainWindow.isDestroyed()) {
            fs.writeFileSync(boundsPath, JSON.stringify(mainWindow.getBounds()));
        }
    } catch (e) {
        // Ignore save errors
    }
}

function createWindow() {
    const bounds = loadBounds();

    // Detect headless mode from command line args (--headless flag)
    const isHeadless = process.argv.includes('--headless');
    // --show-window flag forces the UI to be visible (otherwise runs as hidden service)
    const showWindow = false;//process.argv.includes('--show-window');
    const isWindows = process.platform === 'win32';

    mainWindow = new BrowserWindow({
        width: 0,//bounds.width,
        height: 0,//bounds.height,
        minWidth: 0,//1200,
        x: 0,//bounds.x,
        y: 0,//bounds.y,
        show: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
            webviewTag: true,
            nodeIntegrationInSubFrames: true
        }
    });

    if (showWindow) {
        mainWindow.show();
        log('Running with visible UI');
    } else {
        // Hidden service mode
        // On Windows: show:false works, webview renders fine without display
        // On Linux: webview requires window to be visible (use --show-window or xvfb-run)
        if (isWindows) {
            log('Running as hidden service (Windows — webview works without display)');
        } else {
            mainWindow.show();
            mainWindow.setSkipTaskbar(true);
            log('Running as hidden service (Linux — window visible but minimized from taskbar, use xvfb-run for true headless)');
        }
    }

    mainWindow.loadFile(path.join(__dirname, 'src', 'ui', 'public', 'index.html'));

    if (isDev) {
        mainWindow.webContents.openDevTools();
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // In service mode, prevent window close from destroying it — hide instead
    mainWindow.on('close', (event) => {
        if (!showWindow) {
            // Service mode: hide window, keep app alive
            event.preventDefault();
            mainWindow.hide();
            log('Window closed — app continues running as background service');
        }
    });

    mainWindow.on('resize', saveBounds);
    mainWindow.on('move', saveBounds);
    mainWindow.on('close', saveBounds);

    // Attach CDP debugger to webview to capture page image responses
    // This works regardless of fetch/XHR/web workers — captures at the network layer
    mainWindow.webContents.on('did-attach-webview', (event, guestWebContents) => {
        try {
            guestWebContents.debugger.attach('1.3');
        } catch (e) {
            log('CDP: Debugger already attached or failed:', e.message);
            return;
        }

        // Enable Network with large buffer for response bodies
        guestWebContents.debugger.sendCommand('Network.enable', {
            maxTotalBufferSize: 100 * 1024 * 1024  // 100MB
        }).catch(() => {});

        // Also enable Fetch domain to intercept responses
        guestWebContents.debugger.sendCommand('Fetch.enable', {
            patterns: [{
                urlPattern: '*://www.onland.ca/api/v1/books/transactions/*/pages*',
                requestStage: 'Response'
            }]
        }).catch(() => {});

        guestWebContents.debugger.on('message', (_event, method, params) => {
            if (method === 'Fetch.requestPaused') {
                const pausedUrl = (params.request && params.request.url) || '';
                const requestId = params.requestId;
                if (pausedUrl.includes('/transactions/') && pausedUrl.includes('/pages?page=')) {
                    const pageMatch = pausedUrl.match(/page=(\d+)/);
                    const pageNum = pageMatch ? parseInt(pageMatch[1], 10) : null;

                    if (!pageNum) {
                        guestWebContents.debugger.sendCommand('Fetch.continueResponse', { requestId }).catch(() => {});
                        return;
                    }

                    // Get the response body from the paused request
                    guestWebContents.debugger.sendCommand('Fetch.getResponseBody', { requestId })
                        .then(result => {
                            if (result && result.body) {
                                // Decode body if CDP base64-encoded it for transport
                                const rawBody = result.base64Encoded
                                    ? Buffer.from(result.body, 'base64').toString()
                                    : result.body;
                                const headerCT = (params.responseHeaders &&
                                    (params.responseHeaders['content-type'] || params.responseHeaders['Content-Type'])) || '';
                                const contentType = headerCT || (result.base64Encoded ? 'application/octet-stream' : '');
                                let base64Data;

                                // Extract the actual page image data from the response
                                // Onland API returns JSON: {"content":"<base64_pdf>"} or {"image":"<base64_pdf>"}
                                // Content-type is unreliable — always try JSON first
                                try {
                                    const json = JSON.parse(rawBody);
                                    if (json.content || json.image) {
                                        base64Data = json.content || json.image;
                                        log('FETCH CDP: JSON response, extracted content field (contentType: ' + headerCT + ')');
                                    } else {
                                        throw new Error('No content/image field');
                                    }
                                } catch (e) {
                                    // Not JSON or no content field — treat as raw binary
                                    if (result.base64Encoded) {
                                        base64Data = result.body; // already base64
                                    } else {
                                        base64Data = Buffer.from(rawBody).toString('base64');
                                    }
                                    log('FETCH CDP: Binary response (contentType: ' + headerCT + ')');
                                }

                                if (base64Data) {
                                    cdpPageImages[pageNum] = {
                                        base64Data,
                                        contentType,
                                        size: base64Data.length
                                    };
                                    log('FETCH CDP: Captured page', pageNum, '(', base64Data.length, 'chars)');
                                }
                            }
                            // Continue the request so the webview receives the response
                            // Must pass through original response headers to avoid breaking page rendering
                            const fulfillParams = {
                                requestId,
                                responseCode: params.responseStatusCode || 200,
                                body: result.body,
                                base64Encoded: result.base64Encoded || false
                            };
                            // Pass through original response headers if available
                            if (params.responseHeaders && Object.keys(params.responseHeaders).length > 0) {
                                fulfillParams.responseHeaders = Object.entries(params.responseHeaders).map(([name, value]) => ({
                                    name, value: Array.isArray(value) ? value.join(', ') : String(value)
                                }));
                            }
                            guestWebContents.debugger.sendCommand('Fetch.fulfillResponse', fulfillParams).catch(() => {
                                // If fulfillResponse fails, try continueResponse
                                guestWebContents.debugger.sendCommand('Fetch.continueResponse', { requestId }).catch(() => {});
                            });
                        })
                        .catch(err => {
                            log('FETCH CDP: getResponseBody failed for page', pageNum, err.message);
                            guestWebContents.debugger.sendCommand('Fetch.continueResponse', { requestId }).catch(() => {});
                        });
                } else {
                    guestWebContents.debugger.sendCommand('Fetch.continueResponse', { requestId }).catch(() => {});
                }
            }
        });

        log('CDP: Network + Fetch debugger attached to webview');
    });

    return mainWindow;
}

// Enable main process debugging (open chrome://inspect to see main.js scripts)
app.commandLine.appendSwitch('inspect');

// App lifecycle events
app.whenReady().then(() => {
    log('Electron ready, creating window...');
    createWindow();
    log('Window created, webview will load onland.ca directly');

    // Set up download interception on the webview's session partition
    const ses = session.fromPartition('persist:onland');

    // Capture request headers from Onland page API requests
    // Stores auth token + custom headers for direct API fetch (replaces screenshots)
    ses.webRequest.onBeforeSendHeaders(
        { urls: ['*://www.onland.ca/api/v1/books/transactions/*/pages*'] },
        (details, callback) => {
            const headers = details.requestHeaders || {};
            const auth = headers['authorization'] || headers['Authorization'] || '';
            if (auth) {
                capturedAuthToken = auth;
                // Capture Onland-specific headers for API replay
                capturedApiHeaders = {};
                if (headers['onland-random']) capturedApiHeaders['onland-random'] = headers['onland-random'];
                if (headers['tracer']) capturedApiHeaders['tracer'] = headers['tracer'];
                if (mainWindow && !mainWindow.isDestroyed()) {
                    try {
                        mainWindow.webContents.send('onland:authToken', { token: auth });
                        log('ONLAND AUTH TOKEN CAPTURED');
                    } catch(e) {}
                }
            }
            callback({ requestHeaders: details.requestHeaders });
        }
    );

    // Intercept network requests to capture Onland page API URL pattern + body
    // Onland loads book pages via: POST https://www.onland.ca/api/v1/books/transactions/{id}/pages?page=N
    // We only observe — the callback must pass the request through unchanged
    ses.webRequest.onBeforeRequest(
        { urls: ['*://www.onland.ca/api/v1/books/transactions/*/pages*'] },
        (details, callback) => {
            log('ONLAND PAGE API:', details.url, details.method);
            // Store URL for direct fetch (main process builds URLs from this)
            capturedPageApiUrl = details.url;
            // Capture request body for replay
            if (details.uploadData && details.uploadData.length > 0) {
                capturedRequestBody = details.uploadData[0].bytes.toString();
                log('ONLAND REQUEST BODY:', capturedRequestBody);
            }
            // Forward the captured URL to the renderer so it knows the API pattern
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('onland:pageApiUrl', {
                    url: details.url,
                    method: details.method
                });
            }
            // Pass request through unchanged (cancel: false is the default, but be explicit)
            callback({ cancel: false });
        }
    );

    ses.on('will-download', (event, item, webContents) => {
        // Ensure download directory exists
        if (!fs.existsSync(downloadDirPath)) {
            fs.mkdirSync(downloadDirPath, { recursive: true });
        }

        const filename = item.getFilename();
        const savePath = path.join(downloadDirPath, filename);
        item.setSavePath(savePath);

        item.on('updated', (e, state) => {
            if (state === 'completed') {
                lastDownload = { filename, path: savePath };
                log('Download complete:', savePath);
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('download:complete', { filename, path: savePath });
                }
            }
        });
    });

    // Start REST API server for secondary display (only in --debug mode)
    if (isDebug) {
        try {
            const server = require('./server.js');
            server.startServer(restPort, mainWindow);
            log('REST API server started on port ' + restPort + ' (debug mode — secondary display at http://localhost:' + restPort + ')');
        } catch (err) {
            log('Failed to start REST API server:', err.message);
        }
    } else {
        log('Debug mode off — secondary display server not started (use --debug-server or --useTest to enable)');
    }
});

app.on('window-all-closed', () => {
    try {
        const server = require('./server.js');
        server.stopServer();
    } catch (e) {}
    app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// IPC handler: open file dialog to pick a search config JSON
ipcMain.handle('dialog:openSearchConfig', async () => {
    const { dialog } = require('electron');
    const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Load Search Config',
        filters: [{ name: 'JSON', extensions: ['json'] }],
        properties: ['openFile']
    });

    if (result.canceled || result.filePaths.length === 0) {
        return { canceled: true };
    }

    try {
        const content = fs.readFileSync(result.filePaths[0], 'utf8');
        const config = JSON.parse(content);

        // Validate required fields
        const required = ['LRO', 'Description', 'DescriptionNumber'];
        const missing = required.filter(f => !config[f]);
        if (missing.length > 0) {
            return { canceled: false, error: `Missing required fields: ${missing.join(', ')}` };
        }

        return { canceled: false, config };
    } catch (err) {
        return { canceled: false, error: err.message };
    }
});

// IPC handlers: download directory management
ipcMain.handle('download:getDir', () => downloadDirPath);

ipcMain.handle('download:setDir', async () => {
    const { dialog } = require('electron');
    const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Select Download Directory',
        properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled) return downloadDirPath;
    downloadDirPath = result.filePaths[0];
    return downloadDirPath;
});

ipcMain.handle('download:getLast', () => lastDownload);

// IPC handler: state sync for REST API
ipcMain.handle('state:update', (event, state) => {
    try {
        const server = require('./server.js');
        server.updateState(state);
    } catch (e) {
        // Server may not be running
    }
    return { success: true };
});

// IPC handler: screenshot push from renderer to REST API
ipcMain.handle('screenshot:update', (event, base64Data) => {
    try {
        const server = require('./server.js');
        server.updateScreenshot(base64Data);
    } catch (e) {
        // Server may not be running
    }
    return { success: true };
});

// IPC handler: fetch page image — uses CDP-captured data from webview responses
// Falls back to direct API fetch if CDP data not available
ipcMain.handle('page:fetch', async (event, { pageNumber }) => {
    // Try 1: Return CDP-captured page image
    log('PAGE FETCH: CDP cache has pages:', Object.keys(cdpPageImages).join(','), 'looking for:', pageNumber, typeof pageNumber);
    const cdpImage = cdpPageImages[pageNumber];
    if (cdpImage && cdpImage.base64Data) {
        log('PAGE FETCH: Returning CDP-captured page', pageNumber, '(', cdpImage.size, 'chars)');
        // Push to REST API for secondary display
        try {
            const server = require('./server.js');
            server.updateScreenshot(cdpImage.base64Data);
        } catch (e) {}
        return { success: true, data: cdpImage.base64Data, contentType: cdpImage.contentType, size: cdpImage.size, source: 'cdp' };
    }

    // Try 2: Direct API fetch (may fail due to encrypted request body)
    if (!capturedAuthToken || !capturedPageApiUrl) {
        return { success: false, message: 'No auth token or URL captured yet — search for a book first' };
    }

    const url = capturedPageApiUrl.replace(/page=\d+/, `page=${pageNumber}`);
    log('PAGE FETCH: Direct API', url);

    try {
        const { net } = require('electron');
        const request = net.request({
            url,
            partition: 'persist:onland',
            method: 'POST'
        });

        request.setHeader('Authorization', capturedAuthToken);
        request.setHeader('Content-Type', 'application/json');
        Object.entries(capturedApiHeaders).forEach(([key, value]) => {
            request.setHeader(key, value);
        });
        if (capturedRequestBody) {
            request.write(capturedRequestBody);
        }

        return new Promise((resolve) => {
            const chunks = [];
            request.on('response', (response) => {
                const contentType = response.headers['content-type'] || '';
                log('PAGE FETCH response:', response.statusCode, contentType);

                if (response.statusCode !== 200) {
                    let body = '';
                    response.on('data', (chunk) => { body += chunk.toString(); });
                    response.on('end', () => {
                        resolve({ success: false, message: `HTTP ${response.statusCode}`, body: body.substring(0, 200) });
                    });
                    return;
                }

                response.on('data', (chunk) => chunks.push(chunk));
                response.on('end', () => {
                    const buffer = Buffer.concat(chunks);
                    const text = buffer.toString();
                    let pageData;

                    // Always try JSON extraction — Onland API sometimes returns JSON
                    // with content-type application/octet-stream
                    try {
                        const json = JSON.parse(text);
                        if (json.content) {
                            pageData = json.content;
                            log('PAGE FETCH: JSON response, extracted content field (contentType: ' + contentType + ')');
                        } else if (json.image) {
                            pageData = json.image;
                            log('PAGE FETCH: JSON response, extracted image field');
                        } else {
                            pageData = buffer.toString('base64');
                            log('PAGE FETCH: JSON response but no content/image field, encoded as base64');
                        }
                    } catch (e) {
                        // Not JSON — raw binary (PNG, PDF, etc.)
                        pageData = buffer.toString('base64');
                        log('PAGE FETCH: Binary response, encoded as base64 (contentType: ' + contentType + ')');
                    }

                    try {
                        const server = require('./server.js');
                        server.updateScreenshot(pageData);
                    } catch (e) {}
                    resolve({ success: true, data: pageData, contentType, size: pageData.length, source: 'api' });
                });
            });
            request.on('error', (error) => {
                log('PAGE FETCH error:', error.message);
                resolve({ success: false, message: error.message });
            });
            request.end();
        });
    } catch (error) {
        return { success: false, message: error.message };
    }
});

// IPC handler for webview screenshot requests (legacy - kept as fallback)
ipcMain.handle('webview:screenshot', async (event, webviewId) => {
    try {
        const { webContents } = require('electron');
        const guestWebContents = webContents.fromId(webviewId);

        if (!guestWebContents) {
            return { success: false, message: 'Webview not found or ready' };
        }

        const image = await guestWebContents.capturePage();

        if (!image) {
            return { success: false, message: 'Screenshot capture returned empty image' };
        }

        const buffer = image.toPNG();
        const base64Data = buffer.toString('base64');

        // Push screenshot to REST API for secondary display
        try {
            const server = require('./server.js');
            server.updateScreenshot(base64Data);
        } catch (e) {
            // Server may not be running
        }

        return { success: true, data: base64Data, size: buffer.length };

    } catch (error) {
        return { success: false, message: error.message };
    }
});

// --- PDF Accumulator IPC Handlers ---
// These allow the renderer to capture page PDFs during "Add Current Page" (incAmt=0)
// and let the server return the accumulated combined PDF on DL=true.

const pdfAccumulator = require('./src/pdf-accumulator.cjs');

// IPC: add a page's PDF data to the accumulator (called from renderer after "Add Current Page")
ipcMain.handle('pdf:addPage', async (event, { base64Data, state }) => {
    try {
        const result = await pdfAccumulator.addPage(base64Data, state);
        log('PDF ACCUM: Added page', result.pageCount, 'to', result.filename);
        return { success: true, ...result };
    } catch (err) {
        log('PDF ACCUM: Error adding page:', err.message);
        return { success: false, error: err.message };
    }
});

// IPC: get the accumulated combined PDF info (path, filename, page count)
ipcMain.handle('pdf:getCombined', async () => {
    return pdfAccumulator.getCombinedPdf();
});

// IPC: get the accumulated combined PDF as base64 data (for API response)
ipcMain.handle('pdf:getCombinedBase64', async () => {
    try {
        const result = pdfAccumulator.getCombinedPdfBase64();
        if (result) {
            log('PDF ACCUM: Returning combined PDF:', result.filename, '(' + result.pageCount + ' pages, ' + result.size + ' bytes)');
        } else {
            log('PDF ACCUM: No combined PDF available');
        }
        return result;
    } catch (err) {
        log('PDF ACCUM: Error reading combined PDF:', err.message);
        return null;
    }
});

// IPC: delete the accumulated PDF and associated individual page files
// Called when a new search starts (discard old accumulation) or after confirmed download
ipcMain.handle('pdf:delete', () => {
    try {
        pdfAccumulator.deleteCombined();
        log('PDF ACCUM: Deleted accumulated PDF');
        return { success: true };
    } catch (err) {
        log('PDF ACCUM: Error deleting:', err.message);
        return { success: false, error: err.message };
    }
});
