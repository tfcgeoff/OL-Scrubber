/**
 * Search Handler Module - Main search orchestration
 */

import { addLog } from './logger.js';
import { showStatus } from './ui.js';
import { getWebview } from './webview-manager.js';
import { generateFormFillScript } from './form-filler.js';
import { pollForPageCount } from './page-navigator.js';
import { captureScreenshot } from './screenshot.js';

/**
 * Capture screenshot and display it in the log
 * @param {HTMLElement} webview - The webview element
 */
function takeAndDisplayScreenshot(webview) {
    captureScreenshot(webview, (base64Data) => {
        if (base64Data) {
            addLog('info', 'Screenshot captured', null, base64Data);
        } else {
            addLog('error', 'Screenshot capture failed - no data returned');
        }
    });
}

/**
 * Set up the search form event listener
 * @param {HTMLFormElement} searchForm - The search form element
 */
export function setupSearchHandler(searchForm) {
    searchForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const lro = document.getElementById('lro').value.trim();
        const descType = document.getElementById('descriptionType').value;
        const descNumber = document.getElementById('descriptionNumber').value.trim();

        if (!lro || !descNumber) {
            addLog('error', 'Please fill in all fields');
            showStatus('Please fill in LRO and Description Number', 'error');
            return;
        }

        try {
            await executeSearch(lro, descType, descNumber);
        } catch (error) {
            addLog('error', 'Search failed', error.message);
            showStatus('Error: ' + error.message, 'error');
        }
    });
}

/**
 * Execute the search workflow
 * @param {string} lro - The LRO number
 * @param {string} descType - The description type
 * @param {string} descNumber - The description number
 * @returns {Promise} Promise that resolves when search is complete
 */
async function executeSearch(lro, descType, descNumber) {
    const webview = getWebview();

    addLog('info', 'Navigating to search page', { lro, descType, descNumber });

    // Navigate directly to the LRO-specific search page
    const searchUrl = `https://www.onland.ca/ui/${lro}/books/search`;
    webview.src = searchUrl;

    addLog('info', 'Waiting for page load...');

    // Wait for navigation and then fill in the form
    await waitForFormFill(webview, descType, descNumber);
}

/**
 * Wait for form to load and fill it
 * @param {HTMLElement} webview - The webview element
 * @param {string} descType - The description type
 * @param {string} descNumber - The description number
 * @returns {Promise} Promise that resolves when form is filled
 */
function waitForFormFill(webview, descType, descNumber) {
    return new Promise((resolve) => {
        webview.addEventListener('dom-ready', function fillForm() {
            addLog('success', 'Search page loaded');

            // Wait for Angular to render (add delay)
            setTimeout(() => {
                addLog('info', 'Waiting for Angular to render form...');

                const fullScript = generateFormFillScript(descType, descNumber);

                webview.executeJavaScript(fullScript).then(result => {
                    addLog('info', 'Execution complete', result.log);
                    if (result.success) {
                        addLog('success', 'Search submitted!');
                        showStatus('Search submitted successfully', 'success');

                        // Wait for results page and look for "View Details" buttons
                        setTimeout(() => {
                            waitForViewDetails(webview);
                        }, 3000);
                    } else {
                        addLog('warning', 'Search may not have completed');
                        showStatus('May not have completed search', 'warning');
                        resolve();
                    }
                }).catch(err => {
                    addLog('error', 'Execution failed: ' + err.message);
                    console.error('Error:', err);
                    resolve();
                });
            }, 3000); // Wait 3 seconds for Angular

            // Remove this listener after first use
            webview.removeEventListener('dom-ready', fillForm);
        });
    });
}

/**
 * Wait for and click View Details button
 * @param {HTMLElement} webview - The webview element
 * @returns {Promise} Promise that resolves when View Details is clicked
 */
function waitForViewDetails(webview) {
    webview.executeJavaScript(`
        (() => {
            const log = [];

            // Look for View Details buttons
            const viewBtns = document.querySelectorAll('button[aria-label*="View Details"]');
            log.push({ step: 'found view buttons', count: viewBtns.length });

            if (viewBtns.length > 0) {
                const firstBtn = viewBtns[0];
                const ariaLabel = firstBtn.getAttribute('aria-label');
                log.push({ step: 'clicking first button', ariaLabel: ariaLabel, html: firstBtn.outerHTML });

                firstBtn.click();
                log.push({ step: 'clicked view details', success: true });

                return { found: true, clicked: true, log };
            }

            log.push({ step: 'no view buttons found' });
            return { found: false, clicked: false, log };
        })()
    `).then(viewResult => {
        addLog('info', 'View Details click result', viewResult.log);

        // Start polling for page count after book loads
        setTimeout(() => {
            pollForPageCount(webview, () => {
                takeAndDisplayScreenshot(webview);
            });
        }, 1500);
    }).catch(err => {
        addLog('error', 'View Details execution failed: ' + err.message);
    });
}
