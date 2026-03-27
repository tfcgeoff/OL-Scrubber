/**
 * Search Handler Module - Main search orchestration
 */

import { addLog } from './logger.js';
import { showStatus } from './ui.js';
import { getWebview } from './webview-manager.js';
// import { generateFormFillScript } from './form-filler.js';
import { pollForPageCount } from './page-navigator.js';
import { captureScreenshot } from './screenshot.js';
import { setState } from './variables.js';
import {
    SEARCH_FORM_MAX_POLLS,
    SEARCH_FORM_POLL_INTERVAL
} from './variables.js';

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

    // Navigate directly to search results URL
    const searchUrl = `https://www.onland.ca/ui/${lro}/books/search/1?lcv1=${encodeURIComponent(descNumber)}&lct1=${encodeURIComponent(descType)}&page=1`;

    // addLog('info', 'Navigating to search results', { url: searchUrl });

    setState('lro', lro);
    setState('descType', descType);
    setState('descNumber', descNumber);
    setState('totalBooks', null);
    setState('totalPages', null);
    setState('currentPage', null);
    webview.src = searchUrl;
    showStatus('Loading search results...', 'info');

    await new Promise((resolve) => {
        webview.addEventListener('dom-ready', function onReady() {
            webview.removeEventListener('dom-ready', onReady);
            resolve();
        });
    });

    // addLog('info', 'Page loaded - polling for results...');
    waitForResults(webview);
}

/**
 * Poll for form elements, fill the form, and click search
 * NOTE: Currently unused - using direct URL navigation instead
 */
// function fillFormAndSearch(webview, descType, descNumber) {
//     let polls = 0;
//     const poll = () => {
//         webview.executeJavaScript(`document.getElementById('lct1') !== null`).then(found => {
//             if (found) {
//                 addLog('success', 'Form ready - filling fields...');
//                 executeFormFill(webview, descType, descNumber);
//             } else if (polls < SEARCH_FORM_MAX_POLLS) {
//                 polls++;
//                 setTimeout(poll, SEARCH_FORM_POLL_INTERVAL);
//             } else {
//                 addLog('error', 'Form element lct1 not found after 30 seconds');
//                 showStatus('Form failed to load', 'error');
//             }
//         });
//     };
//     poll();
// }

/**
 * Execute the form fill script in the webview
 * NOTE: Currently unused - using direct URL navigation instead
 */
// function executeFormFill(webview, descType, descNumber) {
//     const script = `
//         (() => {
//             const descType = ${JSON.stringify(descType)};
//             const descNumber = ${JSON.stringify(descNumber)};
//             const log = [];
//             const typeSelect = document.getElementById('lct1');
//             if (!typeSelect) { log.push({ step: 'error', message: 'lct1 not found' }); return { success: false, log }; }
//             let matched = false;
//             for (let i = 0; i < typeSelect.options.length; i++) {
//                 const opt = typeSelect.options[i];
//                 if (opt.textContent.trim().toLowerCase() === descType.toLowerCase()) {
//                     typeSelect.selectedIndex = i; typeSelect.value = opt.value; opt.selected = true;
//                     matched = true; break;
//                 }
//             }
//             typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
//             setTimeout(() => {
//                 const numInput = document.getElementById('lcv1');
//                 if (numInput && !numInput.disabled) {
//                     numInput.value = descNumber;
//                     numInput.dispatchEvent(new Event('input', { bubbles: true }));
//                     numInput.dispatchEvent(new Event('change', { bubbles: true }));
//                     const searchBtn = document.getElementById('searchButton');
//                     if (searchBtn) searchBtn.click();
//                 }
//             }, 500);
//             return { success: matched, log };
//         })()
//     `;
//     webview.executeJavaScript(script).then(result => {
//         if (result.success) { waitForViewDetails(webview); }
//     });
// }

/**
 * Poll for search results (View Details, no results, or server error)
 * @param {HTMLElement} webview - The webview element
 * @param {number} retries - Number of server error retries so far
 */
function waitForResults(webview) {
    let polls = 0;
    const poll = () => {
        webview.executeJavaScript(`
            (() => {
                const bodyText = document.body.innerText || '';

                if (bodyText.includes('The system is unable to perform this request')) {
                    return { status: 'server-error' };
                }
                if (bodyText.includes('Your search did not match any books')) {
                    return { status: 'no-results' };
                }

                const viewBtns = document.querySelectorAll('button[aria-label*="View Details"]');
                if (viewBtns.length > 0) {
                    // Grab the results summary text (e.g. "Showing 1 to 2 of 2 result(s) for \"Plan 606\"")
                    const summaryMatch = bodyText.match(/Showing \\d+ to \\d+ of \\d+ result/);
                    return { status: 'found', count: viewBtns.length, summary: summaryMatch ? summaryMatch[0] : null };
                }

                return { status: 'loading' };
            })()
        `).then(result => {
            if (result.status === 'found') {
                addLog('success', 'Results found', { books: result.count, summary: result.summary });
                setState('totalBooks', result.count);
                setState('currentBook', 1);
                webview.executeJavaScript(`
                    (() => {
                        const btn = document.querySelector('button[aria-label*="View Details"]');
                        if (btn) { btn.click(); return { clicked: true }; }
                        return { clicked: false };
                    })()
                `).then(clickResult => {
                    if (clickResult.clicked) {
                        addLog('success', 'View Details clicked');
                        // addLog('info', 'Waiting for book page to load...');

                        // Wait for SPA navigation to complete by polling the URL
                        const waitForBookPage = () => {
                            let attempts = 0;
                            const check = () => {
                                webview.executeJavaScript(`window.location.href`).then(url => {
                                    if (!url.includes('/search') || attempts > 30) {
                                        // addLog('info', 'Book page URL detected', { url });
                                        pollForPageCount(webview, () => {
                                            takeAndDisplayScreenshot(webview);
                                        });
                                    } else {
                                        attempts++;
                                        setTimeout(check, 500);
                                    }
                                });
                            };
                            check();
                        };
                        waitForBookPage();
                    } else {
                        addLog('error', 'View Details button disappeared before clicking');
                    }
                });
            } else if (result.status === 'server-error') {
                addLog('error', 'Server error: unable to perform request');
                showStatus('Server error - try again later', 'error');
            } else if (result.status === 'no-results') {
                addLog('warning', 'No results found for search');
                showStatus('No results found', 'warning');
            } else if (polls < SEARCH_FORM_MAX_POLLS) {
                polls++;
                setTimeout(poll, SEARCH_FORM_POLL_INTERVAL);
            } else {
                addLog('error', 'Timed out waiting for search results');
                showStatus('Timed out waiting for results', 'error');
            }
        }).catch(err => {
            addLog('error', 'Results poll failed: ' + err.message);
        });
    };
    poll();
}
