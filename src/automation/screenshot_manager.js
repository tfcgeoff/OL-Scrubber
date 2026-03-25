/**
 * Screenshot Manager - Handle screenshots for AI review
 *
 * Single Responsibility: Manage screenshots for display and AI review
 */

const fs = require('fs');
const path = require('path');


class ScreenshotManager {
    /** Manage screenshots for display in UI */

    constructor(storage_dir = null) {
        /**
         * Initialize screenshot manager
         *
         * Args:
         *   storage_dir: Directory to store screenshots
         */
        this.storage_dir = storage_dir || path.join(__dirname, '..', '..', 'shared', 'screenshots');
        // Ensure directory exists
        if (!fs.existsSync(this.storage_dir)) {
            fs.mkdirSync(this.storage_dir, { recursive: true });
        }
        this.current_screenshot = null;
    }

    save_screenshot(image_data, job_id, page_num) {
        /**
         * Save screenshot to storage
         *
         * Args:
         *   image_data: Screenshot image bytes (Buffer)
         *   job_id: Job identifier
         *   page_num: Page number
         *
         * Returns:
         *   Path to saved screenshot
         */
        const filename = `${job_id}_page_${page_num}.png`;
        const filepath = path.join(this.storage_dir, filename);

        fs.writeFileSync(filepath, image_data);

        return filepath;
    }

    get_screenshot_base64(filepath) {
        /**
         * Convert screenshot to base64 for web display
         *
         * Args:
         *   filepath: Path to screenshot
         *
         * Returns:
         *   Base64 encoded image string
         */
        const image_data = fs.readFileSync(filepath);

        return image_data.toString('base64');
    }

    get_current_screenshot() {
        /**
         * Get current screenshot for display
         *
         * Returns:
         *   Base64 encoded screenshot or null
         */
        if (this.current_screenshot) {
            return this.get_screenshot_base64(this.current_screenshot);
        }
        return null;
    }

    set_current_screenshot(filepath) {
        /**
         * Set current screenshot
         *
         * Args:
         *   filepath: Path to screenshot
         */
        this.current_screenshot = filepath;
    }
}


module.exports = { ScreenshotManager };
