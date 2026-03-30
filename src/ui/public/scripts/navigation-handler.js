/**
 * Navigation Handler Module - Parses AI-style navigation commands and executes them
 */

import { addLog } from './logger.js';
import { getWebview } from './webview-manager.js';
import { navigateToPage } from './page-navigator.js';
import { captureScreenshot } from './screenshot.js';
import { getState, setState } from './variables.js';
import { showStatus } from './ui.js';

/**
 * Parse a navigation command and return the target page number and action type
 * Commands:
 *   0           -> add current page
 *   +N          -> move forward N pages
 *   -N          -> move back N pages
 *   +N%         -> move forward N% of remaining pages (current to end)
 *   -N%         -> move back N% of remaining pages (current to start)
 *   N (bare)    -> go directly to page N
 * @param {string} input - The raw command string
 * @returns {object} { action: 'goto'|'forward'|'back'|'percent-forward'|'percent-back'|'add', targetPage: number }
 */
function parseNavCommand(input) {
    const trimmed = input.trim();

    // Bare 0 -> add current page
    if (trimmed === '0') {
        return { action: 'add', targetPage: null };
    }

    // Percentage: N% (treat as +N%), +N%, or -N%
    const percentMatch = trimmed.match(/^([+-]?)(\d+)%$/);
    if (percentMatch) {
        const direction = percentMatch[1] || '+';
        const percent = parseInt(percentMatch[2], 10);
        const current = getState('currentPage');
        const total = getState('totalPages');

        if (current === null || total === null) {
            addLog('error', 'Cannot calculate percentage - no current page or total pages in state');
            return null;
        }

        if (direction === '+') {
            // Move forward: remainder is total - current
            const remainder = total - current;
            const moveBy = Math.round(remainder * (percent / 100));
            const target = Math.min(total, current + moveBy);
            return { action: 'percent-forward', targetPage: target, percent, moveBy, remainder };
        } else {
            // Move back: remainder is current - 1
            const remainder = current - 1;
            const moveBy = Math.round(remainder * (percent / 100));
            const target = Math.max(1, current - moveBy);
            return { action: 'percent-back', targetPage: target, percent, moveBy, remainder };
        }
    }

    // Relative: +N or -N
    const relativeMatch = trimmed.match(/^([+-])(\d+)$/);
    if (relativeMatch) {
        const direction = relativeMatch[1];
        const moveBy = parseInt(relativeMatch[2], 10);
        const current = getState('currentPage');
        const total = getState('totalPages');

        if (current === null || total === null) {
            addLog('error', 'Cannot calculate relative move - no current page or total pages in state');
            return null;
        }

        const target = direction === '+'
            ? Math.min(total, current + moveBy)
            : Math.max(1, current - moveBy);

        return { action: direction === '+' ? 'forward' : 'back', targetPage: target, moveBy };
    }

    // Bare number -> go directly to that page
    const bareMatch = trimmed.match(/^(\d+)$/);
    if (bareMatch) {
        const target = parseInt(bareMatch[1], 10);
        const total = getState('totalPages');
        if (total !== null && (target < 1 || target > total)) {
            addLog('warning', `Page ${target} is out of range (1-${total})`);
            return null;
        }
        return { action: 'goto', targetPage: target };
    }

    addLog('error', 'Invalid navigation command: ' + trimmed);
    return null;
}

/**
 * Take a screenshot and log it
 */
function takeScreenshot(webview) {
    captureScreenshot(webview, (base64Data) => {
        if (base64Data) {
            addLog('info', 'Screenshot captured', null, base64Data);
        } else {
            addLog('error', 'Screenshot capture failed');
        }
    });
}

/**
 * Execute the "Add Current Page" action
 * Clicks "Add Current Page" button, captures the current page's PDF data
 * for the accumulator, then clicks "Next Page" button.
 */
function addCurrentPage(webview) {
    addLog('info', 'Adding current page to selection...');

    return webview.executeJavaScript(`
        (() => {
            // Find and click "Add Current Page" button
            const addBtn = document.querySelector('button[aria-label*="Add Current"]');
            if (!addBtn) {
                return { success: false, message: 'Add Current Page button not found' };
            }
            addBtn.click();
            return { success: true, added: true };
        })()
    `).then(result => {
        if (!result || !result.success) {
            addLog('error', 'Add Current Page failed: ' + (result ? result.message : 'no result'));
            return;
        }

        addLog('success', 'Current page added to selection');

        // Show Download Selected button and increment counter
        const count = getState('pagesSelected') || 0;
        setState('pagesSelected', count + 1);
        const dlBtn = document.getElementById('downloadSelectedBtn');
        if (dlBtn) dlBtn.classList.remove('hidden');

        // PDF Accumulation: capture the current page's PDF data from the
        // webview interceptor cache BEFORE navigating away to the next page.
        // This must happen synchronously before clicking "Next Page" because
        // the page navigation will change the cache contents.
        capturePagePdfForAccumulator(webview);

        // Wait briefly then click Next Page
        setTimeout(() => {
            webview.executeJavaScript(`
                (() => {
                    const nextBtn = document.querySelector('button[aria-label="Next Page"]');
                    if (!nextBtn) {
                        return { success: false, message: 'Next Page button not found' };
                    }
                    nextBtn.click();
                    return { success: true };
                })()
            `).then(nextResult => {
                if (!nextResult || !nextResult.success) {
                    addLog('error', 'Next Page click failed: ' + (nextResult ? nextResult.message : 'no result'));
                    return;
                }

                addLog('info', 'Moved to next page');
                // Update current page in state
                const current = getState('currentPage');
                const total = getState('totalPages');
                if (current !== null && total !== null) {
                    setState('currentPage', Math.min(total, current + 1));
                }

                // Take screenshot of the new page
                setTimeout(() => {
                    takeScreenshot(webview);
                }, 1000);
            });
        }, 500);
    });
}

/**
 * Capture the current page's PDF data from the webview's fetch interceptor cache
 * and send it to the main process PDF accumulator via IPC.
 * This reads window.__onlandPageImages[currentPage] from the webview.
 * @param {HTMLElement} webview - The webview element
 */
function capturePagePdfForAccumulator(webview) {
    const currentPage = getState('currentPage');
    if (!currentPage) {
        addLog('warning', 'PDF ACCUM: No current page in state, skipping accumulation');
        return;
    }

    // Read the PDF data from the webview's interceptor cache
    webview.executeJavaScript(`
        (() => {
            const page = ${currentPage};
            const img = window.__onlandPageImages && window.__onlandPageImages[page];
            if (img && img.base64Data) {
                return { found: true, base64Data: img.base64Data, contentType: img.contentType, size: img.size };
            }
            return { found: false };
        })()
    `).then(result => {
        if (!result || !result.found) {
            addLog('warning', 'PDF ACCUM: No intercepted PDF data for page ' + currentPage);
            return;
        }

        // Send the PDF data to the main process accumulator
        if (window.electronAPI && window.electronAPI.addPageToPdf) {
            const state = {
                lro: getState('lro'),
                descType: getState('descType'),
                descNumber: getState('descNumber'),
                currentPage: currentPage
            };
            window.electronAPI.addPageToPdf(result.base64Data, state).then(addResult => {
                if (addResult && addResult.success) {
                    addLog('success', 'PDF ACCUM: Page ' + currentPage + ' saved (' + addResult.pageCount + ' pages total)', {
                        filename: addResult.filename
                    });
                } else {
                    addLog('error', 'PDF ACCUM: Failed to save page ' + currentPage + ': ' + (addResult ? addResult.error : 'unknown'));
                }
            }).catch(err => {
                addLog('error', 'PDF ACCUM: IPC error: ' + err.message);
            });
        } else {
            addLog('warning', 'PDF ACCUM: electronAPI.addPageToPdf not available');
        }
    }).catch(err => {
        addLog('error', 'PDF ACCUM: Failed to read webview cache for page ' + currentPage + ': ' + err.message);
    });
}

/**
 * Set up the navigation control event handlers
 * @param {HTMLInputElement} navInput - The navigation command input
 * @param {HTMLButtonElement} navBtn - The submit navigation button
 */
// Reference to executeCommand for programmatic use
let _executeCommand = null;

export function executeNavCommand(rawInput) {
    if (rawInput) setNavigationVisible(true);
    if (_executeCommand) {
        _executeCommand(rawInput);
    }
}

export function setupNavigationHandler(navInput, navBtn) {
    const executeCommand = (rawInput) => {
        const raw = (rawInput || navInput.value).trim();
        if (!raw) {
            addLog('error', 'Please enter a navigation command');
            return;
        }

        const webview = getWebview();
        if (!webview) {
            addLog('error', 'Webview not available');
            return;
        }

        const cmd = parseNavCommand(raw);
        if (!cmd) return;

        if (cmd.action === 'add') {
            addCurrentPage(webview);
            navInput.value = '';
            return;
        }

        // Page navigation commands
        const current = getState('currentPage');
        addLog('info', 'Navigation command', {
            action: cmd.action,
            from: current,
            to: cmd.targetPage,
            total: getState('totalPages')
        });

        navigateToPage(webview, cmd.targetPage).then(result => {
            if (result && result.success) {
                setState('currentPage', cmd.targetPage);
                showStatus(`Page ${cmd.targetPage} of ${getState('totalPages')}`, 'info');
                // Take screenshot of the new page
                setTimeout(() => {
                    takeScreenshot(webview);
                }, 1000);
            }
        });

        if (!rawInput) navInput.value = '';
    };

    _executeCommand = executeCommand;

    navBtn.addEventListener('click', () => executeCommand());

    navInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            executeCommand();
        }
    });
}

/**
 * Show or hide the navigation controls card
 * @param {boolean} visible - Whether to show the card
 */
export function setNavigationVisible(visible) {
    const el = document.getElementById('navControls');
    if (el) {
        if (visible) {
            el.classList.remove('hidden');
        } else {
            el.classList.add('hidden');
        }
    }
}
