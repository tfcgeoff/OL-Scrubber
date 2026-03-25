/**
 * Screenshot Endpoint - Handle screenshot requests
 *
 * Single Responsibility: Handle GET /api/screenshot requests
 */

const { get_orchestrator } = require('./orchestrator_manager');


function get_screenshot(req, res) {
    /**
     * Get current page screenshot
     *
     * Returns:
     *   JSON response with screenshot data
     */
    const orchestrator = get_orchestrator();

    if (!orchestrator.browser) {
        return res.status(503).json({
            error: "Browser not running. Start orchestrator first."
        });
    }

    // Get current screenshot
    const { base64_image, filepath } = orchestrator.get_current_page_screenshot();

    if (!base64_image) {
        return res.status(500).json({
            error: "Failed to capture screenshot"
        });
    }

    return res.json({
        screenshot: base64_image,
        current_page: orchestrator.navigator.current_page
    });
}


module.exports = {
    get_screenshot
};
