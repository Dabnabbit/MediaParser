/**
 * Results Display Handler
 *
 * Displays processed files organized by confidence level and duplicate groups.
 * Implements accordion-style buckets, responsive thumbnail grid with size toggle,
 * and shift-click multi-select for batch operations.
 */

class ResultsHandler {
    constructor() {
        this.jobId = null;
        this.summary = null;
        this.selectedFiles = new Set();
        this.lastSelectedIndex = null;
        this.thumbnailSize = 'medium'; // compact | medium | large
        this.expandedBucket = null; // Only one bucket can be expanded at a time
    }

    /**
     * Load and display results for a completed job
     * @param {string} jobId - Job ID to load results for
     * @param {Object} summary - Summary data from progress API
     */
    async loadResults(jobId, summary) {
        this.jobId = jobId;
        this.summary = summary;

        const resultsSection = document.querySelector('[data-section="results"]');
        if (!resultsSection) {
            console.error('Results section not found');
            return;
        }

        // Show results section
        resultsSection.classList.add('visible');

        // Render summary card
        this.renderSummaryCard();

        // Load confidence buckets (initially all collapsed)
        await this.loadConfidenceBuckets();

        // Load duplicates if any exist
        if (summary.duplicates > 0) {
            await this.loadDuplicates();
        }
    }

    /**
     * Render summary card with confidence breakdown
     */
    renderSummaryCard() {
        const summaryCard = document.querySelector('[data-summary-card]');
        if (!summaryCard) return;

        const total = this.summary.high + this.summary.medium + this.summary.low + this.summary.none;

        summaryCard.innerHTML = `
            <h3>Processing Complete</h3>
            <div class="summary-stats">
                <div class="stat">
                    <span class="stat-value">${total}</span>
                    <span class="stat-label">Total Files</span>
                </div>
                <div class="stat">
                    <span class="stat-value confidence-high">${this.summary.high}</span>
                    <span class="stat-label">High Confidence</span>
                </div>
                <div class="stat">
                    <span class="stat-value confidence-medium">${this.summary.medium}</span>
                    <span class="stat-label">Medium Confidence</span>
                </div>
                <div class="stat">
                    <span class="stat-value confidence-low">${this.summary.low + this.summary.none}</span>
                    <span class="stat-label">Low/None</span>
                </div>
                ${this.summary.duplicates > 0 ? `
                <div class="stat">
                    <span class="stat-value">${this.summary.duplicates}</span>
                    <span class="stat-label">Duplicate Groups</span>
                </div>
                ` : ''}
            </div>
            <div class="thumbnail-size-controls">
                <label>Thumbnail size:</label>
                <button class="size-btn ${this.thumbnailSize === 'compact' ? 'active' : ''}"
                        data-size="compact">Compact</button>
                <button class="size-btn ${this.thumbnailSize === 'medium' ? 'active' : ''}"
                        data-size="medium">Medium</button>
                <button class="size-btn ${this.thumbnailSize === 'large' ? 'active' : ''}"
                        data-size="large">Large</button>
            </div>
        `;

        // Add thumbnail size control event listeners
        summaryCard.querySelectorAll('.size-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.setThumbnailSize(e.target.dataset.size));
        });
    }

    /**
     * Load and render confidence buckets
     */
    async loadConfidenceBuckets() {
        const bucketsContainer = document.querySelector('[data-buckets]');
        if (!bucketsContainer) return;

        const levels = [
            { level: 'high', label: 'High Confidence', count: this.summary.high },
            { level: 'medium', label: 'Medium Confidence', count: this.summary.medium },
            { level: 'low', label: 'Low Confidence', count: this.summary.low + this.summary.none }
        ];

        bucketsContainer.innerHTML = '';

        for (const { level, label, count } of levels) {
            if (count > 0) {
                const bucketEl = await this.renderBucket(level, label, count);
                bucketsContainer.appendChild(bucketEl);
            }
        }
    }

    /**
     * Render a single confidence bucket
     * @param {string} level - Confidence level (high/medium/low)
     * @param {string} label - Display label
     * @param {number} count - File count
     * @returns {HTMLElement} Bucket element
     */
    async renderBucket(level, label, count) {
        const bucket = document.createElement('div');
        bucket.className = 'bucket';
        bucket.dataset.bucket = level;

        const header = document.createElement('div');
        header.className = 'bucket-header';
        header.innerHTML = `
            <h4>${label}</h4>
            <span class="badge confidence-${level}">${count} files</span>
        `;
        header.addEventListener('click', () => this.toggleBucket(level));

        const content = document.createElement('div');
        content.className = 'bucket-content';
        content.dataset.content = level;

        bucket.appendChild(header);
        bucket.appendChild(content);

        return bucket;
    }

    /**
     * Toggle bucket expansion (only one bucket can be expanded at a time)
     * @param {string} level - Confidence level to toggle
     */
    async toggleBucket(level) {
        const bucket = document.querySelector(`[data-bucket="${level}"]`);
        const content = document.querySelector(`[data-content="${level}"]`);

        if (!bucket || !content) return;

        // If clicking the currently expanded bucket, collapse it
        if (this.expandedBucket === level) {
            bucket.classList.remove('expanded');
            content.innerHTML = '';
            this.expandedBucket = null;
            return;
        }

        // Collapse currently expanded bucket
        if (this.expandedBucket) {
            const prevBucket = document.querySelector(`[data-bucket="${this.expandedBucket}"]`);
            const prevContent = document.querySelector(`[data-content="${this.expandedBucket}"]`);
            if (prevBucket) prevBucket.classList.remove('expanded');
            if (prevContent) prevContent.innerHTML = '';
        }

        // Expand new bucket and load files
        this.expandedBucket = level;
        bucket.classList.add('expanded');
        content.innerHTML = '<div class="loading">Loading files...</div>';

        try {
            const response = await fetch(`/api/jobs/${this.jobId}/files?confidence=${level}`);
            if (!response.ok) throw new Error('Failed to load files');

            const data = await response.json();
            content.innerHTML = '';

            if (data.files && data.files.length > 0) {
                const grid = this.renderThumbnailGrid(data.files);
                content.appendChild(grid);
            } else {
                content.innerHTML = '<div class="empty">No files found</div>';
            }
        } catch (error) {
            console.error(`Error loading ${level} confidence files:`, error);
            content.innerHTML = '<div class="error">Failed to load files</div>';
        }
    }

    /**
     * Render thumbnail grid
     * @param {Array} files - Array of file objects
     * @returns {HTMLElement} Grid element
     */
    renderThumbnailGrid(files) {
        const grid = document.createElement('div');
        grid.className = `thumbnail-grid thumb-${this.thumbnailSize}`;
        grid.dataset.grid = 'thumbnails';

        files.forEach((file, index) => {
            const thumbnail = this.renderThumbnail(file, index);
            grid.appendChild(thumbnail);
        });

        return grid;
    }

    /**
     * Render a single thumbnail
     * @param {Object} file - File object
     * @param {number} index - Index in the list
     * @returns {HTMLElement} Thumbnail element
     */
    renderThumbnail(file, index) {
        const thumb = document.createElement('div');
        thumb.className = 'thumbnail';
        thumb.dataset.fileId = file.id;
        thumb.dataset.index = index;

        // Use thumbnail_path if available, otherwise placeholder
        const imgSrc = file.thumbnail_path
            ? `/thumbnails/${file.thumbnail_path}`
            : '/static/img/placeholder.svg';

        thumb.innerHTML = `
            <img src="${imgSrc}"
                 alt="${file.original_name}"
                 loading="lazy"
                 onerror="this.src='/static/img/placeholder.svg'">
            <div class="thumbnail-info">
                <div class="filename" title="${file.original_name}">${file.original_name}</div>
                <div class="timestamp">${this.formatTimestamp(file.datetime_original)}</div>
            </div>
            <input type="checkbox" class="file-select" data-file-id="${file.id}">
        `;

        // Add selection handler with shift-click support
        const checkbox = thumb.querySelector('.file-select');
        checkbox.addEventListener('click', (e) => this.handleFileSelect(e, index));

        return thumb;
    }

    /**
     * Handle file selection with shift-click range selection
     * @param {Event} event - Click event
     * @param {number} index - Index of clicked file
     */
    handleFileSelect(event, index) {
        const checkbox = event.target;
        const fileId = parseInt(checkbox.dataset.fileId);

        if (event.shiftKey && this.lastSelectedIndex !== null) {
            // Range selection with shift-click
            const start = Math.min(this.lastSelectedIndex, index);
            const end = Math.max(this.lastSelectedIndex, index);

            const grid = checkbox.closest('[data-grid="thumbnails"]');
            const checkboxes = grid.querySelectorAll('.file-select');

            for (let i = start; i <= end; i++) {
                if (checkboxes[i]) {
                    checkboxes[i].checked = checkbox.checked;
                    const id = parseInt(checkboxes[i].dataset.fileId);
                    if (checkbox.checked) {
                        this.selectedFiles.add(id);
                    } else {
                        this.selectedFiles.delete(id);
                    }
                }
            }
        } else {
            // Single selection
            if (checkbox.checked) {
                this.selectedFiles.add(fileId);
            } else {
                this.selectedFiles.delete(fileId);
            }
        }

        this.lastSelectedIndex = index;

        // Update UI to show selection count
        this.updateSelectionCount();
    }

    /**
     * Update selection count display
     */
    updateSelectionCount() {
        const count = this.selectedFiles.size;
        // This could update a UI element showing selected count
        // For now, just log it
        console.log(`Selected files: ${count}`);
    }

    /**
     * Set thumbnail size
     * @param {string} size - Size (compact/medium/large)
     */
    setThumbnailSize(size) {
        this.thumbnailSize = size;

        // Update active button
        document.querySelectorAll('.size-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.size === size);
        });

        // Update all grids
        document.querySelectorAll('[data-grid="thumbnails"]').forEach(grid => {
            grid.className = `thumbnail-grid thumb-${size}`;
        });
    }

    /**
     * Load and render duplicate groups
     */
    async loadDuplicates() {
        const duplicatesContainer = document.querySelector('[data-duplicates]');
        if (!duplicatesContainer) return;

        duplicatesContainer.innerHTML = '<h3>Duplicate Groups</h3><div class="loading">Loading duplicates...</div>';

        try {
            const response = await fetch(`/api/jobs/${this.jobId}/duplicates`);
            if (!response.ok) throw new Error('Failed to load duplicates');

            const data = await response.json();

            duplicatesContainer.innerHTML = '<h3>Duplicate Groups</h3>';

            if (data.groups && data.groups.length > 0) {
                data.groups.forEach((group, index) => {
                    const groupEl = this.renderDuplicateGroup(group, index);
                    duplicatesContainer.appendChild(groupEl);
                });
            } else {
                duplicatesContainer.innerHTML += '<div class="empty">No duplicates found</div>';
            }
        } catch (error) {
            console.error('Error loading duplicates:', error);
            duplicatesContainer.innerHTML = '<h3>Duplicate Groups</h3><div class="error">Failed to load duplicates</div>';
        }
    }

    /**
     * Render a duplicate group with side-by-side comparison
     * @param {Object} group - Duplicate group object
     * @param {number} index - Group index
     * @returns {HTMLElement} Group element
     */
    renderDuplicateGroup(group, index) {
        const groupEl = document.createElement('div');
        groupEl.className = 'duplicate-group';
        groupEl.dataset.group = index;

        const header = document.createElement('div');
        header.className = 'duplicate-header';
        header.innerHTML = `
            <h4>Group ${index + 1}</h4>
            <span class="badge">${group.files.length} duplicates</span>
        `;

        const comparison = document.createElement('div');
        comparison.className = 'duplicate-comparison';

        // Find recommended file (best timestamp confidence)
        const recommended = this.findRecommended(group.files);

        group.files.forEach(file => {
            const isRecommended = file.id === recommended.id;
            const card = document.createElement('div');
            card.className = `duplicate-card ${isRecommended ? 'recommended' : ''}`;

            const imgSrc = file.thumbnail_path
                ? `/thumbnails/${file.thumbnail_path}`
                : '/static/img/placeholder.svg';

            card.innerHTML = `
                ${isRecommended ? '<div class="recommended-badge">Recommended</div>' : ''}
                <img src="${imgSrc}" alt="${file.original_name}" onerror="this.src='/static/img/placeholder.svg'">
                <div class="file-details">
                    <div class="filename" title="${file.original_name}">${file.original_name}</div>
                    <div class="confidence">
                        <span class="badge confidence-${file.confidence_level}">${file.confidence_level}</span>
                    </div>
                    <div class="timestamp">${this.formatTimestamp(file.datetime_original)}</div>
                    <div class="file-size">${this.formatFileSize(file.file_size)}</div>
                </div>
            `;

            comparison.appendChild(card);
        });

        groupEl.appendChild(header);
        groupEl.appendChild(comparison);

        return groupEl;
    }

    /**
     * Find recommended file in duplicate group (highest confidence)
     * @param {Array} files - Array of duplicate files
     * @returns {Object} Recommended file
     */
    findRecommended(files) {
        const confidenceOrder = { high: 3, medium: 2, low: 1, none: 0 };

        return files.reduce((best, file) => {
            const fileScore = confidenceOrder[file.confidence_level] || 0;
            const bestScore = confidenceOrder[best.confidence_level] || 0;
            return fileScore > bestScore ? file : best;
        }, files[0]);
    }

    /**
     * Format timestamp for display
     * @param {string} timestamp - ISO timestamp
     * @returns {string} Formatted timestamp
     */
    formatTimestamp(timestamp) {
        if (!timestamp) return 'Unknown';

        try {
            const date = new Date(timestamp);
            return date.toLocaleString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (error) {
            return timestamp;
        }
    }

    /**
     * Format file size for display
     * @param {number} bytes - File size in bytes
     * @returns {string} Formatted file size
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
}

// Export for use in main.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ResultsHandler;
}
