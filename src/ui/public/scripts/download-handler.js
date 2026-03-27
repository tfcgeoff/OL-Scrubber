/**
 * Download Handler Module - Executes the Onland download flow for selected pages
 *
 * Flow:
 * 1. Click "Request Selected Pages"
 * 2. Poll for "Continue" popup, click it
 * 3. Poll for "Download" link, click it
 * 4. Main process intercepts the download via will-download event
 */

import { addLog } from './logger.js';
import { getWebview } from './webview-manager.js';
import { showStatus } from './ui.js';

/**
 * Set up the Download Selected button
 * @param {HTMLButtonElement} downloadBtn - The Download Selected button element
 */
export function setupDownloadHandler(downloadBtn) {
    downloadBtn.addEventListener('click', () => {
        const webview = getWebview();
        if (!webview) {
            addLog('error', 'Webview not available for download');
            showStatus('Webview not available', 'error');
            return;
        }

        // Listen for download completion
        if (window.electronAPI && window.electronAPI.onDownloadComplete) {
            window.electronAPI.onDownloadComplete((data) => {
                addLog('success', 'Download complete', { filename: data.filename, path: data.path });
                showStatus('Downloaded: ' + data.filename, 'success');
            });
        }

        executeDownloadFlow(webview);
    });
}

/**
 * Execute the full download flow in the webview
 * @param {HTMLElement} webview - The webview element
 */
async function executeDownloadFlow(webview) {
    addLog('info', 'Starting download flow...');

    try {
        // Step 1: Click "Request Selected Pages"
        const step1Result = await webview.executeJavaScript(`
            (() => {
                const buttons = Array.from(document.querySelectorAll('button'));
                const requestBtn = buttons.find(b => b.textContent.includes('Request Selected Pages'));
                if (!requestBtn) {
                    return { success: false, message: 'Request Selected Pages button not found' };
                }
                requestBtn.click();
                return { success: true };
            })()
        `);

        if (!step1Result || !step1Result.success) {
            addLog('error', 'Step 1 failed: ' + (step1Result ? step1Result.message : 'no result'));
            showStatus('Download failed: Request button not found', 'error');
            return;
        }

        addLog('info', 'Step 1: Request Selected Pages clicked');

        // Step 2: Poll for "Continue" popup and click it
        const step2Result = await pollAndClick(webview, 'button[aria-describedby="reviewFooterNote"]', 'Continue', 10000);
        if (!step2Result) {
            addLog('error', 'Step 2 failed: Continue button not found');
            showStatus('Download failed: Continue button not found', 'error');
            return;
        }

        addLog('info', 'Step 2: Continue clicked');

        // Step 3: Poll for "Download" link and click it
        const step3Result = await pollAndClick(webview, 'button.link-appearance', 'Download', 10000);
        if (!step3Result) {
            addLog('error', 'Step 3 failed: Download link not found');
            showStatus('Download failed: Download link not found', 'error');
            return;
        }

        addLog('info', 'Step 3: Download link clicked - waiting for file...');
        showStatus('Download in progress...', 'info');
    } catch (error) {
        addLog('error', 'Download flow error: ' + error.message);
        showStatus('Download error: ' + error.message, 'error');
    }
}

/**
 * Poll for an element and click it when found
 * @param {HTMLElement} webview - The webview element
 * @param {string} selector - CSS selector for the element
 * @param {string} label - Human-readable label for logging
 * @param {number} timeout - Max wait time in ms
 * @returns {Promise<boolean>} True if element was found and clicked
 */
function pollAndClick(webview, selector, label, timeout) {
    return new Promise((resolve) => {
        const startTime = Date.now();

        const poll = () => {
            if (Date.now() - startTime > timeout) {
                resolve(false);
                return;
            }

            webview.executeJavaScript(`
                (() => {
                    const el = document.querySelector('${selector}');
                    if (el) {
                        el.click();
                        return { found: true };
                    }
                    return { found: false };
                })()
            `).then(result => {
                if (result && result.found) {
                    resolve(true);
                } else {
                    setTimeout(poll, 500);
                }
            }).catch(() => {
                setTimeout(poll, 500);
            });
        };

        poll();
    });
}
