/**
 * SelectionHandler - Events module
 *
 * Click handling, keyboard shortcuts, and event listeners for the action bar.
 * Extends SelectionHandler.prototype.
 *
 * Load order: selection-core.js → selection-events.js → selection-actions.js
 */

(function() {
    const proto = SelectionHandler.prototype;

    /**
     * Initialize all event listeners
     */
    proto.initEventListeners = function() {
        // GRID CLICK HANDLING - SelectionHandler owns ALL grid clicks
        this.unifiedGrid?.addEventListener('click', (e) => {
            const thumb = e.target.closest('.thumbnail');
            if (!thumb) return;

            const fileId = parseInt(thumb.dataset.fileId);
            const index = parseInt(thumb.dataset.index);

            // Handle checkbox clicks - toggle selection
            const checkbox = e.target.closest('.thumb-checkbox');
            if (checkbox) {
                e.preventDefault();
                e.stopPropagation();
                this.toggleSelection(fileId, index);
                return;
            }

            // Don't handle if clicking other interactive elements (except duplicate badge)
            if (e.target.closest('button, a')) return;

            // Check if clicking the duplicate badge - select entire group
            if (e.target.closest('.thumb-badge.duplicate')) {
                this.handleDuplicateBadgeClick(fileId);
                return;
            }

            this.handleClick(e, fileId, index, thumb);
        });

        // Double-click to open examination
        this.unifiedGrid?.addEventListener('dblclick', (e) => {
            const thumb = e.target.closest('.thumbnail');
            if (!thumb) return;

            const fileId = parseInt(thumb.dataset.fileId);
            this.openExamination(fileId);
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.defaultPrevented) return;

            // Don't capture if typing in input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            // Don't handle if viewport is active (it has its own handlers)
            if (this.viewportController?.isActive) return;

            switch (e.key) {
                case 'Escape':
                    if (this.selectedIds.size > 0) {
                        this.clearSelection();
                        e.preventDefault();
                    }
                    break;

                case 'Delete':
                case 'Backspace':
                    if (this.selectedIds.size > 0) {
                        this.confirmDiscard();
                        e.preventDefault();
                    }
                    break;

                case 'a':
                    // Ctrl+A / Cmd+A - select all visible
                    if (e.ctrlKey || e.metaKey) {
                        this.selectAll();
                        e.preventDefault();
                    }
                    break;

                case 'Enter':
                    // Open examination view for selection (1-4 files for comparison)
                    if (this.selectedIds.size >= 1 && this.selectedIds.size <= 4) {
                        const fileId = Array.from(this.selectedIds)[0];
                        this.openExamination(fileId);
                        e.preventDefault();
                    }
                    break;
            }
        });

        // ==========================================
        // Action Bar — Selection Button (3-zone pill)
        // ==========================================

        const selectionBtn = document.getElementById('ab-selection-btn');

        // Eye zone: toggle select/clear
        selectionBtn?.querySelector('.chip-zone-eye')?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.selectedIds.size > 0) {
                this.clearSelection();
            } else {
                this.selectAll();
            }
        });

        // Info zone: examine selected files (when selection exists), else select all
        selectionBtn?.querySelector('.chip-zone-info')?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.selectedIds.size >= 1 && this.selectedIds.size <= 4) {
                const fileId = Array.from(this.selectedIds)[0];
                this.openExamination(fileId);
            } else if (this.selectedIds.size === 0) {
                this.selectAll();
            }
        });

        // Menu zone: open actions dropdown
        selectionBtn?.querySelector('.chip-zone-menu')?.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            const dropdown = document.getElementById('ab-actions-dropdown');
            if (!dropdown) return;
            const wasOpen = dropdown.classList.contains('open');
            window.filterHandler?._closeAllDropdowns();
            if (!wasOpen) dropdown.classList.add('open');
        });

        // ==========================================
        // Action Bar — Dropdown Items
        // ==========================================

        document.querySelectorAll('.split-dropdown-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = item.dataset.action;
                this.handleDropdownAction(action);
                item.closest('.split-dropdown')?.classList.remove('open');
            });
        });

        // Tag button and input are handled by TagsHandler (tags.js)
        // Only stop propagation so keyboard shortcuts don't fire while typing
        document.getElementById('quick-tag-input')?.addEventListener('keydown', (e) => {
            e.stopPropagation();
        });
        document.getElementById('quick-tag-input')?.addEventListener('keyup', (e) => {
            e.stopPropagation();
        });

        // Outside-click closing is handled by filterHandler._closeAllDropdowns()
        // via the unified handler in initSegmentDropdowns().
    };

    /**
     * Dispatch action from dropdown/overflow menu items
     */
    proto.handleDropdownAction = function(action) {
        switch (action) {
            case 'keep-selected':
                this.selectBestFromGroup();
                break;
            case 'discard-selected':
                this.confirmDiscard();
                break;
            case 'not-duplicate':
                this.markNotDuplicate();
                break;
            case 'not-similar':
                this.markNotSimilar();
                break;
            case 'select-group': {
                const mode = window.filterHandler?.getCurrentMode();
                if (mode === 'similar') {
                    this.selectEntireSimilarGroup();
                } else {
                    this.selectEntireDuplicateGroup();
                }
                break;
            }
            case 'accept-review':
                this.bulkReview('accept_review', 'selection');
                break;
            case 'mark-reviewed':
                this.bulkReview('mark_reviewed', 'selection');
                break;
            case 'clear-review':
                this.bulkReview('clear_review', 'selection');
                break;
            case 'restore-selected':
                this.undiscardSelected();
                break;
            case 'restore-all':
                this.restoreAllDiscarded();
                break;
            case 'examine':
                if (this.selectedIds.size >= 1 && this.selectedIds.size <= 4) {
                    const fileId = Array.from(this.selectedIds)[0];
                    this.openExamination(fileId);
                }
                break;
        }
    };

    /**
     * Handle click on a thumbnail
     */
    proto.handleClick = function(event, fileId, index, thumbElement) {
        const visibleFiles = window.resultsHandler?.allFiles || [];

        if (event.shiftKey && this.lastSelectedIndex !== null) {
            // Range selection
            const start = Math.min(this.lastSelectedIndex, index);
            const end = Math.max(this.lastSelectedIndex, index);

            for (let i = start; i <= end; i++) {
                if (visibleFiles[i]) {
                    this.selectedIds.add(visibleFiles[i].id);
                }
            }
        } else if (event.ctrlKey || event.metaKey) {
            // Toggle selection
            if (this.selectedIds.has(fileId)) {
                this.selectedIds.delete(fileId);
            } else {
                this.selectedIds.add(fileId);
            }
        } else {
            // Single click without modifier
            if (this.selectedIds.size === 1 && this.selectedIds.has(fileId)) {
                this.openExamination(fileId);
                return;
            }

            this.selectedIds.clear();
            this.selectedIds.add(fileId);
        }

        this.lastSelectedIndex = index;
        this.lastSelectedId = fileId;

        this.updateUI();
        this.syncWithResultsHandler();
    };

    /**
     * Handle click on duplicate badge - select entire group
     */
    proto.handleDuplicateBadgeClick = function(fileId) {
        const visibleFiles = window.resultsHandler?.allFiles || [];
        const file = visibleFiles.find(f => f.id === fileId);

        if (!file?.exact_group_id) return;

        this.selectedIds.clear();
        visibleFiles.forEach(f => {
            if (f.exact_group_id === file.exact_group_id) {
                this.selectedIds.add(f.id);
            }
        });

        this.updateUI();
        this.syncWithResultsHandler();
    };
})();
