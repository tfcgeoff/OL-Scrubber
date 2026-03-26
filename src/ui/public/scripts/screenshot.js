/**
 * Screenshot Module - Handles real image capture from webview
 */

import { addLog } from './logger.js';

/**
 * Capture a screenshot image from the webview
 * @param {HTMLElement} webview - The webview element
 * @param {Function} callback - Callback function(base64Data) when screenshot is ready
 */
export function captureScreenshot(webview, callback) {
    addLog('info', 'Starting screenshot capture...');

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

                // Call the callback with the base64 data (without prefix for addLog)
                const base64Only = base64Data.replace(/^data:image\/\w+;base64,/, '');
                callback(base64Only);
            } else {
                const err = 'capturePage returned null';
                addLog('error', 'Screenshot capture failed: ' + err);
                callback(null);
            }
        });
    } catch (err) {
        addLog('error', 'Screenshot capture error: ' + err.message);
        callback(null);
    }
}
