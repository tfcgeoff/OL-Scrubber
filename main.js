/**
 * Electron Main Process - Onland Data Entry App
 *
 * Single Responsibility: Bootstrap Electron app and manage IPC
 */

const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');
const fs = require('fs');

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
            console.log('GPU: Using saved config — device:', saved.device);
        } else if (saved.disabled) {
            app.commandLine.appendSwitch('disable-gpu');
            app.commandLine.appendSwitch('disable-software-rasterizer');
            console.log('GPU: Using saved config — software rendering');
        } else {
            console.log('GPU: Using saved config — default hardware');
        }

        // Listen for GPU crash — if it crashes, fall back and re-save
        app.on('gpu-process-crashed', () => {
            console.log('GPU: Saved config crashed, falling back to software rendering');
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
            console.log('GPU: Found', renderNodes.length, 'render nodes, trying:', device);

            // Mark for validation — if no crash within 5s, save as working
            setTimeout(() => {
                console.log('GPU: No crash after 5s — saving config');
                saveGpuConfig({ working: true, disabled: false, device, platform, timestamp: Date.now() });
            }, 5000);

            app.on('gpu-process-crashed', () => {
                console.log('GPU:', device, 'crashed — trying next node or falling back');
                saveGpuConfig({ working: true, disabled: true, device: null, platform, timestamp: Date.now() });
                // Will use software rendering on next launch
            });
        } else {
            console.log('GPU: No DRI render nodes found — using software rendering');
            app.commandLine.appendSwitch('disable-gpu');
            app.commandLine.appendSwitch('disable-software-rasterizer');
            saveGpuConfig({ working: true, disabled: true, device: null, platform, timestamp: Date.now() });
        }
    } else if (platform === 'win32') {
        // Windows: try hardware GPU first (default Chromium behavior)
        console.log('GPU: Windows detected — trying hardware acceleration');
        // No flags needed — Chromium uses the best available GPU by default

        // If it crashes, fall back to software rendering
        setTimeout(() => {
            console.log('GPU: No crash after 5s — saving config');
            saveGpuConfig({ working: true, disabled: false, device: null, platform, timestamp: Date.now() });
        }, 5000);

        app.on('gpu-process-crashed', () => {
            console.log('GPU: Hardware acceleration crashed — falling back to software');
            app.commandLine.appendSwitch('disable-gpu');
            app.commandLine.appendSwitch('disable-software-rasterizer');
            saveGpuConfig({ working: true, disabled: true, device: null, platform, timestamp: Date.now() });
        });
    } else {
        // macOS or other — try hardware first
        console.log('GPU: Unknown platform (' + platform + ') — trying hardware acceleration');
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
const restPort = portArg ? parseInt(portArg.split('=')[1], 10) : 3000;

let mainWindow = null;
const boundsPath = path.join(app.getPath('userData'), 'window-bounds.json');
const defaultBounds = { width: 1600, height: 900, x: 100, y: 0 };

// Download state
let downloadDirPath = path.join(app.getPath('home'), 'Documents', 'Onland', 'Downloads');
let lastDownload = null;

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

    mainWindow = new BrowserWindow({
        width: bounds.width,
        height: bounds.height,
        minWidth: 1200,
        x: bounds.x,
        y: bounds.y,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
            webviewTag: true,
            nodeIntegrationInSubFrames: true
        }
    });

    mainWindow.loadFile(path.join(__dirname, 'src', 'ui', 'public', 'index.html'));

    if (isDev) {
        mainWindow.webContents.openDevTools();
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    mainWindow.on('resize', saveBounds);
    mainWindow.on('move', saveBounds);
    mainWindow.on('close', saveBounds);

    return mainWindow;
}

// App lifecycle events
app.whenReady().then(() => {
    console.log('Electron ready, creating window...');
    createWindow();
    console.log('Window created, webview will load onland.ca directly');

    // Set up download interception on the webview's session partition
    const ses = session.fromPartition('persist:onland');

    // Intercept network requests to capture Onland page API URL pattern
    // Onland loads book pages via: POST https://www.onland.ca/api/v1/books/transactions/{id}/pages?page=N
    // We only observe — the callback must pass the request through unchanged
    ses.webRequest.onBeforeRequest(
        { urls: ['*://www.onland.ca/api/v1/books/transactions/*/pages*'] },
        (details, callback) => {
            console.log('ONLAND PAGE API:', details.url, details.method);
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
                console.log('Download complete:', savePath);
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('download:complete', { filename, path: savePath });
                }
            }
        });
    });

    // Start REST API server for secondary display
    try {
        const server = require('./server.js');
        server.startServer(restPort, mainWindow);
        console.log('REST API server started on port ' + restPort);
    } catch (err) {
        console.error('Failed to start REST API server:', err.message);
    }
});

app.on('window-all-closed', () => {
    // Stop REST API server
    try {
        const server = require('./server.js');
        server.stopServer();
    } catch (e) {
        // Server module may not have loaded
    }

    if (process.platform !== 'darwin') {
        app.quit();
    }
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
