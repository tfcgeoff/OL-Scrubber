/**
 * Page Navigator - Handle page navigation decisions
 *
 * Single Responsibility: Handle AI/user navigation decisions for page movement
 */


class PageNavigator {
    /** Handle page navigation decisions */

    constructor() {
        /** Initialize page navigator */
        this.current_page = 1;
    }

    parse_navigation_decision(decision) {
        /**
         * Parse navigation decision from AI/user
         *
         * Args:
         *   decision: Navigation decision string (e.g., "0", "-1", "+2")
         *
         * Returns:
         *   Dictionary with action and magnitude
         */
        decision = decision.trim();

        if (decision === "0") {
            return { action: "add", pages: 0 };
        } else if (decision.startsWith("-")) {
            return { action: "back", pages: parseInt(decision.slice(1)) };
        } else if (decision.startsWith("+")) {
            return { action: "forward", pages: parseInt(decision.slice(1)) };
        } else {
            // Assume it's a page number
            return { action: "goto", page: parseInt(decision) };
        }
    }

    get_next_action(decision) {
        /**
         * Get the next action based on navigation decision
         *
         * Args:
         *   decision: Navigation decision string
         *
         * Returns:
         *   Action dictionary with type and value
         */
        const parsed = this.parse_navigation_decision(decision);

        if (parsed.action === "add") {
            return { type: "add_page", value: null };
        } else if (parsed.action === "back") {
            return { type: "move_page", value: -parsed.pages };
        } else if (parsed.action === "forward") {
            return { type: "move_page", value: parsed.pages };
        } else if (parsed.action === "goto") {
            return { type: "goto_page", value: parsed.page };
        }
    }

    format_navigation_response(decision) {
        /**
         * Format navigation response for UI/AI
         *
         * Args:
         *   decision: Navigation decision string
         *
         * Returns:
         *   Formatted response
         */
        const action = this.get_next_action(decision);

        return {
            decision: decision,
            action: action.type,
            value: action.value,
            message: this._get_action_message(action)
        };
    }

    _get_action_message(action) {
        /** Get human-readable message for action */
        if (action.type === "add_page") {
            return "Adding current page to selection";
        } else if (action.type === "move_page") {
            const direction = action.value > 0 ? "forward" : "back";
            return `Moving ${direction} ${Math.abs(action.value)} page(s)`;
        } else if (action.type === "goto_page") {
            return `Going to page ${action.value}`;
        }
        return "Unknown action";
    }
}


module.exports = { PageNavigator };
