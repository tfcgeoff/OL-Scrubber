/**
 * Page Navigator Module - Handles page count detection and middle page navigation
 */

import { addLog } from './logger.js';
import { PAGE_COUNT_MAX_POLLS, PAGE_COUNT_POLL_INTERVAL } from './variables.js';

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
                // Get elements by class name "page-count"
                const pageCountDivs = document.getElementsByClassName('page-count');

                if (pageCountDivs.length === 0) {
                    return { found: false, method: 'no-page-count-divs' };
                }

                // Get the first page-count div and find the <p> inside it
                const firstDiv = pageCountDivs[0];
                const pElement = firstDiv.querySelector('p');

                if (!pElement) {
                    return { found: false, method: 'no-p-element' };
                }

                const text = pElement.textContent || pElement.innerText || '';
                const match = text.match(/of\\s+(\\d+)/);

                if (!match) {
                    return { found: false, method: 'no-match', text: text };
                }

                const totalPages = parseInt(match[1], 10);
                const middlePage = Math.max(1, Math.floor(totalPages / 2));

                return {
                    found: true,
                    totalPages: totalPages,
                    middlePage: middlePage,
                    text: text
                };
            })()
        `).then(pageResult => {
            if (pageResult.found) {
                addLog('success', 'Page count loaded', {
                    totalPages: pageResult.totalPages,
                    middlePage: pageResult.middlePage
                });

                // Navigate to middle page via the page input box
                return navigateToMiddlePage(webview, pageResult.middlePage).then(() => {
                    onScreenshotReady();
                });
            } else if (pollCount < maxPolls) {
                return new Promise(resolve => {
                    setTimeout(() => resolve(poll(pollCount + 1)), PAGE_COUNT_POLL_INTERVAL);
                });
            } else {
                addLog('error', 'Page count not found after 15 seconds - taking screenshot anyway');
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
function navigateToMiddlePage(webview, pageNumber) {
    return webview.executeJavaScript(`
        (() => {
            const middlePage = ${pageNumber};

            // Find the "Jump to Page" input
            const pageInput = document.querySelector('input[aria-label="Jump to Page"]');
            if (!pageInput) {
                return { success: false, message: 'Jump to Page input not found' };
            }

            // Set the value and dispatch events for Angular
            pageInput.value = middlePage;
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

            return { success: true, middlePage: middlePage };
        })()
    `).then(navResult => {
        if (navResult.success) {
            addLog('info', 'Navigated to middle page via input', {
                middlePage: navResult.middlePage
            });
        } else {
            addLog('error', 'Page navigation failed: ' + navResult.message);
        }
        return navResult;
    }).catch(navErr => {
        addLog('error', 'Page navigation failed: ' + navErr.message);
        return null;
    });
}
