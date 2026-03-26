/**
 * Electron Main Process - Onland Data Entry App
 *
 * Single Responsibility: Bootstrap Electron app and manage IPC
 */

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// Disable GPU to prevent crashes on Linux
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');

// Check for --dev flag before anything else
const isDev = process.argv.includes('--dev');

let mainWindow = null;
const boundsPath = path.join(app.getPath('userData'), 'window-bounds.json');
const defaultBounds = { width: 1600, height: 900, x: 100, y: 0 };

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
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// IPC handler for webview screenshot requests
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

        return { success: true, data: base64Data, size: buffer.length };

    } catch (error) {
        return { success: false, message: error.message };
    }
});
