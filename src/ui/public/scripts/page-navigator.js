/**
 * Page Navigator Module - Handles page count detection and page navigation
 */

import { addLog } from './logger.js';
import { PAGE_COUNT_MAX_POLLS, PAGE_COUNT_POLL_INTERVAL } from './variables.js';
import { setState, getState } from './variables.js';
import { setNavigationVisible, executeNavCommand } from './navigation-handler.js';

/**
 * Poll for page count element and navigate to middle page
 * @param {HTMLElement} webview - The webview element
 * @param {Function} onScreenshotReady - Callback when screenshot should be taken
 * @returns {Promise} Promise that resolves when navigation is complete
 */
export function pollForPageCount(webview, onScreenshotReady) {
    const maxPolls = PAGE_COUNT_MAX_POLLS;

    const poll = (pollCount = 0) => {
        // addLog('info', 'pollForPageCount called', { pollCount: pollCount });

        return webview.executeJavaScript(`
            (() => {
                const divs = document.getElementsByClassName('page-count');
                return JSON.stringify(Array.from(divs).map(d => d.outerHTML));
            })()
        `).then(raw => {
            const htmlArray = JSON.parse(raw);
            // console.log('page-count HTML:', htmlArray);

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

            // addLog('info', 'Page count poll (' + pollCount + ')', pageResult);

            if (pageResult.found) {
                setState('totalPages', pageResult.totalPages);
                setState('currentPage', 1); // book viewer starts at page 1

                addLog('success', 'Book page count detected', {
                    totalPages: pageResult.totalPages,
                    totalBooks: getState('totalBooks'),
                    currentBook: getState('currentBook')
                });

                setNavigationVisible(true);

                // Navigate to 50% using the same code path as manual commands
                executeNavCommand('50%');

                // // Old: direct navigation and screenshot
                // setState('currentPage', pageResult.targetPage);
                // return navigateToPage(webview, pageResult.targetPage).then(() => {
                //     onScreenshotReady();
                // });
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

            // // new Promise wrapper with setTimeout - Electron executeJavaScript
            // // does not properly await nested Promises, causing undefined results
            // new Promise(resolve => {
            //     setTimeout(() => {
            //         resolve({ success: true, pageNumber: ${pageNumber} });
            //     }, 50);
            // })

            // // Focus page-count div to trigger onChange
            // const pageCountDiv = document.querySelector('.page-count');
            // if (pageCountDiv) {
            //     pageCountDiv.focus();
            // }

            // // setTimeout(() => {
            // //     pageInput.blur();
            // }, 200);

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
