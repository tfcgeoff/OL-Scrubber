/**
 * Electron Preload Script - Bridge between UI and Main Process
 *
 * Single Responsibility: Expose safe IPC APIs to renderer process
 */

const { contextBridge, ipcRenderer } = require('electron');

// Expose protected APIs to renderer
contextBridge.exposeInMainWorld('electronAPI', {
    // Automation control
    startAutomation: () => ipcRenderer.invoke('automation:start'),
    stopAutomation: () => ipcRenderer.invoke('automation:stop'),
    getAutomationStatus: () => ipcRenderer.invoke('automation:status'),

    // Search
    performSearch: (data) => ipcRenderer.invoke('automation:search', data),

    // Navigation
    navigate: (data) => ipcRenderer.invoke('automation:navigate', data),

    // Screenshot
    getScreenshot: () => ipcRenderer.invoke('automation:screenshot'),

    // Webview screenshot - capture webview content
    captureWebviewScreenshot: (webviewId) => ipcRenderer.invoke('webview:screenshot', webviewId),

    // Logs
    getLogs: (since) => ipcRenderer.invoke('logs:get', since),
    clearLogs: () => ipcRenderer.invoke('logs:clear')
});
