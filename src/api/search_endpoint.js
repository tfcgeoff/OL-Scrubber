/**
 * Search Endpoint - Handle book search requests
 *
 * Single Responsibility: Handle POST /api/search requests
 */

const { v4: uuidv4 } = require('uuid');
const { get_orchestrator } = require('./orchestrator_manager');


async function handle_search(req, res) {
    /**
     * Handle book search request
     *
     * Expected JSON:
     * {
     *     "lro": "###",
     *     "description": "Concession|Plan|Section|Condo|Parcel",
     *     "descriptionNumber": "xxxx"
     * }
     *
     * Returns:
     *   JSON response with search_id, status, and screenshot
     */
    const data = req.body;

    // Validate required fields
    if (!data.lro || !data.description || !data.descriptionNumber) {
        return res.status(400).json({
            error: "Missing required fields: lro, description, descriptionNumber"
        });
    }

    const search_id = uuidv4();
    const orchestrator = get_orchestrator();

    // Check if browser is running
    if (!orchestrator.browser) {
        return res.status(503).json({
            error: "Browser not running. Start the browser first."
        });
    }

    try {
        // Navigate to site and perform search
        const results = await orchestrator.search_books(
            data.lro,
            data.description,
            data.descriptionNumber,
            data.category
        );

        // Automatically capture screenshot after search
        let screenshot_data = null;
        let current_page = orchestrator.navigator.current_page;

        if (results.status === 'found' || results.status === 'no_results') {
            try {
                const { base64_image } = await orchestrator.get_current_page_screenshot();
                screenshot_data = base64_image;
            } catch (screenshotError) {
                // Screenshot is optional, don't fail the search if it fails
                console.error('Screenshot capture failed:', screenshotError.message);
            }
        }

        return res.json({
            search_id: search_id,
            status: results.status,
            lro: data.lro,
            description: data.description,
            descriptionNumber: data.descriptionNumber,
            books: results.books || [],
            error: results.error,
            screenshot: screenshot_data,
            current_page: current_page
        });

    } catch (error) {
        return res.status(500).json({
            search_id: search_id,
            status: "error",
            error: error.message
        });
    }
}


module.exports = {
    handle_search
};
