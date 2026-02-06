/**
 * SelectionHandler - Actions module
 *
 * Bulk API actions: discard, review, tags, duplicate management.
 * Extends SelectionHandler.prototype.
 *
 * Load order: selection-core.js → selection-events.js → selection-actions.js
 */

(function() {
    const proto = SelectionHandler.prototype;

    // ==========================================
    // Discard Actions
    // ==========================================

    /**
     * Confirm before discarding selected files
     */
    proto.confirmDiscard = function() {
        const count = this.selectedIds.size;
        if (count === 0) return;

        const message = count === 1
            ? 'Discard this file from output?'
            : `Discard ${count} files from output?`;

        if (confirm(message)) {
            this.discardSelected();
        }
    };

    /**
     * Discard selected files via API
     */
    proto.discardSelected = async function() {
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
    };

    // ==========================================
    // Duplicate Management
    // ==========================================

    /**
     * Mark selected files as "not duplicate"
     */
    proto.markNotDuplicate = async function() {
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
    };

    /**
     * Keep selected files, discard others in duplicate group
     */
    proto.selectBestFromGroup = async function() {
        // Keep selected file(s), discard others in duplicate group
        const fileIds = Array.from(this.selectedIds);
        if (fileIds.length === 0) return;

        // Get all files in duplicate groups for selected files
        const visibleFiles = window.resultsHandler?.allFiles || [];
        const selectedFiles = visibleFiles.filter(f => this.selectedIds.has(f.id));
        const groupIds = new Set(selectedFiles.filter(f => f.exact_group_id).map(f => f.exact_group_id));

        // Find all files in those groups that are NOT selected
        const toDiscard = visibleFiles.filter(f =>
            f.exact_group_id &&
            groupIds.has(f.exact_group_id) &&
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
    };

    // ==========================================
    // Tagging
    // ==========================================

    /**
     * Add a quick tag to selected files
     */
    proto.addQuickTag = async function() {
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
    };

    // ==========================================
    // Bulk Review
    // ==========================================

    /**
     * Bulk review action (accept_review, mark_reviewed, clear_review)
     * Can work on selection, filtered view, or confidence level
     */
    proto.bulkReview = async function(action, scope, options = {}) {
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
    };

    /**
     * Get human-readable label for review action
     */
    proto.getActionLabel = function(action) {
        switch (action) {
            case 'accept_review': return 'Accept & review';
            case 'mark_reviewed': return 'Mark as reviewed';
            case 'clear_review': return 'Clear review from';
            default: return action;
        }
    };
})();

// ==========================================
// Initialize when DOM is ready
// ==========================================

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.selectionHandler = new SelectionHandler();
    });
} else {
    window.selectionHandler = new SelectionHandler();
}
