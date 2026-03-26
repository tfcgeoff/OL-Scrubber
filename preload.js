/**
 * Electron Preload Script - Bridge between UI and Main Process
 *
 * Single Responsibility: Expose safe IPC APIs to renderer process
 */

const { contextBridge, ipcRenderer } = require('electron');

// Expose protected APIs to renderer
contextBridge.exposeInMainWorld('electronAPI', {
    // Webview screenshot
    captureWebviewScreenshot: (webviewId) => ipcRenderer.invoke('webview:screenshot', webviewId),

    // Logs
    getLogs: (since) => ipcRenderer.invoke('logs:get', since),
    clearLogs: () => ipcRenderer.invoke('logs:clear')
});
