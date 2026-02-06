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
        this.modeChips = document.querySelectorAll('.mode-segment');
        this.confidenceChips = document.querySelectorAll('.confidence-filters .filter-chip');
        this.indicatorDiscarded = document.getElementById('indicator-discarded');
        this.indicatorFailed = document.getElementById('indicator-failed');

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

        // Summary indicator clicks (discarded/failed)
        [this.indicatorDiscarded, this.indicatorFailed].forEach(btn => {
            btn?.addEventListener('click', () => {
                this.setMode(btn.dataset.mode);
            });
        });

        // Confidence filter clicks (toggleable)
        this.confidenceChips.forEach(chip => {
            chip.addEventListener('click', (e) => {
                const filter = chip.dataset.filter;
                this.toggleConfidence(filter);
            });
        });

        // Sort removed from UI - using defaults (detected_timestamp asc)
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
            this.visibleConfidence.delete(level);
        } else {
            this.visibleConfidence.add(level);
        }
        this.updateStyles();
        this.saveState();
        this.emitChange();
    }

    updateStyles() {
        // Update mode segments
        this.modeChips.forEach(chip => {
            const isActive = chip.dataset.mode === this.currentMode;
            chip.classList.toggle('active', isActive);
        });

        // Update summary indicators (discarded/failed)
        if (this.indicatorDiscarded) {
            this.indicatorDiscarded.classList.toggle('active', this.currentMode === 'discarded');
        }
        if (this.indicatorFailed) {
            this.indicatorFailed.classList.toggle('active', this.currentMode === 'failed');
        }

        // Update confidence chips
        this.confidenceChips.forEach(chip => {
            const isActive = this.visibleConfidence.has(chip.dataset.filter);
            chip.classList.toggle('active', isActive);
            chip.classList.toggle('hidden-filter', !isActive);
        });
    }

    updateCounts(counts) {
        this.counts = { ...this.counts, ...counts };

        // Update count displays (both segment counts and any remaining data-count elements)
        Object.keys(this.counts).forEach(key => {
            document.querySelectorAll(`[data-count="${key}"]`).forEach(el => {
                el.textContent = this.counts[key] || 0;
            });
        });

        // Map bar-segment mode names to count keys (only workflow stages)
        const modeCountMap = {
            reviewed: 'reviewed',
            duplicates: 'duplicates',
            similar: 'similar',
            unreviewed: 'unreviewed'
        };

        // Calculate total across bar segments for proportional sizing
        const total = Object.values(modeCountMap).reduce((sum, key) => sum + (this.counts[key] || 0), 0);

        // Update mode segments: flex-grow, collapsed state, small state
        this.modeChips.forEach(seg => {
            const mode = seg.dataset.mode;
            const countKey = modeCountMap[mode];
            const count = this.counts[countKey] || 0;

            // Proportional flex-grow (minimum 1 for non-zero to ensure visibility)
            if (count > 0) {
                seg.style.flexGrow = Math.max(count, 1);
                seg.classList.remove('collapsed');
                // Small segment: less than 8% of total, hide label
                seg.classList.toggle('seg-small', total > 0 && (count / total) < 0.08);
            } else {
                seg.style.flexGrow = '0';
                seg.classList.add('collapsed');
                seg.classList.remove('seg-small');
            }

            // Attention pulse for duplicates/similar when not active
            const needsAttention = (mode === 'duplicates' || mode === 'similar') && count > 0;
            seg.classList.toggle('has-items', needsAttention);
        });

        // Show/hide summary indicators for side-channel modes
        if (this.indicatorDiscarded) {
            this.indicatorDiscarded.style.display = (this.counts.discards || 0) > 0 ? 'inline-flex' : 'none';
        }
        if (this.indicatorFailed) {
            this.indicatorFailed.style.display = (this.counts.failed || 0) > 0 ? 'inline-flex' : 'none';
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
        // Reset segment sizing
        this.modeChips.forEach(seg => {
            seg.style.flexGrow = '0';
            seg.classList.add('collapsed');
            seg.classList.remove('seg-small', 'has-items');
        });
        // Hide summary indicators
        if (this.indicatorDiscarded) this.indicatorDiscarded.style.display = 'none';
        if (this.indicatorFailed) this.indicatorFailed.style.display = 'none';
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
