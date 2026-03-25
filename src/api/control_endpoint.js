/**
 * Control Endpoint - Handle orchestrator control requests
 *
 * Single Responsibility: Handle orchestrator start/stop/status
 */

const { get_orchestrator, start_orchestrator, stop_orchestrator } = require('./orchestrator_manager');


function handle_status(req, res) {
    /**
     * Get orchestrator status
     *
     * Returns:
     *   JSON response with current status
     */
    const orchestrator = get_orchestrator();
    const status = orchestrator.get_status();
    return res.json(status);
}


async function handle_start(req, res) {
    /**
     * Start the orchestrator browser
     *
     * Returns:
     *   JSON response with start result
     */
    try {
        const orchestrator = get_orchestrator();
        const success = await orchestrator.start();

        if (success) {
            return res.json({"status": "started", "message": "Browser started"});
        } else {
            return res.status(500).json({
                "error": "Failed to start browser - check logs for details"
            });
        }
    } catch (error) {
        return res.status(500).json({
            "error": `Failed to start: ${error.message}`
        });
    }
}


function handle_stop(req, res) {
    /**
     * Stop the orchestrator browser
     *
     * Returns:
     *   JSON response with stop result
     */
    try {
        stop_orchestrator();
        return res.json({"status": "stopped", "message": "Browser stopped"});
    } catch (error) {
        return res.status(500).json({
            "error": `Failed to stop: ${error.message}`
        });
    }
}


module.exports = {
    handle_status,
    handle_start,
    handle_stop
};
