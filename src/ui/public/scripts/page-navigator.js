/**
 * Page Navigator Module - Handles page count detection and page navigation
 */

import { addLog } from './logger.js';
import { PAGE_COUNT_MAX_POLLS, PAGE_COUNT_POLL_INTERVAL } from './variables.js';
import { setState, getState } from './variables.js';
import { executeNavCommand } from './navigation-handler.js';
import { parseBookTitleRange, estimateStartPage } from './search-handler.js';

/**
 * DEBUG: Test fetching a page directly from the Onland API
 * Probes for transaction ID and tests a page fetch
 * TODO: Remove after confirming we can fetch pages directly
 */
function probePDFjs(webview) {
    webview.executeJavaScript(`
        (async () => {
            const results = {};

            // 1. Get current URL to find transaction ID
            results.url = window.location.href;

            // 2. Find page API URLs from network performance entries
            const pageEntries = performance.getEntriesByType('resource')
                .filter(e => e.name && e.name.includes('/pages?page='))
                .map(e => e.name);
            results.pageApiUrls = pageEntries.slice(0, 5);

            // 3. Extract transaction ID from the URL pattern
            const txMatch = window.location.href.match(/\\/transactions\\/(\\d+)/);
            results.transactionId = txMatch ? txMatch[1] : null;

            // 4. If we found a page URL, try fetching one directly
            if (pageEntries.length > 0) {
                const templateUrl = pageEntries[0];
                // Extract the base URL (replace page number with test page)
                const pageApiUrl = templateUrl.replace(/page=\d+/, 'page=1');
                results.pageApiUrl = pageApiUrl;

                try {
                    const resp = await fetch(pageApiUrl, {
                        method: 'POST',
                        credentials: 'include'
                    });
                    results.fetchStatus = resp.status;
                    results.fetchContentType = resp.headers.get('content-type');

                    const contentType = resp.headers.get('content-type') || '';
                    if (contentType.includes('image')) {
                        // Response IS the image directly
                        const blob = await resp.blob();
                        results.imageBlobSize = blob.size;
                        results.imageType = blob.type;
                        // Get first few bytes to confirm it's an image
                        const reader = new FileReader();
                        reader.onload = () => {
                            results.base64Prefix = reader.result.substring(0, 50);
                        };
                        reader.readAsDataURL(blob);
                        await new Promise(r => { reader.onloadend = r; reader.onload = null; });
                    } else {
                        // Response might be JSON
                        const text = await resp.text();
                        results.responseTextPreview = text.substring(0, 500);
                        results.isJson = text.trim().startsWith('{') || text.trim().startsWith('[');
                    }
                } catch(e) {
                    results.fetchError = e.message;
                }
            }

            return results;
        })()
    `).then(results => {
        addLog('info', 'Page API probe results', results);
    });
}

/**
 * Poll for page count element and navigate to middle page
 * @param {HTMLElement} webview - The webview element
 * @param {Function} onScreenshotReady - Callback when screenshot should be taken
 * @returns {Promise} Promise that resolves when navigation is complete
 */
export function pollForPageCount(webview, onScreenshotReady) {
    const maxPolls = PAGE_COUNT_MAX_POLLS;

    const poll = (pollCount = 0) => {
        return webview.executeJavaScript(`
            (() => {
                const divs = document.getElementsByClassName('page-count');
                return JSON.stringify(Array.from(divs).map(d => d.outerHTML));
            })()
        `).then(raw => {
            const htmlArray = JSON.parse(raw);

            const pageResult = { found: false, divs: htmlArray };

            if (htmlArray.length === 0) {
                pageResult.reason = 'no-page-count-elements';
            } else {
                // Extract text from HTML
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = htmlArray[0];
                const text = tempDiv.innerText || tempDiv.textContent || '';

                const parts = text.split('of');
                if (parts.length < 2) {
                    pageResult.reason = 'no-of-in-text';
                    pageResult.text = text;
                } else {
                    const totalPages = parseInt(parts[1].trim(), 10);
                    if (isNaN(totalPages) || totalPages < 1) {
                        pageResult.reason = 'invalid-number';
                        pageResult.text = text;
                    } else {
                        pageResult.found = true;
                        pageResult.totalPages = totalPages;
                        pageResult.targetPage = Math.max(1, Math.floor(totalPages / 2));
                        pageResult.text = text.trim();
                    }
                }
            }

            if (pageResult.found) {
                setState('totalPages', pageResult.totalPages);
                setState('currentPage', 1); // book viewer starts at page 1

                addLog('success', 'Book page count detected', {
                    totalPages: pageResult.totalPages,
                    totalBooks: getState('totalBooks'),
                    currentBook: getState('currentBook')
                });

                // DEBUG: Probe for page API (temporary)
                probePDFjs(webview);

                // Scrape the book title from the page for smart page estimation
                scrapeBookTitle(webview);

                // Calculate best starting page using book range if available,
                // otherwise fall back to 50%
                const rangeStart = getState('bookRangeStart');
                const rangeEnd = getState('bookRangeEnd');
                const descNumber = parseInt(getState('descNumber'), 10);
                const totalPages = pageResult.totalPages;

                let startPage;
                if (rangeStart && rangeEnd && !isNaN(descNumber)) {
                    startPage = estimateStartPage(descNumber, rangeStart, rangeEnd, totalPages);
                    addLog('info', 'Smart page estimation applied', {
                        target: descNumber,
                        range: `${rangeStart}-${rangeEnd}`,
                        estimatedPage: startPage,
                        totalPages
                    });
                } else {
                    startPage = Math.max(1, Math.floor(totalPages / 2));
                    addLog('info', 'No book range available, using 50% fallback', {
                        startPage,
                        totalPages
                    });
                }

                // Navigate to estimated starting page
                executeNavCommand(String(startPage));
            } else if (pollCount < maxPolls) {
                return new Promise(resolve => {
                    setTimeout(() => resolve(poll(pollCount + 1)), PAGE_COUNT_POLL_INTERVAL);
                });
            } else {
                addLog('error', 'Book page count not found after 15 seconds - taking screenshot anyway');
                onScreenshotReady();
                return Promise.resolve();
            }
        });
    };

    return poll();
}

/**
 * Navigate to a specific page using the "Jump to Page" input box
 * @param {HTMLElement} webview - The webview element
 * @param {number} pageNumber - The page number to navigate to
 * @returns {Promise} Promise that resolves when navigation is complete
 */
export function navigateToPage(webview, pageNumber) {
    return webview.executeJavaScript(`
        (() => {
            const pageInput = document.querySelector('input[aria-label="Jump to Page"]');
            if (!pageInput) {
                return { success: false, message: 'Jump to Page input not found' };
            }

            pageInput.value = ${pageNumber};
            pageInput.dispatchEvent(new Event('input', { bubbles: true }));
            pageInput.dispatchEvent(new Event('change', { bubbles: true }));

            // Press Enter to trigger navigation
            const enterEvent = new KeyboardEvent('keydown', {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                bubbles: true
            });
            pageInput.dispatchEvent(enterEvent);

            return { success: true, pageNumber: ${pageNumber} };
        })()
    `).then(navResult => {
        if (navResult.success) {
            addLog('info', 'Navigated to page', {
                pageNumber: navResult.pageNumber,
                totalPages: getState('totalPages')
            });
        } else {
            addLog('error', 'Page navigation failed: ' + navResult.message);
        }
        return navResult;
    }).catch(navErr => {
        const errMsg = navErr instanceof Error ? navErr.message : String(navErr);
        addLog('error', 'Page navigation failed: ' + errMsg);
        return null;
    });
}

/**
 * Scrape the book title from the book viewer page to extract page range info
 * Looks for common patterns like "PARCEL 952 TO 1029" in heading/title elements
 * @param {HTMLElement} webview - The webview element
 */
function scrapeBookTitle(webview) {
    webview.executeJavaScript(`
        (() => {
            // Try multiple selectors to find the book title
            const selectors = [
                'h1', 'h2', 'h3',
                '[class*="title"]',
                '[class*="header"]',
                '[class*="book-title"]',
                '[class*="book-title"]'
            ];

            for (const sel of selectors) {
                const elements = document.querySelectorAll(sel);
                for (const el of elements) {
                    const text = (el.textContent || el.innerText || '').trim();
                    // Look for range patterns in the title (e.g., "PARCEL 952 TO 1029")
                    if (text.match(/\d+\s+(TO|to|–|-)\s+\d+/)) {
                        return { found: true, title: text, selector: sel };
                    }
                }
            }

            // Fallback: check the page URL or any meta/title tags
            const pageTitle = document.title || '';
            return { found: false, title: pageTitle, meta: document.querySelector('meta[property="og:title"]')?.content || null };
        })()
    `).then(result => {
        if (result.found) {
            setState('bookTitle', result.title);
            const range = parseBookTitleRange(result.title);
            if (range) {
                setState('bookRangeStart', range.start);
                setState('bookRangeEnd', range.end);
                addLog('info', 'Book title scraped', {
                    title: result.title,
                    rangeStart: range.start,
                    rangeEnd: range.end
                });
            } else {
                addLog('info', 'Book title found but range not parseable', { title: result.title });
            }
        } else {
            addLog('info', 'No book title with range found', { pageTitle: result.title });
        }
    }).catch(err => {
        addLog('error', 'Book title scrape failed: ' + (err.message || String(err)));
    });
}
