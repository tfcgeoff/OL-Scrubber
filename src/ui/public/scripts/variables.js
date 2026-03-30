/**
 * Variables Module - Centralized timing, configuration constants, and global state
 */

// Global state
const state = {
    lro: null,
    descType: null,
    descNumber: null,
    filter: null,
    totalBooks: null,
    currentBook: null,
    totalPages: null,
    currentPage: null,
    pagesSelected: 0,
    pageApiBaseUrl: null,  // e.g. "https://www.onland.ca/api/v1/books/transactions/34122282/pages" (set by main process)
    transactionId: null     // e.g. "34122282" (extracted from page API URL)
};

export function setState(key, value) {
    state[key] = value;

    // Sync state to main process for REST API secondary display
    if (window.electronAPI && window.electronAPI.pushState) {
        window.electronAPI.pushState({ ...state });
    }
}

export function getState(key) {
    return state[key];
}

export function getAllState() {
    return { ...state };
}

export function resetState() {
    Object.keys(state).forEach(key => state[key] = null);
}

// Screenshot timing
export const SCREENSHOT_SPINNER_APPEAR_MAX = 2000;
export const SCREENSHOT_SPINNER_GONE_MAX = 10000;
export const SCREENSHOT_POLL_INTERVAL = 10;
export const SCREENSHOT_BUFFER = 500;

// Page navigation timing
export const PAGE_COUNT_MAX_POLLS = 30;
export const PAGE_COUNT_POLL_INTERVAL = 500;

// Search timing
export const SEARCH_FORM_MAX_POLLS = 60;
export const SEARCH_FORM_POLL_INTERVAL = 500;

// UI timing
export const STATUS_MESSAGE_DURATION = 5000;
