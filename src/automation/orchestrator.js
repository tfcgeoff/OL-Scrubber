/**
 * Onland Orchestrator - Coordinate the automation workflow
 *
 * Single Responsibility: Orchestrate the Onland automation flow
 */

const { chromium } = require('playwright');
const { BookSearcher } = require('./book_searcher');
const { PageViewer } = require('./page_viewer');
const { PageNavigator } = require('./page_navigator');
const { ScreenshotManager } = require('./screenshot_manager');
const { get_log_manager } = require('./log_manager');


class OnlandOrchestrator {
    /** Orchestrate the Onland automation workflow */

    constructor() {
        /** Initialize orchestrator */
        this.playwright = null;
        this.browser = null;
        this.page = null;
        this.book_searcher = null;
        this.page_viewer = null;
        this.navigator = new PageNavigator();
        this.screenshot_manager = new ScreenshotManager();
        this.selected_pages = [];
        this.logger = get_log_manager();
    }

    async start() {
        /** Start browser and initialize components */
        this.logger.info('Starting browser...');
        try {
            this.browser = await chromium.launch({
                headless: false,
                args: [
                    '--start-maximized',
                    '--window-position=0,0'
                ]
            });

            // Create context with viewport
            const context = await this.browser.newContext({
                viewport: { width: 1920, height: 1080 }
            });

            this.page = await context.newPage();

            // Navigate to Onland on startup so window isn't blank
            await this.page.goto("https://www.onland.ca/ui/", { timeout: 15000, waitUntil: 'domcontentloaded' });

            // Bring page to front
            await this.page.bringToFront();

            this.book_searcher = new BookSearcher(this.page);
            this.page_viewer = new PageViewer(this.page);

            this.logger.success('Browser started successfully');
            return true;
        } catch (error) {
            this.logger.error('Failed to start browser', error.message);
            // Don't throw - return false so caller can handle gracefully
            this.playwright = null;
            this.browser = null;
            this.page = null;
            return false;
        }
    }

    async stop() {
        /** Stop browser and cleanup */
        if (this.page) {
            await this.page.close();
            this.page = null;
        }
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }

    async search_books(lro, description_type, description_number, category = null) {
        /**
         * Search for books
         *
         * Args:
         *   lro: Land Registration Office identifier
         *   description_type: Property description type
         *   description_number: Description number
         *   category: Optional category override
         *
         * Returns:
         *   Search results
         */
        this.logger.info(`Starting search: LRO=${lro}, Type=${description_type}, Number=${description_number}`);

        const results = await this.book_searcher.search(lro, description_type, description_number, category);

        if (results.status === 'found') {
            this.logger.success(`Found ${results.books.length} book(s)`, { books: results.books });
        } else if (results.status === 'no_results') {
            this.logger.warning('No results found');
        } else {
            this.logger.error('Search failed', results.error);
        }

        return results;
    }

    async open_first_book() {
        /**
         * Open the first book from search results
         *
         * Returns:
         *   True if book opened successfully
         */
        const results = await this.book_searcher.get_search_results();
        if (results.status === "no_results") {
            this.logger.warning('No books to open');
            return false;
        }

        const books = results.books || [];
        if (books.length === 0) {
            this.logger.warning('No books to open');
            return false;
        }

        // Open first book
        const first_book_row = books[0].row;
        this.logger.info(`Opening book at row ${first_book_row}`);

        const result = await this.page_viewer.open_book(first_book_row);

        if (result) {
            this.logger.success('Book opened successfully');
        } else {
            this.logger.error('Failed to open book');
        }

        return result;
    }

    async get_current_page_screenshot() {
        /**
         * Get screenshot of current page
         *
         * Returns:
         *   Object with { base64_image, filepath }
         */
        const screenshot_bytes = await this.page_viewer.capture_page_screenshot();
        if (!screenshot_bytes || screenshot_bytes.length === 0) {
            return { base64_image: null, filepath: null };
        }

        const job_id = "current";
        const page_num = 1;
        const filepath = this.screenshot_manager.save_screenshot(screenshot_bytes, job_id, page_num);
        this.screenshot_manager.set_current_screenshot(filepath);

        const base64_image = this.screenshot_manager.get_screenshot_base64(filepath);
        return { base64_image, filepath };
    }

    async process_navigation_decision(decision) {
        /**
         * Process navigation decision from AI/user
         *
         * Args:
         *   decision: Navigation decision (0, -1, +1, or page number)
         *
         * Returns:
         *   Action result
         */
        this.logger.info(`Processing navigation decision: "${decision}"`);

        const action = this.navigator.get_next_action(decision);

        if (action.type === "add_page") {
            await this.page_viewer.add_current_page_to_selection();
            this.selected_pages.push(decision);  // Track page
            this.logger.success(`Page ${this.navigator.current_page} added to selection`);
            return { status: "page_added", message: "Page added to selection" };

        } else if (action.type === "move_page") {
            const new_page = this.navigator.current_page + action.value;
            this.logger.info(`Moving from page ${this.navigator.current_page} to ${new_page}`);

            await this.page_viewer.navigate_to_page(new_page);
            this.navigator.current_page = new_page;

            this.logger.success(`Now on page ${this.navigator.current_page}`);
            return { status: "moved", message: `Moved to page ${this.navigator.current_page}` };

        } else if (action.type === "goto_page") {
            this.logger.info(`Going to page ${action.value}`);

            await this.page_viewer.navigate_to_page(action.value);
            this.navigator.current_page = action.value;

            this.logger.success(`Now on page ${this.navigator.current_page}`);
            return { status: "moved", message: `Moved to page ${this.navigator.current_page}` };
        }
    }

    async request_pages() {
        /**
         * Request selected pages for download
         *
         * Returns:
         *   True if request initiated successfully
         */
        return await this.page_viewer.click_request_pages();
    }

    async continue_to_download() {
        /**
         * Click Continue and then Download
         *
         * Returns:
         *   True if download initiated successfully
         */
        const cont = await this.page_viewer.click_continue();
        if (!cont) {
            return false;
        }

        return await this.page_viewer.click_download();
    }

    get_status() {
        /**
         * Get current orchestrator status
         *
         * Returns:
         *   Status dictionary
         */
        return {
            browser_running: this.browser !== null,
            current_page: this.navigator.current_page,
            selected_pages_count: this.selected_pages.length,
            current_screenshot: this.screenshot_manager.get_current_screenshot()
        };
    }
}


module.exports = { OnlandOrchestrator };
