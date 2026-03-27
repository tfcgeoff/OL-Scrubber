/**
 * Logger Module - Handles log display in the UI
 */

// Cache DOM elements
let logsContainer;
let clearLogsBtn;

/**
 * Initialize the logger
 * @param {HTMLElement} logsElem - The logs container element
 * @param {HTMLElement} clearBtn - The clear logs button
 */
export function initLogger(logsElem, clearBtn) {
    logsContainer = logsElem;
    clearLogsBtn = clearBtn;

    clearLogsBtn.addEventListener('click', () => {
        logsContainer.innerHTML = '';
    });
}

/**
 * Add a log entry to the logs container
 * @param {string} level - Log level (info, success, warning, error)
 * @param {string} message - Log message
 * @param {Object|null} data - Optional data to display
 * @param {string|null} screenshot - Optional base64 screenshot data
 */
export function addLog(level, message, data = null, screenshot = null) {
    // Capture caller info for file/line number
    const stack = new Error().stack;
    const callerLine = stack ? stack.split('\n')[2] : '';
    const match = callerLine.match(/(?:https?:\/\/[^/]+)?(.+):(\d+):\d+/);
    // Strip directory path, keep just filename:line
    const source = match ? `${match[1].split('/').pop()}:${match[2]}` : '';

    console.log(`[${level.toUpperCase()}]`, source, message, data || '');

    const entry = document.createElement('div');
    entry.className = `log-entry ${level}`;

    // Timestamp
    const time = document.createElement('span');
    time.className = 'log-timestamp';
    time.textContent = `[${new Date().toLocaleTimeString()}] `;

    // Source (file:line)
    if (source) {
        const src = document.createElement('span');
        src.className = 'log-source';
        src.textContent = `[${source}] `;
        src.style.color = '#888';
        src.style.fontSize = '11px';
        entry.appendChild(src);
    }

    // Message
    const msg = document.createElement('span');
    msg.className = 'log-message';
    msg.textContent = message;

    entry.appendChild(time);
    entry.appendChild(msg);

    // Data
    if (data) {
        const dataDiv = document.createElement('div');
        dataDiv.className = 'log-data';
        dataDiv.textContent = JSON.stringify(data, null, 2);
        entry.appendChild(dataDiv);
    }

    // Screenshots are no longer shown in the log panel (view via remote control instead)

    logsContainer.appendChild(entry);
    logsContainer.scrollTop = logsContainer.scrollHeight;

    // Push to REST API for remote viewing
    if (window.electronAPI && window.electronAPI.pushLog) {
        window.electronAPI.pushLog({ level, message, source, data, time: new Date().toISOString() });
    }
}
