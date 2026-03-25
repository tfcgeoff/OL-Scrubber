/**
 * Navigation Endpoint - Handle page navigation requests
 *
 * Single Responsibility: Handle POST /api/navigate requests
 */

const { get_orchestrator } = require('./orchestrator_manager');


async function handle_navigation(req, res) {
    /**
     * Handle navigation decision from AI/user
     *
     * Expected JSON:
     * {
     *     "decision": "0|-#|+#|page_number"
     * }
     *
     * Returns:
     *   JSON response with action result and screenshot
     */
    const data = req.body;
    const decision = data.decision;

    if (!decision) {
        return res.status(400).json({
            error: "Missing 'decision' field"
        });
    }

    const orchestrator = get_orchestrator();

    if (!orchestrator.browser) {
        return res.status(503).json({
            error: "Browser not running. Start orchestrator first."
        });
    }

    // Process navigation decision
    const result = await orchestrator.process_navigation_decision(decision);

    // Automatically capture screenshot after navigation
    if (result.status === 'moved' || result.status === 'page_added') {
        try {
            // Wait a moment for page to settle
            await new Promise(resolve => setTimeout(resolve, 1000));
            const { base64_image } = await orchestrator.get_current_page_screenshot();
            result.screenshot = base64_image;
            result.current_page = orchestrator.navigator.current_page;
        } catch (screenshotError) {
            // Screenshot is optional
            console.error('Screenshot capture failed:', screenshotError.message);
        }
    }

    return res.json(result);
}


module.exports = {
    handle_navigation
};
