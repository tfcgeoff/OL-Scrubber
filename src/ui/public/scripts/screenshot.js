/**
 * Screenshot Module - Captures page images via fetch interceptor in webview
 *
 * Injects a fetch interceptor into the webview that captures page image responses
 * from the Onland API as they flow through. Stores them in window.__onlandPageImages.
 * captureScreenshot() reads from that cache — no separate API call needed.
 *
 * Previous approaches:
 * - canvas.toDataURL() — fails on cross-origin tainted canvases
 * - webContents.capturePage() — captures entire page including UI chrome
 * - Direct API fetch (page:fetch IPC) — auth token timing issues
 */

import { addLog } from './logger.js';
import { getState } from './variables.js';

// Module-level flag (may be stale if webview reloaded — always verify in webview)
let interceptorInstalled = false;

/**
 * Check if the fetch interceptor is actually installed in the webview.
 * The module-level flag can be stale after webview navigates/reloads.
 */
async function isInterceptorActive(webview) {
    try {
        return await webview.executeJavaScript(`!!window.__fetchInterceptorInstalled`);
    } catch (e) {
        return false;
    }
}

/**
 * Inject a fetch interceptor into the webview to capture page image responses.
 * Intercepts both fetch() and XMLHttpRequest for maximum compatibility.
 * Stores captured images in window.__onlandPageImages[pageNumber].
 * @param {HTMLElement} webview - The webview element
 */
export async function installFetchInterceptor(webview) {
    if (!webview) return;

    // Always check the webview's actual state (it may have reloaded)
    if (await isInterceptorActive(webview)) {
        interceptorInstalled = true;
        return;
    }

    try {
        await webview.executeJavaScript(`
            (() => {
                if (window.__fetchInterceptorInstalled) return;
                window.__onlandPageImages = {};
                window.__fetchInterceptCount = 0;

                // Helper: store captured page data
                function storePageImage(pageNum, base64Data, contentType, size) {
                    if (!pageNum) return;
                    window.__onlandPageImages[pageNum] = {
                        base64Data: base64Data,
                        contentType: contentType,
                        size: size,
                        ts: Date.now()
                    };
                    window.__fetchInterceptCount++;
                }

                // Helper: convert ArrayBuffer to base64
                function bufferToBase64(buffer) {
                    const bytes = new Uint8Array(buffer);
                    const chunkSize = 8192;
                    let binary = '';
                    for (let i = 0; i < bytes.length; i += chunkSize) {
                        const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
                        binary += String.fromCharCode.apply(null, chunk);
                    }
                    return btoa(binary);
                }

                // --- Intercept fetch() ---
                const origFetch = window.fetch;
                window.fetch = async function(...args) {
                    const resp = await origFetch.apply(this, args);
                    try {
                        const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');

                        if (url.includes('/transactions/') && url.includes('/pages?page=') && resp.ok) {
                            const pageMatch = url.match(/page=(\\d+)/);
                            const pageNum = pageMatch ? parseInt(pageMatch[1], 10) : null;
                            const ct = resp.headers.get('content-type') || '';

                            if (ct.includes('json')) {
                                // JSON response — extract base64 content field
                                resp.clone().json().then(json => {
                                    if (json.content) {
                                        storePageImage(pageNum, json.content, ct, json.content.length);
                                    }
                                }).catch(() => {});
                            } else {
                                // Binary response — encode to base64
                                resp.clone().arrayBuffer().then(buf => {
                                    const b64 = bufferToBase64(buf);
                                    storePageImage(pageNum, b64, ct, buf.byteLength);
                                }).catch(() => {});
                            }
                        }
                    } catch(e) {}
                    return resp;
                };

                // --- Intercept XMLHttpRequest ---
                const origXhrOpen = XMLHttpRequest.prototype.open;
                const origXhrSend = XMLHttpRequest.prototype.send;
                XMLHttpRequest.prototype.open = function(method, url, ...rest) {
                    this.__interceptUrl = url;
                    return origXhrOpen.apply(this, [method, url, ...rest]);
                };
                XMLHttpRequest.prototype.send = function(...args) {
                    try {
                        this.addEventListener('load', function() {
                            const url = this.__interceptUrl || '';
                            if (url.includes('/transactions/') && url.includes('/pages?page=')) {
                                const pageMatch = url.match(/page=(\\d+)/);
                                const pageNum = pageMatch ? parseInt(pageMatch[1], 10) : null;
                                const ct = this.getResponseHeader('content-type') || '';

                                if (ct.includes('json')) {
                                    try {
                                        const json = JSON.parse(this.responseText);
                                        if (json.content) {
                                            storePageImage(pageNum, json.content, ct, json.content.length);
                                        }
                                    } catch(e) {}
                                } else if (this.responseType === 'arraybuffer' || this.response instanceof ArrayBuffer) {
                                    const b64 = bufferToBase64(this.response);
                                    storePageImage(pageNum, b64, ct, this.response.byteLength);
                                } else {
                                    // Text response — try base64 encoding
                                    const b64 = btoa(this.responseText);
                                    storePageImage(pageNum, b64, ct, this.responseText.length);
                                }
                            }
                        });
                    } catch(e) {}
                    return origXhrSend.apply(this, args);
                };

                window.__fetchInterceptorInstalled = true;
            })()
        `);

        interceptorInstalled = true;
        addLog('info', 'Fetch interceptor installed in webview');
    } catch (err) {
        addLog('error', 'Failed to install fetch interceptor: ' + err.message);
    }
}

/**
 * Capture a page image from the webview's intercepted fetch responses.
 * Falls back to direct API fetch via page:fetch IPC if interceptor has no data.
 * @param {HTMLElement} webview - The webview element
 * @param {Function} callback - Callback function(base64Data) when image is ready
 */
export async function captureScreenshot(webview, callback) {
    addLog('info', 'Capturing page image...');

    if (!webview) {
        addLog('error', 'Webview not available');
        callback(null);
        return;
    }

    const currentPage = getState('currentPage');
    if (!currentPage) {
        addLog('error', 'No current page in state');
        callback(null);
        return;
    }

    // Try 1: Read from webview's fetch interceptor cache
    await installFetchInterceptor(webview);

    try {
        const result = await webview.executeJavaScript(`
            (() => {
                const page = ${currentPage};
                const img = window.__onlandPageImages && window.__onlandPageImages[page];
                if (img) {
                    return { found: true, base64Data: img.base64Data, contentType: img.contentType, size: img.size };
                }
                return { found: false, interceptorInstalled: !!window.__fetchInterceptorInstalled, interceptCount: window.__fetchInterceptCount || 0 };
            })()
        `);

        if (result && result.found) {
            addLog('success', 'Page image from intercepted response', { page: currentPage, size: result.size });
            // Push to REST API for secondary display
            if (window.electronAPI && window.electronAPI.pushScreenshot) {
                window.electronAPI.pushScreenshot(result.base64Data);
            }
            callback(result.base64Data);
            return;
        }
    } catch (e) {
        addLog('warning', 'Interceptor read failed: ' + e.message);
    }

    // Try 2: Direct API fetch via main process (uses captured auth token + session)
    addLog('info', 'Trying direct API fetch for page ' + currentPage + '...');
    if (!window.electronAPI || typeof window.electronAPI.fetchPageImage !== 'function') {
        addLog('error', 'electronAPI.fetchPageImage not available');
        callback(null);
        return;
    }

    try {
        const result = await window.electronAPI.fetchPageImage(currentPage);

        if (result.success && result.data) {
            addLog('success', 'Page image fetched via API', {
                page: currentPage,
                size: result.size,
                contentType: result.contentType
            });
            // Already pushed to REST API by page:fetch handler in main process
            callback(result.data);
        } else {
            addLog('error', 'API fetch failed: ' + (result.message || 'Unknown error'));
            callback(null);
        }
    } catch (error) {
        addLog('error', 'API fetch error: ' + error.message);
        callback(null);
    }
}
