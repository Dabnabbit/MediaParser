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

        // Import job ID for export (set by results.js on showResults)
        this.importJobId = null;

        // Strict workflow progression (loaded from localStorage, toggled via debug panel)
        this.strictMode = localStorage.getItem('strictWorkflow') === 'true';

        // Cache DOM elements
        this.filterBar = document.getElementById('filter-bar');
        this.modeChips = document.querySelectorAll('.mode-segment:not(.export-segment)');
        this.exportSegment = document.querySelector('.export-segment');
        this.confidenceChips = document.querySelectorAll('.confidence-filters .filter-chip');
        this.indicatorDiscarded = document.getElementById('indicator-discarded');
        this.indicatorFailed = document.getElementById('indicator-failed');
        this.dividerDiscarded = document.getElementById('divider-discarded');
        this.dividerFailed = document.getElementById('divider-failed');
        this.reviewedOverlay = document.getElementById('reviewed-overlay');
        this.modeSegmentsContainer = document.getElementById('mode-segments');
        this.lockOverlay = document.getElementById('seg-lock-overlay');

        // Reposition lock icons when any segment's width changes (flex reflow)
        const lockObserver = new ResizeObserver(() => this._repositionLockIcons());
        this.modeChips.forEach(seg => lockObserver.observe(seg));

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

        // Reviewed overlay click
        this.reviewedOverlay?.addEventListener('click', () => this.setMode('reviewed'));

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

        // Strict workflow: block switching to later stages if earlier ones have items
        if (this.strictMode && this._isModeLocked(mode)) {
            return;
        }

        this.currentMode = mode;

        // All modes now use the unified grid view - duplicates appear in grid like other files
        // The grid will filter based on mode via API params
        this.updateStyles();
        this.saveState();
        this.emitChange();
    }

    /**
     * Check if a mode is locked under strict workflow progression.
     * Order: duplicates → similar → unreviewed
     * A stage is locked if any prior stage still has items.
     */
    _isModeLocked(mode) {
        if (mode === 'similar') {
            return (this.counts.duplicates || 0) > 0;
        }
        if (mode === 'unreviewed') {
            return (this.counts.duplicates || 0) > 0
                || (this.counts.similar || 0) > 0;
        }
        // reviewed, discarded, failed, export — never locked
        return false;
    }

    /**
     * Rebuild lock icons for current locked state.
     * Each icon stores a reference to its segment for repositioning.
     */
    _updateLockIcons() {
        if (!this.lockOverlay) return;
        this.lockOverlay.innerHTML = '';

        if (!this.strictMode) return;

        this.modeChips.forEach(seg => {
            if (!seg.classList.contains('locked') || seg.classList.contains('collapsed')) return;

            const icon = document.createElement('span');
            icon.className = 'seg-lock-icon';
            icon.textContent = '\u{1F512}';
            icon._segment = seg;
            this.lockOverlay.appendChild(icon);
        });

        // Position after flex layout settles
        requestAnimationFrame(() => this._repositionLockIcons());
    }

    /**
     * Reposition existing lock icons to match current segment geometry.
     * Called by ResizeObserver when flex layout changes.
     */
    _repositionLockIcons() {
        if (!this.lockOverlay) return;
        for (const icon of this.lockOverlay.children) {
            if (icon._segment) {
                icon.style.left = icon._segment.offsetLeft + 'px';
            }
        }
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

        // Update reviewed overlay active state
        if (this.reviewedOverlay) {
            this.reviewedOverlay.classList.toggle('active', this.currentMode === 'reviewed');
        }

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

        // Map bar-segment mode names to count keys (non-reviewed workflow stages only)
        const modeCountMap = {
            duplicates: 'duplicates',
            similar: 'similar',
            unreviewed: 'unreviewed'
        };

        // Total across all bar segments (including reviewed for proportional sizing)
        const total = (this.counts.reviewed || 0) + (this.counts.duplicates || 0)
                    + (this.counts.similar || 0) + (this.counts.unreviewed || 0);

        // Non-reviewed total for segment proportional sizing
        const nonReviewedTotal = (this.counts.duplicates || 0) + (this.counts.similar || 0) + (this.counts.unreviewed || 0);

        // Update mode segments: flex-grow, collapsed state, small state
        this.modeChips.forEach(seg => {
            const mode = seg.dataset.mode;
            const countKey = modeCountMap[mode];
            if (!countKey) return; // Skip if not in map
            const count = this.counts[countKey] || 0;

            // Proportional flex-grow (minimum 1 for non-zero to ensure visibility)
            if (count > 0) {
                seg.style.flexGrow = Math.max(count, 1);
                seg.classList.remove('collapsed');
                // Small segment: less than 8% of non-reviewed total, hide label
                seg.classList.toggle('seg-small', nonReviewedTotal > 0 && (count / nonReviewedTotal) < 0.08);
            } else {
                seg.style.flexGrow = '0';
                seg.classList.add('collapsed');
                seg.classList.remove('seg-small');
            }

            // Attention pulse for duplicates/similar only when NOT the active mode
            const needsAttention = (mode === 'duplicates' || mode === 'similar')
                                && count > 0
                                && mode !== this.currentMode;
            seg.classList.toggle('has-items', needsAttention);

            // Strict workflow: lock segments that can't be accessed yet
            const locked = this.strictMode && this._isModeLocked(mode) && count > 0;
            seg.classList.toggle('locked', locked);
        });

        // Position lock icons between segments when strict mode is active
        this._updateLockIcons();

        // Update reviewed overlay width and reposition mode segments
        const reviewedPct = total > 0 ? ((this.counts.reviewed || 0) / total) * 100 : 0;
        if (this.reviewedOverlay) {
            this.reviewedOverlay.style.width = reviewedPct + '%';
            this.reviewedOverlay.classList.toggle('seg-empty', reviewedPct === 0);
            this.reviewedOverlay.classList.toggle('seg-small', reviewedPct > 0 && reviewedPct < 8);
            this.reviewedOverlay.classList.toggle('full-width', reviewedPct >= 99.5);
        }
        // Push mode segments to the right of the reviewed overlay
        if (this.modeSegmentsContainer) {
            this.modeSegmentsContainer.style.left = reviewedPct + '%';
            this.modeSegmentsContainer.style.width = (100 - reviewedPct) + '%';
        }

        // Show/hide summary indicators for side-channel modes
        const showFailed = (this.counts.failed || 0) > 0;
        const showDiscarded = (this.counts.discards || 0) > 0;
        if (this.indicatorFailed) this.indicatorFailed.style.display = showFailed ? 'inline' : 'none';
        if (this.dividerFailed) this.dividerFailed.style.display = showFailed ? 'inline' : 'none';
        if (this.indicatorDiscarded) this.indicatorDiscarded.style.display = showDiscarded ? 'inline' : 'none';
        if (this.dividerDiscarded) this.dividerDiscarded.style.display = showDiscarded ? 'inline' : 'none';

        // Show/hide export segment reactively based on review completion
        const allReviewed = (this.counts.duplicates || 0) === 0
                         && (this.counts.similar || 0) === 0
                         && (this.counts.unreviewed || 0) === 0
                         && (this.counts.reviewed || 0) > 0;

        if (this.exportSegment) {
            if (allReviewed && this.importJobId) {
                // Cap reviewed overlay to ~90% to leave room for export segment
                if (this.reviewedOverlay) {
                    this.reviewedOverlay.style.width = '90%';
                    // Trigger shimmer once when transitioning to all-reviewed
                    if (!this._shimmerFired) {
                        this._shimmerFired = true;
                        // Add class on next frame so width is committed first
                        requestAnimationFrame(() => {
                            this.reviewedOverlay.classList.add('all-reviewed');
                        });
                    }
                }
                if (this.modeSegmentsContainer) {
                    this.modeSegmentsContainer.style.left = '90%';
                    this.modeSegmentsContainer.style.width = '10%';
                }
                // Un-collapse and show export segment
                this.exportSegment.classList.remove('collapsed');
                this.exportSegment.style.flexGrow = '1';
                if (!this.exportSegment.classList.contains('ready')) {
                    this.exportSegment.classList.add('ready');
                    // Delay burst until segment has transitioned into view
                    setTimeout(() => window.particles.burst(this.exportSegment), 350);
                }
                // Wire click handler once
                if (!this.exportSegment.dataset.wired) {
                    this.exportSegment.dataset.wired = 'true';
                    this.exportSegment.addEventListener('click', () => {
                        if (window.progressHandler && this.importJobId) {
                            window.progressHandler.startExport(this.importJobId);
                        }
                    });
                }
            } else {
                // Collapse export segment, restore normal reviewed overlay width
                this.exportSegment.classList.add('collapsed');
                this.exportSegment.classList.remove('ready');
                this.exportSegment.style.flexGrow = '0';
                // Remove shimmer so it re-triggers next time
                this._shimmerFired = false;
                if (this.reviewedOverlay) {
                    this.reviewedOverlay.classList.remove('all-reviewed');
                }
            }
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
        this.importJobId = null;
        this._shimmerFired = false;

        // Reset segment sizing
        this.modeChips.forEach(seg => {
            seg.style.flexGrow = '0';
            seg.classList.add('collapsed');
            seg.classList.remove('seg-small', 'has-items', 'locked');
        });
        // Clear lock icons
        if (this.lockOverlay) this.lockOverlay.innerHTML = '';
        // Reset export segment
        if (this.exportSegment) {
            this.exportSegment.classList.add('collapsed');
            this.exportSegment.classList.remove('ready');
            this.exportSegment.style.flexGrow = '0';
        }
        // Reset reviewed overlay
        if (this.reviewedOverlay) {
            this.reviewedOverlay.style.width = '0%';
            this.reviewedOverlay.classList.remove('active', 'seg-small', 'full-width', 'all-reviewed');
            this.reviewedOverlay.classList.add('seg-empty');
        }
        // Reset mode segments positioning
        if (this.modeSegmentsContainer) {
            this.modeSegmentsContainer.style.left = '0';
            this.modeSegmentsContainer.style.width = '100%';
        }
        // Hide summary indicators and their dividers
        if (this.indicatorDiscarded) this.indicatorDiscarded.style.display = 'none';
        if (this.indicatorFailed) this.indicatorFailed.style.display = 'none';
        if (this.dividerDiscarded) this.dividerDiscarded.style.display = 'none';
        if (this.dividerFailed) this.dividerFailed.style.display = 'none';
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
        // All review done — default to reviewed mode
        // (export button visibility is handled reactively by updateCounts)
        this.setMode('reviewed');
        return 'reviewed';
    }


}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.filterHandler = new FilterHandler();
    });
} else {
    window.filterHandler = new FilterHandler();
}
