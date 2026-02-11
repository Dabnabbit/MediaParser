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
        this.strictMode = localStorage.getItem('strictWorkflow') !== 'false';

        // Cache DOM elements
        this.modeChips = document.querySelectorAll('.mode-segment:not(.export-segment)');
        this.exportSegment = document.querySelector('.export-segment');
        this.confidenceChips = document.querySelectorAll('.confidence-filters .filter-chip');
        this.indicatorDiscarded = document.getElementById('indicator-discarded');
        this.indicatorFailed = document.getElementById('indicator-failed');
        this.reviewedOverlay = document.getElementById('reviewed-overlay');
        this.modeSegmentsContainer = document.getElementById('mode-segments');
        this.initEventListeners();
        this.initSegmentDropdowns();
        this.initChipDropdowns();
        this.initIndicatorDropdowns();
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

        // Reviewed overlay click (but not on chevron)
        this.reviewedOverlay?.addEventListener('click', (e) => {
            if (e.target.closest('.seg-chevron')) return;
            this.setMode('reviewed');
        });

        // Summary indicator clicks (discarded/failed) — ignore menu zone clicks
        [this.indicatorDiscarded, this.indicatorFailed].forEach(btn => {
            btn?.addEventListener('click', (e) => {
                if (e.target.closest('.chip-zone-menu')) return;
                this.setMode(btn.dataset.mode);
            });
        });

        // Confidence filter clicks — eye/info zones toggle, menu zone is handled by dropdown
        this.confidenceChips.forEach(chip => {
            chip.addEventListener('click', (e) => {
                if (e.target.closest('.chip-zone-menu')) return;
                if (chip.classList.contains('chip-empty')) return;
                const filter = chip.dataset.filter;
                this.toggleConfidence(filter);
            });
        });
    }

    // ==========================================
    // Dropdown Helpers (shared by segment + chip dropdowns)
    // ==========================================

    /**
     * Wire chevron-click, right-click, and long-press on a set of elements,
     * each opening a dropdown via the provided callback.
     */
    _wireDropdownTriggers(elements, chevronSelector, openFn) {
        elements.forEach(el => {
            const chevron = el.querySelector(chevronSelector);
            if (!chevron) return;

            chevron.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                openFn(el);
            });

            el.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                openFn(el);
            });

            let longPressTimer = null;
            el.addEventListener('touchstart', (e) => {
                longPressTimer = setTimeout(() => {
                    e.preventDefault();
                    openFn(el);
                }, 500);
            }, { passive: false });

            el.addEventListener('touchend', () => {
                if (longPressTimer) clearTimeout(longPressTimer);
            });

            el.addEventListener('touchmove', () => {
                if (longPressTimer) clearTimeout(longPressTimer);
            });
        });
    }

    /**
     * Create a dropdown, position it below an anchor element.
     * Returns the dropdown element, or null if toggled closed.
     * @param {Element} anchor - element to position below
     * @param {string} openClass - class added to openTarget when open
     * @param {Element} [openTarget=anchor] - element that receives the open class
     */
    _createDropdown(anchor, openClass, openTarget) {
        const target = openTarget || anchor;

        // Toggle: if already open, just close
        if (target.classList.contains(openClass)) {
            this._closeAllDropdowns();
            return null;
        }

        this._closeAllDropdowns();
        target.classList.add(openClass);

        const dropdown = document.createElement('div');
        dropdown.className = 'seg-dropdown filter-dropdown';

        const anchorRect = anchor.getBoundingClientRect();
        dropdown.style.position = 'fixed';
        dropdown.style.top = (anchorRect.bottom + 4) + 'px';
        const dropdownWidth = 240; // matches min-width in CSS
        let left = anchorRect.left + anchorRect.width / 2 - dropdownWidth / 2;
        left = Math.max(8, Math.min(left, window.innerWidth - dropdownWidth - 8));
        dropdown.style.left = left + 'px';

        return dropdown;
    }

    /**
     * Append dropdown to body and wire item click handlers.
     * Each item calls actionFn(item.dataset) then closes all dropdowns.
     */
    _wireDropdownItems(dropdown, actionFn) {
        document.body.appendChild(dropdown);
        dropdown.querySelectorAll('.seg-dropdown-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                actionFn(item.dataset);
                this._closeAllDropdowns();
            });
        });
    }

    /**
     * Close ALL dropdowns app-wide (filter dropdowns + action bar split/overflow).
     * Called from both filters.js and selection-events.js.
     */
    _closeAllDropdowns() {
        // Filter dropdowns (body-appended)
        document.querySelectorAll('.filter-dropdown').forEach(d => d.remove());
        document.querySelectorAll('.seg-dropdown-open').forEach(s => s.classList.remove('seg-dropdown-open'));
        document.querySelectorAll('.chip-dropdown-open').forEach(c => c.classList.remove('chip-dropdown-open'));
        // Action bar dropdown
        document.querySelectorAll('.split-dropdown.open').forEach(d => d.classList.remove('open'));
    }

    // ==========================================
    // Segment Dropdowns
    // ==========================================

    initSegmentDropdowns() {
        const allSegments = [...this.modeChips];
        if (this.reviewedOverlay) allSegments.push(this.reviewedOverlay);

        this._wireDropdownTriggers(allSegments, '.seg-chevron', (seg) => this.openSegmentDropdown(seg));

        // Close all dropdowns on outside click (registered once, covers all types)
        document.addEventListener('click', (e) => {
            if (e.target.closest('.filter-dropdown, .seg-chevron, .chip-chevron, .chip-zone-menu, .action-selection, .split-dropdown')) return;
            this._closeAllDropdowns();
        });
    }

    openSegmentDropdown(segment) {
        const mode = segment.dataset.mode;
        const count = this.counts[mode] || 0;
        if (count === 0) return;

        // Position on chevron if present, open class goes on segment
        const chevron = segment.querySelector('.seg-chevron');
        const dropdown = this._createDropdown(chevron || segment, 'seg-dropdown-open', segment);
        if (!dropdown) return;

        const hi = this.counts.high || 0;
        const med = this.counts.medium || 0;
        const lo = this.counts.low || 0;

        if (mode === 'duplicates' || mode === 'similar') {
            const label = mode === 'duplicates' ? 'Duplicate' : 'Similar';
            let items = `<div class="seg-dropdown-header">Auto-resolve ${label} Groups</div>`;
            if (hi)  items += `<button class="seg-dropdown-item" data-action="auto-resolve" data-confidence="high"><span class="chip-badge confidence-high">H</span> Auto-resolve HIGH groups</button>`;
            if (med) items += `<button class="seg-dropdown-item" data-action="auto-resolve" data-confidence="medium"><span class="chip-badge confidence-medium">M</span> Auto-resolve MEDIUM groups</button>`;
            if (lo)  items += `<button class="seg-dropdown-item" data-action="auto-resolve" data-confidence="low"><span class="chip-badge confidence-low">L</span> Auto-resolve LOW groups</button>`;
            items += `<div class="seg-dropdown-divider"></div>`;
            items += `<button class="seg-dropdown-item" data-action="auto-resolve-all">Auto-resolve ALL groups</button>`;
            items += `<button class="seg-dropdown-item" data-action="keep-all">Keep all (not ${mode === 'duplicates' ? 'duplicates' : 'similar'})</button>`;
            dropdown.innerHTML = items;
        } else if (mode === 'unreviewed') {
            let items = `<div class="seg-dropdown-header">Bulk Review</div>`;
            if (hi)  items += `<button class="seg-dropdown-item" data-action="accept-review" data-confidence="high"><span class="chip-badge confidence-high">H</span> Accept all HIGH</button>`;
            if (med) items += `<button class="seg-dropdown-item" data-action="accept-review" data-confidence="medium"><span class="chip-badge confidence-medium">M</span> Accept all MEDIUM</button>`;
            if (lo)  items += `<button class="seg-dropdown-item" data-action="accept-review" data-confidence="low"><span class="chip-badge confidence-low">L</span> Accept all LOW</button>`;
            items += `<div class="seg-dropdown-divider"></div>`;
            items += `<button class="seg-dropdown-item" data-action="mark-all-reviewed">Mark all reviewed</button>`;
            dropdown.innerHTML = items;
        } else if (mode === 'reviewed') {
            dropdown.innerHTML = `
                <div class="seg-dropdown-header">Reviewed Files</div>
                <button class="seg-dropdown-item" data-action="clear-all-reviews">Clear all reviews</button>
            `;
        }

        this._wireDropdownItems(dropdown, (data) => this._handleDropdownAction(mode, data));
    }

    // ==========================================
    // Chip Dropdowns (confidence filter chips)
    // ==========================================

    initChipDropdowns() {
        this._wireDropdownTriggers(this.confidenceChips, '.chip-zone-menu', (chip) => this.openChipDropdown(chip));
    }

    openChipDropdown(chip) {
        const level = chip.dataset.filter;
        const mode = this.currentMode;

        // No dropdown for discarded/failed modes
        if (mode === 'discarded' || mode === 'failed') return;

        const count = this.counts[level] || 0;
        if (count === 0) return;

        const dropdown = this._createDropdown(chip, 'chip-dropdown-open');
        if (!dropdown) return;
        const levelUpper = level.toUpperCase();

        const selectItem = `
            <div class="seg-dropdown-divider"></div>
            <button class="seg-dropdown-item" data-action="select-confidence" data-confidence="${level}">
                Select all ${levelUpper}
            </button>`;

        if (mode === 'duplicates' || mode === 'similar') {
            const label = mode === 'duplicates' ? 'duplicate' : 'similar';
            dropdown.innerHTML = `
                <div class="seg-dropdown-header">${levelUpper} Confidence ${label} groups</div>
                <button class="seg-dropdown-item" data-action="auto-resolve" data-confidence="${level}">
                    Auto-resolve ${levelUpper} ${label}s
                </button>
                ${selectItem}
            `;
        } else if (mode === 'unreviewed') {
            dropdown.innerHTML = `
                <div class="seg-dropdown-header">${levelUpper} Confidence files</div>
                <button class="seg-dropdown-item" data-action="accept-review" data-confidence="${level}">
                    Accept all ${levelUpper}
                </button>
                <button class="seg-dropdown-item" data-action="mark-reviewed" data-confidence="${level}">
                    Mark all ${levelUpper} reviewed
                </button>
                ${selectItem}
            `;
        } else if (mode === 'reviewed') {
            dropdown.innerHTML = `
                <div class="seg-dropdown-header">${levelUpper} Confidence files</div>
                <button class="seg-dropdown-item" data-action="clear-review" data-confidence="${level}">
                    Clear review from ${levelUpper}
                </button>
                ${selectItem}
            `;
        }

        this._wireDropdownItems(dropdown, (data) => this._handleDropdownAction(mode, data));
    }

    // ==========================================
    // Indicator Dropdowns (discarded/failed summary indicators)
    // ==========================================

    initIndicatorDropdowns() {
        const indicators = [this.indicatorDiscarded, this.indicatorFailed].filter(Boolean);
        this._wireDropdownTriggers(indicators, '.chip-zone-menu', (btn) => this.openIndicatorDropdown(btn));
    }

    openIndicatorDropdown(indicator) {
        const mode = indicator.dataset.mode;

        if (mode === 'discarded') {
            const count = this.counts.discards || 0;
            if (count === 0) return;

            const dropdown = this._createDropdown(indicator, 'chip-dropdown-open');
            if (!dropdown) return;
            dropdown.innerHTML = `
                <div class="seg-dropdown-header">Discarded Files</div>
                <button class="seg-dropdown-item" data-action="restore-all">Restore all ${count} discarded</button>
            `;
            this._wireDropdownItems(dropdown, (data) => this._handleDropdownAction(mode, data));
        }
        // failed mode: view-only, no actions
    }

    // ==========================================
    // Dropdown Action Dispatch (shared)
    // ==========================================

    /**
     * Unified action handler for both segment and chip dropdown items.
     * Each item carries data-action and optionally data-confidence.
     */
    _handleDropdownAction(mode, data) {
        switch (data.action) {
            case 'auto-resolve':
                this.autoResolveByConfidence(mode, data.confidence);
                break;
            case 'accept-review':
                this._bulkReviewByConfidence('accept_review', data.confidence);
                break;
            case 'mark-reviewed':
                this._bulkReviewByConfidence('mark_reviewed', data.confidence);
                break;
            case 'clear-review':
                this._bulkReviewByConfidence('clear_review', data.confidence);
                break;
            case 'auto-resolve-all':
                this.autoResolveByConfidence(mode, null);
                break;
            case 'keep-all':
                this.keepAllInMode(mode);
                break;
            case 'mark-all-reviewed':
                this._bulkReviewAll('mark_reviewed', mode);
                break;
            case 'clear-all-reviews':
                this._bulkReviewAll('clear_review', mode);
                break;
            case 'restore-all':
                if (window.selectionHandler) {
                    window.selectionHandler.restoreAllDiscarded();
                }
                break;
            case 'select-confidence':
                if (window.selectionHandler) {
                    window.selectionHandler.selectByConfidence(data.confidence);
                }
                break;
        }
    }

    // ==========================================
    // Mode-Aware Chip Tooltips
    // ==========================================

    _updateChipTooltips() {
        const infoTooltips = {
            duplicates: {
                high: 'Near-identical match (distance 0\u20131)',
                medium: 'Close match (distance 2\u20133)',
                low: 'Weak match (distance 4\u20135)'
            },
            similar: {
                high: 'Strong visual similarity',
                medium: 'Moderate similarity',
                low: 'Marginal similarity'
            },
            unreviewed: {
                high: 'Multiple sources agree',
                medium: 'Single reliable source',
                low: 'Filename only or conflicts'
            },
            reviewed: {
                high: 'Multiple sources agree',
                medium: 'Single reliable source',
                low: 'Filename only or conflicts'
            },
            discarded: {
                high: 'Multiple sources agree',
                medium: 'Single reliable source',
                low: 'Filename only or conflicts'
            },
            failed: {
                high: 'Multiple sources agree',
                medium: 'Single reliable source',
                low: 'Filename only or conflicts'
            }
        };

        const levelNames = { high: 'High', medium: 'Medium', low: 'Low' };
        const modeInfo = infoTooltips[this.currentMode] || infoTooltips.unreviewed;

        this.confidenceChips.forEach(chip => {
            const level = chip.dataset.filter;
            const name = levelNames[level];
            const isVisible = this.visibleConfidence.has(level);
            const isEmpty = (this.counts[level] || 0) === 0;

            // Clear chip-level tooltip (zones handle their own)
            chip.title = '';

            const eyeZone = chip.querySelector('.chip-zone-eye');
            const infoZone = chip.querySelector('.chip-zone-info');
            const menuZone = chip.querySelector('.chip-zone-menu');

            if (eyeZone) {
                eyeZone.title = isEmpty ? '' : isVisible
                    ? `Hide ${name.toLowerCase()} confidence`
                    : `Show ${name.toLowerCase()} confidence`;
            }
            if (infoZone) {
                infoZone.title = modeInfo[level] || '';
            }
            if (menuZone) {
                menuZone.title = isEmpty ? '' : 'Bulk actions';
            }
        });
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

            // Filter to groups by confidence (null = all groups)
            const confKey = mode === 'similar' ? 'similar_group_confidence' : 'exact_group_confidence';
            const targetGroups = [];
            for (const [gid, members] of groups) {
                if (confidence) {
                    const hasMatch = members.some(f => f[confKey]?.toLowerCase() === confidence);
                    if (!hasMatch) continue;
                }
                targetGroups.push(members);
            }

            if (targetGroups.length === 0) {
                window.selectionHandler?.showToast(confidence
                    ? `No ${confidence.toUpperCase()} confidence groups found`
                    : 'No groups found');
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

            const confLabel = confidence ? `${confidence.toUpperCase()} ` : '';
            const msg = `Auto-resolve ${targetGroups.length} ${confLabel}groups? Keep ${keepCount}, discard ${toDiscard.length}.`;
            const { confirmed } = await showModal({
                title: 'Auto-resolve Groups',
                body: msg,
                confirmText: 'Resolve',
                dangerous: true
            });
            if (!confirmed) return;

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
            window.showToast(`Auto-resolve failed: ${error.message}`, 'error');
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
        const { confirmed } = await showModal({
            title: `Keep All (Not ${label.charAt(0).toUpperCase() + label.slice(1)})`,
            body: msg,
            confirmText: 'Keep All'
        });
        if (!confirmed) return;

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
            window.showToast(`Failed: ${error.message}`, 'error');
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
     * Bulk review all files in a mode (for segment dropdown)
     */
    _bulkReviewAll(action, mode) {
        mode = mode || this.currentMode;
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

        // Hide tag controls in failed mode (failed files are excluded from export)
        const tagInput = document.getElementById('quick-tag-input');
        const tagBtn = document.getElementById('add-quick-tag');
        if (tagInput) tagInput.style.display = this.currentMode === 'failed' ? 'none' : '';
        if (tagBtn) tagBtn.style.display = this.currentMode === 'failed' ? 'none' : '';

        // Update confidence chips — mutually exclusive states
        // Inert in failed/discarded modes (confidence not applicable)
        const confidenceInert = this.currentMode === 'failed' || this.currentMode === 'discarded';
        this.confidenceChips.forEach(chip => {
            const level = chip.dataset.filter;
            const count = this.counts[level] || 0;
            const isVisible = this.visibleConfidence.has(level);
            const state = confidenceInert  ? 'chip-empty'
                        : count === 0      ? 'chip-empty'
                        : isVisible        ? 'chip-enabled'
                        :               'chip-disabled';
            chip.classList.remove('chip-enabled', 'chip-disabled', 'chip-empty',
                                  'active', 'hidden-filter', 'empty-filter');
            chip.classList.add(state);
        });

        // Update mode-aware tooltips on confidence chips
        this._updateChipTooltips();
    }

    updateCounts(counts) {
        const prevDiscards = this.counts.discards || 0;
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

            // Strict workflow: lock segments that can't be accessed yet
            const locked = this.strictMode && this._isModeLocked(mode) && count > 0;
            seg.classList.toggle('locked', locked);

            // Attention pulse: unlocked segments with items that aren't the current mode
            const needsAttention = (mode === 'duplicates' || mode === 'similar')
                                && count > 0
                                && !locked
                                && mode !== this.currentMode;
            seg.classList.toggle('has-items', needsAttention);
        });

        // Diagonal stripe on unreviewed while dupes/similar still have items
        const unreviewedSeg = document.querySelector('.mode-segment[data-mode="unreviewed"]');
        if (unreviewedSeg) {
            const pending = (this.counts.duplicates || 0) + (this.counts.similar || 0);
            unreviewedSeg.classList.toggle('seg-processing', pending > 0);
        }


        // Update reviewed overlay width and reposition mode segments
        const reviewedPct = total > 0 ? ((this.counts.reviewed || 0) / total) * 100 : 0;
        if (this.reviewedOverlay) {
            this.reviewedOverlay.style.width = reviewedPct + '%';
            this.reviewedOverlay.classList.toggle('seg-empty', reviewedPct === 0);
            this.reviewedOverlay.classList.toggle('seg-small', reviewedPct > 0 && reviewedPct < 8);
            this.reviewedOverlay.classList.toggle('full-width', reviewedPct >= 99.5);
            // Stripe while reviewing is in progress (has reviewed items but not all done)
            this.reviewedOverlay.classList.toggle('seg-processing', reviewedPct > 0 && reviewedPct < 100);
        }
        // Push mode segments to the right of the reviewed overlay
        if (this.modeSegmentsContainer) {
            this.modeSegmentsContainer.style.left = reviewedPct + '%';
            this.modeSegmentsContainer.style.width = (100 - reviewedPct) + '%';
        }

        // Show/hide summary indicators for side-channel modes
        const showFailed = (this.counts.failed || 0) > 0;
        const showDiscarded = (this.counts.discards || 0) > 0;
        const wasDiscardedHidden = this.indicatorDiscarded && this.indicatorDiscarded.style.display === 'none';
        if (this.indicatorFailed) this.indicatorFailed.style.display = showFailed ? 'inline-flex' : 'none';
        if (this.indicatorDiscarded) this.indicatorDiscarded.style.display = showDiscarded ? 'inline-flex' : 'none';

        // Particle effects for discards
        const newDiscards = this.counts.discards || 0;
        if (newDiscards > prevDiscards && this.indicatorDiscarded && window.particles) {
            requestAnimationFrame(() => {
                if (wasDiscardedHidden) {
                    // First appearance: shimmer + sound
                    window.particles.notifySound();
                    this.indicatorDiscarded.classList.add('shimmer-once');
                    this.indicatorDiscarded.addEventListener('animationend', () => {
                        this.indicatorDiscarded.classList.remove('shimmer-once');
                    }, { once: true });
                } else {
                    // Count increased: trail from active mode segment to chip
                    const seg = document.querySelector(`.mode-segment[data-mode="${this.currentMode}"]`);
                    if (seg) {
                        window.particles.trail(seg, this.indicatorDiscarded, {
                            count: Math.min(newDiscards - prevDiscards, 8),
                            color: '#f59e0b',
                        });
                    }
                }
            });
        }

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
                // Advance breadcrumb: Review ✓, Export active
                if (window.progressHandler) {
                    window.progressHandler.setPhase('export');
                }
                // Un-collapse and show export segment
                this.exportSegment.classList.remove('collapsed');
                this.exportSegment.style.flexGrow = '1';
                if (!this.exportSegment.classList.contains('ready')) {
                    this.exportSegment.classList.add('ready');
                    // Delay burst until segment has transitioned into view
                    setTimeout(() => {
                        if (Math.random() < 0.05) {
                            // ~5% chance: fart + success sound for fun
                            window.particles.fart(this.exportSegment);
                            window.particles.successSound();
                        } else {
                            window.particles.burst(this.exportSegment);
                        }
                    }, 350);
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
                // Revert breadcrumb: Review active again
                if (window.progressHandler) {
                    window.progressHandler.setPhase('review');
                }
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

        // Re-apply chip states now that counts have changed
        this.updateStyles();

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
        // Failed/discarded modes: skip confidence filter (files may have no confidence)
        if (this.currentMode !== 'failed' && this.currentMode !== 'discarded') {
            const visibleLevels = Array.from(this.visibleConfidence);
            // Include 'none' with 'low' since they're both uncertain timestamps
            // But not in group modes — group confidence never has a 'none' value
            if (visibleLevels.includes('low') && this.currentMode !== 'duplicates' && this.currentMode !== 'similar') {
                visibleLevels.push('none');
            }
            params.set('confidence', visibleLevels.join(','));
        }

        // Sort
        params.set('sort', this.sortField);
        params.set('order', this.sortOrder);

        return params;
    }

    getCurrentMode() {
        return this.currentMode;
    }

    getCountForMode(mode) {
        const key = mode === 'discarded' ? 'discards' : mode;
        return this.counts[key] || 0;
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
        // Preserve user's confidence visibility preference (restored by loadState)
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
        // Reset export segment
        if (this.exportSegment) {
            this.exportSegment.classList.add('collapsed');
            this.exportSegment.classList.remove('ready');
            this.exportSegment.style.flexGrow = '0';
        }
        // Reset reviewed overlay
        if (this.reviewedOverlay) {
            this.reviewedOverlay.style.width = '0%';
            this.reviewedOverlay.classList.remove('active', 'seg-small', 'full-width', 'all-reviewed', 'seg-processing');
            this.reviewedOverlay.classList.add('seg-empty');
        }
        // Reset mode segments positioning
        if (this.modeSegmentsContainer) {
            this.modeSegmentsContainer.style.left = '0';
            this.modeSegmentsContainer.style.width = '100%';
        }
        // Hide summary indicator pills
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
        const prev = this.currentMode;
        let selected;

        // Enforce sequential resolution: Duplicates → Similar → Unreviewed
        if (this.counts.duplicates > 0) {
            this.setMode('duplicates');
            selected = 'duplicates';
        } else if (this.counts.similar > 0) {
            this.setMode('similar');
            selected = 'similar';
        } else if (this.counts.unreviewed > 0) {
            this.setMode('unreviewed');
            selected = 'unreviewed';
        } else {
            // All review done — default to reviewed mode
            this.setMode('reviewed');
            selected = 'reviewed';
        }

        // One-shot shimmer + sound on the newly active segment
        if (selected !== prev) {
            const seg = selected === 'reviewed'
                ? this.reviewedOverlay
                : document.querySelector(`.mode-segment[data-mode="${selected}"]`);
            if (seg) {
                setTimeout(() => {
                    seg.classList.add('shimmer-once');
                    seg.addEventListener('animationend', () => {
                        seg.classList.remove('shimmer-once');
                    }, { once: true });
                    if (window.particles) {
                        const rect = seg.getBoundingClientRect();
                        window.particles.shatter({ cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2 });
                    }
                }, 300);
            }
        }

        return selected;
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
