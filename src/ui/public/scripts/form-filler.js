/**
 * Form Filler Module - Fills in the search form on the Onland website
 */

import {
    FORM_DROPDOWN_WAIT,
    FORM_SEARCH_CLICK_INTERVAL,
    FORM_SEARCH_MAX_CLICKS
} from './variables.js';

/**
 * Generate the JavaScript code to fill the search form
 * @param {string} descType - The description type
 * @param {string} descNumber - The description number
 * @returns {string} The JavaScript code to execute
 */
export function generateFormFillScript(descType, descNumber) {
    return `
        (() => {
            const descType = ${JSON.stringify(descType)};
            const descNumber = ${JSON.stringify(descNumber)};
            const log = [];

            // Check what we can see
            log.push({ step: 'page-check', title: document.title, url: window.location.href });

            // Check if Angular has loaded
            const angularApp = document.querySelector('[ng-version]');
            log.push({ step: 'angular-check', hasAngular: !!angularApp });

            // Page analysis
            const inputs = document.querySelectorAll('input');
            const buttons = Array.from(document.querySelectorAll('button'));
            log.push({ step: 'analysis', inputCount: inputs.length, buttonCount: buttons.length });

            // If no inputs, the form hasn't loaded yet
            if (inputs.length === 0) {
                log.push({ step: 'error', message: 'No inputs found - form may not be loaded yet' });
                return { success: false, log };
            }

            // === Step 1: Log all inputs with full details ===
            log.push({ step: 'input-analysis', totalInputs: inputs.length });
            inputs.forEach((inp, i) => {
                log.push({
                    step: 'input-details',
                    index: i,
                    placeholder: inp.placeholder || '(none)',
                    ariaLabel: inp.getAttribute('aria-label') || inp.getAttribute('aria-labelledby') || '(none)',
                    type: inp.type || '(unknown)',
                    id: inp.id || '(none)',
                    name: inp.name || '(none)',
                    value: inp.value || '(empty)'
                });
            });

            // === Step 2: Find inputs by their purpose ===
            let typeInput = null;
            let numInput = null;

            // First try: Find by aria-label or placeholder content
            for (let i = 0; i < inputs.length; i++) {
                const inp = inputs[i];
                const ariaLabel = (inp.getAttribute('aria-label') || inp.getAttribute('aria-labelledby') || '').toLowerCase();
                const placeholder = (inp.placeholder || '').toLowerCase();

                // Look for Description Type input (triggers dropdown)
                if (!typeInput) {
                    if (ariaLabel.includes('description') && (ariaLabel.includes('type') || placeholder.includes('type'))) {
                        typeInput = inp;
                        log.push({ step: 'found-type-by-label', index: i, ariaLabel, placeholder });
                    } else if (placeholder.includes('description') && placeholder.includes('type')) {
                        typeInput = inp;
                        log.push({ step: 'found-type-by-placeholder', index: i, placeholder });
                    }
                }

                // Look for Property Description Number input
                if (!numInput) {
                    const hasDesc = ariaLabel.includes('description') || placeholder.includes('description');
                    const hasNum = ariaLabel.includes('number') || placeholder.includes('number');
                    const hasOther = ariaLabel.includes('other') || placeholder.includes('other');

                    if (hasDesc && hasNum && !hasOther) {
                        numInput = inp;
                        log.push({ step: 'found-number-by-label', index: i, ariaLabel, placeholder });
                    }
                }
            }

            // === Step 3: Fallback to positional logic if not found ===
            if (!typeInput && inputs.length >= 1) {
                typeInput = inputs[0];
                log.push({ step: 'type-input-fallback', index: 0, reason: 'first-input' });
            }

            if (!numInput && inputs.length >= 2) {
                // Check if second input looks like "other" field
                const secondInput = inputs[1];
                const ariaLabel = (secondInput.getAttribute('aria-label') || secondInput.getAttribute('aria-labelledby') || '').toLowerCase();
                const placeholder = (secondInput.placeholder || '').toLowerCase();
                const isOtherField = ariaLabel.includes('other') || placeholder.includes('other');

                if (isOtherField && inputs.length >= 3) {
                    numInput = inputs[2];
                    log.push({ step: 'number-input-fallback', index: 2, reason: 'third-input-skipped-other' });
                } else {
                    numInput = inputs[1];
                    log.push({ step: 'number-input-fallback', index: 1, reason: 'second-input' });
                }
            }

            // === Step 4: Fill Description Type and handle dropdown ===
            if (typeInput) {
                log.push({ step: 'filling-type', inputIndex: Array.from(inputs).indexOf(typeInput), value: descType });
                typeInput.click();
                typeInput.focus();
                typeInput.value = descType;
                typeInput.dispatchEvent(new Event('input', { bubbles: true }));
                typeInput.dispatchEvent(new Event('change', { bubbles: true }));

                // Wait for dropdown to appear and select an option
                setTimeout(() => {
                    const options = document.querySelectorAll('mat-option');
                    log.push({ step: 'dropdown-check', optionCount: options.length });

                    if (options.length > 0) {
                        // Click the first option (Abstract/Parcel Register Book)
                        options[0].click();
                        log.push({ step: 'selected-option', optionText: options[0].textContent.trim().substring(0, 50) });
                    } else {
                        log.push({ step: 'warning', message: 'No mat-option elements found for dropdown' });
                    }
                }, ${FORM_DROPDOWN_WAIT});
            } else {
                log.push({ step: 'error', message: 'Could not find Description Type input' });
            }

            // === Step 5: Fill Description Number ===
            if (numInput) {
                log.push({ step: 'filling-number', inputIndex: Array.from(inputs).indexOf(numInput), value: descNumber });
                numInput.click();
                numInput.focus();
                numInput.value = descNumber;
                numInput.dispatchEvent(new Event('input', { bubbles: true }));
                numInput.dispatchEvent(new Event('change', { bubbles: true }));
            } else {
                log.push({ step: 'error', message: 'Could not find Description Number input' });
            }

            // Find search button by ID (more reliable)
            const searchBtn = document.getElementById('searchButton');
            if (searchBtn) {
                log.push({ step: 'found search button', id: 'searchButton' });

                // Click multiple times to ensure submission
                let clickCount = 0;
                const maxClicks = ${FORM_SEARCH_MAX_CLICKS};
                const clickInterval = setInterval(() => {
                    searchBtn.click();
                    clickCount++;
                    log.push({ step: 'clicked search', count: clickCount });

                    if (clickCount >= maxClicks) {
                        clearInterval(clickInterval);
                    }
                }, ${FORM_SEARCH_CLICK_INTERVAL});
            } else {
                log.push({ step: 'error', message: 'searchButton not found by ID' });
            }

            return { success: true, log };
        })()
    `;
}
