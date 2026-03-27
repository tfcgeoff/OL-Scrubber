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

    // Load search config JSON
    loadSearchConfig: () => ipcRenderer.invoke('dialog:openSearchConfig'),

    // Download methods
    getDownloadDir: () => ipcRenderer.invoke('download:getDir'),
    setDownloadDir: () => ipcRenderer.invoke('download:setDir'),
    getLastDownload: () => ipcRenderer.invoke('download:getLast'),
    onDownloadComplete: (callback) => ipcRenderer.on('download:complete', (_event, data) => callback(data)),

    // State sync for REST API
    pushState: (state) => ipcRenderer.invoke('state:update', state),

    // Push screenshot from renderer to main process (for REST API)
    pushScreenshot: (base64Data) => ipcRenderer.invoke('screenshot:update', base64Data),

    // Push activity log to REST API for remote viewing
    pushLog: (logEntry) => ipcRenderer.invoke('log:push', logEntry),

    // Nav command from REST API
    onNavCommand: (callback) => ipcRenderer.on('nav:execute', (_event, command) => callback(command)),

    // Search command from REST API
    onSearchCommand: (callback) => ipcRenderer.on('search:execute', (_event, params) => callback(params)),

    // Next book command from REST API
    onNextBookCommand: (callback) => ipcRenderer.on('next-book:execute', (_event, params) => callback(params)),

    // Intercepted Onland page API URLs (from main process network filter)
    onPageApiUrl: (callback) => ipcRenderer.on('onland:pageApiUrl', (_event, data) => callback(data)),

    // Direct page image fetch from Onland API (uses captured auth token)
    fetchPageImage: (pageNumber) => ipcRenderer.invoke('page:fetch', { pageNumber }),

    // Logs
    getLogs: (since) => ipcRenderer.invoke('logs:get', since),
    clearLogs: () => ipcRenderer.invoke('logs:clear')
});
