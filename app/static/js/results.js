/**
 * Results Display Handler
 *
 * Displays processed files in a unified grid with filter integration.
 * Works with FilterHandler for chip-based filtering.
 * Uses Intersection Observer for lazy loading thumbnails.
 */

class ResultsHandler {
    constructor() {
        this.jobId = null;
        this.summary = null;
        this.selectedFiles = new Set();
        this.lastSelectedIndex = null;
        this.thumbnailSize = 'medium';
        this.allFiles = [];
        this.currentPage = 1;
        this.totalPages = 1;
        this.PAGE_SIZE = 100;
        this.lazyLoader = null;

        // Cache DOM elements - unified grid
        this.resultsContainer = document.getElementById('results-container');
        this.unifiedGrid = document.getElementById('unified-grid');
        this.gridLoading = document.getElementById('grid-loading');
        this.gridPagination = document.getElementById('grid-pagination');

        this.initEventListeners();
        this.initLazyLoader();
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
     * Reset results display for a new job
     */
    reset() {
        this.jobId = null;
        this.summary = null;
        this.selectedFiles.clear();
        this.lastSelectedIndex = null;
        this.allFiles = [];
        this.currentPage = 1;
        this.totalPages = 1;

        // Hide results container
        if (this.resultsContainer) {
            this.resultsContainer.style.display = 'none';
        }

        // Clear grid
        if (this.unifiedGrid) {
            this.unifiedGrid.innerHTML = '';
        }

        // Hide pagination
        if (this.gridPagination) {
            this.gridPagination.style.display = 'none';
        }

        // Reset filters
        if (window.filterHandler) {
            window.filterHandler.reset();
        }
    }

    initEventListeners() {
        // Listen for filter changes from FilterHandler
        window.addEventListener('filterChange', (e) => {
            this.currentPage = 1;
            this.loadFiles();
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

        // NOTE: Grid click handling is DELEGATED to SelectionHandler (04-04)
        // results.js does NOT handle thumbnail clicks directly
        // This avoids conflicts between results.js and selection.js
    }

    /**
     * Load files from API with current filter state
     */
    async loadFiles() {
        if (!this.jobId) return;

        this.showLoading(true);

        try {
            // Build URL with filter params
            const filterParams = window.filterHandler?.getQueryParams() || new URLSearchParams();
            filterParams.set('page', this.currentPage);
            filterParams.set('per_page', this.PAGE_SIZE);

            const response = await fetch(`/api/jobs/${this.jobId}/files?${filterParams}`);
            if (!response.ok) throw new Error('Failed to load files');

            const data = await response.json();

            this.allFiles = data.files || [];
            this.totalPages = data.pages || 1;

            this.renderGrid();
            this.renderPagination(data);
        } catch (error) {
            console.error('Error loading files:', error);
            if (this.unifiedGrid) {
                this.unifiedGrid.innerHTML = '<div class="empty">Failed to load files</div>';
            }
        } finally {
            this.showLoading(false);
        }
    }

    /**
     * Show results for a completed job (called from progressHandler)
     */
    showResults(jobId, data) {
        this.jobId = jobId;
        if (this.resultsContainer) {
            this.resultsContainer.style.display = 'block';
        }

        // Update filter counts from summary
        if (data.summary && window.filterHandler) {
            window.filterHandler.updateCounts({
                high: data.summary.confidence_counts?.high || 0,
                medium: data.summary.confidence_counts?.medium || 0,
                low: (data.summary.confidence_counts?.low || 0) + (data.summary.confidence_counts?.none || 0),
                reviewed: 0, // Will be fetched from summary endpoint
                duplicates: data.summary.duplicate_groups || 0,
                failed: data.summary.failed_count || 0,
                total: data.progress_total || 0
            });
        }

        // Load initial files
        this.loadFiles();

        // Load full summary for accurate counts
        this.loadSummary();
    }

    /**
     * Load job summary for filter counts
     */
    async loadSummary() {
        try {
            const response = await fetch(`/api/jobs/${this.jobId}/summary`);
            if (response.ok) {
                const summary = await response.json();
                if (window.filterHandler) {
                    window.filterHandler.updateCounts(summary);
                }
            }
        } catch (error) {
            console.warn('Failed to load summary:', error);
        }
    }

    /**
     * Render the thumbnail grid
     */
    renderGrid() {
        if (!this.unifiedGrid) return;

        this.unifiedGrid.innerHTML = '';
        this.unifiedGrid.className = `thumbnail-grid thumb-${this.thumbnailSize}`;

        if (this.allFiles.length === 0) {
            this.unifiedGrid.innerHTML = '<div class="empty">No files match the current filters</div>';
            return;
        }

        this.allFiles.forEach((file, index) => {
            const thumb = this.createThumbnailElement(file, index);
            this.unifiedGrid.appendChild(thumb);

            // Observe image for lazy loading
            const img = thumb.querySelector('img');
            if (img && this.lazyLoader) {
                this.lazyLoader.observe(img);
            }
        });

        // After rendering, refresh selection UI if selectionHandler exists
        if (window.selectionHandler) {
            window.selectionHandler.refreshUI();
        }
    }

    /**
     * Create a thumbnail element with badges
     * NOTE: No click handler - selection.js owns all grid click handling
     */
    createThumbnailElement(file, index) {
        const thumb = document.createElement('div');
        thumb.className = 'thumbnail';
        thumb.dataset.fileId = file.id;
        thumb.dataset.index = index;

        if (this.selectedFiles.has(file.id)) {
            thumb.classList.add('selected');
        }
        if (file.is_duplicate) {
            thumb.classList.add('duplicate-group');
        }

        const imgSrc = file.thumbnail_path ? `/${file.thumbnail_path}` : '/static/img/placeholder.svg';
        const confidenceClass = `confidence-${file.confidence}`;
        const confidenceLabel = file.confidence?.charAt(0).toUpperCase() || '?';
        const isVideo = file.mime_type?.startsWith('video/');
        const isReviewed = !!file.reviewed_at;
        const isFailed = !!file.processing_error;

        const timestamp = file.final_timestamp || file.detected_timestamp;
        const dateStr = timestamp ? new Date(timestamp).toISOString().split('T')[0] : 'Unknown';

        thumb.innerHTML = `
            <div class="thumbnail-badges">
                <div class="badge-left">
                    <span class="thumb-badge ${confidenceClass}">${confidenceLabel}</span>
                    ${isVideo ? '<span class="thumb-badge media-video">&#9658;</span>' : ''}
                </div>
                <div class="badge-right">
                    ${isReviewed ? '<span class="thumb-badge reviewed">&#10003;</span>' : ''}
                    ${isFailed ? '<span class="thumb-badge failed">&#10007;</span>' : ''}
                </div>
            </div>
            <img data-src="${imgSrc}"
                 src="/static/img/placeholder.svg"
                 alt="${file.original_filename}"
                 title="${file.original_filename}&#10;${file.file_size_bytes ? this.formatFileSize(file.file_size_bytes) : ''}">
            <div class="thumbnail-date">${dateStr}</div>
        `;

        return thumb;
    }

    /**
     * Render pagination controls
     */
    renderPagination(data) {
        if (!this.gridPagination) return;

        // Hide pagination if only one page
        if (data.pages <= 1) {
            this.gridPagination.style.display = 'none';
            return;
        }

        this.gridPagination.style.display = 'flex';

        const prevDisabled = data.page <= 1;
        const nextDisabled = data.page >= data.pages;

        this.gridPagination.innerHTML = `
            <button class="btn btn-secondary btn-sm" id="page-prev" ${prevDisabled ? 'disabled' : ''}>
                &larr; Previous
            </button>
            <span class="pagination-info">
                Page ${data.page} of ${data.pages} &bull; ${data.total} files
            </span>
            <button class="btn btn-secondary btn-sm" id="page-next" ${nextDisabled ? 'disabled' : ''}>
                Next &rarr;
            </button>
        `;

        // Attach event listeners
        document.getElementById('page-prev')?.addEventListener('click', () => {
            if (this.currentPage > 1) {
                this.currentPage--;
                this.loadFiles();
                this.scrollToTop();
            }
        });

        document.getElementById('page-next')?.addEventListener('click', () => {
            if (this.currentPage < this.totalPages) {
                this.currentPage++;
                this.loadFiles();
                this.scrollToTop();
            }
        });
    }

    /**
     * Scroll to top of results container
     */
    scrollToTop() {
        this.resultsContainer?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    /**
     * Show/hide loading indicator
     */
    showLoading(show) {
        if (this.gridLoading) {
            this.gridLoading.style.display = show ? 'flex' : 'none';
        }
        if (this.unifiedGrid && show) {
            this.unifiedGrid.innerHTML = '';
        }
    }

    /**
     * Set thumbnail size and update grid
     */
    setThumbnailSize(size) {
        this.thumbnailSize = size;

        // Update active button
        document.querySelectorAll('#thumb-size-toggle button').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.size === size);
        });

        // Update grid class
        if (this.unifiedGrid) {
            this.unifiedGrid.className = `thumbnail-grid thumb-${size}`;
        }
    }

    /**
     * Format file size in human-readable format
     */
    formatFileSize(bytes) {
        if (!bytes) return 'Unknown size';
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
     * Format timestamp for display
     */
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
