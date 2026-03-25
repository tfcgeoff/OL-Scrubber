/**
 * Webview Manager Module - Handles webview initialization and ready state
 */

import { addLog } from './logger.js';

// Cache DOM elements
let webview;
let browserStatus;
let screenshotCard;
let webviewWebContents = null;

/**
 * Initialize the webview manager
 * @param {HTMLElement} webviewElem - The webview element
 * @param {HTMLElement} browserStatusElem - The browser status element
 * @param {HTMLElement} screenshotElem - The screenshot card element
 */
export function initWebview(webviewElem, browserStatusElem, screenshotElem) {
    webview = webviewElem;
    browserStatus = browserStatusElem;
    screenshotCard = screenshotElem;

    // Set up dom-ready event listener
    webview.addEventListener('dom-ready', () => {
        // Try to capture webContents (may fail without electron.remote)
        try {
            const webContents = require('electron').remote.webContents.fromId(webview.getWebContentsId());
            webviewWebContents = webContents;
            addLog('info', 'Webview webContents captured for screenshots');
        } catch (err) {
            console.error('Could not capture webContents:', err);
        }

        addLog('info', 'Webview loaded - ready for searches');
        browserStatus.textContent = 'Browser: Ready ✓';
        browserStatus.style.background = '#1b4332';
        screenshotCard.classList.remove('hidden');
    });
}

/**
 * Get the webview element
 * @returns {HTMLElement} The webview element
 */
export function getWebview() {
    return webview;
}

/**
 * Get the webview webContents (if available)
 * @returns {Object|null} The webContents object or null
 */
export function getWebContents() {
    return webviewWebContents;
}
