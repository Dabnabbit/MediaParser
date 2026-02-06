/**
 * SelectionHandler - Core module
 *
 * Manages selection state, UI updates, and viewport integration.
 * Other selection-*.js files extend this class via prototype.
 *
 * Load order: selection-core.js → selection-events.js → selection-actions.js
 */

class SelectionHandler {
    constructor() {
        this.selectedIds = new Set();
        this.lastSelectedIndex = null;
        this.lastSelectedId = null;

        // Cache DOM elements
        this.toolbar = document.getElementById('selection-toolbar');
        this.countDisplay = document.getElementById('selection-count');
        this.unifiedGrid = document.getElementById('unified-grid');

        // ViewportController instance (initialized later when TileManager is ready)
        this.viewportController = null;

        this.initEventListeners();
        this.initViewportController();
    }

    // ==========================================
    // Viewport Integration
    // ==========================================

    /**
     * Initialize ViewportController for examination mode
     * Called after TileManager is available
     */
    initViewportController() {
        // Defer initialization until TileManager is ready
        const tryInit = () => {
            const tileManager = window.resultsHandler?.getTileManager();
            if (tileManager) {
                this.viewportController = new ViewportController(tileManager, {
                    onFileChange: (file) => this.onViewportFileChange(file),
                    onExit: () => this.onViewportExit(),
                });

                // Listen for viewport events
                window.addEventListener('viewportNavigate', (e) => {
                    // Update details panel on navigation
                    this.updateDetailsForFile(e.detail.file);
                });

                // Exit viewport when filter changes (navigation set changes)
                window.addEventListener('filterChange', () => {
                    if (this.viewportController?.isActive) {
                        // Exit viewport since the file set is changing
                        this.viewportController.exit();
                    }
                });
            } else {
                // Retry after a short delay
                setTimeout(tryInit, 100);
            }
        };

        // Start trying after DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', tryInit);
        } else {
            setTimeout(tryInit, 50);
        }
    }

    /**
     * Called when current file changes in viewport
     */
    onViewportFileChange(file) {
        if (file) {
            this.updateDetailsForFile(file);
        }
    }

    /**
     * Called when exiting viewport mode
     */
    onViewportExit() {
        // Could update selection to last viewed file
        // For now, just let the viewport handle scroll restoration
    }

    /**
     * Update details panel for a file
     */
    updateDetailsForFile(file) {
        // Dispatch event for examination/timestamp handlers
        window.dispatchEvent(new CustomEvent('fileSelected', {
            detail: { file, fileId: file?.id }
        }));
    }

    /**
     * Open examination/viewport mode for a file
     */
    openExamination(fileId) {
        // Use ViewportController if available
        if (this.viewportController) {
            // Determine navigation set based on selection/filter state
            const navigableIds = this.getNavigableFileIds(fileId);
            this.viewportController.enter(fileId, navigableIds);
            return;
        }

        // Fallback: Dispatch event for legacy examination handler
        window.dispatchEvent(new CustomEvent('fileExamine', {
            detail: {
                fileId,
                selectedIds: Array.from(this.selectedIds),
                files: window.resultsHandler?.allFiles || []
            }
        }));
    }

    /**
     * Get the list of file IDs that should be navigable in viewport mode
     * Priority: multi-selection > duplicate/similar group > current filter > all visible
     */
    getNavigableFileIds(clickedFileId) {
        const visibleFiles = window.resultsHandler?.allFiles || [];
        const currentMode = window.filterHandler?.getCurrentMode();

        // If multiple files are selected, navigate only selected files
        if (this.selectedIds.size > 1) {
            // Return selected IDs in display order
            return visibleFiles
                .filter(f => this.selectedIds.has(f.id))
                .map(f => f.id);
        }

        // In duplicates mode, navigate the duplicate group only
        if (currentMode === 'duplicates') {
            const clickedFile = visibleFiles.find(f => f.id === clickedFileId);
            if (clickedFile?.is_duplicate) {
                // Get all files in the same duplicate group
                const groupFiles = visibleFiles.filter(f =>
                    f.exact_group_id && f.exact_group_id === clickedFile.exact_group_id
                );
                if (groupFiles.length > 0) {
                    return groupFiles.map(f => f.id);
                }
            }
        }

        // In similar mode, navigate the similar group only
        if (currentMode === 'similar') {
            const clickedFile = visibleFiles.find(f => f.id === clickedFileId);
            if (clickedFile?.is_similar) {
                // Get all files in the same similar group
                const groupFiles = visibleFiles.filter(f =>
                    f.similar_group_id && f.similar_group_id === clickedFile.similar_group_id
                );
                if (groupFiles.length > 0) {
                    return groupFiles.map(f => f.id);
                }
            }
        }

        // Otherwise, navigate all visible files (filtered by current mode)
        return visibleFiles.map(f => f.id);
    }

    // ==========================================
    // Selection State
    // ==========================================

    selectAll() {
        const visibleFiles = window.resultsHandler?.allFiles || [];
        visibleFiles.forEach(file => {
            this.selectedIds.add(file.id);
        });
        this.updateUI();
        this.syncWithResultsHandler();
    }

    clearSelection() {
        this.selectedIds.clear();
        this.lastSelectedIndex = null;
        this.lastSelectedId = null;
        this.updateUI();
        this.syncWithResultsHandler();
    }

    toggleSelection(fileId, index) {
        if (this.selectedIds.has(fileId)) {
            this.selectedIds.delete(fileId);
        } else {
            this.selectedIds.add(fileId);
        }
        this.lastSelectedIndex = index;
        this.lastSelectedId = fileId;
        this.updateUI();
        this.syncWithResultsHandler();
    }

    selectDuplicateGroup(file) {
        // Select all files in the same duplicate group (same exact_group_id)
        if (!file?.exact_group_id) return;

        const visibleFiles = window.resultsHandler?.allFiles || [];
        visibleFiles.forEach(f => {
            if (f.exact_group_id === file.exact_group_id) {
                this.selectedIds.add(f.id);
            }
        });
    }

    selectEntireDuplicateGroup() {
        // Get the exact_group_id(s) of currently selected files that are duplicates
        const visibleFiles = window.resultsHandler?.allFiles || [];
        const selectedFiles = visibleFiles.filter(f => this.selectedIds.has(f.id));
        const groupIds = new Set(
            selectedFiles.filter(f => f.is_duplicate && f.exact_group_id).map(f => f.exact_group_id)
        );

        if (groupIds.size === 0) return;

        // Select all files matching those group IDs
        visibleFiles.forEach(f => {
            if (f.exact_group_id && groupIds.has(f.exact_group_id)) {
                this.selectedIds.add(f.id);
            }
        });

        this.updateUI();
        this.syncWithResultsHandler();
    }

    syncWithResultsHandler() {
        // Sync selection state with results handler and tile manager
        if (window.resultsHandler) {
            window.resultsHandler.selectedFiles = new Set(this.selectedIds);
            // Keep TileManager's selectedIds in sync for virtual scroll re-renders
            const tm = window.resultsHandler.getTileManager();
            if (tm) {
                tm.selectedIds = new Set(this.selectedIds);
            }
        }
    }

    // ==========================================
    // UI Updates
    // ==========================================

    updateUI() {
        // Update thumbnail visual state and checkbox state
        document.querySelectorAll('.thumbnail').forEach(thumb => {
            const fileId = parseInt(thumb.dataset.fileId);
            const isSelected = this.selectedIds.has(fileId);
            thumb.classList.toggle('selected', isSelected);

            // Sync checkbox state
            const checkbox = thumb.querySelector('.thumb-checkbox input');
            if (checkbox) {
                checkbox.checked = isSelected;
            }
        });

        // Update toolbar visibility and count
        const hasSelection = this.selectedIds.size > 0;
        if (this.toolbar) {
            this.toolbar.style.display = hasSelection ? 'flex' : 'none';
        }

        if (this.countDisplay) {
            const count = this.selectedIds.size;
            this.countDisplay.textContent = `${count} file${count !== 1 ? 's' : ''} selected`;
        }

        // Update examine button label based on selection count
        const examineBtn = document.getElementById('examine-selected');
        const examineBtnLabel = document.getElementById('examine-btn-label');
        if (examineBtn && examineBtnLabel) {
            const count = this.selectedIds.size;
            if (count >= 2 && count <= 4) {
                examineBtnLabel.textContent = 'Compare';
                examineBtn.title = `Compare ${count} files side-by-side (Enter)`;
            } else if (count === 1) {
                examineBtnLabel.textContent = 'Examine';
                examineBtn.title = 'Open examination view (Enter)';
            } else {
                examineBtnLabel.textContent = 'Examine';
                examineBtn.title = 'Select 1-4 files to examine';
            }
            // Disable if too many files selected
            examineBtn.disabled = count === 0 || count > 4;
        }

        // Show/hide duplicate-specific actions based on selection
        this.updateDuplicateActions();
    }

    updateDuplicateActions() {
        const visibleFiles = window.resultsHandler?.allFiles || [];
        const selectedFiles = visibleFiles.filter(f => this.selectedIds.has(f.id));
        const hasDuplicates = selectedFiles.some(f => f.is_duplicate);

        // Check if there are unselected files in the same duplicate group(s)
        const groupIds = new Set(
            selectedFiles.filter(f => f.is_duplicate && f.exact_group_id).map(f => f.exact_group_id)
        );
        const hasUnselectedInGroup = visibleFiles.some(f =>
            f.exact_group_id &&
            groupIds.has(f.exact_group_id) &&
            !this.selectedIds.has(f.id)
        );

        const selectGroupBtn = document.getElementById('select-group');
        const notDuplicateBtn = document.getElementById('not-duplicate');
        const selectBestBtn = document.getElementById('select-best');

        if (selectGroupBtn) {
            // Show "Select Group" only if there are unselected files in the group
            selectGroupBtn.style.display = (hasDuplicates && hasUnselectedInGroup) ? '' : 'none';
        }
        if (notDuplicateBtn) {
            notDuplicateBtn.style.display = hasDuplicates ? '' : 'none';
        }
        if (selectBestBtn) {
            // Show "Keep Selected" only if there are unselected files in the group to discard
            selectBestBtn.style.display = (hasDuplicates && hasUnselectedInGroup) ? '' : 'none';
        }
    }

    showToast(message) {
        // Create toast element
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        document.body.appendChild(toast);

        // Trigger animation
        setTimeout(() => toast.classList.add('show'), 10);

        // Remove after delay
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 2500);
    }

    // Called after grid re-renders to restore selection visual state
    refreshUI() {
        this.updateUI();
    }

    // ==========================================
    // Public Getters
    // ==========================================

    getSelectedIds() {
        return Array.from(this.selectedIds);
    }

    getSelectedCount() {
        return this.selectedIds.size;
    }

    /**
     * Get the ViewportController instance
     * @returns {ViewportController|null}
     */
    getViewportController() {
        return this.viewportController;
    }

    /**
     * Check if viewport mode is currently active
     * @returns {boolean}
     */
    isViewportActive() {
        return this.viewportController?.isActive || false;
    }

    reset() {
        this.selectedIds.clear();
        this.lastSelectedIndex = null;
        this.lastSelectedId = null;

        // Exit viewport if active
        if (this.viewportController?.isActive) {
            this.viewportController.exit();
        }

        this.updateUI();
    }
}

// Export for use in other modules
window.SelectionHandler = SelectionHandler;
