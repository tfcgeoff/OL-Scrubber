/**
 * Page Viewer - View and navigate pages within a book
 *
 * Single Responsibility: View pages and handle navigation
 */


class PageViewer {
    /** View and navigate pages within a book */

    constructor(page) {
        /**
         * Initialize page viewer
         *
         * Args:
         *   page: Playwright page object
         */
        this.page = page;
        this.page_input_selector = "[_ngcontent-ng-c3858425539]";
        this.add_page_checkbox_selector = "[_ngcontent-ng-c2478924352][type='checkbox']";
        this.add_page_button_selector = "button[_ngcontent-ng-c2478924352]";
    }

    async open_book(row_number) {
        /**
         * Open a book by clicking its View Details button
         *
         * Args:
         *   row_number: Row number in results (1-based)
         *
         * Returns:
         *   True if book opened successfully
         */
        try {
            // Click View Details button for the row
            const button = this.page.locator(`button[aria-label='View Details for row ${row_number}']`);
            await button.click();

            // Wait for page to load
            await this.page.waitForTimeout(2000);
            return true;
        } catch (e) {
            console.error(`Error opening book at row ${row_number}: ${e.message}`);
            return false;
        }
    }

    async capture_page_screenshot() {
        /**
         * Capture screenshot of current page
         *
         * Returns:
         *   Screenshot image bytes (Buffer)
         */
        try {
            // Click fullscreen button to view page
            const fullscreen_btn = this.page.locator("button[aria-describedby='fullscreen-status']");
            const count = await fullscreen_btn.count();
            if (count > 0) {
                await fullscreen_btn.click();
                await this.page.waitForTimeout(1000);
            }

            // Capture screenshot
            const screenshot = await this.page.screenshot();
            return screenshot;

        } catch (e) {
            console.error(`Screenshot capture error: ${e.message}`);
            return Buffer.from([]);
        }
    }

    async navigate_to_page(page_number) {
        /**
         * Navigate to specific page number
         *
         * Args:
         *   page_number: Page number to navigate to
         *
         * Returns:
         *   True if navigation successful
         */
        try {
            // Enter page number in input box
            await this.page.fill(this.page_input_selector, String(page_number));

            // Submit/press enter to navigate
            await this.page.press(this.page_input_selector, "Enter");
            await this.page.waitForTimeout(2000);
            return true;
        } catch (e) {
            console.error(`Page navigation error: ${e.message}`);
            return false;
        }
    }

    async add_current_page_to_selection() {
        /**
         * Add current page to selection
         *
         * Returns:
         *   True if page added successfully
         */
        try {
            // Enable the checkbox
            const checkbox = this.page.locator(this.add_page_checkbox_selector);
            await checkbox.check();

            // Click Add Current Page button
            await this.page.locator(this.add_page_button_selector).click();
            await this.page.waitForTimeout(500);
            return true;
        } catch (e) {
            console.error(`Error adding page: ${e.message}`);
            return false;
        }
    }

    async click_next_page() {
        /**
         * Click Next Page button
         *
         * Returns:
         *   True if click successful
         */
        try {
            // Next Page button
            const next_btn = this.page.locator("button[aria-label='Next Page']");
            await next_btn.click();
            await this.page.waitForTimeout(2000);
            return true;
        } catch (e) {
            console.error(`Next page click error: ${e.message}`);
            return false;
        }
    }

    async click_request_pages() {
        /**
         * Click Request Selected Pages button
         *
         * Returns:
         *   True if click successful
         */
        try {
            // Request Selected Pages button
            const request_btn = this.page.locator("button:has-text('Request Selected Pages')");
            await request_btn.click();
            await this.page.waitForTimeout(1000);
            return true;
        } catch (e) {
            console.error(`Request pages click error: ${e.message}`);
            return false;
        }
    }

    async click_continue() {
        /**
         * Click Continue button on popup
         *
         * Returns:
         *   True if click successful
         */
        try {
            // Continue button
            const continue_btn = this.page.locator("button:has-text('Continue')");
            await continue_btn.click();
            await this.page.waitForTimeout(1000);
            return true;
        } catch (e) {
            console.error(`Continue click error: ${e.message}`);
            return false;
        }
    }

    async click_download() {
        /**
         * Click Download button
         *
         * Returns:
         *   True if click successful
         */
        try {
            // Download button
            const download_btn = this.page.locator("button:has-text('Download')");
            await download_btn.click();
            await this.page.waitForTimeout(1000);
            return true;
        } catch (e) {
            console.error(`Download click error: ${e.message}`);
            return false;
        }
    }
}


module.exports = { PageViewer };
