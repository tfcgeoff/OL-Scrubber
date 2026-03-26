/**
 * Screenshot Module - Handles real image capture from webview
 */

import { addLog } from './logger.js';

/**
 * Wait for the page to fully load using spinner detection
 * Sequence:
 * 1. Wait for spinner to appear (page change started)
 * 2. Poll every 10ms until spinner is gone (page loaded)
 * 3. Wait 25ms buffer
 * 4. Resolve (ready for screenshot)
 * @param {HTMLElement} webview - The webview element
 * @returns {Promise} Promise that resolves when page is ready
 */
async function waitForCanvasReady(webview) {
    const maxWaitForSpinner = 2000; // Max 2 seconds to wait for spinner to appear
    const maxWaitForLoad = 10000; // Max 10 seconds to wait for spinner to disappear
    const pollInterval = 10; // 10ms between polls

    addLog('info', 'Waiting for page load...');

    return new Promise((resolve) => {
        // Step 1: Wait for spinner to appear (constant while loop)
        const startTime = Date.now();
        const checkForSpinner = () => {
            webview.executeJavaScript(`
                (() => {
                    const loader = document.querySelector('.loader');
                    return { hasSpinner: !!loader };
                })()
            `).then(result => {
                if (result.hasSpinner) {
                    addLog('info', 'Spinner detected - page change started');
                    // Step 2: Wait for spinner to disappear (setInterval 10ms)
                    waitForSpinnerGone();
                } else if (Date.now() - startTime < maxWaitForSpinner) {
                    // Keep checking for spinner
                    setTimeout(checkForSpinner, pollInterval);
                } else {
                    // Spinner never appeared - might already be loaded or error
                    addLog('warning', 'Spinner never appeared - assuming page is already loaded');
                    waitForSpinnerGone();
                }
            }).catch(err => {
                addLog('error', 'Spinner check failed: ' + err.message);
                waitForSpinnerGone(); // Continue anyway
            });
        };

        // Step 2: Poll every 10ms until spinner is gone
        const waitForSpinnerGone = () => {
            const loadStartTime = Date.now();
            let intervalId = null;

            const pollForLoad = () => {
                webview.executeJavaScript(`
                    (() => {
                        const loader = document.querySelector('.loader');
                        const canvas = document.querySelector('canvas');
                        return {
                            hasSpinner: !!loader,
                            hasCanvas: !!canvas,
                            canvasWidth: canvas ? canvas.width : 0,
                            canvasHeight: canvas ? canvas.height : 0
                        };
                    })()
                `).then(result => {
                    if (!result.hasSpinner && result.hasCanvas) {
                        // Spinner is gone and canvas exists
                        if (intervalId) {
                            clearInterval(intervalId);
                            intervalId = null;
                        }
                        addLog('success', 'Spinner gone, canvas present', {
                            width: result.canvasWidth,
                            height: result.canvasHeight
                        });

                        // Step 3: Wait 25ms buffer before resolving
                        setTimeout(() => {
                            addLog('success', 'Page fully loaded - ready for screenshot');
                            resolve();
                        }, 25);
                    } else if (Date.now() - loadStartTime < maxWaitForLoad) {
                        // Still loading, continue polling
                        // (interval will call this again)
                    } else {
                        // Timeout - spinner never went away
                        if (intervalId) {
                            clearInterval(intervalId);
                            intervalId = null;
                        }
                        addLog('error', 'Timeout waiting for spinner to disappear - taking screenshot anyway');
                        resolve();
                    }
                }).catch(err => {
                    addLog('error', 'Load poll failed: ' + err.message);
                    if (intervalId) {
                        clearInterval(intervalId);
                        intervalId = null;
                    }
                    resolve(); // Continue anyway
                });
            };

            // Start polling every 10ms
            intervalId = setInterval(pollForLoad, pollInterval);
            // Immediate first check
            pollForLoad();
        };

        // Start the process
        checkForSpinner();
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

    // Wait for page to fully load before taking screenshot
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
