/**
 * SelectionHandler - Events module
 *
 * Click handling, keyboard shortcuts, and event listeners.
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

        // Toolbar buttons
        document.getElementById('clear-selection')?.addEventListener('click', () => {
            this.clearSelection();
        });

        document.getElementById('discard-selected')?.addEventListener('click', () => {
            this.confirmDiscard();
        });

        // Duplicate group actions
        document.getElementById('select-group')?.addEventListener('click', () => {
            this.selectEntireDuplicateGroup();
        });

        document.getElementById('not-duplicate')?.addEventListener('click', () => {
            this.markNotDuplicate();
        });

        document.getElementById('select-best')?.addEventListener('click', () => {
            this.selectBestFromGroup();
        });

        // Quick tag add
        document.getElementById('add-quick-tag')?.addEventListener('click', () => {
            this.addQuickTag();
        });

        // Allow Enter key to add tag
        document.getElementById('quick-tag-input')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.addQuickTag();
                e.preventDefault();
            }
        });

        // Bulk review actions on selection
        document.getElementById('accept-review-selected')?.addEventListener('click', () => {
            this.bulkReview('accept_review', 'selection');
        });

        document.getElementById('mark-reviewed-selected')?.addEventListener('click', () => {
            this.bulkReview('mark_reviewed', 'selection');
        });

        // Examine/Compare button
        document.getElementById('examine-selected')?.addEventListener('click', () => {
            if (this.selectedIds.size >= 1 && this.selectedIds.size <= 4) {
                const fileId = Array.from(this.selectedIds)[0];
                this.openExamination(fileId);
            }
        });
    };

    /**
     * Handle click on a thumbnail
     */
    proto.handleClick = function(event, fileId, index, thumbElement) {
        const visibleFiles = window.resultsHandler?.allFiles || [];
        const file = visibleFiles.find(f => f.id === fileId);

        if (event.shiftKey && this.lastSelectedIndex !== null) {
            // Range selection
            const start = Math.min(this.lastSelectedIndex, index);
            const end = Math.max(this.lastSelectedIndex, index);

            // Add all files in range
            for (let i = start; i <= end; i++) {
                if (visibleFiles[i]) {
                    this.selectedIds.add(visibleFiles[i].id);
                }
            }
        } else if (event.ctrlKey || event.metaKey) {
            // Toggle selection (single file only, even for duplicates)
            if (this.selectedIds.has(fileId)) {
                this.selectedIds.delete(fileId);
            } else {
                this.selectedIds.add(fileId);
            }
        } else {
            // Single click without modifier
            // If clicking already-selected single item, open examination
            // (For multi-select, user must use Compare button or Enter key)
            if (this.selectedIds.size === 1 && this.selectedIds.has(fileId)) {
                this.openExamination(fileId);
                return;
            }

            // Clear and select just this file (not the whole duplicate group)
            this.selectedIds.clear();
            this.selectedIds.add(fileId);

            // Note: Don't auto-open examination on first click
            // User must click again or press Enter to examine
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
        // Clicking duplicate badge selects entire duplicate group
        const visibleFiles = window.resultsHandler?.allFiles || [];
        const file = visibleFiles.find(f => f.id === fileId);

        if (!file?.exact_group_id) return;

        // Clear current selection and select all files with same exact_group_id
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
