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
        this.tileSizePx = 150;
        this.allFiles = [];
        this.totalFiles = 0;
        this.isLoading = false;  // Prevent overlapping loads
        this.pendingLoad = false;  // Queue next load if one is in progress

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
            virtualScroll: true,
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
        this.totalFiles = 0;

        // Hide results container
        if (this.resultsContainer) {
            this.resultsContainer.style.display = 'none';
        }

        // Hide export section
        const exportSection = document.getElementById('export-section');
        if (exportSection) {
            exportSection.style.display = 'none';
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
        window.addEventListener('filterChange', () => {
            this.loadFiles();
        });

        // Tile size slider - live update + sync scrollbar after resize
        const tileSizeSlider = document.getElementById('tile-size-slider');
        if (tileSizeSlider) {
            tileSizeSlider.addEventListener('input', (e) => {
                this.setTileSize(parseInt(e.target.value, 10));
            });
            tileSizeSlider.addEventListener('change', () => {
                if (window.positionSlider) {
                    window.positionSlider.syncThumb();
                }
            });
        }

        // NOTE: Grid click handling is DELEGATED to SelectionHandler (04-04)
        // results.js does NOT handle thumbnail clicks directly
        // This avoids conflicts between results.js and selection.js
    }

    /**
     * Load all files from API with current filter state.
     * Grid scrolls natively; no offset/limit windowing needed.
     */
    async loadFiles() {
        if (!this.jobId) return;

        // If already loading, queue a reload after current finishes
        if (this.isLoading) {
            this.pendingLoad = true;
            return;
        }

        this.isLoading = true;

        try {
            const allChipsOff = window.filterHandler && window.filterHandler.visibleConfidence.size === 0;

            const filterParams = window.filterHandler?.getQueryParams() || new URLSearchParams();
            filterParams.set('offset', 0);
            filterParams.set('limit', 10000);

            const response = await fetch(`/api/jobs/${this.jobId}/files?${filterParams}`);
            if (!response.ok) throw new Error('Failed to load files');

            const data = await response.json();

            // If all confidence chips are off, show empty grid but still use
            // the API response for counts (so chips update on mode switch)
            this.allFiles = allChipsOff ? [] : (data.files || []);
            this.totalFiles = allChipsOff ? 0 : (data.total || 0);

            this.renderGrid();

            // Update filter counts with mode totals and confidence counts
            if (window.filterHandler) {
                const counts = {
                    ...(data.mode_totals || {}),
                    ...(data.mode_counts || {}),
                    total: data.total || 0
                };
                window.filterHandler.updateCounts(counts);
            }

            // Sync scrollbar after grid renders
            if (window.positionSlider) {
                window.positionSlider.setTotal(this.totalFiles);
            }
        } catch (error) {
            console.error('Error loading files:', error);
            if (this.unifiedGrid) {
                this.unifiedGrid.innerHTML = '<div class="empty">Failed to load files</div>';
            }
        } finally {
            this.isLoading = false;

            // Process any pending load request
            if (this.pendingLoad) {
                this.pendingLoad = false;
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

        // Show export section with export button
        this.showExportSection(jobId);

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
     * Show export section with export button
     */
    showExportSection(importJobId) {
        const exportSection = document.getElementById('export-section');
        if (!exportSection) return;

        exportSection.style.display = 'block';

        // Wire up export button if not already done
        const exportBtn = document.getElementById('export-btn');
        if (exportBtn && !exportBtn.dataset.wired) {
            exportBtn.dataset.wired = 'true';
            exportBtn.addEventListener('click', () => {
                if (window.progressHandler) {
                    window.progressHandler.startExport(importJobId);
                }
            });
        }
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

        this.unifiedGrid.className = 'thumbnail-grid';

        if (this.allFiles.length === 0) {
            if (this.tileManager) {
                this.tileManager.clear();
            }
            this.unifiedGrid.innerHTML = '<div class="empty">No files match the current filters</div>';
            return;
        }

        // Scroll to top before rendering so VirtualScrollManager sees scrollTop=0
        this.unifiedGrid.scrollTop = 0;

        // Use TileManager for tile rendering (triggers virtual scroll if enabled)
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

        // Sync scrollbar after layout settles
        requestAnimationFrame(() => {
            if (window.positionSlider) {
                window.positionSlider.syncThumb();
            }
        });
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

        const mode = window.filterHandler?.getCurrentMode?.() || null;
        const showDuplicate = !!file.is_duplicate && mode !== 'similar';
        const showSimilar = !!file.is_similar && mode !== 'duplicates';

        if (showDuplicate) {
            thumb.classList.add('duplicate-group');
            const groupColor = this.getGroupColor(file.exact_group_id);
            thumb.style.setProperty('--duplicate-color', groupColor.solid);
            thumb.style.setProperty('--duplicate-color-light', groupColor.light);
        }
        if (showSimilar) {
            thumb.classList.add('similar-group');
            const groupColor = this.getGroupColor(file.similar_group_id);
            thumb.style.setProperty('--similar-color', groupColor.solid);
            thumb.style.setProperty('--similar-color-light', groupColor.light);
        }

        const imgSrc = file.thumbnail_path ? `/${file.thumbnail_path}` : '/static/img/placeholder.svg';
        const confidenceClass = `confidence-${file.confidence}`;
        const confidenceLabel = file.confidence?.charAt(0).toUpperCase() || '?';
        const isVideo = file.mime_type?.startsWith('video/');
        const isReviewed = !!file.reviewed_at;
        const isFailed = !!file.processing_error;
        const isDiscarded = !!file.discarded;

        const timestamp = file.final_timestamp || file.detected_timestamp;
        const dateStr = timestamp ? new Date(timestamp).toISOString().split('T')[0] : 'Unknown';

        // Badge background comes from CSS vars (--duplicate-color / --similar-color)
        let duplicateBadge = '';
        if (showDuplicate) {
            duplicateBadge = `<span class="thumb-badge duplicate" title="Click to select duplicate group">&#x29C9;</span>`;
        }

        let similarBadge = '';
        if (showSimilar) {
            const typeLabel = file.similar_group_type || 'similar';
            similarBadge = `<span class="thumb-badge similar" title="Similar group (${typeLabel})">&#x2248;</span>`;
        }

        thumb.innerHTML = `
            <div class="thumbnail-badges">
                <div class="badge-top">
                    <div class="badge-info">
                        <span class="thumb-badge ${confidenceClass}">${confidenceLabel}</span>
                        ${isVideo ? '<span class="thumb-badge media-video">&#9658;</span>' : ''}
                        ${duplicateBadge}
                        ${similarBadge}
                        ${isReviewed ? '<span class="thumb-badge reviewed">&#10003;</span>' : ''}
                        ${isFailed ? '<span class="thumb-badge failed">&#10007;</span>' : ''}
                        ${isDiscarded ? '<span class="thumb-badge discarded">&#x1F5D1;</span>' : ''}
                    </div>
                    <label class="thumb-checkbox" title="Select file">
                        <input type="checkbox" data-file-id="${file.id}">
                        <span class="checkmark"></span>
                    </label>
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
     * Set tile size via CSS variable (driven by slider)
     */
    setTileSize(px) {
        this.tileSizePx = px;
        if (this.unifiedGrid) {
            this.unifiedGrid.style.setProperty('--tile-size', px + 'px');
        }
        // Recalculate virtual scroll layout (columns/rows change with tile size)
        this.tileManager?.virtualScroll?.recalculateLayout();
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
