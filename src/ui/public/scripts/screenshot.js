/**
 * Screenshot Module - Handles real image capture from webview
 */

import { addLog } from './logger.js';

/**
 * Capture a screenshot image from the webview
 * @param {HTMLElement} webview - The webview element
 * @param {Function} callback - Callback function(base64Data) when screenshot is ready
 */
export function captureScreenshot(webview, callback) {
    addLog('info', 'Starting screenshot capture...');

    // Validate webview element
    if (!webview) {
        addLog('error', 'Webview element is null or undefined');
        callback(null);
        return;
    }

    // Check if getWebContentsId method exists
    if (typeof webview.getWebContentsId !== 'function') {
        addLog('error', 'webview.getWebContentsId is not a function');
        callback(null);
        return;
    }

    // Get the webview's ID (this identifies the guest WebContents in the main process)
    const webviewId = webview.getWebContentsId();

    if (!webviewId || webviewId <= 0) {
        addLog('error', 'Invalid webview ID: ' + webviewId + ' - webview may not be ready');
        callback(null);
        return;
    }

    addLog('info', 'Webview ID: ' + webviewId);

    // Check if the electronAPI is available
    if (!window.electronAPI || typeof window.electronAPI.captureWebviewScreenshot !== 'function') {
        addLog('error', 'electronAPI.captureWebviewScreenshot is not available');
        callback(null);
        return;
    }

    // Call the IPC method to capture screenshot from main process
    addLog('info', 'Calling IPC to capture screenshot...');

    window.electronAPI.captureWebviewScreenshot(webviewId)
        .then(result => {
            addLog('info', 'IPC screenshot response received', {
                success: result.success,
                hasData: !!result.data
            });

            if (result.success && result.data) {
                addLog('success', 'Screenshot captured via IPC', {
                    size: result.size || 'unknown'
                });
                callback(result.data);
            } else {
                addLog('error', 'Screenshot capture failed: ' + (result.message || 'Unknown error'));
                callback(null);
            }
        })
        .catch(error => {
            addLog('error', 'IPC screenshot call failed: ' + error.message);
            callback(null);
        });
}
