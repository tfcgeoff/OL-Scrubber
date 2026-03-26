/**
 * UI Module - UI helper functions
 */

import { STATUS_MESSAGE_DURATION } from './variables.js';

// Cache DOM elements
let statusMessage;

/**
 * Initialize the UI module
 * @param {HTMLElement} statusElem - The status message element
 */
export function initUI(statusElem) {
    statusMessage = statusElem;
}

/**
 * Show a status message to the user
 * @param {string} message - The message to display
 * @param {string} type - The type of message (success, error, warning)
 */
export function showStatus(message, type = 'success') {
    statusMessage.textContent = message;
    statusMessage.className = 'status ' + type;
    setTimeout(() => {
        statusMessage.className = 'status';
    }, STATUS_MESSAGE_DURATION);
}
