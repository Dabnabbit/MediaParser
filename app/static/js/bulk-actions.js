/**
 * Bulk Actions Dropdown Handler.
 *
 * Manages the bulk actions dropdown menu in the filter bar, allowing
 * batch operations (accept & review, mark reviewed, clear reviews)
 * on filtered or confidence-level file sets.
 */
class BulkActionsHandler {
    constructor() {
        this.dropdown = document.getElementById('bulk-actions-dropdown');
        this.trigger = document.getElementById('bulk-actions-trigger');
        this.menu = document.getElementById('bulk-actions-menu');

        this.initEventListeners();
    }

    initEventListeners() {
        // Toggle dropdown
        this.trigger?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.dropdown?.classList.toggle('open');
            this.updateCounts();
        });

        // Close on outside click
        document.addEventListener('click', (e) => {
            if (!this.dropdown?.contains(e.target)) {
                this.dropdown?.classList.remove('open');
            }
        });

        // Handle menu item clicks
        this.menu?.querySelectorAll('.bulk-menu-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const action = item.dataset.action;
                const scope = item.dataset.scope;
                const level = item.dataset.level;

                this.executeBulkAction(action, scope, level);
                this.dropdown?.classList.remove('open');
            });
        });

        // Update counts when filter counts update
        window.addEventListener('filterCountsUpdated', () => {
            this.updateCounts();
        });

        // Listen for duplicate resolution completion
        window.addEventListener('duplicatesResolved', () => {
            // Auto-switch mode if no duplicates remain
            if (window.filterHandler) {
                window.filterHandler.autoSelectMode();
            }
        });
    }

    updateCounts() {
        const counts = window.filterHandler?.counts || {};

        // Update filtered count (based on current mode)
        const filteredCountEl = document.getElementById('bulk-filtered-count');
        if (filteredCountEl) {
            const mode = window.filterHandler?.currentMode || 'unreviewed';
            filteredCountEl.textContent = counts[mode] || counts.total || 0;
        }

        // Update confidence counts in menu
        ['high', 'medium', 'low', 'none'].forEach(level => {
            const countEl = document.querySelector(`[data-bulk-count="${level}"]`);
            if (countEl) {
                countEl.textContent = counts[level] || 0;
            }
        });
    }

    async executeBulkAction(action, scope, level) {
        const jobId = window.resultsHandler?.jobId;
        if (!jobId) return;

        // Delegate to selection handler's bulk review method
        if (window.selectionHandler) {
            const options = {};

            if (scope === 'confidence' && level) {
                options.confidence_level = level;
                options.count = window.filterHandler?.counts?.[level] || 0;
            } else if (scope === 'filtered') {
                const mode = window.filterHandler?.currentMode || 'unreviewed';
                options.count = window.filterHandler?.counts?.[mode] || 0;
            }

            await window.selectionHandler.bulkReview(action, scope, options);
        }
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.bulkActionsHandler = new BulkActionsHandler();
    });
} else {
    window.bulkActionsHandler = new BulkActionsHandler();
}
