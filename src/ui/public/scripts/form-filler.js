/**
 * Form Filler Module - Fills in the search form on the Onland website
 * NOTE: Currently unused - search-handler.js now navigates directly to the search URL
 */

// import { FORM_DROPDOWN_WAIT } from './variables.js';

/**
 * Generate the JavaScript code to fill the search form
 * @param {string} descType - The description type (e.g. "Plan")
 * @param {string} descNumber - The description number
 * @returns {string} The JavaScript code to execute
 */
export function generateFormFillScript(descType, descNumber) {
    return `
        (() => {
            const descType = ${JSON.stringify(descType)};
            const descNumber = ${JSON.stringify(descNumber)};
            const log = [];

            // === Step 1: Select the description type from <select id="lct1"> ===
            const typeSelect = document.getElementById('lct1');
            if (typeSelect) {
                log.push({ step: 'found-type-select', id: 'lct1', tag: typeSelect.tagName });

                // Find the option matching descType and select it
                let matched = false;
                for (let i = 0; i < typeSelect.options.length; i++) {
                    const opt = typeSelect.options[i];
                    if (opt.textContent.trim().toLowerCase() === descType.toLowerCase() ||
                        opt.getAttribute('aria-label')?.toLowerCase() === descType.toLowerCase()) {
                        typeSelect.selectedIndex = i;
                        typeSelect.value = opt.value;
                        opt.selected = true;
                        log.push({ step: 'selected-type', value: opt.value, text: opt.textContent.trim() });
                        matched = true;
                        break;
                    }
                }

                if (!matched) {
                    log.push({ step: 'warning', message: 'No option matching "' + descType + '"', availableOptions: Array.from(typeSelect.options).map(o => o.textContent.trim()) });
                }

                typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
            } else {
                // Element not found - log what IS on the page for debugging
                const allIds = Array.from(document.querySelectorAll('[id]')).map(e => e.id).slice(0, 30);
                const selectCount = document.querySelectorAll('select').length;
                const inputCount = document.querySelectorAll('input').length;
                log.push({ step: 'error', message: 'lct1 not found', allIds, selectCount, inputCount });
            }

            // === Step 2: Fill Description Number (id: lcv1) ===
            // This input is disabled until a type is selected, so wait briefly
            setTimeout(() => {
                const numInput = document.getElementById('lcv1');
                if (numInput) {
                    const wasDisabled = numInput.disabled;
                    log.push({ step: 'found-number', id: 'lcv1', wasDisabled: wasDisabled });
                    if (!wasDisabled) {
                        numInput.value = descNumber;
                        numInput.dispatchEvent(new Event('input', { bubbles: true }));
                        numInput.dispatchEvent(new Event('change', { bubbles: true }));
                        log.push({ step: 'filled-number', value: descNumber });

                        // === Step 3: Click search button ===
                        const searchBtn = document.getElementById('searchButton');
                        if (searchBtn) {
                            searchBtn.click();
                            log.push({ step: 'clicked search', success: true });
                        } else {
                            log.push({ step: 'error', message: 'searchButton not found' });
                        }
                    } else {
                        log.push({ step: 'error', message: 'lcv1 is still disabled - type selection may have failed' });
                    }
                } else {
                    log.push({ step: 'error', message: 'lcv1 not found' });
                }
            }, ${FORM_DROPDOWN_WAIT});

            return { success: true, log };
        })()
    `;
}
