/**
 * Log Manager - Capture and retrieve automation logs
 *
 * Single Responsibility: Manage real-time logs for UI display
 */


class LogManager {
    /** Manage real-time logs for UI display */

    constructor() {
        /** Initialize log manager */
        this.logs = [];
        this.max_logs = 500;  // Keep last 500 log entries
    }

    add(level, message, data = null, screenshot_base64 = null) {
        /**
         * Add a log entry
         *
         * Args:
         *   level: Log level (info, success, error, warning)
         *   message: Log message
         *   data: Optional additional data
         *   screenshot_base64: Optional base64 screenshot
         */
        const entry = {
            timestamp: new Date().toISOString(),
            level: level,
            message: message,
            data: data,
            screenshot: screenshot_base64
        };

        this.logs.push(entry);

        // Keep only the last N logs
        if (this.logs.length > this.max_logs) {
            this.logs.shift();
        }

        // Also print to console for server-side debugging
        const console_method = level === 'error' ? console.error :
                              level === 'warning' ? console.warn :
                              console.log;
        console_method(`[${level.toUpperCase()}]`, message, data || '');
        if (screenshot_base64) {
            console_method(`[SCREENSHOT] ${screenshot_base64.substring(0, 50)}...`);
        }
    }

    info(message, data = null, screenshot = null) {
        this.add('info', message, data, screenshot);
    }

    success(message, data = null, screenshot = null) {
        this.add('success', message, data, screenshot);
    }

    error(message, data = null, screenshot = null) {
        this.add('error', message, data, screenshot);
    }

    warning(message, data = null, screenshot = null) {
        this.add('warning', message, data, screenshot);
    }

    get_logs(since = null) {
        /**
         * Get log entries
         *
         * Args:
         *   since: Optional timestamp to get logs after (for polling)
         *
         * Returns:
         *   Array of log entries
         */
        if (since) {
            return this.logs.filter(log => log.timestamp > since);
        }
        return [...this.logs];  // Return copy
    }

    clear() {
        /** Clear all logs */
        this.logs = [];
    }
}


// Singleton instance
let _log_manager = null;

function get_log_manager() {
    if (_log_manager === null) {
        _log_manager = new LogManager();
    }
    return _log_manager;
}


module.exports = {
    LogManager,
    get_log_manager
};
