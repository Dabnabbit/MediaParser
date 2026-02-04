/**
 * Duplicates Handler
 *
 * Manages duplicate group comparison and resolution.
 * Features:
 * - Fetch and render duplicate groups from API
 * - Radio button selection for keep/discard decisions
 * - Per-group actions (Keep All, Confirm Selection)
 * - Lazy loading for thumbnails
 * - Recommended file pre-selection
 */

class DuplicatesHandler {
    constructor() {
        this.jobId = null;
        this.groups = [];              // Array of duplicate groups from API
        this.groupSelections = new Map(); // hash -> selected file_id

        // Cache DOM elements
        this.container = document.getElementById('duplicate-groups-container');
        this.groupsList = document.getElementById('duplicate-groups-list');
        this.groupCountEl = document.getElementById('duplicates-group-count');
        this.fileCountEl = document.getElementById('duplicates-file-count');
        this.resolvedCountEl = document.getElementById('duplicates-resolved-count');
        this.resolveAllBtn = document.getElementById('btn-resolve-all');

        // Initialize lazy loader for thumbnails (same pattern as results.js)
        this.initLazyLoader();
        this.initEventListeners();
    }

    /**
     * Initialize Intersection Observer for lazy loading thumbnails
     */
    initLazyLoader() {
        this.lazyLoader = new IntersectionObserver(
            (entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const img = entry.target;
                        if (img.dataset.src) {
                            img.src = img.dataset.src;
                            img.removeAttribute('data-src');
                            img.addEventListener('load', () => img.classList.add('loaded'));
                            img.addEventListener('error', () => {
                                img.src = '/static/img/placeholder.svg';
                            });
                        }
                        this.lazyLoader.unobserve(img);
                    }
                });
            },
            { rootMargin: '100px' }
        );
    }

    /**
     * Load duplicate groups from API
     */
    async loadGroups(jobId) {
        this.jobId = jobId;

        try {
            const response = await fetch(`/api/jobs/${jobId}/duplicates`);
            if (!response.ok) throw new Error('Failed to load duplicate groups');

            const data = await response.json();
            this.groups = data.duplicate_groups || [];

            // Initialize selections with recommended file for each group
            this.groups.forEach(group => {
                if (group.recommended_id) {
                    this.groupSelections.set(group.hash, group.recommended_id);
                }
            });

            this.renderGroups();
            this.updateSummary();

        } catch (error) {
            console.error('Error loading duplicate groups:', error);
            if (this.groupsList) {
                this.groupsList.innerHTML = '<div class="empty">Failed to load duplicate groups</div>';
            }
        }
    }

    /**
     * Render all duplicate groups
     */
    renderGroups() {
        if (!this.groupsList) return;

        this.groupsList.innerHTML = '';

        if (this.groups.length === 0) {
            this.groupsList.innerHTML = '<div class="empty">No duplicate groups found</div>';
            return;
        }

        this.groups.forEach(group => {
            const card = this.renderGroup(group);
            this.groupsList.appendChild(card);
        });
    }

    /**
     * Render a single duplicate group card
     */
    renderGroup(group) {
        const card = document.createElement('div');
        card.className = 'duplicate-group-card';
        card.dataset.groupHash = group.hash;

        // Header with file count
        const header = document.createElement('div');
        header.className = 'duplicate-group-header';
        header.innerHTML = `
            <h4>Duplicate Group</h4>
            <span class="file-count">${group.files.length} files</span>
        `;
        card.appendChild(header);

        // Files comparison grid
        const filesGrid = document.createElement('div');
        filesGrid.className = 'files-comparison';

        group.files.forEach(file => {
            const fileOption = this.renderFileOption(file, group);
            filesGrid.appendChild(fileOption);
        });

        card.appendChild(filesGrid);

        // Group actions
        const actions = document.createElement('div');
        actions.className = 'duplicate-group-actions';
        actions.innerHTML = `
            <button class="btn btn-secondary btn-sm btn-keep-all">
                Keep All (Remove from Duplicates)
            </button>
            <button class="btn btn-primary btn-confirm-group" disabled>
                Confirm Selection
            </button>
        `;
        card.appendChild(actions);

        return card;
    }

    /**
     * Render a file option within a duplicate group
     */
    renderFileOption(file, group) {
        const option = document.createElement('div');
        option.className = 'file-option';
        option.dataset.fileId = file.id;

        const isRecommended = file.id === group.recommended_id;
        if (isRecommended) {
            option.classList.add('recommended');
        }

        // Thumbnail with lazy loading
        const imgSrc = file.thumbnail_path ? `/${file.thumbnail_path}` : '/static/img/placeholder.svg';
        const img = document.createElement('img');
        img.dataset.src = imgSrc;
        img.src = '/static/img/placeholder.svg';
        img.alt = file.original_filename;
        img.title = file.original_filename;

        // Observe for lazy loading
        if (this.lazyLoader) {
            this.lazyLoader.observe(img);
        }

        const thumbnail = document.createElement('div');
        thumbnail.className = 'file-thumbnail';
        if (isRecommended) {
            const recommendedBadge = document.createElement('div');
            recommendedBadge.className = 'recommended-badge';
            recommendedBadge.textContent = 'Recommended';
            thumbnail.appendChild(recommendedBadge);
        }
        thumbnail.appendChild(img);
        option.appendChild(thumbnail);

        // Quality metrics
        const metrics = document.createElement('div');
        metrics.className = 'quality-metrics';

        // Quality metrics are merged directly into file object from API
        const resolution = file.resolution_mp
            ? `${file.width}×${file.height} (${file.resolution_mp.toFixed(1)}MP)`
            : 'Unknown';

        const fileSize = file.file_size_bytes
            ? this.formatFileSize(file.file_size_bytes)
            : 'Unknown';

        const format = file.format
            ? file.format.toUpperCase()
            : 'Unknown';

        const timestamp = file.detected_timestamp
            ? this.formatDate(file.detected_timestamp)
            : 'Unknown';

        metrics.innerHTML = `
            <div class="metric">
                <span class="metric-label">Resolution:</span>
                <span class="metric-value">${resolution}</span>
            </div>
            <div class="metric">
                <span class="metric-label">Size:</span>
                <span class="metric-value">${fileSize}</span>
            </div>
            <div class="metric">
                <span class="metric-label">Format:</span>
                <span class="metric-value">${format}</span>
            </div>
            <div class="metric">
                <span class="metric-label">Date:</span>
                <span class="metric-value">${timestamp}</span>
            </div>
        `;
        option.appendChild(metrics);

        // Radio button for selection
        const radioContainer = document.createElement('div');
        radioContainer.className = 'file-selection';

        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = `keep-${group.hash}`;
        radio.value = file.id;
        radio.id = `file-${file.id}`;

        // Pre-check if this file is the selected one
        const selectedId = this.groupSelections.get(group.hash);
        if (selectedId && selectedId === file.id) {
            radio.checked = true;
        }

        const label = document.createElement('label');
        label.htmlFor = `file-${file.id}`;
        label.textContent = 'Keep this file';

        radioContainer.appendChild(radio);
        radioContainer.appendChild(label);
        option.appendChild(radioContainer);

        // Status badge (KEEP/DISCARD)
        const statusBadge = document.createElement('div');
        statusBadge.className = 'status-badge-container';
        if (selectedId === file.id) {
            statusBadge.innerHTML = '<span class="status-badge status-keep">KEEP</span>';
            option.classList.add('selected');
        } else {
            statusBadge.innerHTML = '<span class="status-badge status-discard">DISCARD</span>';
        }
        option.appendChild(statusBadge);

        return option;
    }

    /**
     * Format file size in human-readable format
     */
    formatFileSize(bytes) {
        if (!bytes) return 'Unknown';
        const units = ['B', 'KB', 'MB', 'GB'];
        let size = bytes;
        let unitIndex = 0;
        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }
        return `${size.toFixed(1)} ${units[unitIndex]}`;
    }

    /**
     * Format ISO date string to readable format
     */
    formatDate(isoString) {
        if (!isoString) return 'Unknown';
        try {
            const date = new Date(isoString);
            return date.toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit'
            });
        } catch (error) {
            return 'Unknown';
        }
    }

    /**
     * Initialize event listeners
     */
    initEventListeners() {
        // Delegate radio change events on groupsList
        this.groupsList?.addEventListener('change', (e) => {
            if (e.target.type === 'radio' && e.target.name.startsWith('keep-')) {
                this.handleRadioChange(e);
            }
        });

        // Delegate button clicks
        this.groupsList?.addEventListener('click', (e) => {
            const keepAllBtn = e.target.closest('.btn-keep-all');
            if (keepAllBtn) {
                const groupHash = keepAllBtn.closest('.duplicate-group-card').dataset.groupHash;
                this.handleKeepAll(groupHash);
                return;
            }

            const confirmBtn = e.target.closest('.btn-confirm-group');
            if (confirmBtn) {
                const groupHash = confirmBtn.closest('.duplicate-group-card').dataset.groupHash;
                this.handleConfirmGroup(groupHash);
                return;
            }
        });

        // Listen for mode changes to show/hide container
        window.addEventListener('filterChange', (e) => {
            // Show duplicates container only when in duplicates mode
            const filterParams = window.filterHandler?.getQueryParams();
            const mode = filterParams?.get('mode');
            if (mode === 'duplicates') {
                this.show();
            } else {
                this.hide();
            }
        });

        // Resolve All button
        this.resolveAllBtn?.addEventListener('click', () => {
            this.confirmAllGroups();
        });

        // Modal confirmation buttons
        const confirmExecuteBtn = document.getElementById('confirm-execute');
        const confirmCancelBtn = document.getElementById('confirm-cancel');

        confirmExecuteBtn?.addEventListener('click', () => {
            this.executeDuplicateResolution();
        });

        confirmCancelBtn?.addEventListener('click', () => {
            this.cancelConfirmation();
        });
    }

    /**
     * Handle radio button changes
     */
    handleRadioChange(event) {
        // Extract group hash from radio name (name="keep-{hash}")
        const radioName = event.target.name;
        const groupHash = radioName.replace('keep-', '');
        const fileId = parseInt(event.target.value);

        // Update groupSelections Map
        this.groupSelections.set(groupHash, fileId);

        // Update UI for this group
        this.updateGroupPreview(groupHash);

        // Update summary counts
        this.updateSummary();
    }

    /**
     * Update visual preview for a group after selection change
     */
    updateGroupPreview(groupHash) {
        // Find group card by data-group-hash
        const card = document.querySelector(`.duplicate-group-card[data-group-hash="${groupHash}"]`);
        if (!card) return;

        // Get selected file_id
        const selectedFileId = this.groupSelections.get(groupHash);

        // Update all file-option status badges and classes
        const fileOptions = card.querySelectorAll('.file-option');
        fileOptions.forEach(option => {
            const fileId = parseInt(option.dataset.fileId);
            const statusBadgeContainer = option.querySelector('.status-badge-container');

            if (fileId === selectedFileId) {
                // Selected file: KEEP
                statusBadgeContainer.innerHTML = '<span class="status-badge status-keep">KEEP</span>';
                option.classList.add('selected');
            } else {
                // Other files: DISCARD
                statusBadgeContainer.innerHTML = '<span class="status-badge status-discard">DISCARD</span>';
                option.classList.remove('selected');
            }
        });

        // Enable confirm button for this group
        const confirmBtn = card.querySelector('.btn-confirm-group');
        if (confirmBtn && selectedFileId) {
            confirmBtn.disabled = false;
        }
    }

    /**
     * Update summary counts in header
     */
    updateSummary() {
        // Count total groups
        const totalGroups = this.groups.length;

        // Count total files across all groups
        const totalFiles = this.groups.reduce((sum, group) => sum + group.files.length, 0);

        // Count resolved groups (those with selection in groupSelections)
        const resolvedGroups = this.groups.filter(group =>
            this.groupSelections.has(group.hash)
        ).length;

        // Update DOM elements
        if (this.groupCountEl) {
            this.groupCountEl.textContent = `${totalGroups} group${totalGroups !== 1 ? 's' : ''}`;
        }
        if (this.fileCountEl) {
            this.fileCountEl.textContent = `${totalFiles} file${totalFiles !== 1 ? 's' : ''}`;
        }
        if (this.resolvedCountEl) {
            this.resolvedCountEl.textContent = `${resolvedGroups} resolved`;
        }

        // Enable/disable "Resolve All" button
        if (this.resolveAllBtn) {
            const allResolved = resolvedGroups === totalGroups && totalGroups > 0;
            this.resolveAllBtn.disabled = !allResolved;
        }
    }

    /**
     * Get array of unresolved group hashes
     */
    getUnresolvedGroups() {
        return this.groups
            .filter(group => !this.groupSelections.has(group.hash))
            .map(group => group.hash);
    }

    /**
     * Get resolution summary for bulk operations
     */
    getResolutionSummary() {
        const keepFileIds = [];
        const discardFileIds = [];

        this.groups.forEach(group => {
            const selectedId = this.groupSelections.get(group.hash);
            if (selectedId) {
                keepFileIds.push(selectedId);
                group.files.forEach(file => {
                    if (file.id !== selectedId) {
                        discardFileIds.push(file.id);
                    }
                });
            }
        });

        return {
            keepFileIds,
            discardFileIds,
            groupCount: this.groups.filter(g => this.groupSelections.has(g.hash)).length
        };
    }

    /**
     * Handle "Keep All" button - removes group from duplicate detection
     */
    async handleKeepAll(groupHash) {
        const group = this.groups.find(g => g.hash === groupHash);
        if (!group) return;

        try {
            const response = await fetch(`/api/duplicates/groups/${groupHash}/keep-all`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to keep all files');
            }

            // Remove the group card from DOM
            const card = document.querySelector(`.duplicate-group-card[data-group-hash="${groupHash}"]`);
            if (card) {
                card.remove();
            }

            // Remove from groups array
            this.groups = this.groups.filter(g => g.hash !== groupHash);

            // Remove from selections
            this.groupSelections.delete(groupHash);

            // Update summary
            this.updateSummary();

            // Refresh filter counts
            if (window.resultsHandler) {
                window.resultsHandler.loadSummary();
            }

        } catch (error) {
            console.error('Error keeping all files:', error);
            alert(`Failed to keep all files: ${error.message}`);
        }
    }

    /**
     * Handle "Confirm Group" button - discards non-selected files
     */
    async handleConfirmGroup(groupHash) {
        const group = this.groups.find(g => g.hash === groupHash);
        if (!group) return;

        // Validate selection exists
        const selectedFileId = this.groupSelections.get(groupHash);
        if (!selectedFileId) {
            alert('Please select a file to keep first');
            return;
        }

        // Get files to discard (all except selected)
        const discardFileIds = group.files
            .filter(file => file.id !== selectedFileId)
            .map(file => file.id);

        if (discardFileIds.length === 0) return;

        try {
            // Call API to discard non-selected files
            const response = await fetch('/api/files/bulk/discard', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    file_ids: discardFileIds,
                    reason: 'duplicate_resolution'
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to discard files');
            }

            // Mark group as resolved
            const card = document.querySelector(`.duplicate-group-card[data-group-hash="${groupHash}"]`);
            if (card) {
                card.classList.add('resolved');
                const confirmBtn = card.querySelector('.btn-confirm-group');
                if (confirmBtn) {
                    confirmBtn.textContent = 'Resolved ✓';
                    confirmBtn.disabled = true;
                    confirmBtn.classList.remove('btn-primary');
                    confirmBtn.classList.add('btn-success');
                }
            }

            // Update summary
            this.updateSummary();

            // Dispatch custom event for filter count updates
            window.dispatchEvent(new CustomEvent('filterCountsUpdated'));

            // Refresh filter counts
            if (window.resultsHandler) {
                window.resultsHandler.loadSummary();
            }

        } catch (error) {
            console.error('Error confirming group:', error);
            alert(`Failed to confirm selection: ${error.message}`);
        }
    }

    /**
     * Show the duplicates container
     */
    show() {
        if (this.container) {
            this.container.style.display = 'block';
        }
    }

    /**
     * Hide the duplicates container
     */
    hide() {
        if (this.container) {
            this.container.style.display = 'none';
        }
    }

    /**
     * Check if container is visible
     */
    isVisible() {
        if (!this.container) return false;
        return this.container.style.display !== 'none';
    }

    /**
     * Confirm all group selections with summary modal
     * Shows modal with keep/discard counts before executing
     */
    confirmAllGroups() {
        // Validate all groups are resolved
        const unresolvedGroups = this.getUnresolvedGroups();
        if (unresolvedGroups.length > 0) {
            alert(`Please resolve all groups first (${unresolvedGroups.length} remaining)`);
            return;
        }

        // Get resolution summary
        const summary = this.getResolutionSummary();

        // Show modal with counts
        const modal = document.getElementById('duplicate-confirm-modal');
        const groupCountEl = document.getElementById('confirm-group-count');
        const keepCountEl = document.getElementById('confirm-keep-count');
        const discardCountEl = document.getElementById('confirm-discard-count');

        if (groupCountEl) groupCountEl.textContent = summary.groupCount;
        if (keepCountEl) keepCountEl.textContent = summary.keepFileIds.length;
        if (discardCountEl) discardCountEl.textContent = summary.discardFileIds.length;

        if (modal) {
            modal.showModal();
        }
    }

    /**
     * Execute duplicate resolution after confirmation
     * Calls bulk discard API, closes modal, refreshes counts
     */
    async executeDuplicateResolution() {
        const summary = this.getResolutionSummary();

        if (summary.discardFileIds.length === 0) {
            this.cancelConfirmation();
            return;
        }

        try {
            // Call bulk discard API
            const response = await fetch('/api/files/bulk/discard', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    file_ids: summary.discardFileIds,
                    reason: 'duplicate_resolution'
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to discard files');
            }

            // Close modal
            this.cancelConfirmation();

            // Clear resolved groups from UI
            this.groups.forEach(group => {
                if (this.groupSelections.has(group.hash)) {
                    const card = document.querySelector(`.duplicate-group-card[data-group-hash="${group.hash}"]`);
                    if (card) {
                        card.remove();
                    }
                }
            });

            // Clear groups array and selections
            this.groups = [];
            this.groupSelections.clear();
            this.updateSummary();

            // Refresh filter counts
            if (window.resultsHandler) {
                window.resultsHandler.loadSummary();
            }

            // Dispatch event for mode switching if needed
            window.dispatchEvent(new CustomEvent('duplicatesResolved'));

        } catch (error) {
            console.error('Error executing duplicate resolution:', error);
            alert(`Failed to execute duplicate resolution: ${error.message}`);
        }
    }

    /**
     * Cancel confirmation modal
     */
    cancelConfirmation() {
        const modal = document.getElementById('duplicate-confirm-modal');
        if (modal) {
            modal.close();
        }
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.duplicatesHandler = new DuplicatesHandler();
    });
} else {
    window.duplicatesHandler = new DuplicatesHandler();
}
