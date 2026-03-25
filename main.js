/**
 * Electron Main Process - Onland Data Entry App
 *
 * Single Responsibility: Bootstrap Electron app and manage automation
 */

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
// const { start_orchestrator, get_orchestrator } = require('./src/api/orchestrator_manager');

// Disable GPU to prevent crashes on Linux
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');

let mainWindow = null;
let isDev = false;


function createWindow() {
    /** Create the main browser window */
    mainWindow = new BrowserWindow({
        width: 1600,
        height: 900,
        minWidth: 1200,
        x: 100,  // Position on the left side
        y: 0,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
            webviewTag: true,  // Enable webview tag
            nodeIntegrationInSubFrames: true
        }
    });

    mainWindow.loadFile(path.join(__dirname, 'src', 'ui', 'public', 'index.html'));

    // Open DevTools in development
    if (isDev) {
        mainWindow.webContents.openDevTools();
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    return mainWindow;
}


// App lifecycle events
app.whenReady().then(async () => {
    console.log('Electron ready, creating window...');

    // Create window
    createWindow();

    console.log('Window created, webview will load onland.ca directly');
});


app.on('window-all-closed', () => {
    // On macOS, keep app running when all windows closed
    if (process.platform !== 'darwin') {
        app.quit();
    }
});


app.on('activate', () => {
    // On macOS, recreate window when dock icon clicked
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});


// IPC handlers for automation control
ipcMain.handle('automation:start', async () => {
    try {
        const success = await start_orchestrator();
        return { success: success };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('automation:stop', async () => {
    try {
        const orchestrator = get_orchestrator();
        await orchestrator.stop();
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('automation:status', async () => {
    const orchestrator = get_orchestrator();
    return orchestrator.get_status();
});

ipcMain.handle('automation:search', async (event, data) => {
    const orchestrator = get_orchestrator();
    const results = await orchestrator.search_books(
        data.lro,
        data.description,
        data.descriptionNumber,
        data.category
    );

    // Capture screenshot after search
    const { base64_image } = await orchestrator.get_current_page_screenshot();

    return {
        ...results,
        screenshot: base64_image,
        current_page: orchestrator.navigator.current_page
    };
});

ipcMain.handle('automation:navigate', async (event, data) => {
    const orchestrator = get_orchestrator();
    const result = await orchestrator.process_navigation_decision(data.decision);

    // Capture screenshot after navigation
    if (result.status === 'moved' || result.status === 'page_added') {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const { base64_image } = await orchestrator.get_current_page_screenshot();
        result.screenshot = base64_image;
        result.current_page = orchestrator.navigator.current_page;
    }

    return result;
});

ipcMain.handle('automation:screenshot', async () => {
    const orchestrator = get_orchestrator();
    const { base64_image, filepath } = await orchestrator.get_current_page_screenshot();
    return {
        screenshot: base64_image,
        current_page: orchestrator.navigator.current_page
    };
});

ipcMain.handle('logs:get', async (event, since) => {
    const { get_log_manager } = require('./src/automation/log_manager');
    const log_manager = get_log_manager();
    return log_manager.get_logs(since);
});

ipcMain.handle('logs:clear', async () => {
    const { get_log_manager } = require('./src/automation/log_manager');
    const log_manager = get_log_manager();
    log_manager.clear();
    return { success: true };
});

// Handle webview screenshot requests
ipcMain.handle('webview:screenshot', async (event, webviewId) => {
    // Find the webview element in the renderer
    // This requires sending a message back to renderer to get the screenshot
    // For now, return a simple base64 placeholder
    return {
        success: false,
        message: 'Webview screenshot requires direct access from renderer process'
    };
});


// Export for testing
if (require.main === module) {
    // Check for --dev flag
    isDev = process.argv.includes('--dev');
}
