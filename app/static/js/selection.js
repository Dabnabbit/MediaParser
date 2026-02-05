/**
 * Selection Handler
 *
 * Manages multi-select functionality for the unified grid.
 * OWNS ALL CLICK HANDLING on #unified-grid.
 *
 * Click behaviors:
 * - Single click (no modifier): select one, dispatch fileExamine for examination view
 * - Ctrl/Cmd + click: toggle selection
 * - Shift + click: range selection from last selected
 * - Click on duplicate file: auto-select entire duplicate group
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

    initEventListeners() {
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
    }

    handleClick(event, fileId, index, thumbElement) {
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
    }

    selectDuplicateGroup(file) {
        // Select all files in the same duplicate group (same file_hash)
        if (!file?.file_hash) return;

        const visibleFiles = window.resultsHandler?.allFiles || [];
        visibleFiles.forEach(f => {
            if (f.file_hash === file.file_hash) {
                this.selectedIds.add(f.id);
            }
        });
    }

    selectEntireDuplicateGroup() {
        // Get the hash(es) of currently selected files that are duplicates
        const visibleFiles = window.resultsHandler?.allFiles || [];
        const selectedFiles = visibleFiles.filter(f => this.selectedIds.has(f.id));
        const groupHashes = new Set(
            selectedFiles.filter(f => f.is_duplicate && f.file_hash).map(f => f.file_hash)
        );

        if (groupHashes.size === 0) return;

        // Select all files matching those hashes
        visibleFiles.forEach(f => {
            if (f.file_hash && groupHashes.has(f.file_hash)) {
                this.selectedIds.add(f.id);
            }
        });

        this.updateUI();
        this.syncWithResultsHandler();
    }

    handleDuplicateBadgeClick(fileId) {
        // Clicking duplicate badge selects entire duplicate group
        const visibleFiles = window.resultsHandler?.allFiles || [];
        const file = visibleFiles.find(f => f.id === fileId);

        if (!file?.file_hash) return;

        // Clear current selection and select all files with same hash
        this.selectedIds.clear();
        visibleFiles.forEach(f => {
            if (f.file_hash === file.file_hash) {
                this.selectedIds.add(f.id);
            }
        });

        this.updateUI();
        this.syncWithResultsHandler();
    }

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
        const groupHashes = new Set(
            selectedFiles.filter(f => f.is_duplicate && f.file_hash).map(f => f.file_hash)
        );
        const hasUnselectedInGroup = visibleFiles.some(f =>
            f.file_hash &&
            groupHashes.has(f.file_hash) &&
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

    syncWithResultsHandler() {
        // Sync selection state with results handler
        if (window.resultsHandler) {
            window.resultsHandler.selectedFiles = new Set(this.selectedIds);
        }
    }

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
     * Priority: multi-selection > current filter > all visible
     */
    getNavigableFileIds(clickedFileId) {
        const visibleFiles = window.resultsHandler?.allFiles || [];

        // If multiple files are selected, navigate only selected files
        if (this.selectedIds.size > 1) {
            // Return selected IDs in display order
            return visibleFiles
                .filter(f => this.selectedIds.has(f.id))
                .map(f => f.id);
        }

        // Otherwise, navigate all visible files (filtered by current mode)
        return visibleFiles.map(f => f.id);
    }

    confirmDiscard() {
        const count = this.selectedIds.size;
        if (count === 0) return;

        const message = count === 1
            ? 'Discard this file from output?'
            : `Discard ${count} files from output?`;

        if (confirm(message)) {
            this.discardSelected();
        }
    }

    async discardSelected() {
        const fileIds = Array.from(this.selectedIds);
        if (fileIds.length === 0) return;

        try {
            const response = await fetch('/api/files/bulk/discard', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ file_ids: fileIds })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to discard files');
            }

            const result = await response.json();

            // Remove discarded files from grid (they no longer match current mode)
            fileIds.forEach(id => {
                const thumb = document.querySelector(`.thumbnail[data-file-id="${id}"]`);
                thumb?.remove();
            });

            // Update filter counts
            if (window.resultsHandler) {
                window.resultsHandler.loadSummary();
            }

            // Show feedback
            this.showToast(`Discarded ${result.files_discarded} files`);

            // Clear selection after action
            this.clearSelection();

        } catch (error) {
            console.error('Error discarding files:', error);
            alert(`Failed to discard: ${error.message}`);
        }
    }

    async markNotDuplicate() {
        // Mark selected files as "not duplicate" - removes from duplicate group
        const fileIds = Array.from(this.selectedIds);
        if (fileIds.length === 0) return;

        try {
            const response = await fetch('/api/files/bulk/not-duplicate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ file_ids: fileIds })
            });

            if (response.ok) {
                // Refresh grid to reflect change
                window.resultsHandler?.loadFiles();
                this.clearSelection();
            }
        } catch (error) {
            console.error('Failed to mark as not duplicate:', error);
            alert('Failed to update duplicate status');
        }
    }

    async selectBestFromGroup() {
        // Keep selected file(s), discard others in duplicate group
        const fileIds = Array.from(this.selectedIds);
        if (fileIds.length === 0) return;

        // Get all files in duplicate groups for selected files
        const visibleFiles = window.resultsHandler?.allFiles || [];
        const selectedFiles = visibleFiles.filter(f => this.selectedIds.has(f.id));
        const groupHashes = new Set(selectedFiles.filter(f => f.file_hash).map(f => f.file_hash));

        // Find all files in those groups that are NOT selected
        const toDiscard = visibleFiles.filter(f =>
            f.file_hash &&
            groupHashes.has(f.file_hash) &&
            !this.selectedIds.has(f.id)
        ).map(f => f.id);

        if (toDiscard.length === 0) {
            alert('No other files in duplicate group to discard');
            return;
        }

        if (!confirm(`Keep ${fileIds.length} selected file(s) and discard ${toDiscard.length} other(s) from duplicate group(s)?`)) {
            return;
        }

        try {
            const response = await fetch('/api/files/bulk/discard', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ file_ids: toDiscard })
            });

            if (response.ok) {
                window.resultsHandler?.loadFiles();
                this.clearSelection();
            }
        } catch (error) {
            console.error('Failed to select best:', error);
            alert('Failed to discard duplicate files');
        }
    }

    async addQuickTag() {
        const input = document.getElementById('quick-tag-input');
        const tagName = input?.value?.trim();

        if (!tagName || this.selectedIds.size === 0) return;

        try {
            const response = await fetch('/api/files/bulk/tag', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    file_ids: Array.from(this.selectedIds),
                    tag: tagName
                })
            });

            if (response.ok) {
                input.value = '';
                // Optionally refresh to show tag badge
                // window.resultsHandler?.loadFiles();
            }
        } catch (error) {
            console.error('Failed to add tag:', error);
            alert('Failed to add tag');
        }
    }

    /**
     * Bulk review action (accept_review, mark_reviewed, clear_review)
     * Can work on selection, filtered view, or confidence level
     */
    async bulkReview(action, scope, options = {}) {
        const jobId = window.resultsHandler?.jobId;
        if (!jobId) return;

        let requestBody = { action, scope };
        let confirmMsg = '';
        let count = 0;

        if (scope === 'selection') {
            const fileIds = Array.from(this.selectedIds);
            if (fileIds.length === 0) return;
            requestBody.file_ids = fileIds;
            count = fileIds.length;
            confirmMsg = `${this.getActionLabel(action)} ${count} selected file${count !== 1 ? 's' : ''}?`;

        } else if (scope === 'confidence') {
            const level = options.confidence_level;
            if (!level) return;
            requestBody.confidence_level = level;
            count = options.count || '?';
            confirmMsg = `${this.getActionLabel(action)} all ${count} ${level.toUpperCase()} confidence files?`;

        } else if (scope === 'filtered') {
            // Get current filter params
            const filterParams = window.filterHandler?.getQueryParams();
            if (filterParams) {
                requestBody.filter_params = Object.fromEntries(filterParams.entries());
            }
            count = options.count || window.resultsHandler?.totalFiles || '?';
            confirmMsg = `${this.getActionLabel(action)} ${count} filtered files?`;
        }

        if (!confirm(confirmMsg)) return;

        try {
            const response = await fetch(`/api/jobs/${jobId}/bulk-review`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Bulk review failed');
            }

            const result = await response.json();

            // Show toast notification
            this.showToast(`${result.affected_count} files updated`);

            // Refresh the grid and counts
            window.resultsHandler?.loadFiles();
            window.resultsHandler?.loadSummary();

            // Clear selection if we acted on selection
            if (scope === 'selection') {
                this.clearSelection();
            }

        } catch (error) {
            console.error('Bulk review failed:', error);
            alert(`Failed to update files: ${error.message}`);
        }
    }

    getActionLabel(action) {
        switch (action) {
            case 'accept_review': return 'Accept & review';
            case 'mark_reviewed': return 'Mark as reviewed';
            case 'clear_review': return 'Clear review from';
            default: return action;
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

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.selectionHandler = new SelectionHandler();
    });
} else {
    window.selectionHandler = new SelectionHandler();
}
