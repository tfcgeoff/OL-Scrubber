/**
 * Variables Module - Centralized timing, configuration constants, and global state
 */

// Global state
const state = {
    lro: null,
    descType: null,
    descNumber: null,
    totalBooks: null,
    currentBook: null,
    totalPages: null,
    currentPage: null
};

export function setState(key, value) {
    state[key] = value;
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

// Form filler timing (unused - navigating directly to URL now)
// export const FORM_DROPDOWN_WAIT = 500;

// UI timing
export const STATUS_MESSAGE_DURATION = 5000;
