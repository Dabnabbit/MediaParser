/**
 * Filter Handler - Mode-Based Workflow
 *
 * Modes are mutually exclusive workflow stages:
 * - duplicates: Files in duplicate groups (resolve first)
 * - unreviewed: Files needing timestamp review
 * - reviewed: Reviewed files (verification)
 * - discarded: Discarded files (recovery)
 * - failed: Files that failed processing
 *
 * Confidence filters (HIGH/MEDIUM/LOW) are toggleable within each mode.
 */

class FilterHandler {
    constructor() {
        // Current mode (mutually exclusive)
        this.currentMode = 'unreviewed';

        // Confidence visibility toggles (all ON by default)
        this.visibleConfidence = new Set(['high', 'medium', 'low']);

        // Counts for display
        this.counts = {
            duplicates: 0,
            similar: 0,
            unreviewed: 0,
            reviewed: 0,
            discards: 0,
            failed: 0,
            high: 0,
            medium: 0,
            low: 0,
            none: 0,
            total: 0
        };

        // Sort state
        this.sortField = 'detected_timestamp';
        this.sortOrder = 'asc';

        // Cache DOM elements
        this.filterBar = document.getElementById('filter-bar');
        this.modeChips = document.querySelectorAll('.mode-chip');
        this.confidenceChips = document.querySelectorAll('.confidence-filters .filter-chip');

        this.initEventListeners();
        this.loadState();
        this.updateStyles();
    }

    initEventListeners() {
        // Listen for duplicate group resolutions to refresh counts
        window.addEventListener('duplicateGroupResolved', () => {
            // Refresh filter counts after duplicate resolution
            if (window.resultsHandler) {
                window.resultsHandler.loadSummary();
            }
        });

        // Mode chip clicks (mutually exclusive)
        this.modeChips.forEach(chip => {
            chip.addEventListener('click', (e) => {
                const mode = chip.dataset.mode;
                this.setMode(mode);
            });
        });

        // Confidence filter clicks (toggleable)
        this.confidenceChips.forEach(chip => {
            chip.addEventListener('click', (e) => {
                const filter = chip.dataset.filter;
                this.toggleConfidence(filter);
            });
        });

        // Sort select
        const sortSelect = document.getElementById('sort-select');
        if (sortSelect) {
            sortSelect.addEventListener('change', (e) => {
                this.sortField = e.target.value;
                this.saveState();
                this.emitChange();
            });
        }

        // Sort order button
        const sortOrder = document.getElementById('sort-order');
        if (sortOrder) {
            sortOrder.addEventListener('click', () => {
                this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
                sortOrder.dataset.order = this.sortOrder;
                sortOrder.innerHTML = this.sortOrder === 'asc' ? '&#x2191;' : '&#x2193;';
                sortOrder.title = this.sortOrder === 'asc' ? 'Sort ascending' : 'Sort descending';
                this.saveState();
                this.emitChange();
            });
        }
    }

    setMode(mode) {
        if (this.currentMode === mode) return;

        this.currentMode = mode;

        // All modes now use the unified grid view - duplicates appear in grid like other files
        // The grid will filter based on mode via API params
        this.updateStyles();
        this.saveState();
        this.emitChange();
    }

    toggleConfidence(level) {
        if (this.visibleConfidence.has(level)) {
            // Don't allow hiding all confidence levels
            if (this.visibleConfidence.size > 1) {
                this.visibleConfidence.delete(level);
            }
        } else {
            this.visibleConfidence.add(level);
        }
        this.updateStyles();
        this.saveState();
        this.emitChange();
    }

    updateStyles() {
        // Update mode chips
        this.modeChips.forEach(chip => {
            const isActive = chip.dataset.mode === this.currentMode;
            chip.classList.toggle('active', isActive);
        });

        // Update confidence chips
        this.confidenceChips.forEach(chip => {
            const isActive = this.visibleConfidence.has(chip.dataset.filter);
            chip.classList.toggle('active', isActive);
        });
    }

    updateCounts(counts) {
        this.counts = { ...this.counts, ...counts };

        // Update count displays
        Object.keys(this.counts).forEach(key => {
            const countEl = document.querySelector(`[data-count="${key}"]`);
            if (countEl) {
                countEl.textContent = this.counts[key] || 0;
            }
        });

        // Highlight duplicates mode if there are unresolved duplicates
        const dupChip = document.querySelector('[data-mode="duplicates"]');
        if (dupChip) {
            dupChip.classList.toggle('has-items', this.counts.duplicates > 0);
        }

        // Highlight similar mode if there are unresolved similar groups
        const simChip = document.querySelector('[data-mode="similar"]');
        if (simChip) {
            simChip.classList.toggle('has-items', this.counts.similar > 0);
        }

        // Emit counts updated event for other components
        window.dispatchEvent(new CustomEvent('filterCountsUpdated', {
            detail: { counts: this.counts, mode: this.currentMode }
        }));
    }

    getQueryParams() {
        const params = new URLSearchParams();

        // Mode determines the base filter
        params.set('mode', this.currentMode);

        // Confidence levels that are visible
        const visibleLevels = Array.from(this.visibleConfidence);
        // Include 'none' with 'low' since they're both uncertain timestamps
        // But not in group modes — group confidence never has a 'none' value
        if (visibleLevels.includes('low') && this.currentMode !== 'duplicates' && this.currentMode !== 'similar') {
            visibleLevels.push('none');
        }
        params.set('confidence', visibleLevels.join(','));

        // Sort
        params.set('sort', this.sortField);
        params.set('order', this.sortOrder);

        return params;
    }

    getCurrentMode() {
        return this.currentMode;
    }

    getVisibleConfidence() {
        return Array.from(this.visibleConfidence);
    }

    saveState() {
        const state = {
            mode: this.currentMode,
            confidence: Array.from(this.visibleConfidence),
            sortField: this.sortField,
            sortOrder: this.sortOrder
        };
        try {
            localStorage.setItem('filterState', JSON.stringify(state));
        } catch (e) {
            console.warn('Failed to save filter state:', e);
        }
    }

    loadState() {
        try {
            const saved = localStorage.getItem('filterState');
            if (saved) {
                const state = JSON.parse(saved);

                // Load mode (default to unreviewed)
                if (state.mode) {
                    this.currentMode = state.mode;
                }

                // Load confidence visibility
                if (state.confidence && Array.isArray(state.confidence)) {
                    this.visibleConfidence = new Set(state.confidence);
                }

                this.sortField = state.sortField || 'detected_timestamp';
                this.sortOrder = state.sortOrder || 'asc';

                // Update UI to match loaded state
                this.updateStyles();

                const sortSelect = document.getElementById('sort-select');
                if (sortSelect) sortSelect.value = this.sortField;

                const sortOrderBtn = document.getElementById('sort-order');
                if (sortOrderBtn) {
                    sortOrderBtn.dataset.order = this.sortOrder;
                    sortOrderBtn.innerHTML = this.sortOrder === 'asc' ? '&#x2191;' : '&#x2193;';
                }
            }
        } catch (e) {
            console.warn('Failed to load filter state:', e);
        }
    }

    emitChange() {
        // Dispatch custom event for results handler to listen to
        window.dispatchEvent(new CustomEvent('filterChange', {
            detail: {
                mode: this.currentMode,
                confidence: Array.from(this.visibleConfidence),
                queryParams: this.getQueryParams(),
                sortField: this.sortField,
                sortOrder: this.sortOrder
            }
        }));
    }

    reset() {
        this.currentMode = 'unreviewed';
        this.visibleConfidence = new Set(['high', 'medium', 'low']);
        this.counts = {
            duplicates: 0, similar: 0, unreviewed: 0, reviewed: 0, discards: 0, failed: 0,
            high: 0, medium: 0, low: 0, none: 0, total: 0
        };
        this.updateStyles();
    }

    /**
     * Auto-select the appropriate mode based on job state.
     * Called when a job completes or when resuming.
     * Enforces sequential workflow: Duplicates → Similar → Unreviewed
     */
    autoSelectMode() {
        // Enforce sequential resolution: Duplicates → Similar → Unreviewed
        if (this.counts.duplicates > 0) {
            this.setMode('duplicates');
            return 'duplicates';
        }
        if (this.counts.similar > 0) {
            this.setMode('similar');
            return 'similar';
        }
        if (this.counts.unreviewed > 0) {
            this.setMode('unreviewed');
            return 'unreviewed';
        }
        // All done? Show reviewed
        this.setMode('reviewed');
        return 'reviewed';
    }

}

/**
 * Bulk Actions Dropdown Handler
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
        window.filterHandler = new FilterHandler();
        window.bulkActionsHandler = new BulkActionsHandler();
    });
} else {
    window.filterHandler = new FilterHandler();
    window.bulkActionsHandler = new BulkActionsHandler();
}
