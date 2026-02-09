/**
 * VirtualScrollManager - Only renders DOM for visible tiles
 *
 * Listens to the grid's scroll events (RAF-throttled), calculates which
 * file indices are visible, and tells TileManager to render that range.
 *
 * Uses explicit CSS Grid placement: defines grid-template-rows for the
 * full virtual row count, then places each rendered tile at its correct
 * grid-row/grid-column. Empty rows still contribute to scroll height.
 * This avoids padding manipulation which breaks under border-box.
 *
 * Grid tiles are all the same size (driven by --tile-size CSS variable),
 * so no per-tile ResizeObserver is needed — layout is fully calculable.
 */

class VirtualScrollManager {
    /**
     * @param {HTMLElement} container - The scrollable grid element (CSS grid)
     */
    constructor(container) {
        this.container = container;

        // File data (set via setFiles)
        this.files = [];

        // Layout metrics (recalculated on resize / tile-size change)
        this.columns = 1;
        this.rowHeight = 150;
        this.tileSize = 150;
        this.gap = 0;
        this.totalRows = 0;

        // Padding from CSS (for width calculation only — never manipulated)
        this.padLeft = 8;
        this.padRight = 44;

        // Currently rendered range
        this.startIdx = 0;
        this.endIdx = 0;

        // Overscan rows (render extra rows above/below viewport)
        this.overscanRows = 3;

        // Guard against re-entrant layout during rendering
        this._rendering = false;

        // Viewport-exempted tile IDs (carousel mode tiles kept alive)
        this.exemptedIds = new Set();

        // Callback: called with (startIdx, endIdx) when visible range changes
        this.onRender = null;

        // Pause flag — skips recalculation and scroll handling (viewport mode)
        this._paused = false;

        // Scroll listener (RAF-throttled)
        this._rafId = null;
        this._onScroll = () => {
            if (this._rafId || this._rendering || this._paused) return;
            this._rafId = requestAnimationFrame(() => {
                this._rafId = null;
                this.handleScroll();
            });
        };
        container.addEventListener('scroll', this._onScroll, { passive: true });

        // Container ResizeObserver — handles width and height changes separately.
        // Width change → recalculateLayout (columns depend on width)
        // Height change → handleScroll (visible range depends on height)
        this._lastWidth = 0;
        this._lastHeight = 0;
        this._resizeObserver = new ResizeObserver((entries) => {
            if (this._rendering || this._paused) return;
            const entry = entries[0];
            const w = entry.contentRect.width;
            const h = entry.contentRect.height;

            if (w !== this._lastWidth) {
                this._lastWidth = w;
                this._lastHeight = h;
                this.recalculateLayout();
            } else if (h !== this._lastHeight) {
                this._lastHeight = h;
                // Height changed but width didn't — just update visible range
                this.handleScroll();
            }
        });
        this._resizeObserver.observe(container);
    }

    /**
     * Set the full file list and trigger initial render.
     * @param {Object[]} files - Array of file data objects
     */
    setFiles(files) {
        this.files = files;
        this.recalculateLayout();
    }

    /**
     * Recalculate layout metrics from CSS and container dimensions.
     * Called on tile size change, window resize, or new file set.
     * Skips DOM updates and re-render if layout hasn't actually changed.
     */
    recalculateLayout() {
        if (!this.container || this._recalculating || this._paused) return;
        this._recalculating = true;

        try {
            if (this.files.length === 0) {
                this.columns = 1;
                this.totalRows = 0;
                this.startIdx = 0;
                this.endIdx = 0;
                this.container.style.gridTemplateRows = '';
                return;
            }

            // Read --tile-size and gap from computed style
            const cs = getComputedStyle(this.container);
            const tileSize = parseFloat(cs.getPropertyValue('--tile-size')) || 150;
            const gap = parseFloat(cs.gap) || parseFloat(cs.getPropertyValue('gap')) || 8;

            // Read actual padding for width calculation
            const padLeft = parseFloat(cs.paddingLeft) || 8;
            const padRight = parseFloat(cs.paddingRight) || 44;

            // Available width for columns
            const containerWidth = this.container.clientWidth - padLeft - padRight;

            // Column count: same formula CSS auto-fill uses
            const columns = Math.max(1, Math.floor((containerWidth + gap) / (tileSize + gap)));
            const totalRows = Math.ceil(this.files.length / columns);

            // Skip DOM updates if layout hasn't changed
            if (columns === this.columns && totalRows === this.totalRows &&
                tileSize === this.tileSize && gap === this.gap) {
                return;
            }

            this.tileSize = tileSize;
            this.gap = gap;
            this.padLeft = padLeft;
            this.padRight = padRight;
            this.columns = columns;
            this.rowHeight = tileSize + gap;
            this.totalRows = totalRows;

            // Set explicit grid rows for the full virtual height.
            // Empty rows still occupy space, creating the scroll area.
            this.container.style.gridTemplateRows = `repeat(${this.totalRows}, var(--tile-size))`;

            // Also lock column template to match our calculated count
            this.container.style.gridTemplateColumns = `repeat(${this.columns}, var(--tile-size))`;

            // Reset range to force re-render
            this.startIdx = -1;
            this.endIdx = -1;

            this.handleScroll();
        } finally {
            this._recalculating = false;
        }
    }

    /**
     * Calculate visible range from scrollTop and render if changed.
     */
    handleScroll() {
        if (this.files.length === 0 || this._rendering || this._paused) return;

        const scrollTop = this.container.scrollTop;
        const clientHeight = this.container.clientHeight;

        const startRow = Math.max(0, Math.floor(scrollTop / this.rowHeight) - this.overscanRows);
        const endRow = Math.min(this.totalRows, Math.ceil((scrollTop + clientHeight) / this.rowHeight) + this.overscanRows);

        const startIdx = startRow * this.columns;
        const endIdx = Math.min(this.files.length, endRow * this.columns);

        // Only re-render if range actually changed
        if (startIdx === this.startIdx && endIdx === this.endIdx) return;

        this.startIdx = startIdx;
        this.endIdx = endIdx;

        // Notify TileManager to render this range
        if (this.onRender) {
            this._rendering = true;
            try {
                this.onRender(startIdx, endIdx);
            } finally {
                this._rendering = false;
            }
        }
    }

    /**
     * Get the grid-row and grid-column for a file at a given global index.
     * Returns 1-indexed values for CSS grid placement.
     * @param {number} globalIndex
     * @returns {{row: number, col: number}}
     */
    getGridPosition(globalIndex) {
        return {
            row: Math.floor(globalIndex / this.columns) + 1,
            col: (globalIndex % this.columns) + 1,
        };
    }

    /**
     * Get the currently visible range.
     * @returns {{startIdx: number, endIdx: number}}
     */
    getVisibleRange() {
        return { startIdx: this.startIdx, endIdx: this.endIdx };
    }

    /**
     * Get file index by ID.
     * @param {number} fileId
     * @returns {number} Index in files array, or -1
     */
    getFileIndex(fileId) {
        return this.files.findIndex(f => f.id === fileId);
    }

    /**
     * Mark tile IDs as exempt from recycling (viewport mode).
     * These tiles won't be destroyed on range changes.
     * @param {number[]} ids
     */
    exemptFromRecycling(ids) {
        ids.forEach(id => {
            if (id !== undefined) this.exemptedIds.add(id);
        });
    }

    /**
     * Remove recycling exemption for tile IDs.
     * @param {number[]} ids
     */
    allowRecycling(ids) {
        ids.forEach(id => this.exemptedIds.delete(id));
    }

    /**
     * Clear all recycling exemptions.
     */
    clearExemptions() {
        this.exemptedIds.clear();
    }

    /**
     * Check if a file index is in the currently rendered range.
     * @param {number} index
     * @returns {boolean}
     */
    isIndexInRange(index) {
        return index >= this.startIdx && index < this.endIdx;
    }

    /**
     * Force re-render of the current visible range.
     */
    renderVisibleRange() {
        this.startIdx = -1;
        this.endIdx = -1;
        this.handleScroll();
    }

    /**
     * Scroll to bring a specific file index into view.
     * @param {number} fileIndex
     */
    scrollToIndex(fileIndex) {
        if (fileIndex < 0 || fileIndex >= this.files.length) return;

        const row = Math.floor(fileIndex / this.columns);
        const targetScrollTop = row * this.rowHeight;

        // Only scroll if not already visible
        const scrollTop = this.container.scrollTop;
        const clientHeight = this.container.clientHeight;

        if (targetScrollTop < scrollTop || targetScrollTop > scrollTop + clientHeight - this.rowHeight) {
            this.container.scrollTop = Math.max(0, targetScrollTop - clientHeight / 3);
        }
    }

    /**
     * Pause scroll handling and layout recalculation (viewport mode).
     */
    pause() {
        this._paused = true;
    }

    /**
     * Resume scroll handling and layout recalculation.
     */
    resume() {
        this._paused = false;
    }

    /**
     * Destroy the manager and clean up.
     */
    destroy() {
        if (this._rafId) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }

        this.container.removeEventListener('scroll', this._onScroll);

        if (this._resizeObserver) {
            this._resizeObserver.disconnect();
            this._resizeObserver = null;
        }

        // Clear explicit grid template
        if (this.container) {
            this.container.style.gridTemplateRows = '';
            this.container.style.gridTemplateColumns = '';
        }

        this.files = [];
        this.onRender = null;
        this.container = null;
    }
}

// Export for use in other modules
window.VirtualScrollManager = VirtualScrollManager;
