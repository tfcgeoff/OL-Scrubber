/**
 * Page Navigator Module - Handles page count detection and page navigation
 */

import { addLog } from './logger.js';
import { PAGE_COUNT_MAX_POLLS, PAGE_COUNT_POLL_INTERVAL } from './variables.js';
import { setState, getState } from './variables.js';
import { executeNavCommand } from './navigation-handler.js';

/**
 * Parse description field to extract numbers for page estimation
 * Handles range formats ("PARCEL 884 TO 1082"), list formats ("PLAN 606, 608, 624, 625"),
 * and semicolon-separated segments ("CONCESSION 1; LOT 6 TO 10")
 */
function parseDescNumbers(descField, descType, descNumber) {
    try {
        const target = parseInt(descNumber, 10);
        if (!descField || isNaN(target)) return { type: 'none' };

        const typeLabel = (descType || '').toUpperCase();
        const segments = descField.split(';').map(s => s.trim()).filter(Boolean);

        // Find the segment matching the descType
        let relevantSegment = '';
        for (const seg of segments) {
            const segWords = seg.split(/[\s,]+/);
            const firstWord = segWords.length >= 1 ? segWords[0].toUpperCase() : '';
            if (segWords.length >= 2 && firstWord === typeLabel) {
                relevantSegment = seg;
                break;
            }
        }

        const text = relevantSegment || descField;

        // Check for range pattern (e.g., "LOT 1 TO 83")
        const rangeMatch = text.match(/(\d+)\s+(TO|to|–|-)\s+(\d+)/);
        if (rangeMatch) {
            return { type: 'range', start: parseInt(rangeMatch[1], 10), end: parseInt(rangeMatch[3], 10), target };
        }

        // Extract all numbers as a list
        const numbers = text.match(/\d+/g);
        if (numbers && numbers.length >= 1) {
            const nums = numbers.map(Number);
            const idx = nums.indexOf(target);
            if (idx !== -1) {
                return { type: 'list', numbers: nums, targetIndex: idx, total: nums.length, target };
            }
        }

        return { type: 'none' };
    } catch (err) {
        return { type: 'none' };
    }
}

/**
 * Estimate starting page from parsed description numbers.
 * Page 1 is always the title page, so minimum result is 2.
 */
function estimatePageFromDesc(parsed, totalPages) {
    try {
        let result;
        if (parsed.type === 'range') {
            if (parsed.start >= parsed.end || totalPages < 1 || parsed.target < parsed.start || parsed.target > parsed.end) {
                result = Math.max(2, Math.floor(totalPages / 2));
            } else {
                const offset = parsed.target - parsed.start;
                const numItems = parsed.end - parsed.start + 1;
                result = Math.max(2, Math.min(totalPages, Math.round(offset * totalPages / numItems) + 2));
            }
        } else if (parsed.type === 'list') {
            if (parsed.total < 1 || totalPages < 1) {
                result = Math.max(2, Math.floor(totalPages / 2));
            } else {
                result = Math.max(2, Math.min(totalPages, Math.round(parsed.targetIndex * totalPages / parsed.total) + 2));
            }
        } else {
            result = Math.max(2, Math.floor(totalPages / 2));
        }
        return result;
    } catch (err) {
        return Math.max(2, Math.floor(totalPages / 2));
    }
}

/**
 * Calculate the best starting page from description field and book info.
 */
function calculateStartPage() {
    try {
        const descNumber = getState('descNumber');
        const descType = getState('descType');
        const descField = getState('bookField');
        const totalPages = getState('totalPages');
        const parsed = parseDescNumbers(descField || '', descType, descNumber);
        return estimatePageFromDesc(parsed, totalPages || 1);
    } catch (err) {
        return Math.max(2, Math.floor((getState('totalPages') || 1) / 2));
    }
}

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

                // Scrape the book title, then calculate page
                scrapeBookTitle(webview).then(() => {
                    const startPage = calculateStartPage();
                    const totalPages = pageResult.totalPages;
                    addLog('info', 'Navigating to page', { startPage, totalPages });
                    executeNavCommand(String(startPage));
                });
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
    return webview.executeJavaScript(`
        (() => {
            const summary = document.querySelector('book-summary');
            if (summary) {
                const header = summary.querySelector('p.header');
                const desc = summary.querySelector('#descField');
                const parts = [];
                if (header) parts.push(header.textContent.trim());
                if (desc) parts.push(desc.textContent.trim());
                if (parts.length > 0) {
                    return { found: true, title: parts.join(', '), header: parts[0], desc: parts[1] || null };
                }
            }
            return { found: false, title: document.title || '' };
        })()
    `).then(result => {
        if (result.found) {
            setState('bookTitle', result.header);
            if (result.desc) setState('bookField', result.desc);
            addLog('info', 'Book title scraped', { title: result.title });
        } else {
            addLog('info', 'No book-summary element found', { pageTitle: result.title });
        }
    }).catch(err => {
        addLog('error', 'Book title scrape failed: ' + (err.message || String(err)));
    });
}
