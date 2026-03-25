/**
 * Screenshot Module - Handles screenshot capture
 */

import { addLog } from './logger.js';

/**
 * Capture a screenshot of the current webview content
 * @param {HTMLElement} webview - The webview element
 * @returns {Promise} Promise that resolves with screenshot data
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

                // Try to extract page counts using getElementsByClassName
                const pageCountDivs = document.getElementsByClassName('page-count');
                if (pageCountDivs.length > 0) {
                    const pElement = pageCountDivs[0].querySelector('p');
                    if (pElement) {
                        const text = pElement.textContent || pElement.innerText;
                        const match = text.match(/of\\s+(\\d+)/);
                        if (match) {
                            pageInfo.totalPages = parseInt(match[1], 10);
                        }
                    }
                }

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
