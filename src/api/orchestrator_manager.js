/**
 * Orchestrator Manager - Manage the orchestrator instance
 *
 * Single Responsibility: Manage singleton orchestrator instance
 */

const { OnlandOrchestrator } = require('../automation/orchestrator');


let _orchestrator = null;


function get_orchestrator() {
    /**
     * Get or create orchestrator instance
     *
     * Returns:
     *   OnlandOrchestrator instance
     */
    if (_orchestrator === null) {
        _orchestrator = new OnlandOrchestrator();
    }
    return _orchestrator;
}


function start_orchestrator() {
    /** Start the orchestrator browser */
    const orchestrator = get_orchestrator();
    if (!orchestrator.browser) {
        orchestrator.start();
    }
}


function stop_orchestrator() {
    /** Stop the orchestrator browser */
    if (_orchestrator) {
        _orchestrator.stop();
        _orchestrator = null;
    }
}


module.exports = {
    get_orchestrator,
    start_orchestrator,
    stop_orchestrator
};
