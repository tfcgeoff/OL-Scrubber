/**
 * Search Config Module - Load search parameters from JSON files
 */

import { addLog } from './logger.js';
import { showStatus } from './ui.js';
import { setState } from './variables.js';

/**
 * Set up the Load Search button to open a file dialog and populate the form
 * @param {HTMLButtonElement} loadBtn - The Load Search button element
 */
export function setupLoadSearch(loadBtn) {
    loadBtn.addEventListener('click', async () => {
        try {
            const result = await window.electronAPI.loadSearchConfig();
            if (result.canceled) {
                addLog('info', 'Load Search cancelled');
                return;
            }

            const config = result.config;
            addLog('success', 'Search config loaded', config);

            // Populate form fields
            document.getElementById('lro').value = config.LRO || '';
            document.getElementById('descriptionType').value = config.Description || '';
            document.getElementById('descriptionNumber').value = config.DescriptionNumber || '';

            showStatus(`Loaded: LRO ${config.LRO}, ${config.Description} ${config.DescriptionNumber}`, 'success');
        } catch (error) {
            addLog('error', 'Failed to load search config: ' + error.message);
            showStatus('Error loading search config: ' + error.message, 'error');
        }
    });
}
