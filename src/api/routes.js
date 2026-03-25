/**
 * API Routes - Main Express router with all endpoints
 *
 * Single Responsibility: Combine all endpoint routes
 */

const express = require('express');
const { handle_status, handle_start, handle_stop } = require('./control_endpoint');
const { get_screenshot } = require('./screenshot_endpoint');
const { handle_navigation } = require('./navigation_endpoint');
const { handle_search } = require('./search_endpoint');
const { get_logs, clear_logs } = require('./logs_endpoint');


// Create router
const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


// Control endpoints
app.get('/status', handle_status);
app.post('/start', handle_start);
app.post('/stop', handle_stop);

// Screenshot endpoint
app.get('/screenshot', get_screenshot);

// Navigation endpoint
app.post('/navigate', handle_navigation);

// Search endpoint
app.post('/search', handle_search);

// Logs endpoint
app.get('/logs', get_logs);
app.delete('/logs', clear_logs);

// Health check
app.get('/', (req, res) => {
    res.json({
        "service": "Onland Data Entry API",
        "version": "0.2.0",
        "endpoints": {
            "search": "POST /api/search",
            "screenshot": "GET /api/screenshot",
            "navigate": "POST /api/navigate",
            "status": "GET /api/status",
            "start": "POST /api/start",
            "stop": "POST /api/stop"
        }
    });
});


module.exports = app;
