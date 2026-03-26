/**
 * Screenshot Module - Handles real image capture from webview
 */

import { addLog } from './logger.js';

/**
 * Wait for the canvas element to be loaded with actual content
 * @param {HTMLElement} webview - The webview element
 * @returns {Promise} Promise that resolves when canvas is ready
 */
async function waitForCanvasReady(webview) {
    const maxPolls = 100; // 10 seconds total (100 * 100ms)
    const pollDelay = 100; // 100ms between polls

    addLog('info', 'Waiting for canvas to load...');

    return new Promise((resolve, reject) => {
        const poll = (pollCount = 0) => {
            webview.executeJavaScript(`
                (() => {
                    // Find the canvas element
                    const canvas = document.querySelector('canvas');

                    if (!canvas) {
                        return { ready: false, reason: 'No canvas found' };
                    }

                    // Check if canvas has valid dimensions
                    if (canvas.width <= 0 || canvas.height <= 0) {
                        return { ready: false, reason: 'Canvas has no dimensions', width: canvas.width, height: canvas.height };
                    }

                    // Check if canvas has actual content (not blank/transparent)
                    const ctx = canvas.getContext('2d');
                    if (!ctx) {
                        return { ready: false, reason: 'Cannot get canvas context' };
                    }

                    // Sample a few pixels to check if there's actual content
                    // Get image data from center of canvas
                    const sampleX = Math.floor(canvas.width / 2);
                    const sampleY = Math.floor(canvas.height / 2);
                    const pixelData = ctx.getImageData(sampleX, sampleY, 1, 1).data;

                    // Check if pixel is not transparent (alpha > 0)
                    const hasContent = pixelData[3] > 0;

                    if (!hasContent) {
                        return { ready: false, reason: 'Canvas appears blank (transparent pixels)', pixelData: pixelData };
                    }

                    // Canvas is ready with content
                    return {
                        ready: true,
                        width: canvas.width,
                        height: canvas.height,
                        pixelData: pixelData
                    };
                })()
            `).then(result => {
                if (result.ready) {
                    addLog('success', 'Canvas ready with content', {
                        width: result.width,
                        height: result.height
                    });
                    resolve();
                } else if (pollCount < maxPolls) {
                    // Log every 10 polls (every 1 second) to avoid spam
                    if (pollCount % 10 === 0) {
                        addLog('info', 'Waiting for canvas... ' + result.reason);
                    }
                    // Poll again
                    setTimeout(() => poll(pollCount + 1), pollDelay);
                } else {
                    // Max polls reached - canvas never became ready
                    addLog('error', 'Canvas not ready after 10 seconds - taking screenshot anyway');
                    resolve(); // Resolve anyway so we can attempt screenshot
                }
            }).catch(err => {
                addLog('error', 'Canvas check failed: ' + err.message);
                resolve(); // Resolve anyway so we can attempt screenshot
            });
        };

        poll();
    });
}

/**
 * Capture a screenshot image from the webview
 * @param {HTMLElement} webview - The webview element
 * @param {Function} callback - Callback function(base64Data) when screenshot is ready
 */
export async function captureScreenshot(webview, callback) {
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

    // Wait for canvas to be ready before taking screenshot
    await waitForCanvasReady(webview);

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
