/**
 * Results Display Handler
 *
 * Displays processed files in a unified grid with filter integration.
 * Works with FilterHandler for chip-based filtering.
 * Uses TileManager for tile lifecycle and lazy loading.
 */

class ResultsHandler {
    constructor() {
        this.jobId = null;
        this.summary = null;
        this.selectedFiles = new Set();
        this.lastSelectedIndex = null;
        this.thumbnailSize = 'medium';
        this.allFiles = [];

        // Window-based loading (scrubber model)
        this.currentOffset = 0;
        this.totalFiles = 0;
        this.windowSize = 50;  // Will be updated dynamically by slider
        this.isLoading = false;  // Prevent overlapping loads
        this.pendingLoad = null;  // Queue next load if one is in progress

        // Cache DOM elements - unified grid
        this.resultsContainer = document.getElementById('results-container');
        this.unifiedGrid = document.getElementById('unified-grid');
        this.gridLoading = document.getElementById('grid-loading');

        // Initialize TileManager for tile lifecycle
        this.tileManager = null;
        this.initTileManager();

        this.initEventListeners();
    }

    /**
     * Initialize TileManager for managing tiles
     */
    initTileManager() {
        if (!this.unifiedGrid) return;

        this.tileManager = new TileManager(this.unifiedGrid, {
            getGroupColor: (hash) => this.getGroupColor(hash),
            lazyLoad: true,
        });
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
        this.currentOffset = 0;
        this.totalFiles = 0;

        // Hide results container
        if (this.resultsContainer) {
            this.resultsContainer.style.display = 'none';
        }

        // Clear tiles via TileManager
        if (this.tileManager) {
            this.tileManager.clear();
        } else if (this.unifiedGrid) {
            this.unifiedGrid.innerHTML = '';
        }

        // Reset selection handler
        if (window.selectionHandler) {
            window.selectionHandler.reset();
        }

        // Reset filters
        if (window.filterHandler) {
            window.filterHandler.reset();
        }
    }

    initEventListeners() {
        // Listen for filter changes from FilterHandler
        window.addEventListener('filterChange', (e) => {
            this.currentOffset = 0;  // Reset to start on filter change
            this.loadFiles();
        });

        // Listen for slider offset changes (live during drag)
        window.addEventListener('sliderOffsetChange', (e) => {
            this.currentOffset = e.detail.offset;
            if (e.detail.limit) {
                this.windowSize = e.detail.limit;
            }
            this.loadFiles();
        });

        // Listen for window size changes (from resize)
        window.addEventListener('windowSizeChange', (e) => {
            this.windowSize = e.detail.windowSize;
            // Reload with new window size
            this.loadFiles();
        });

        // Thumbnail size toggle
        const sizeToggle = document.getElementById('thumb-size-toggle');
        if (sizeToggle) {
            sizeToggle.querySelectorAll('button').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    this.setThumbnailSize(e.target.dataset.size);
                    // Trigger window size recalculation after size change
                    if (window.positionSlider) {
                        window.positionSlider.recalculateWindowSize();
                    }
                });
            });
        }

        // NOTE: Grid click handling is DELEGATED to SelectionHandler (04-04)
        // results.js does NOT handle thumbnail clicks directly
        // This avoids conflicts between results.js and selection.js
    }

    /**
     * Load files from API with current filter state
     * Handles rapid calls during scrubbing by canceling stale requests
     */
    async loadFiles() {
        if (!this.jobId) return;

        // Get dynamic window size from slider
        const windowSize = window.positionSlider?.getWindowSize() || this.windowSize;

        // If already loading, queue this request
        if (this.isLoading) {
            this.pendingLoad = { offset: this.currentOffset, windowSize };
            return;
        }

        this.isLoading = true;
        const requestOffset = this.currentOffset;

        try {
            // Build URL with filter params
            const filterParams = window.filterHandler?.getQueryParams() || new URLSearchParams();
            filterParams.set('offset', requestOffset);
            filterParams.set('limit', windowSize);

            const response = await fetch(`/api/jobs/${this.jobId}/files?${filterParams}`);
            if (!response.ok) throw new Error('Failed to load files');

            const data = await response.json();

            // Only render if this is still the current offset (not stale)
            if (requestOffset === this.currentOffset) {
                this.allFiles = data.files || [];
                this.totalFiles = data.total || 0;
                this.windowSize = windowSize;

                this.renderGrid();
                this.updateSlider();

                // Update filter counts with mode totals and confidence counts
                if (window.filterHandler) {
                    const counts = {
                        ...(data.mode_totals || {}),
                        ...(data.mode_counts || {}),
                        total: data.total || 0
                    };
                    window.filterHandler.updateCounts(counts);
                }
            }
        } catch (error) {
            console.error('Error loading files:', error);
            if (requestOffset === this.currentOffset && this.unifiedGrid) {
                this.unifiedGrid.innerHTML = '<div class="empty">Failed to load files</div>';
            }
        } finally {
            this.isLoading = false;

            // Process any pending load request
            if (this.pendingLoad) {
                const pending = this.pendingLoad;
                this.pendingLoad = null;
                this.currentOffset = pending.offset;
                this.windowSize = pending.windowSize;
                this.loadFiles();
            }
        }
    }

    /**
     * Show results for a completed job (called from progressHandler)
     */
    async showResults(jobId, data) {
        this.jobId = jobId;
        if (this.resultsContainer) {
            this.resultsContainer.style.display = 'block';
        }

        // Reset filter handler and load fresh counts
        if (window.filterHandler) {
            window.filterHandler.reset();
        }

        // Load summary first to get counts, then auto-select mode
        await this.loadSummary();

        // Auto-select appropriate mode based on counts
        // (Duplicates first if any, otherwise Unreviewed)
        if (window.filterHandler) {
            window.filterHandler.autoSelectMode();
        }

        // Load files for the selected mode
        this.loadFiles();
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

        this.unifiedGrid.className = `thumbnail-grid thumb-${this.thumbnailSize}`;

        if (this.allFiles.length === 0) {
            if (this.tileManager) {
                this.tileManager.clear();
            }
            this.unifiedGrid.innerHTML = '<div class="empty">No files match the current filters</div>';
            return;
        }

        // Use TileManager for tile rendering
        if (this.tileManager) {
            this.tileManager.renderFiles(this.allFiles, {
                clear: true,
                selectedIds: this.selectedFiles,
            });
        } else {
            // Fallback to legacy rendering
            this.unifiedGrid.innerHTML = '';
            this.allFiles.forEach((file, index) => {
                const thumb = this.createThumbnailElement(file, index);
                this.unifiedGrid.appendChild(thumb);
            });
        }

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
            // Generate consistent color from file hash for this duplicate group
            const groupColor = this.getGroupColor(file.file_hash);
            thumb.style.setProperty('--duplicate-color', groupColor.solid);
            thumb.style.setProperty('--duplicate-color-light', groupColor.light);
        }

        const imgSrc = file.thumbnail_path ? `/${file.thumbnail_path}` : '/static/img/placeholder.svg';
        const confidenceClass = `confidence-${file.confidence}`;
        const confidenceLabel = file.confidence?.charAt(0).toUpperCase() || '?';
        const isVideo = file.mime_type?.startsWith('video/');
        const isReviewed = !!file.reviewed_at;
        const isFailed = !!file.processing_error;
        const isDuplicate = !!file.is_duplicate;
        const isDiscarded = !!file.discarded;

        const timestamp = file.final_timestamp || file.detected_timestamp;
        const dateStr = timestamp ? new Date(timestamp).toISOString().split('T')[0] : 'Unknown';

        // Get duplicate badge with group color
        let duplicateBadge = '';
        if (isDuplicate) {
            const groupColor = this.getGroupColor(file.file_hash);
            duplicateBadge = `<span class="thumb-badge duplicate" style="background:${groupColor.solid}" title="Click to select duplicate group">&#x29C9;</span>`;
        }

        thumb.innerHTML = `
            <div class="thumbnail-badges">
                <div class="badge-top">
                    <label class="thumb-checkbox" title="Select file">
                        <input type="checkbox" data-file-id="${file.id}">
                        <span class="checkmark"></span>
                    </label>
                    <div class="badge-status">
                        ${isReviewed ? '<span class="thumb-badge reviewed">&#10003;</span>' : ''}
                        ${isFailed ? '<span class="thumb-badge failed">&#10007;</span>' : ''}
                        ${isDiscarded ? '<span class="thumb-badge discarded">&#x1F5D1;</span>' : ''}
                    </div>
                </div>
                <div class="badge-bottom">
                    <span class="thumb-badge ${confidenceClass}">${confidenceLabel}</span>
                    ${isVideo ? '<span class="thumb-badge media-video">&#9658;</span>' : ''}
                    ${duplicateBadge}
                </div>
            </div>
            <img data-src="${imgSrc}"
                 src="/static/img/placeholder.svg"
                 alt="${file.original_filename}"
                 title="${file.original_filename}&#10;${dateStr}&#10;${file.file_size_bytes ? this.formatFileSize(file.file_size_bytes) : ''}">
            <div class="thumbnail-filename">${file.original_filename}</div>
        `;

        return thumb;
    }

    /**
     * Update position slider with current window state
     */
    updateSlider() {
        if (window.positionSlider) {
            window.positionSlider.setTotal(this.totalFiles);
            window.positionSlider.setOffset(this.currentOffset);
        }
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
        if (show) {
            if (this.tileManager) {
                this.tileManager.clear();
            } else if (this.unifiedGrid) {
                this.unifiedGrid.innerHTML = '';
            }
        }
    }

    /**
     * Get the TileManager instance
     * @returns {TileManager|null}
     */
    getTileManager() {
        return this.tileManager;
    }

    /**
     * Get a Tile by file ID
     * @param {number} fileId
     * @returns {Tile|undefined}
     */
    getTile(fileId) {
        return this.tileManager?.getTile(fileId);
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
     * Generate a consistent color for a duplicate group based on its hash
     * Returns both solid and semi-transparent versions
     */
    getGroupColor(hash) {
        if (!hash) {
            return { solid: 'hsl(45, 90%, 50%)', light: 'hsla(45, 90%, 50%, 0.4)' };
        }

        // Generate hue from hash (0-360)
        // Use first 8 chars of hash to get a number
        let hashNum = 0;
        for (let i = 0; i < Math.min(8, hash.length); i++) {
            hashNum = ((hashNum << 5) - hashNum) + hash.charCodeAt(i);
            hashNum = hashNum & hashNum; // Convert to 32bit integer
        }

        // Map to hue, avoiding greens (hard to see) and staying in warm/cool spectrum
        // Use modulo and offset to get good distribution
        const hue = Math.abs(hashNum) % 360;

        // Fixed saturation and lightness for consistency
        const sat = 75;
        const light = 50;

        return {
            solid: `hsl(${hue}, ${sat}%, ${light}%)`,
            light: `hsla(${hue}, ${sat}%, ${light}%, 0.4)`
        };
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
