/**
 * Book Searcher - Handle book search functionality
 *
 * Single Responsibility: Search for books by LRO and description
 */

const { get_log_manager } = require('./log_manager');


class BookSearcher {
    /** Handle book search on Onland website */

    constructor(page) {
        /**
         * Initialize book searcher
         *
         * Args:
         *   page: Playwright page object
         */
        this.page = page;
        this.logger = get_log_manager();
    }

    async capture_screenshot() {
        /**
         * Capture a screenshot of the current page
         *
         * Returns:
         *   Base64 encoded screenshot or null
         */
        try {
            const screenshot = await this.page.screenshot();
            return screenshot.toString('base64');
        } catch (e) {
            // Screenshot capture is optional
            return null;
        }
    }

    async enter_lro(lro) {
        /**
         * Enter LRO (Land Registry Office) into the autocomplete input
         *
         * Args:
         *   lro: LRO number
         *
         * Returns:
         *   True if entry successful
         */
        try {
            // Capture initial state before entering LRO
            const before_screenshot = await this.capture_screenshot();
            this.logger.info(`Entering LRO: ${lro}`, null, before_screenshot);

            // Find the LRO input using aria-labelledby
            const lro_input = this.page.locator("input[aria-labelledby='lro-label']").first();

            // Click to focus
            await lro_input.click();
            await this.page.waitForTimeout(500);

            // Type the LRO number
            await lro_input.fill(lro);
            await this.page.waitForTimeout(1000);

            // Wait for autocomplete options and select first match
            const options = this.page.locator("mat-option").all();
            const option_count = await this.page.locator("mat-option").count();

            if (option_count > 0) {
                await this.page.locator("mat-option").first().click();
                await this.page.waitForTimeout(500);
                const screenshot = await this.capture_screenshot();
                this.logger.success(`LRO entered and selected: ${lro}`, null, screenshot);
            } else {
                const screenshot = await this.capture_screenshot();
                this.logger.warning(`No autocomplete options for LRO: ${lro}`, null, screenshot);
            }

            return true;
        } catch (e) {
            const screenshot = await this.capture_screenshot();
            this.logger.error('LRO entry failed', e.message, screenshot);
            return false;
        }
    }

    async select_description_type(desc_type) {
        /**
         * Select property description type
         *
         * Args:
         *   desc_type: Description type (Concession, Plan, Section, Condo, Parcel)
         *
         * Returns:
         *   True if selection successful
         */
        try {
            this.logger.info(`Selecting description type: ${desc_type}`);

            // Find the description type input/selector
            const desc_input = this.page.locator("input[aria-labelledby*='description'], input[placeholder*='Description']").first();

            await desc_input.click();
            await this.page.waitForTimeout(500);

            // Type to search
            await desc_input.fill(desc_type);
            await this.page.waitForTimeout(1000);

            // Click the matching option
            const options = this.page.locator("mat-option").all();
            const option_count = await this.page.locator("mat-option").count();

            if (option_count > 0) {
                await this.page.locator("mat-option").first().click();
                await this.page.waitForTimeout(500);
                const screenshot = await this.capture_screenshot();
                this.logger.success(`Description type selected: ${desc_type}`, null, screenshot);
            } else {
                this.logger.warning(`No options for description type: ${desc_type}`);
                // Press Enter to accept the typed value
                await desc_input.press('Enter');
                await this.page.waitForTimeout(500);
                const screenshot = await this.capture_screenshot();
                this.logger.warning(`Description type entered: ${desc_type}`, null, screenshot);
            }

            return true;
        } catch (e) {
            const screenshot = await this.capture_screenshot();
            this.logger.error('Description type selection failed', e.message, screenshot);
            return false;
        }
    }

    async enter_description_number(number) {
        /**
         * Enter description number
         *
         * Args:
         *   number: Description number (may contain letters)
         *
         * Returns:
         *   True if entry successful
         */
        try {
            this.logger.info(`Entering description number: ${number}`);

            // Find the description number input
            const desc_num_input = this.page.locator("input[aria-labelledby*='number'], input[placeholder*='number']").first();

            await desc_num_input.click();
            await desc_num_input.fill(number);
            await this.page.waitForTimeout(500);
            const screenshot = await this.capture_screenshot();
            this.logger.success('Description number entered', null, screenshot);
            return true;
        } catch (e) {
            const screenshot = await this.capture_screenshot();
            this.logger.error('Description number entry failed', e.message, screenshot);
            return false;
        }
    }

    async click_search_button() {
        /**
         * Click Search Books button
         *
         * Returns:
         *   True if button clicked successfully
         */
        try {
            this.logger.info('Clicking Search button');

            // Look for search button - try the actual text
            const search_button = this.page.locator("button:has-text('Find historical records'):visible, button:has-text('Search'):visible").first();

            await search_button.click();
            await this.page.waitForTimeout(2000);

            const screenshot = await this.capture_screenshot();
            this.logger.success('Search submitted', null, screenshot);
            return true;
        } catch (e) {
            const screenshot = await this.capture_screenshot();
            this.logger.error('Search button click failed', e.message, screenshot);
            return false;
        }
    }

    async get_search_results() {
        /**
         * Get search results
         *
         * Returns:
         *   Dictionary with status and books list
         */
        try {
            // Wait for results to load
            await this.page.waitForTimeout(3000);

            // Check for "No Results" message
            const no_results_text = await this.page.locator("text=/No Results/i, text=/no results/i, text=/not found/i").first();
            const has_no_results = await no_results_text.count() > 0;

            if (has_no_results && await no_results_text.isVisible()) {
                this.logger.warning('Site response: No Results found');
                return { status: "no_results", books: [] };
            }

            // Look for results table or cards
            const result_rows = await this.page.locator("table tr, mat-row, [role='row']").all();
            const view_details_buttons = await this.page.locator("button:has-text('View Details'), button:has-text('View')").all();

            if (view_details_buttons.length > 0) {
                const books = [];
                for (let i = 0; i < view_details_buttons.length; i++) {
                    books.push({
                        index: i,
                        text: await view_details_buttons[i].textContent()
                    });
                }
                this.logger.success(`Site response: Found ${books.length} book(s)`, { books });
                return { status: "found", books: books };
            }

            // If we got here, check if we're still on search form
            const still_on_form = await this.page.locator("input[aria-labelledby='lro-label']").count() > 0;
            if (still_on_form) {
                this.logger.warning('Still on search form - no results loaded');
                return { status: "no_results", books: [] };
            }

            this.logger.warning('No results found');
            return { status: "no_results", books: [] };

        } catch (e) {
            this.logger.error('Failed to get search results', e.message);
            return { status: "error", error: e.message, books: [] };
        }
    }

    async search(lro, description_type, description_number, category = null) {
        /**
         * Execute full search flow
         *
         * Args:
         *   lro: Land Registration Office identifier
         *   description_type: Property description type
         *   description_number: Description number
         *   category: Optional category override (not used in new UI)
         *
         * Returns:
         *   Search results dictionary
         */
        try {
            // Navigate to main site first
            this.logger.info('Navigating to Onland.ca');
            await this.page.goto("https://www.onland.ca/ui/", { timeout: 15000, waitUntil: 'domcontentloaded' });
            this.logger.success('Page loaded');

            // Wait for page to be ready
            await this.page.waitForTimeout(2000);

            // Step 1: Enter LRO
            await this.enter_lro(lro);
            await this.page.waitForTimeout(1000);

            // Step 2: Select description type
            await this.select_description_type(description_type);
            await this.page.waitForTimeout(1000);

            // Step 3: Enter description number
            await this.enter_description_number(description_number);
            await this.page.waitForTimeout(500);

            // Step 4: Click search
            await this.click_search_button();

            // Step 5: Get results
            return await this.get_search_results();

        } catch (error) {
            this.logger.error('Search failed', error.message);
            return { status: "error", error: error.message, books: [] };
        }
    }
}


module.exports = { BookSearcher };
