/**
 * Screenshot Module - Captures the book canvas directly (not the whole page)
 *
 * Uses canvas.toDataURL() inside the webview to get ONLY the book image,
 * without any UI chrome, side panels, or navigation elements.
 */

import { addLog } from './logger.js';
import {
    SCREENSHOT_SPINNER_APPEAR_MAX,
    SCREENSHOT_SPINNER_GONE_MAX,
    SCREENSHOT_POLL_INTERVAL,
    SCREENSHOT_BUFFER
} from './variables.js';

/**
 * Wait for the page to fully load using spinner detection
 * Sequence:
 * 1. Wait for spinner to appear (page change started)
 * 2. Poll every 10ms until spinner is gone (page loaded)
 * 3. Wait buffer before resolving
 * 4. Resolve (ready for screenshot)
 * @param {HTMLElement} webview - The webview element
 * @returns {Promise} Promise that resolves when page is ready
 */
async function waitForCanvasReady(webview) {
    const maxWaitForSpinner = SCREENSHOT_SPINNER_APPEAR_MAX;
    const maxWaitForLoad = SCREENSHOT_SPINNER_GONE_MAX;
    const pollInterval = SCREENSHOT_POLL_INTERVAL;

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
                        // Find the book canvas - pdf-viewer renders into canvas elements
                        const canvases = document.querySelectorAll('canvas');
                        // Use the largest canvas (the book) not the mobile thumbnail
                        let bookCanvas = null;
                        canvases.forEach(c => {
                            if (!bookCanvas || (c.width * c.height) > (bookCanvas.width * bookCanvas.height)) {
                                bookCanvas = c;
                            }
                        });
                        return {
                            hasSpinner: !!loader,
                            hasCanvas: !!bookCanvas,
                            canvasWidth: bookCanvas ? bookCanvas.width : 0,
                            canvasHeight: bookCanvas ? bookCanvas.height : 0
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

                        // Step 3: Wait buffer before resolving
                        setTimeout(() => {
                            addLog('success', 'Page fully loaded - ready for screenshot');
                            resolve();
                        }, SCREENSHOT_BUFFER);
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
        };

        // Start the process
        checkForSpinner();
    });
}

/**
 * Capture a screenshot of the book canvas directly from the webview.
 * Uses browser Fullscreen API on the pdf-viewer element for maximum resolution,
 * then captures the canvas, then exits fullscreen.
 * @param {HTMLElement} webview - The webview element
 * @param {Function} callback - Callback function(base64Data) when screenshot is ready
 */
export async function captureScreenshot(webview, callback) {
    addLog('info', 'Starting book capture...');

    if (!webview) {
        addLog('error', 'Webview element is null or undefined');
        callback(null);
        return;
    }

    // Wait for page to fully load
    await waitForCanvasReady(webview);

    // Step 1: Record current canvas size for comparison
    const preZoom = await webview.executeJavaScript(`
        (() => {
            const canvases = document.querySelectorAll('canvas');
            let max = 0;
            canvases.forEach(c => { if (c.width * c.height > max) max = c.width * c.height; });
            return max;
        })()
    `);

    // Step 2: Try zoom factor approach for higher resolution
    // Set zoom to 2x which forces PDF.js to re-render canvas at 2x resolution
    let zoomApplied = false;
    try {
        const guestWebContents = webview.getWebContents();
        if (guestWebContents) {
            addLog('info', 'Setting zoom factor to 1.5x for high-res capture...');
            guestWebContents.setZoomFactor(1.5);
            zoomApplied = true;

            // Wait for the zoom to trigger a canvas re-render
            await new Promise((resolve) => {
                const start = Date.now();
                const maxWait = 5000;
                const poll = () => {
                    webview.executeJavaScript(`
                        (() => {
                            const canvases = document.querySelectorAll('canvas');
                            let maxArea = 0;
                            canvases.forEach(c => { if (c.width * c.height > maxArea) maxArea = c.width * c.height; });
                            const loader = document.querySelector('.loader');
                            return { maxArea, hasSpinner: !!loader };
                        })()
                    `).then(result => {
                        if (!result.hasSpinner && result.maxArea > preZoom) {
                            addLog('info', 'Zoom re-render complete', { area: result.maxArea, was: preZoom });
                            resolve();
                        } else if (Date.now() - start < maxWait) {
                            setTimeout(poll, 100);
                        } else {
                            addLog('warning', 'Zoom re-render timed out, capturing at current resolution');
                            resolve();
                        }
                    }).catch(() => resolve());
                };
                poll();
            });
        }
    } catch (err) {
        addLog('warning', 'Zoom factor not supported: ' + err.message);
    }

    // Step 3: Capture the canvas (high-res if zoom worked, normal otherwise)
    try {
        await captureCanvasData(webview, callback);
    } catch (err) {
        addLog('error', 'Canvas capture failed: ' + err.message);
        callback(null);
    }

    // Step 4: Restore zoom to 1.0
    if (zoomApplied) {
        try {
            const guestWebContents = webview.getWebContents();
            if (guestWebContents) guestWebContents.setZoomFactor(1.0);
        } catch (e) {
            // Ignore restore errors
        }
    }

    // // --- OLD: Browser Fullscreen API approach ---
    // // requestFullscreen() does NOT work inside Electron webview context
    // // Keeping as reference in case future Electron versions support it
    //
    // addLog('info', 'Requesting browser fullscreen for max resolution...');
    //
    // const fsResult = await webview.executeJavaScript(`
    //     (() => {
    //         const target = document.querySelector('.fullscreen-target');
    //         if (target && target.requestFullscreen) {
    //             target.requestFullscreen();
    //             return { ok: true };
    //         }
    //         return { ok: false, reason: !target ? 'no .fullscreen-target' : 'no requestFullscreen' };
    //     })()
    // `);
    //
    // if (!fsResult.ok) {
    //     addLog('warning', 'Browser fullscreen unavailable: ' + fsResult.reason);
    //     await captureCanvasData(webview, callback);
    //     return;
    // }
    //
    // // Poll until canvas grows (fullscreen triggered re-render)
    // await new Promise((resolve) => {
    //     const start = Date.now();
    //     const maxWait = 10000;
    //     const poll = () => {
    //         webview.executeJavaScript(`
    //             (() => {
    //                 const canvases = document.querySelectorAll('canvas');
    //                 let maxArea = 0;
    //                 canvases.forEach(c => { if (c.width * c.height > maxArea) maxArea = c.width * c.height; });
    //                 const loader = document.querySelector('.loader');
    //                 return { maxArea, hasSpinner: !!loader };
    //             })()
    //         `).then(result => {
    //             if (!result.hasSpinner && result.maxArea > preFullscreen) {
    //                 addLog('info', 'Fullscreen canvas ready', { area: result.maxArea, was: preFullscreen });
    //                 resolve();
    //             } else if (Date.now() - start < maxWait) {
    //                 setTimeout(poll, 100);
    //             } else {
    //                 addLog('warning', 'Fullscreen poll timed out, capturing anyway');
    //                 resolve();
    //             }
    //         });
    //     };
    //     poll();
    // });
    //
    // await captureCanvasData(webview, callback);
    //
    // webview.executeJavaScript(`
    //     (() => {
    //         if (document.fullscreenElement) {
    //             document.exitFullscreen();
    //         }
    //     })()
    // `);
}

/**
 * Extract canvas data from the webview and invoke callback
 */
async function captureCanvasData(webview, callback) {
    addLog('info', 'Capturing book canvas...');

    webview.executeJavaScript(`
        (() => {
            // Find the largest canvas (the book, not mobile thumbnail)
            const canvases = document.querySelectorAll('canvas');
            let bookCanvas = null;
            let info = [];
            canvases.forEach(c => {
                info.push({ w: c.width, h: c.height, cls: c.className });
                if (!bookCanvas || (c.width * c.height) > (bookCanvas.width * bookCanvas.height)) {
                    bookCanvas = c;
                }
            });

            if (!bookCanvas) {
                return { success: false, message: 'No canvas found', canvases: info };
            }

            const dataUrl = bookCanvas.toDataURL('image/png');
            const base64 = dataUrl.replace(/^data:image\\/png;base64,/, '');
            return {
                success: true,
                data: base64,
                width: bookCanvas.width,
                height: bookCanvas.height,
                canvases: info
            };
        })()
    `).then(result => {
        if (result && result.success && result.data) {
            addLog('success', 'Book captured', {
                width: result.width,
                height: result.height,
                size: result.data.length,
                canvases: result.canvases
            });

            // Push screenshot to REST API via IPC
            if (window.electronAPI && window.electronAPI.pushScreenshot) {
                window.electronAPI.pushScreenshot(result.data);
            }

            callback(result.data);
        } else {
            addLog('error', 'Book capture failed: ' + (result ? result.message : 'no result'));
            callback(null);
        }
    }).catch(error => {
        addLog('error', 'Book capture error: ' + error.message);
        callback(null);
    });
}

// // --- OLD: Full-page screenshot via IPC (captures entire page, not just book) ---
// // Kept as fallback if canvas.toDataURL() doesn't work in webview context
// //
// // export async function captureScreenshot(webview, callback) {
// //     addLog('info', 'Starting screenshot capture...');
// //
// //     if (!webview) {
// //         addLog('error', 'Webview element is null or undefined');
// //         callback(null);
// //         return;
// //     }
// //
// //     if (typeof webview.getWebContentsId !== 'function') {
// //         addLog('error', 'webview.getWebContentsId is not a function');
// //         callback(null);
// //         return;
// //     }
// //
// //     const webviewId = webview.getWebContentsId();
// //     if (!webviewId || webviewId <= 0) {
// //         addLog('error', 'Invalid webview ID: ' + webviewId);
// //         callback(null);
// //         return;
// //     }
// //
// //     if (!window.electronAPI || typeof window.electronAPI.captureWebviewScreenshot !== 'function') {
// //         addLog('error', 'electronAPI.captureWebviewScreenshot is not available');
// //         callback(null);
// //         return;
// //     }
// //
// //     await waitForCanvasReady(webview);
// //
// //     addLog('info', 'Calling IPC to capture screenshot...');
// //
// //     window.electronAPI.captureWebviewScreenshot(webviewId)
// //         .then(result => {
// //             if (result.success && result.data) {
// //                 addLog('success', 'Screenshot captured via IPC', { size: result.size || 'unknown' });
// //                 callback(result.data);
// //             } else {
// //                 addLog('error', 'Screenshot capture failed: ' + (result.message || 'Unknown error'));
// //                 callback(null);
// //             }
// //         })
// //         .catch(error => {
// //             addLog('error', 'IPC screenshot call failed: ' + error.message);
// //             callback(null);
// //         });
// // }
