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
        this.initSegmentDropdowns();
        this.loadState();
        this.updateStyles();
    }

    initEventListeners() {
        // Listen for duplicate group resolutions to refresh counts
        window.addEventListener('duplicateGroupResolved', () => {
            if (window.resultsHandler) {
                window.resultsHandler.loadSummary();
            }
        });

        // Listen for all duplicates resolved — auto-switch mode
        window.addEventListener('duplicatesResolved', () => {
            this.autoSelectMode();
        });

        // Mode chip clicks (mutually exclusive)
        this.modeChips.forEach(chip => {
            chip.addEventListener('click', (e) => {
                // Don't switch mode if clicking the chevron
                if (e.target.closest('.seg-chevron')) return;
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
    }

    // ==========================================
    // Segment Dropdowns
    // ==========================================

    initSegmentDropdowns() {
        this.modeChips.forEach(seg => {
            const chevron = seg.querySelector('.seg-chevron');
            if (!chevron) return;

            // Chevron click opens dropdown
            chevron.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                this.openSegmentDropdown(seg);
            });

            // Right-click on segment opens dropdown
            seg.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.openSegmentDropdown(seg);
            });

            // Long-press on segment opens dropdown (touch)
            let longPressTimer = null;
            seg.addEventListener('touchstart', (e) => {
                longPressTimer = setTimeout(() => {
                    e.preventDefault();
                    this.openSegmentDropdown(seg);
                }, 500);
            }, { passive: false });

            seg.addEventListener('touchend', () => {
                if (longPressTimer) clearTimeout(longPressTimer);
            });

            seg.addEventListener('touchmove', () => {
                if (longPressTimer) clearTimeout(longPressTimer);
            });
        });

        // Close segment dropdowns on outside click
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.seg-dropdown') && !e.target.closest('.seg-chevron')) {
                this._closeSegmentDropdowns();
            }
        });
    }

    openSegmentDropdown(segment) {
        // Close any existing
        this._closeSegmentDropdowns();

        const mode = segment.dataset.mode;
        const count = this.counts[mode] || 0;
        if (count === 0) return;

        segment.classList.add('seg-dropdown-open');

        // Build dropdown
        const dropdown = document.createElement('div');
        dropdown.className = 'seg-dropdown';

        if (mode === 'duplicates' || mode === 'similar') {
            const label = mode === 'duplicates' ? 'Duplicate' : 'Similar';
            dropdown.innerHTML = `
                <div class="seg-dropdown-header">Auto-resolve ${label} Groups</div>
                <button class="seg-dropdown-item" data-resolve="high">
                    <span class="chip-badge confidence-high">H</span> Auto-resolve HIGH groups
                </button>
                <button class="seg-dropdown-item" data-resolve="medium">
                    <span class="chip-badge confidence-medium">M</span> Auto-resolve MEDIUM groups
                </button>
                <div class="seg-dropdown-divider"></div>
                <button class="seg-dropdown-item" data-resolve="keep-all">Keep all (not ${mode === 'duplicates' ? 'duplicates' : 'similar'})</button>
            `;
        } else if (mode === 'unreviewed') {
            dropdown.innerHTML = `
                <div class="seg-dropdown-header">Bulk Review</div>
                <button class="seg-dropdown-item" data-resolve="accept-high">
                    <span class="chip-badge confidence-high">H</span> Accept all HIGH
                </button>
                <button class="seg-dropdown-item" data-resolve="accept-medium">
                    <span class="chip-badge confidence-medium">M</span> Accept all MEDIUM
                </button>
                <button class="seg-dropdown-item" data-resolve="accept-low">
                    <span class="chip-badge confidence-low">L</span> Accept all LOW
                </button>
                <div class="seg-dropdown-divider"></div>
                <button class="seg-dropdown-item" data-resolve="mark-all-reviewed">Mark all reviewed</button>
            `;
        }

        // Position dropdown below the chevron using fixed positioning
        // (can't use segment as parent because it has overflow: hidden)
        const chevron = segment.querySelector('.seg-chevron');
        const anchor = chevron || segment;
        const anchorRect = anchor.getBoundingClientRect();
        const segRect = segment.getBoundingClientRect();
        dropdown.style.position = 'fixed';
        dropdown.style.top = (segRect.bottom + 4) + 'px';
        // Center dropdown on the chevron, but clamp to viewport
        const dropdownWidth = 240; // min-width from CSS
        let left = anchorRect.left + anchorRect.width / 2 - dropdownWidth / 2;
        left = Math.max(8, Math.min(left, window.innerWidth - dropdownWidth - 8));
        dropdown.style.left = left + 'px';
        dropdown.dataset.segMode = mode;
        document.body.appendChild(dropdown);

        // Wire item clicks
        dropdown.querySelectorAll('.seg-dropdown-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const resolve = item.dataset.resolve;
                this._handleSegmentAction(mode, resolve);
                this._closeSegmentDropdowns();
            });
        });
    }

    _closeSegmentDropdowns() {
        document.querySelectorAll('.seg-dropdown').forEach(d => d.remove());
        document.querySelectorAll('.seg-dropdown-open').forEach(s => s.classList.remove('seg-dropdown-open'));
    }

    _handleSegmentAction(mode, resolve) {
        if (resolve === 'keep-all') {
            this.keepAllInMode(mode);
        } else if (resolve === 'high' || resolve === 'medium') {
            this.autoResolveByConfidence(mode, resolve);
        } else if (resolve === 'accept-high') {
            this._bulkReviewByConfidence('accept_review', 'high');
        } else if (resolve === 'accept-medium') {
            this._bulkReviewByConfidence('accept_review', 'medium');
        } else if (resolve === 'accept-low') {
            this._bulkReviewByConfidence('accept_review', 'low');
        } else if (resolve === 'mark-all-reviewed') {
            this._bulkReviewAll('mark_reviewed');
        }
    }

    /**
     * Auto-resolve groups at a given confidence level.
     * Fetches all files for the mode, groups them, keeps recommended, discards rest.
     */
    async autoResolveByConfidence(mode, confidence) {
        const jobId = window.resultsHandler?.jobId;
        if (!jobId) return;

        const groupKey = mode === 'similar' ? 'similar_group_id' : 'exact_group_id';

        try {
            // Fetch ALL files for this mode (no confidence filter)
            const params = new URLSearchParams({
                mode: mode,
                confidence: 'high,medium,low,none',
                sort: 'detected_timestamp',
                order: 'asc',
                limit: 10000
            });

            const response = await fetch(`/api/jobs/${jobId}/files?${params}`);
            if (!response.ok) throw new Error('Failed to fetch files');

            const data = await response.json();
            const files = data.files || [];

            // Group files by group key
            const groups = new Map();
            for (const f of files) {
                const gid = f[groupKey];
                if (!gid) continue;
                if (!groups.has(gid)) groups.set(gid, []);
                groups.get(gid).push(f);
            }

            // Filter to groups matching target confidence
            const targetGroups = [];
            for (const [gid, members] of groups) {
                // Group confidence is the confidence of the group match
                const groupConfidence = members[0]?.confidence?.toLowerCase() ||
                                       members[0]?.match_confidence?.toLowerCase();
                if (groupConfidence === confidence) {
                    targetGroups.push(members);
                }
            }

            if (targetGroups.length === 0) {
                window.selectionHandler?.showToast(`No ${confidence.toUpperCase()} confidence groups found`);
                return;
            }

            // For each group: keep recommended, collect rest as discard targets
            const toDiscard = [];
            let keepCount = 0;
            for (const members of targetGroups) {
                const recommended = members.find(f => f.is_recommended) || members[0];
                keepCount++;
                for (const f of members) {
                    if (f.id !== recommended.id) {
                        toDiscard.push(f.id);
                    }
                }
            }

            if (toDiscard.length === 0) {
                window.selectionHandler?.showToast('Nothing to discard');
                return;
            }

            const msg = `Auto-resolve ${targetGroups.length} ${confidence.toUpperCase()} groups? Keep ${keepCount}, discard ${toDiscard.length}.`;
            if (!confirm(msg)) return;

            const discardResp = await fetch('/api/files/bulk/discard', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ file_ids: toDiscard })
            });

            if (discardResp.ok) {
                window.resultsHandler?.loadFiles();
                window.resultsHandler?.loadSummary();
                window.selectionHandler?.showToast(`Resolved ${targetGroups.length} groups`);
            }

        } catch (error) {
            console.error('Auto-resolve failed:', error);
            alert(`Auto-resolve failed: ${error.message}`);
        }
    }

    /**
     * Keep all files in a mode — mark them as not-duplicate or not-similar.
     */
    async keepAllInMode(mode) {
        const jobId = window.resultsHandler?.jobId;
        if (!jobId) return;

        const count = this.counts[mode] || 0;
        const label = mode === 'duplicates' ? 'duplicate' : 'similar';
        const msg = `Mark all ${count} files as not ${label}? This removes them from their groups.`;
        if (!confirm(msg)) return;

        try {
            // Fetch all files for this mode
            const params = new URLSearchParams({
                mode: mode,
                confidence: 'high,medium,low,none',
                sort: 'detected_timestamp',
                order: 'asc',
                limit: 10000
            });

            const response = await fetch(`/api/jobs/${jobId}/files?${params}`);
            if (!response.ok) throw new Error('Failed to fetch files');

            const data = await response.json();
            const fileIds = (data.files || []).map(f => f.id);

            if (fileIds.length === 0) return;

            const endpoint = mode === 'duplicates'
                ? '/api/files/bulk/not-duplicate'
                : '/api/files/bulk/not-similar';

            const clearResp = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ file_ids: fileIds })
            });

            if (clearResp.ok) {
                window.resultsHandler?.loadFiles();
                window.resultsHandler?.loadSummary();
                window.selectionHandler?.showToast(`Cleared ${fileIds.length} files from ${label} groups`);
            }

        } catch (error) {
            console.error('Keep all failed:', error);
            alert(`Failed: ${error.message}`);
        }
    }

    /**
     * Bulk review by confidence level (for unreviewed segment dropdown)
     */
    _bulkReviewByConfidence(action, confidence) {
        const count = this.counts[confidence] || 0;
        if (window.selectionHandler) {
            window.selectionHandler.bulkReview(action, 'confidence', {
                confidence_level: confidence,
                count: count
            });
        }
    }

    /**
     * Bulk review all files in current mode (for unreviewed segment dropdown)
     */
    _bulkReviewAll(action) {
        const mode = this.currentMode;
        const count = this.counts[mode] || 0;
        if (window.selectionHandler) {
            window.selectionHandler.bulkReview(action, 'filtered', { count });
        }
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
     * Snapshot current lock icon positions before DOM changes shift segments.
     * Returns Map<mode, {cx, cy}> — empty map if no lock overlay or no icons.
     */
    _snapshotLockPositions() {
        const positions = new Map();
        if (!this.lockOverlay) return positions;
        for (const icon of this.lockOverlay.children) {
            const seg = icon._segment;
            if (seg) {
                const rect = seg.getBoundingClientRect();
                positions.set(seg.dataset.mode, {
                    cx: rect.left + rect.width / 2,
                    cy: rect.top + rect.height / 2,
                });
            }
        }
        return positions;
    }

    /**
     * Rebuild lock icons for current locked state.
     * Each icon stores a reference to its segment for repositioning.
     * @param {Map} [prevLocked] — pre-snapshot of old lock positions (from before DOM changes)
     */
    _updateLockIcons(prevLocked) {
        if (!this.lockOverlay) return;

        // Fall back to snapshotting now if no pre-computed positions passed
        if (!prevLocked) prevLocked = this._snapshotLockPositions();

        this.lockOverlay.innerHTML = '';

        if (!this.strictMode) return;

        // Rebuild lock icons for current state
        const nowLocked = new Set();
        this.modeChips.forEach(seg => {
            if (!seg.classList.contains('locked') || seg.classList.contains('collapsed')) return;

            nowLocked.add(seg.dataset.mode);
            const icon = document.createElement('span');
            icon.className = 'seg-lock-icon';
            icon.textContent = '\u{1F512}';
            icon._segment = seg;
            this.lockOverlay.appendChild(icon);
        });

        // Shatter effect for each lock that just disappeared (= segment unlocked)
        if (window.particles) {
            for (const [mode, pos] of prevLocked) {
                if (!nowLocked.has(mode)) {
                    window.particles.shatter(pos);
                }
            }
        }

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
        // Snapshot lock icon positions BEFORE any DOM changes (flex reflow shifts segments)
        const prevLockPositions = this._snapshotLockPositions();

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
        this._updateLockIcons(prevLockPositions);

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
