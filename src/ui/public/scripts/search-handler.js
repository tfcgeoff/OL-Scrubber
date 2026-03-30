/**
 * Search Handler Module - Main search orchestration
 */

import { addLog } from './logger.js';
import { showStatus } from './ui.js';
import { getWebview } from './webview-manager.js';
import { pollForPageCount } from './page-navigator.js';
import { captureScreenshot, installFetchInterceptor } from './screenshot.js';
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
 * @param {string} [filter] - Optional filter value to append to search URL
 * @returns {Promise} Promise that resolves when search is complete
 */
export async function executeSearch(lro, descType, descNumber, filter) {
    const webview = getWebview();

    // Check Onland business hours (EST) before searching
    const estNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const day = estNow.getDay(); // 0=Sun
    const hour = estNow.getHours();
    const withinHours =
        (day >= 1 && day <= 4 && hour >= 4) ||   // Mon-Thu: 4am - midnight
        (day === 5 && hour >= 4 && hour < 21) ||   // Fri: 4am - 9pm
        (day === 6 && hour >= 9 && hour < 18) ||   // Sat: 9am - 6pm
        (day === 0 && hour >= 9 && hour < 21);      // Sun: 9am - 9pm
    if (!withinHours) {
        addLog('error', 'Onland search unavailable outside business hours (EST)', { estTime: estNow.toLocaleString('en-US') });
        showStatus('Onland is closed — check business hours', 'error');
        return;
    }

    // Navigate directly to search results URL
    let searchUrl = `https://www.onland.ca/ui/${lro}/books/search/1?lcv1=${encodeURIComponent(descNumber)}&lct1=${encodeURIComponent(descType)}&page=1`;
    if (filter) {
        searchUrl += `&township=${encodeURIComponent(filter)}`;
        setState('filter', filter);
    } else {
        setState('filter', null);
    }

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

    waitForResults(webview);
}

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

                        // Install fetch interceptor before book viewer loads pages
                        installFetchInterceptor(webview);

                        // Wait for SPA navigation to complete by polling the URL
                        const waitForBookPage = () => {
                            let attempts = 0;
                            const check = () => {
                                webview.executeJavaScript(`window.location.href`).then(url => {
                                    if (!url.includes('/search') || attempts > 30) {
                                        pollForPageCount(webview);
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
