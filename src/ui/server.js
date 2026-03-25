/**
 * UI Server - Web server for Onland automation UI
 *
 * Single Responsibility: Serve web UI and proxy API routes
 */

const express = require('express');
const path = require('path');
const os = require('os');
const api_routes = require('../api/routes');


function get_local_ip() {
    /** Get the local IP address for network access */
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            // Skip internal (loopback) and non-IPv4 addresses
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}


function create_server() {
    /** Create and configure Express server */
    const app = express();

    // Serve static files
    const public_dir = path.join(__dirname, 'public');
    app.use('/', express.static(public_dir));

    // Mount API routes
    app.use('/api', api_routes);

    return app;
}


async function start_server() {
    /** Start the server */
    const app = create_server();

    // Port 80 for standard HTTP access (requires sudo/root), or use 8002 as fallback
    const PORT = process.env.PORT || 80;
    const HOST = process.env.HOST || '0.0.0.0';

    const local_ip = get_local_ip();

    console.log(`Onland Data Entry UI starting on port ${PORT}`);
    console.log(`Starting browser automation...`);

    // Auto-start the orchestrator browser
    try {
        const { start_orchestrator } = require('../api/orchestrator_manager');
        await start_orchestrator();
        console.log(`Browser automation started (separate window)`);
    } catch (error) {
        console.error(`Failed to start browser: ${error.message}`);
        console.error(`You can start it manually from the UI`);
    }

    console.log(``);
    console.log(`  Local:      http://localhost${PORT === 80 ? '' : ':' + PORT}`);
    console.log(`  Network:    http://${local_ip}${PORT === 80 ? '' : ':' + PORT}`);
    console.log(`  mDNS:       http://onland.local${PORT === 80 ? '' : ':' + PORT}`);
    console.log(``);

    app.listen(PORT, HOST);
}


if (require.main === module) {
    start_server();
}


module.exports = { create_server, start_server };
