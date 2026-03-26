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
    return new Promise((resolve, reject) => {
        try {
            webview.capturePage((image) => {
                if (image) {
                    // Convert NativeImage to PNG buffer
                    const buffer = image.toPNG();
                    // Convert to base64
                    const base64Data = buffer.toString('base64');

                    addLog('success', 'Screenshot captured', { size: buffer.length });
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
