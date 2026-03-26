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
                const middlePage = Math.floor(totalPages / 2);

                return {
                    found: true,
                    totalPages: totalPages,
                    middlePage: middlePage,
                    text: text
                };
            })()
        `).then(pageResult => {
            if (pageResult.found) {
                addLog('success', 'Page count loaded - navigating to middle page', {
                    totalPages: pageResult.totalPages,
                    middlePage: pageResult.middlePage,
                    originalText: pageResult.text
                });

                // Navigate to middle page
                return navigateToMiddlePage(webview, pageResult.middlePage).then(() => {
                    onScreenshotReady();
                });
            } else if (pollCount < maxPolls) {
                // Poll again after 500ms
                return new Promise(resolve => {
                    setTimeout(() => resolve(poll(pollCount + 1)), PAGE_COUNT_POLL_INTERVAL);
                });
            } else {
                // Max polls reached - take screenshot anyway
                addLog('error', 'Page count not found after 15 seconds - taking screenshot anyway');
                onScreenshotReady();
                return Promise.resolve();
            }
        });
    };

    return poll();
}

/**
 * Navigate to a specific page in the book viewer
 * @param {HTMLElement} webview - The webview element
 * @param {number} pageNumber - The page number to navigate to
 * @returns {Promise} Promise that resolves when navigation is complete
 */
function navigateToMiddlePage(webview, pageNumber) {
    return webview.executeJavaScript(`
        (() => {
            const currentUrl = window.location.href;
            const middlePage = ${pageNumber};

            // Parse page number from URL or construct new URL
            let newUrl;
            if (currentUrl.includes('/books/search/')) {
                // URL format: /books/search/{some-path}
                const parts = currentUrl.split('/books/search/');
                if (parts.length > 1) {
                    const searchPath = parts[1].split('?')[0];
                    const urlObj = new URL(currentUrl);
                    urlObj.searchParams.set('page', middlePage);
                    newUrl = urlObj.href;
                } else {
                    newUrl = currentUrl + '?page=' + middlePage;
                }
            } else {
                const urlObj = new URL(currentUrl);
                urlObj.searchParams.set('page', middlePage);
                newUrl = urlObj.href;
            }

            // Navigate to the middle page
            window.location.href = newUrl;

            return {
                navigated: true,
                middlePage: middlePage,
                newUrl: newUrl,
                oldUrl: currentUrl
            };
        })()
    `).then(navResult => {
        addLog('info', 'Navigated to middle page', {
            middlePage: navResult.middlePage,
            newUrl: navResult.newUrl
        });
        return navResult;
    }).catch(navErr => {
        addLog('error', 'Navigation failed: ' + navErr.message);
        return null;
    });
}
