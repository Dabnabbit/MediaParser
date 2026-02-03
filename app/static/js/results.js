/**
 * Results Display Handler
 *
 * Displays processed files organized by confidence level.
 * Works within the unified job section.
 */

class ResultsHandler {
    constructor() {
        this.jobId = null;
        this.summary = null;
        this.selectedFiles = new Set();
        this.lastSelectedIndex = null;
        this.thumbnailSize = 'medium';
        this.expandedBucket = null;
        this.bucketPages = { high: 1, medium: 1, low: 1 };
        this.bucketTotals = { high: {}, medium: {}, low: {} };
        this.PAGE_SIZE = 50;

        // Cache DOM elements
        this.bucketsContainer = document.getElementById('buckets-container');
        this.highCount = document.getElementById('high-count');
        this.mediumCount = document.getElementById('medium-count');
        this.lowCount = document.getElementById('low-count');

        this.highGrid = document.getElementById('high-grid');
        this.mediumGrid = document.getElementById('medium-grid');
        this.lowGrid = document.getElementById('low-grid');

        this.duplicatesContainer = document.getElementById('duplicates-container');
        this.duplicatesList = document.getElementById('duplicates-list');

        this.initEventListeners();
    }

    /**
     * Reset results display for a new job
     */
    reset() {
        this.jobId = null;
        this.summary = null;
        this.selectedFiles.clear();
        this.lastSelectedIndex = null;
        this.expandedBucket = null;
        this.bucketPages = { high: 1, medium: 1, low: 1 };
        this.bucketTotals = { high: {}, medium: {}, low: {} };

        // Hide all buckets
        ['high', 'medium', 'low'].forEach(level => {
            const bucket = document.querySelector(`[data-bucket="${level}"]`);
            const grid = document.getElementById(`${level}-grid`);
            if (bucket) {
                bucket.style.display = 'none';
                bucket.dataset.expanded = 'false';
            }
            if (grid) {
                grid.innerHTML = '';
            }
        });

        // Reset counts
        if (this.highCount) this.highCount.textContent = '0 files';
        if (this.mediumCount) this.mediumCount.textContent = '0 files';
        if (this.lowCount) this.lowCount.textContent = '0 files';

        // Hide duplicates
        if (this.duplicatesContainer) {
            this.duplicatesContainer.style.display = 'none';
        }
        if (this.duplicatesList) {
            this.duplicatesList.innerHTML = '';
        }
    }

    initEventListeners() {
        // Bucket toggle handlers
        document.querySelectorAll('[data-bucket-toggle]').forEach(header => {
            header.addEventListener('click', (e) => {
                const level = e.currentTarget.dataset.bucketToggle;
                this.toggleBucket(level);
            });
        });

        // Thumbnail size toggle
        const sizeToggle = document.getElementById('thumb-size-toggle');
        if (sizeToggle) {
            sizeToggle.querySelectorAll('button').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    this.setThumbnailSize(e.target.dataset.size);
                });
            });
        }
    }

    /**
     * Show results for a completed job (called from progressHandler)
     */
    showResults(jobId, data) {
        this.jobId = jobId;

        // Transform API response format
        this.summary = data.summary ? {
            high: data.summary.confidence_counts?.high || 0,
            medium: data.summary.confidence_counts?.medium || 0,
            low: data.summary.confidence_counts?.low || 0,
            none: data.summary.confidence_counts?.none || 0,
            duplicates: data.summary.duplicate_groups || 0
        } : { high: 0, medium: 0, low: 0, none: 0, duplicates: 0 };

        // Update bucket counts and visibility
        this.updateBucketCounts();

        // Show duplicates section if any
        if (this.summary.duplicates > 0 && this.duplicatesContainer) {
            this.duplicatesContainer.style.display = 'block';
        }
    }

    updateBucketCounts() {
        const lowTotal = this.summary.low + this.summary.none;

        if (this.highCount) this.highCount.textContent = `${this.summary.high} files`;
        if (this.mediumCount) this.mediumCount.textContent = `${this.summary.medium} files`;
        if (this.lowCount) this.lowCount.textContent = `${lowTotal} files`;

        // Show/hide buckets based on count
        this.toggleBucketVisibility('high', this.summary.high > 0);
        this.toggleBucketVisibility('medium', this.summary.medium > 0);
        this.toggleBucketVisibility('low', lowTotal > 0);
    }

    toggleBucketVisibility(level, visible) {
        const bucket = document.querySelector(`[data-bucket="${level}"]`);
        if (bucket) {
            bucket.style.display = visible ? 'block' : 'none';
        }
    }

    /**
     * Toggle bucket expansion (accordion style)
     */
    async toggleBucket(level) {
        const bucket = document.querySelector(`[data-bucket="${level}"]`);
        const grid = document.getElementById(`${level}-grid`);

        if (!bucket || !grid) return;

        const isExpanded = bucket.dataset.expanded === 'true';

        // If clicking currently expanded bucket, collapse it
        if (isExpanded) {
            bucket.dataset.expanded = 'false';
            grid.innerHTML = '';
            this.expandedBucket = null;
            return;
        }

        // Collapse any currently expanded bucket
        if (this.expandedBucket) {
            const prevBucket = document.querySelector(`[data-bucket="${this.expandedBucket}"]`);
            const prevGrid = document.getElementById(`${this.expandedBucket}-grid`);
            if (prevBucket) prevBucket.dataset.expanded = 'false';
            if (prevGrid) prevGrid.innerHTML = '';
        }

        // Expand new bucket and load first page
        bucket.dataset.expanded = 'true';
        this.expandedBucket = level;
        this.bucketPages[level] = 1;
        await this.loadBucketPage(level, 1);
    }

    /**
     * Load a specific page of files for a bucket
     */
    async loadBucketPage(level, page) {
        const grid = document.getElementById(`${level}-grid`);
        if (!grid) return;

        grid.innerHTML = '<div class="loading">Loading files...</div>';

        try {
            const confidenceParam = level === 'low' ? 'low&confidence=none' : level;
            const response = await fetch(
                `/api/jobs/${this.jobId}/files?confidence=${confidenceParam}&page=${page}&per_page=${this.PAGE_SIZE}`
            );
            if (!response.ok) throw new Error('Failed to load files');

            const data = await response.json();

            // Store pagination info
            this.bucketTotals[level] = {
                total: data.total,
                pages: data.pages,
                currentPage: data.page
            };
            this.bucketPages[level] = page;

            grid.innerHTML = '';

            if (data.files && data.files.length > 0) {
                this.renderThumbnails(grid, data.files);
                this.renderPagination(grid, level, data);
            } else {
                grid.innerHTML = '<div class="empty">No files found</div>';
            }
        } catch (error) {
            console.error(`Error loading ${level} confidence files:`, error);
            grid.innerHTML = '<div class="error">Failed to load files</div>';
        }
    }

    /**
     * Render pagination controls below the thumbnail grid
     */
    renderPagination(grid, level, data) {
        // Only show pagination if more than one page
        if (data.pages <= 1) return;

        const pagination = document.createElement('div');
        pagination.className = 'bucket-pagination';

        const prevDisabled = data.page <= 1;
        const nextDisabled = data.page >= data.pages;

        pagination.innerHTML = `
            <button class="pagination-btn prev" ${prevDisabled ? 'disabled' : ''}>
                ← Prev
            </button>
            <span class="pagination-info">
                Page ${data.page} of ${data.pages} (${data.total} files)
            </span>
            <button class="pagination-btn next" ${nextDisabled ? 'disabled' : ''}>
                Next →
            </button>
        `;

        // Attach event listeners
        const prevBtn = pagination.querySelector('.prev');
        const nextBtn = pagination.querySelector('.next');

        prevBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (data.page > 1) {
                this.loadBucketPage(level, data.page - 1);
            }
        });

        nextBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (data.page < data.pages) {
                this.loadBucketPage(level, data.page + 1);
            }
        });

        grid.appendChild(pagination);
    }

    renderThumbnails(grid, files) {
        grid.className = `thumbnail-grid thumb-${this.thumbnailSize}`;

        files.forEach((file, index) => {
            const thumb = document.createElement('div');
            thumb.className = 'thumbnail';
            thumb.dataset.fileId = file.id;
            thumb.dataset.index = index;

            const imgSrc = file.thumbnail_path
                ? `/${file.thumbnail_path}`
                : '/static/img/placeholder.svg';

            const filename = file.original_filename || file.original_name || 'Unknown';
            const timestamp = this.formatTimestamp(file.detected_timestamp);

            thumb.innerHTML = `
                <img src="${imgSrc}"
                     alt="${filename}"
                     loading="lazy"
                     onerror="this.src='/static/img/placeholder.svg'">
                <div class="thumbnail-info">
                    <div class="filename" title="${filename}">${filename}</div>
                    <div class="timestamp">${timestamp}</div>
                </div>
                <input type="checkbox" class="file-select" data-file-id="${file.id}">
            `;

            const checkbox = thumb.querySelector('.file-select');
            checkbox.addEventListener('click', (e) => this.handleFileSelect(e, index));

            grid.appendChild(thumb);
        });
    }

    handleFileSelect(event, index) {
        const checkbox = event.target;
        const fileId = parseInt(checkbox.dataset.fileId);

        if (event.shiftKey && this.lastSelectedIndex !== null) {
            const start = Math.min(this.lastSelectedIndex, index);
            const end = Math.max(this.lastSelectedIndex, index);

            const grid = checkbox.closest('.thumbnail-grid');
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
            if (checkbox.checked) {
                this.selectedFiles.add(fileId);
            } else {
                this.selectedFiles.delete(fileId);
            }
        }

        this.lastSelectedIndex = index;
        console.log(`Selected files: ${this.selectedFiles.size}`);
    }

    setThumbnailSize(size) {
        this.thumbnailSize = size;

        // Update active button
        document.querySelectorAll('#thumb-size-toggle button').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.size === size);
        });

        // Update all grids
        document.querySelectorAll('.thumbnail-grid').forEach(grid => {
            grid.className = `thumbnail-grid thumb-${size}`;
        });
    }

    formatTimestamp(timestamp) {
        if (!timestamp) return 'Unknown';

        try {
            const date = new Date(timestamp);
            return date.toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                year: '2-digit',
                hour: 'numeric',
                minute: '2-digit'
            });
        } catch (error) {
            return timestamp;
        }
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.resultsHandler = new ResultsHandler();
    });
} else {
    window.resultsHandler = new ResultsHandler();
}
