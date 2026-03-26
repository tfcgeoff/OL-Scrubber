/**
 * Screenshot Module - Handles real image capture from webview
 */

import { addLog } from './logger.js';

/**
 * Capture a screenshot image from the webview
 * @param {HTMLElement} webview - The webview element
 * @returns {Promise<string>} Promise that resolves with base64 PNG data
 */
export async function captureScreenshot(webview) {
    addLog('info', 'Starting screenshot capture...');

    return new Promise((resolve, reject) => {
        try {
            addLog('info', 'Calling webview.capturePage()...');

            webview.capturePage((image) => {
                addLog('info', 'capturePage callback received', { hasImage: !!image });

                if (image) {
                    // Convert NativeImage to PNG buffer
                    const buffer = image.toPNG();
                    // Convert to base64
                    const base64Data = buffer.toString('base64');

                    addLog('success', 'Screenshot captured and converted', {
                        size: buffer.length,
                        base64Length: base64Data.length
                    });
                    resolve('data:image/png;base64,' + base64Data);
                } else {
                    const err = 'capturePage returned null';
                    addLog('error', 'Screenshot capture failed: ' + err);
                    reject(new Error(err));
                }
            });
        } catch (err) {
            addLog('error', 'Screenshot capture error: ' + err.message);
            reject(err);
        }
    });
}
