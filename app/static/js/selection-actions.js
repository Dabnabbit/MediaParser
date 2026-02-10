/**
 * SelectionHandler - Actions module
 *
 * Bulk API actions: discard, review, tags, duplicate/similar management.
 * Extends SelectionHandler.prototype.
 *
 * Load order: selection-core.js → selection-events.js → selection-actions.js
 */

(function() {
    const proto = SelectionHandler.prototype;

    // ==========================================
    // Discard Actions
    // ==========================================

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

            fileIds.forEach(id => {
                const thumb = document.querySelector(`.thumbnail[data-file-id="${id}"]`);
                thumb?.remove();
            });

            if (window.resultsHandler) {
                window.resultsHandler.loadSummary();
            }

            this.showToast(`Discarded ${result.files_discarded} files`);
            this.clearSelection();

        } catch (error) {
            console.error('Error discarding files:', error);
            alert(`Failed to discard: ${error.message}`);
        }
    };

    // ==========================================
    // Undiscard / Restore
    // ==========================================

    proto.undiscardSelected = async function() {
        const fileIds = Array.from(this.selectedIds);
        if (fileIds.length === 0) return;

        const message = fileIds.length === 1
            ? 'Restore this file?'
            : `Restore ${fileIds.length} files?`;

        if (!confirm(message)) return;

        try {
            const response = await fetch('/api/files/bulk/undiscard', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ file_ids: fileIds })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to restore files');
            }

            const result = await response.json();

            this.showToast(`Restored ${result.files_undiscarded} files`);

            // Refresh grid and counts
            window.resultsHandler?.loadFiles();
            window.resultsHandler?.loadSummary();
            this.clearSelection();

        } catch (error) {
            console.error('Error restoring files:', error);
            alert(`Failed to restore: ${error.message}`);
        }
    };

    proto.restoreAllDiscarded = async function() {
        const jobId = window.resultsHandler?.jobId;
        if (!jobId) return;

        try {
            const params = new URLSearchParams({
                mode: 'discarded',
                confidence: 'high,medium,low,none',
                limit: 10000
            });

            const response = await fetch(`/api/jobs/${jobId}/files?${params}`);
            if (!response.ok) throw new Error('Failed to fetch discarded files');

            const data = await response.json();
            const fileIds = (data.files || []).map(f => f.id);

            if (fileIds.length === 0) {
                this.showToast('No discarded files to restore');
                return;
            }

            if (!confirm(`Restore all ${fileIds.length} discarded files?`)) return;

            const restoreResp = await fetch('/api/files/bulk/undiscard', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ file_ids: fileIds })
            });

            if (!restoreResp.ok) {
                const error = await restoreResp.json();
                throw new Error(error.error || 'Failed to restore files');
            }

            const result = await restoreResp.json();
            this.showToast(`Restored ${result.files_undiscarded} files`);

            window.resultsHandler?.loadFiles();
            window.resultsHandler?.loadSummary();
            this.clearSelection();

        } catch (error) {
            console.error('Restore all failed:', error);
            alert(`Failed to restore: ${error.message}`);
        }
    };

    // ==========================================
    // Discard All Failed
    // ==========================================

    proto.discardAllFailed = async function() {
        const jobId = window.resultsHandler?.jobId;
        if (!jobId) return;

        try {
            const params = new URLSearchParams({
                mode: 'failed',
                confidence: 'high,medium,low,none',
                limit: 10000
            });

            const response = await fetch(`/api/jobs/${jobId}/files?${params}`);
            if (!response.ok) throw new Error('Failed to fetch failed files');

            const data = await response.json();
            const fileIds = (data.files || []).map(f => f.id);

            if (fileIds.length === 0) {
                this.showToast('No failed files to discard');
                return;
            }

            if (!confirm(`Discard all ${fileIds.length} failed files?`)) return;

            const discardResp = await fetch('/api/files/bulk/discard', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ file_ids: fileIds })
            });

            if (!discardResp.ok) {
                const error = await discardResp.json();
                throw new Error(error.error || 'Failed to discard files');
            }

            const result = await discardResp.json();
            this.showToast(`Discarded ${result.files_discarded} failed files`);

            window.resultsHandler?.loadFiles();
            window.resultsHandler?.loadSummary();
            this.clearSelection();

        } catch (error) {
            console.error('Discard all failed:', error);
            alert(`Failed to discard: ${error.message}`);
        }
    };

    // ==========================================
    // Duplicate Management
    // ==========================================

    proto.markNotDuplicate = async function() {
        const fileIds = Array.from(this.selectedIds);
        if (fileIds.length === 0) return;

        try {
            const response = await fetch('/api/files/bulk/not-duplicate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ file_ids: fileIds })
            });

            if (response.ok) {
                window.resultsHandler?.loadFiles();
                this.clearSelection();
            }
        } catch (error) {
            console.error('Failed to mark as not duplicate:', error);
            alert('Failed to update duplicate status');
        }
    };

    // ==========================================
    // Similar Management
    // ==========================================

    proto.markNotSimilar = async function() {
        const fileIds = Array.from(this.selectedIds);
        if (fileIds.length === 0) return;

        try {
            const response = await fetch('/api/files/bulk/not-similar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ file_ids: fileIds })
            });

            if (response.ok) {
                window.resultsHandler?.loadFiles();
                window.resultsHandler?.loadSummary();
                this.clearSelection();
            }
        } catch (error) {
            console.error('Failed to mark as not similar:', error);
            alert('Failed to update similar status');
        }
    };

    // ==========================================
    // Keep Selected (mode-aware, multi-group)
    // ==========================================

    proto.selectBestFromGroup = async function() {
        const fileIds = Array.from(this.selectedIds);
        if (fileIds.length === 0) return;

        const visibleFiles = window.resultsHandler?.allFiles || [];
        const selectedFiles = visibleFiles.filter(f => this.selectedIds.has(f.id));
        const currentMode = window.filterHandler?.getCurrentMode();

        // Choose group key based on mode
        const groupKey = currentMode === 'similar' ? 'similar_group_id' : 'exact_group_id';

        const groupIds = new Set(
            selectedFiles.filter(f => f[groupKey]).map(f => f[groupKey])
        );

        // Find all files in those groups that are NOT selected
        const toDiscard = visibleFiles.filter(f =>
            f[groupKey] &&
            groupIds.has(f[groupKey]) &&
            !this.selectedIds.has(f.id)
        ).map(f => f.id);

        if (toDiscard.length === 0) {
            alert('No other files in group to discard');
            return;
        }

        // Multi-group confirmation with detailed counts
        const groupCount = groupIds.size;
        let confirmMsg;
        if (groupCount > 1) {
            confirmMsg = `Keep ${fileIds.length} files, discard ${toDiscard.length} others across ${groupCount} groups?`;
        } else {
            confirmMsg = `Keep ${fileIds.length} selected file(s) and discard ${toDiscard.length} other(s) from group?`;
        }

        if (!confirm(confirmMsg)) return;

        try {
            const response = await fetch('/api/files/bulk/discard', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ file_ids: toDiscard })
            });

            if (response.ok) {
                window.resultsHandler?.loadFiles();
                window.resultsHandler?.loadSummary();
                this.clearSelection();
            }
        } catch (error) {
            console.error('Failed to select best:', error);
            alert('Failed to discard group files');
        }
    };

    // ==========================================
    // Tagging (bug fix: correct endpoint + format)
    // ==========================================

    proto.addQuickTag = async function() {
        const input = document.getElementById('quick-tag-input');
        const tagName = input?.value?.trim();

        if (!tagName || this.selectedIds.size === 0) return;

        try {
            const response = await fetch('/api/files/bulk/tags', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    file_ids: Array.from(this.selectedIds),
                    tags: [tagName]
                })
            });

            if (response.ok) {
                input.value = '';
                this.showToast(`Tag "${tagName}" added`);
            }
        } catch (error) {
            console.error('Failed to add tag:', error);
            alert('Failed to add tag');
        }
    };

    // ==========================================
    // Bulk Review
    // ==========================================

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

            this.showToast(`${result.affected_count} files updated`);

            window.resultsHandler?.loadFiles();
            window.resultsHandler?.loadSummary();

            if (scope === 'selection') {
                this.clearSelection();
            }

        } catch (error) {
            console.error('Bulk review failed:', error);
            alert(`Failed to update files: ${error.message}`);
        }
    };

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
