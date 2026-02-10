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

        // Cache DOM elements — new action bar
        this.actionBar = document.getElementById('action-bar');
        this.unifiedGrid = document.getElementById('unified-grid');

        // Selection button + mode sections
        this.selectionBtn = document.getElementById('ab-selection-btn');
        this.selectionCount = document.getElementById('ab-selection-count');
        this.actionModeSections = document.querySelectorAll('.action-mode-section[data-action-mode]');

        // ViewportController instance (initialized later when TileManager is ready)
        this.viewportController = null;

        // Track current mode for action bar
        this._currentMode = null;

        // Listen for mode changes to update action bar
        window.addEventListener('filterChange', (e) => {
            this._currentMode = e.detail?.mode || null;
            this.updateModeActions();
        });

        // Refresh visible count when grid data changes
        window.addEventListener('filterCountsUpdated', () => {
            this.updateModeActions();
        });

        this.initEventListeners();
        this.initViewportController();

        // Set initial mode from filterHandler (may already be initialized)
        // Use microtask to ensure FilterHandler constructor has completed
        queueMicrotask(() => {
            this._currentMode = window.filterHandler?.getCurrentMode() || 'unreviewed';
            this.updateModeActions();
        });
    }

    // ==========================================
    // Viewport Integration
    // ==========================================

    initViewportController() {
        const tryInit = () => {
            const tileManager = window.resultsHandler?.getTileManager();
            if (tileManager) {
                this.viewportController = new ViewportController(tileManager, {
                    onFileChange: (file) => this.onViewportFileChange(file),
                    onExit: () => this.onViewportExit(),
                });

                window.addEventListener('viewportNavigate', (e) => {
                    this.updateDetailsForFile(e.detail.file);
                });

                window.addEventListener('filterChange', () => {
                    if (this.viewportController?.isActive) {
                        this.viewportController.exit();
                    }
                });
            } else {
                setTimeout(tryInit, 100);
            }
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', tryInit);
        } else {
            setTimeout(tryInit, 50);
        }
    }

    onViewportFileChange(file) {
        if (file) {
            this.updateDetailsForFile(file);
        }
    }

    onViewportExit() {
        // Let the viewport handle scroll restoration
    }

    updateDetailsForFile(file) {
        window.dispatchEvent(new CustomEvent('fileSelected', {
            detail: { file, fileId: file?.id }
        }));
    }

    openExamination(fileId) {
        if (this.viewportController) {
            const navigableIds = this.getNavigableFileIds(fileId);
            this.viewportController.enter(fileId, navigableIds);
            return;
        }

        window.dispatchEvent(new CustomEvent('fileExamine', {
            detail: {
                fileId,
                selectedIds: Array.from(this.selectedIds),
                files: window.resultsHandler?.allFiles || []
            }
        }));
    }

    getNavigableFileIds(clickedFileId) {
        const visibleFiles = window.resultsHandler?.allFiles || [];
        const currentMode = window.filterHandler?.getCurrentMode();

        if (this.selectedIds.size > 1) {
            return visibleFiles
                .filter(f => this.selectedIds.has(f.id))
                .map(f => f.id);
        }

        if (currentMode === 'duplicates') {
            const clickedFile = visibleFiles.find(f => f.id === clickedFileId);
            if (clickedFile?.is_duplicate) {
                const groupFiles = visibleFiles.filter(f =>
                    f.exact_group_id && f.exact_group_id === clickedFile.exact_group_id
                );
                if (groupFiles.length > 0) {
                    return groupFiles.map(f => f.id);
                }
            }
        }

        if (currentMode === 'similar') {
            const clickedFile = visibleFiles.find(f => f.id === clickedFileId);
            if (clickedFile?.is_similar) {
                const groupFiles = visibleFiles.filter(f =>
                    f.similar_group_id && f.similar_group_id === clickedFile.similar_group_id
                );
                if (groupFiles.length > 0) {
                    return groupFiles.map(f => f.id);
                }
            }
        }

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

    selectByConfidence(level) {
        const visibleFiles = window.resultsHandler?.allFiles || [];
        visibleFiles.forEach(file => {
            if (file.confidence === level) {
                this.selectedIds.add(file.id);
            }
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
        if (!file?.exact_group_id) return;

        const visibleFiles = window.resultsHandler?.allFiles || [];
        visibleFiles.forEach(f => {
            if (f.exact_group_id === file.exact_group_id) {
                this.selectedIds.add(f.id);
            }
        });
    }

    selectEntireDuplicateGroup() {
        const visibleFiles = window.resultsHandler?.allFiles || [];
        const selectedFiles = visibleFiles.filter(f => this.selectedIds.has(f.id));
        const groupIds = new Set(
            selectedFiles.filter(f => f.is_duplicate && f.exact_group_id).map(f => f.exact_group_id)
        );

        if (groupIds.size === 0) return;

        visibleFiles.forEach(f => {
            if (f.exact_group_id && groupIds.has(f.exact_group_id)) {
                this.selectedIds.add(f.id);
            }
        });

        this.updateUI();
        this.syncWithResultsHandler();
    }

    selectEntireSimilarGroup() {
        const visibleFiles = window.resultsHandler?.allFiles || [];
        const selectedFiles = visibleFiles.filter(f => this.selectedIds.has(f.id));
        const groupIds = new Set(
            selectedFiles.filter(f => f.is_similar && f.similar_group_id).map(f => f.similar_group_id)
        );

        if (groupIds.size === 0) return;

        visibleFiles.forEach(f => {
            if (f.similar_group_id && groupIds.has(f.similar_group_id)) {
                this.selectedIds.add(f.id);
            }
        });

        this.updateUI();
        this.syncWithResultsHandler();
    }

    syncWithResultsHandler() {
        if (window.resultsHandler) {
            window.resultsHandler.selectedFiles = new Set(this.selectedIds);
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

            const checkbox = thumb.querySelector('.thumb-checkbox input');
            if (checkbox) {
                checkbox.checked = isSelected;
            }
        });

        // Update mode-specific actions (enable/disable based on selection)
        this.updateModeActions();
    }

    /**
     * Show the correct action mode section in the dropdown.
     * Update selection button text based on selection state.
     */
    updateModeActions() {
        const mode = this._currentMode || window.filterHandler?.getCurrentMode() || 'unreviewed';
        const hasSelection = this.selectedIds.size > 0;
        const count = this.selectedIds.size;

        // Show the correct mode section in the actions dropdown
        this.actionModeSections.forEach(section => {
            section.classList.toggle('active', section.dataset.actionMode === mode);
        });

        // Update selection button icon and count
        if (this.selectionBtn) {
            this.selectionBtn.classList.toggle('has-selection', hasSelection);
            this.selectionBtn.title = '';  // zones handle their own tooltips

            const eyeZone = this.selectionBtn.querySelector('.chip-zone-eye');
            const infoZone = this.selectionBtn.querySelector('.chip-zone-info');
            const menuZone = this.selectionBtn.querySelector('.chip-zone-menu');

            if (eyeZone) {
                eyeZone.title = hasSelection ? 'Clear selection' : 'Select all visible files';
            }
            if (infoZone) {
                if (count >= 2 && count <= 4) {
                    infoZone.title = 'Click to compare selected files';
                    infoZone.style.cursor = 'pointer';
                } else if (count === 1) {
                    infoZone.title = 'Click to examine selected file';
                    infoZone.style.cursor = 'pointer';
                } else {
                    infoZone.title = hasSelection
                        ? `${count} files selected`
                        : 'Visible file count';
                    infoZone.style.cursor = '';
                }
            }
            if (menuZone) {
                menuZone.title = 'Actions menu';
            }
        }
        if (this.selectionCount) {
            const visibleTotal = window.resultsHandler?.totalFiles || 0;
            this.selectionCount.textContent = hasSelection
                ? `${count} selected`
                : `${visibleTotal} total`;
        }
    }

    showToast(message, type = 'success') {
        window.showToast(message, type);
    }

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

    getViewportController() {
        return this.viewportController;
    }

    isViewportActive() {
        return this.viewportController?.isActive || false;
    }

    reset() {
        this.selectedIds.clear();
        this.lastSelectedIndex = null;
        this.lastSelectedId = null;

        if (this.viewportController?.isActive) {
            this.viewportController.exit();
        }

        this.updateUI();
    }
}

// Export for use in other modules
window.SelectionHandler = SelectionHandler;
