/**
 * Screenshot Module - Handles page data capture
 */

import { addLog } from './logger.js';

/**
 * Capture page data (text-based snapshot)
 * @param {HTMLElement} webview - The webview element
 * @returns {Promise} Promise that resolves with page data
 */
export function captureScreenshot(webview) {
    return webview.executeJavaScript(`
        (() => {
            try {
                const pageInfo = {
                    title: document.title,
                    url: window.location.href,
                    timestamp: new Date().toISOString(),
                    visibleElements: {
                        inputs: document.querySelectorAll('input').length,
                        buttons: document.querySelectorAll('button').length,
                        links: document.querySelectorAll('a').length,
                        textContent: document.body.innerText.substring(0, 5000)
                    }
                };

                return JSON.stringify(pageInfo);
            } catch (err) {
                return JSON.stringify({
                    error: err.message,
                    title: document.title,
                    url: window.location.href
                });
            }
        })()
    `).then(jsonData => {
        const pageData = JSON.parse(jsonData);
        addLog('info', 'Page snapshot captured', pageData);
        return pageData;
    }).catch(err => {
        addLog('error', 'Page snapshot capture exception', {
            message: err.message,
            stack: err.stack ? err.stack.split('\n').slice(0, 3).join('\n') : 'no stack'
        });
        return null;
    });
}
