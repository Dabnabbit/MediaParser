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
        // Action Bar — Primary Buttons
        // ==========================================

        // Duplicates: Keep Selected
        document.getElementById('ab-keep-selected')?.addEventListener('click', () => {
            this.selectBestFromGroup();
        });

        // Similar: Keep Selected
        document.getElementById('ab-similar-keep')?.addEventListener('click', () => {
            this.selectBestFromGroup();
        });

        // Unreviewed: Accept & Review
        document.getElementById('ab-accept-review')?.addEventListener('click', () => {
            this.bulkReview('accept_review', 'selection');
        });

        // Reviewed: Clear Review
        document.getElementById('ab-clear-review')?.addEventListener('click', () => {
            this.bulkReview('clear_review', 'selection');
        });

        // Reviewed: Discard
        document.getElementById('ab-reviewed-discard')?.addEventListener('click', () => {
            this.confirmDiscard();
        });

        // Discarded: Restore
        document.getElementById('ab-restore')?.addEventListener('click', () => {
            this.undiscardSelected();
        });

        // ==========================================
        // Action Bar — Split Button Carets
        // ==========================================

        const setupCaret = (caretId, dropdownId) => {
            const caret = document.getElementById(caretId);
            const dropdown = document.getElementById(dropdownId);
            if (!caret || !dropdown) return;

            caret.addEventListener('click', (e) => {
                e.stopPropagation();
                // Close other dropdowns
                document.querySelectorAll('.split-dropdown.open, .action-overflow-menu.open').forEach(d => {
                    if (d !== dropdown) d.classList.remove('open');
                });
                dropdown.classList.toggle('open');
            });
        };

        setupCaret('ab-keep-caret', 'ab-keep-dropdown');
        setupCaret('ab-similar-caret', 'ab-similar-dropdown');
        setupCaret('ab-accept-caret', 'ab-accept-dropdown');
        setupCaret('ab-restore-caret', 'ab-restore-dropdown');

        // ==========================================
        // Action Bar — Split Dropdown Items
        // ==========================================

        document.querySelectorAll('.split-dropdown-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = item.dataset.action;
                this.handleDropdownAction(action);
                // Close dropdown
                item.closest('.split-dropdown')?.classList.remove('open');
            });
        });

        // ==========================================
        // Action Bar — Overflow Menu
        // ==========================================

        const overflowTrigger = document.getElementById('action-overflow-trigger');
        const overflowMenu = document.getElementById('action-overflow-menu');

        overflowTrigger?.addEventListener('click', (e) => {
            e.stopPropagation();
            // Close other dropdowns
            document.querySelectorAll('.split-dropdown.open').forEach(d => d.classList.remove('open'));
            overflowMenu?.classList.toggle('open');
        });

        // Overflow menu items
        overflowMenu?.querySelectorAll('.action-overflow-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = item.dataset.action;
                this.handleDropdownAction(action);
                overflowMenu.classList.remove('open');
            });
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
            // Stop propagation so keyboard shortcuts don't fire
            e.stopPropagation();
        });

        // Prevent tag input from capturing the 'a' key
        document.getElementById('quick-tag-input')?.addEventListener('keyup', (e) => {
            e.stopPropagation();
        });

        // ==========================================
        // Close all dropdowns on outside click
        // ==========================================

        document.addEventListener('click', (e) => {
            // Close split dropdowns
            if (!e.target.closest('.split-btn')) {
                document.querySelectorAll('.split-dropdown.open').forEach(d => d.classList.remove('open'));
            }
            // Close overflow menu
            if (!e.target.closest('.action-bar-right')) {
                document.getElementById('action-overflow-menu')?.classList.remove('open');
            }
        });
    };

    /**
     * Dispatch action from dropdown/overflow menu items
     */
    proto.handleDropdownAction = function(action) {
        switch (action) {
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
            case 'mark-reviewed':
                this.bulkReview('mark_reviewed', 'selection');
                break;
            case 'restore-all':
                this.restoreAllDiscarded();
                break;
            case 'select-all':
                this.selectAll();
                break;
            case 'examine':
                if (this.selectedIds.size >= 1 && this.selectedIds.size <= 4) {
                    const fileId = Array.from(this.selectedIds)[0];
                    this.openExamination(fileId);
                }
                break;
            case 'clear-selection':
                this.clearSelection();
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
