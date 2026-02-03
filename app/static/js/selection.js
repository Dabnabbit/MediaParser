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

        this.initEventListeners();
    }

    initEventListeners() {
        // GRID CLICK HANDLING - SelectionHandler owns ALL grid clicks
        this.unifiedGrid?.addEventListener('click', (e) => {
            const thumb = e.target.closest('.thumbnail');
            if (!thumb) return;

            // Don't handle if clicking interactive elements
            if (e.target.closest('button, input, a')) return;

            const fileId = parseInt(thumb.dataset.fileId);
            const index = parseInt(thumb.dataset.index);

            this.handleClick(e, fileId, index, thumb);
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.defaultPrevented) return;

            // Don't capture if typing in input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

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
                    // Open examination view if single selection
                    if (this.selectedIds.size === 1) {
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
    }

    handleClick(event, fileId, index, thumbElement) {
        const visibleFiles = window.resultsHandler?.allFiles || [];
        const file = visibleFiles.find(f => f.id === fileId);

        // Check if this file is part of a duplicate group
        const isDuplicateFile = file?.is_duplicate || thumbElement.classList.contains('duplicate-group');

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
            // Toggle selection
            if (this.selectedIds.has(fileId)) {
                this.selectedIds.delete(fileId);
            } else {
                this.selectedIds.add(fileId);
                // If duplicate, also select group members
                if (isDuplicateFile) {
                    this.selectDuplicateGroup(file);
                }
            }
        } else {
            // Single click without modifier
            // If clicking already-selected single item, open examination
            if (this.selectedIds.size === 1 && this.selectedIds.has(fileId)) {
                this.openExamination(fileId);
                return;
            }

            // Clear and select this file
            this.selectedIds.clear();
            this.selectedIds.add(fileId);

            // If duplicate, also select entire duplicate group
            if (isDuplicateFile) {
                this.selectDuplicateGroup(file);
            }

            // Dispatch fileExamine for examination view to listen
            this.openExamination(fileId);
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

    updateUI() {
        // Update thumbnail visual state
        document.querySelectorAll('.thumbnail').forEach(thumb => {
            const fileId = parseInt(thumb.dataset.fileId);
            thumb.classList.toggle('selected', this.selectedIds.has(fileId));
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

        // Show/hide duplicate-specific actions based on selection
        this.updateDuplicateActions();
    }

    updateDuplicateActions() {
        const visibleFiles = window.resultsHandler?.allFiles || [];
        const selectedFiles = visibleFiles.filter(f => this.selectedIds.has(f.id));
        const hasDuplicates = selectedFiles.some(f => f.is_duplicate);

        const notDuplicateBtn = document.getElementById('not-duplicate');
        const selectBestBtn = document.getElementById('select-best');

        if (notDuplicateBtn) {
            notDuplicateBtn.style.display = hasDuplicates ? '' : 'none';
        }
        if (selectBestBtn) {
            selectBestBtn.style.display = hasDuplicates ? '' : 'none';
        }
    }

    syncWithResultsHandler() {
        // Sync selection state with results handler
        if (window.resultsHandler) {
            window.resultsHandler.selectedFiles = new Set(this.selectedIds);
        }
    }

    openExamination(fileId) {
        // Dispatch event for examination handler
        window.dispatchEvent(new CustomEvent('fileExamine', {
            detail: {
                fileId,
                selectedIds: Array.from(this.selectedIds),
                files: window.resultsHandler?.allFiles || []
            }
        }));
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
        // Will be implemented when discard API exists
        // For now, just emit event
        window.dispatchEvent(new CustomEvent('filesDiscard', {
            detail: { fileIds: Array.from(this.selectedIds) }
        }));

        // Clear selection after action
        this.clearSelection();
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

    reset() {
        this.selectedIds.clear();
        this.lastSelectedIndex = null;
        this.lastSelectedId = null;
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
