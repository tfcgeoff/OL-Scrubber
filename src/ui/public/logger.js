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
    console.log(`[${level.toUpperCase()}]`, message, data || '');

    const entry = document.createElement('div');
    entry.className = `log-entry ${level}`;

    // Timestamp
    const time = document.createElement('span');
    time.className = 'log-timestamp';
    time.textContent = `[${new Date().toLocaleTimeString()}] `;

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

    // Screenshot
    if (screenshot) {
        const screenshotDiv = document.createElement('div');
        screenshotDiv.className = 'log-screenshot';
        const img = document.createElement('img');
        img.src = 'data:image/png;base64,' + screenshot;
        img.alt = message;
        img.style.maxWidth = '100%';
        img.style.cursor = 'pointer';
        img.style.borderRadius = '4px';
        img.style.marginTop = '8px';
        // Make screenshot clickable to view full size
        img.onclick = () => {
            const win = window.open();
            win.document.write('<img src="' + img.src + '" style="width:100%"/>');
        };
        screenshotDiv.appendChild(img);
        entry.appendChild(screenshotDiv);
    }

    logsContainer.appendChild(entry);
    logsContainer.scrollTop = logsContainer.scrollHeight;
}
