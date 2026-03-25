/**
 * Logs Endpoint - Handle log requests
 *
 * Single Responsibility: Handle GET /api/logs requests
 */

const { get_log_manager } = require('../automation/log_manager');


function get_logs(req, res) {
    /**
     * Get log entries
     *
     * Query params:
     *   since: Optional timestamp to get logs after
     *
     * Returns:
     *   JSON response with logs array
     */
    const log_manager = get_log_manager();
    const since = req.query.since || null;

    const logs = log_manager.get_logs(since);

    return res.json({
        logs: logs,
        count: logs.length
    });
}


function clear_logs(req, res) {
    /**
     * Clear all logs
     *
     * Returns:
     *   JSON response with status
     */
    const log_manager = get_log_manager();
    log_manager.clear();

    return res.json({
        status: "cleared",
        message: "Logs cleared"
    });
}


module.exports = {
    get_logs,
    clear_logs
};
