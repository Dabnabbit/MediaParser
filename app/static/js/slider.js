/**
 * Position Slider Handler (Window Scrubber)
 *
 * Dynamically-sized slider that controls which window of files is displayed.
 * Dragging streams different files into the viewport in real-time.
 * Window size is calculated based on how many tiles fit in the grid area.
 */

class PositionSliderHandler {
    constructor() {
        this.slider = document.getElementById('position-slider');
        this.track = document.getElementById('slider-track');
        this.thumb = document.getElementById('slider-thumb');
        this.gridContainer = document.querySelector('.grid-with-slider');
        this.grid = document.getElementById('unified-grid');

        this.totalFiles = 0;
        this.windowSize = 50;  // Will be calculated dynamically
        this.currentOffset = 0;
        this.isDragging = false;
        this.lastDispatchedOffset = -1;  // Track last dispatched to avoid duplicates

        // Throttle for live updates during drag
        this.dragThrottleMs = 50;  // 20fps updates
        this.lastDragDispatch = 0;

        this.initEventListeners();
        this.initResizeObserver();
    }

    /**
     * Watch for grid resize and recalculate window size
     */
    initResizeObserver() {
        if (!this.gridContainer) return;

        this.resizeObserver = new ResizeObserver(() => {
            this.recalculateWindowSize();
            this.syncTrackHeight();
        });
        this.resizeObserver.observe(this.gridContainer);

        // Initial calculation after a brief delay for layout
        requestAnimationFrame(() => {
            this.recalculateWindowSize();
            this.syncTrackHeight();
        });
    }

    /**
     * Calculate how many tiles fit in the grid area
     */
    recalculateWindowSize() {
        if (!this.grid || !this.gridContainer) return;

        // Use the grid's actual dimensions, not the container
        const gridHeight = this.grid.clientHeight;
        const gridWidth = this.grid.clientWidth;

        // Get thumbnail size from grid class
        const sizeClass = this.grid.className.match(/thumb-(compact|medium|large)/);
        const size = sizeClass ? sizeClass[1] : 'medium';

        // Tile dimensions: width from CSS minmax + gap (8px)
        // Height = width since aspect-ratio: 1 makes thumbnails square
        const gap = 8;  // --spacing-sm = 0.5rem = 8px
        const tileSizes = {
            compact: { width: 100 + gap, height: 100 + gap },
            medium: { width: 150 + gap, height: 150 + gap },
            large: { width: 200 + gap, height: 200 + gap }
        };
        const tileSize = tileSizes[size] || tileSizes.medium;

        const cols = Math.max(1, Math.floor(gridWidth / tileSize.width));
        const rows = Math.max(1, Math.floor(gridHeight / tileSize.height));
        const newWindowSize = cols * rows;

        if (newWindowSize !== this.windowSize && newWindowSize > 0) {
            this.windowSize = newWindowSize;

            // Notify results handler of new window size
            window.dispatchEvent(new CustomEvent('windowSizeChange', {
                detail: { windowSize: this.windowSize }
            }));
        }
    }

    /**
     * Sync slider track after layout changes
     */
    syncTrackHeight() {
        // CSS flex: 1 handles the track height automatically
        // Just update thumb position after any layout change
        this.updateThumbPosition();
    }

    initEventListeners() {
        if (!this.track || !this.thumb) return;

        // Mouse drag on thumb
        this.thumb.addEventListener('mousedown', (e) => {
            e.preventDefault();
            this.startDrag(e);
        });

        // Click on track to jump
        this.track.addEventListener('click', (e) => {
            if (e.target === this.thumb) return;
            this.jumpToPosition(e);
        });

        // Global mouse events for drag
        document.addEventListener('mousemove', (e) => {
            if (this.isDragging) {
                this.onDrag(e);
            }
        });

        document.addEventListener('mouseup', () => {
            if (this.isDragging) {
                this.endDrag();
            }
        });

        // Touch support
        this.thumb.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.startDrag(e.touches[0]);
        }, { passive: false });

        document.addEventListener('touchmove', (e) => {
            if (this.isDragging) {
                this.onDrag(e.touches[0]);
            }
        }, { passive: true });

        document.addEventListener('touchend', () => {
            if (this.isDragging) {
                this.endDrag();
            }
        });

        // Keyboard navigation
        this.track.setAttribute('tabindex', '0');
        this.track.addEventListener('keydown', (e) => {
            const step = e.shiftKey ? this.windowSize : Math.ceil(this.windowSize / 4);

            if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
                this.goToOffset(Math.max(0, this.currentOffset - step));
                e.preventDefault();
            } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
                this.goToOffset(Math.min(this.totalFiles - this.windowSize, this.currentOffset + step));
                e.preventDefault();
            } else if (e.key === 'Home') {
                this.goToOffset(0);
                e.preventDefault();
            } else if (e.key === 'End') {
                this.goToOffset(Math.max(0, this.totalFiles - this.windowSize));
                e.preventDefault();
            }
        });

        // Mouse wheel on slider
        this.slider?.addEventListener('wheel', (e) => {
            e.preventDefault();
            const step = Math.ceil(this.windowSize / 4);
            const delta = e.deltaY > 0 ? step : -step;
            const newOffset = Math.max(0, Math.min(this.totalFiles - this.windowSize, this.currentOffset + delta));
            this.goToOffset(newOffset);
        }, { passive: false });
    }

    /**
     * Update slider with total file count
     * Window size is calculated dynamically, so the parameter is ignored
     */
    setTotal(total) {
        this.totalFiles = total;

        // Recalculate window size based on current grid dimensions
        this.recalculateWindowSize();

        // Show/hide slider
        if (this.slider) {
            this.slider.style.display = total > this.windowSize ? 'flex' : 'none';
        }

        // Update total label
        const totalLabel = this.slider?.querySelector('.slider-total');
        if (totalLabel) {
            totalLabel.textContent = `of ${total.toLocaleString()}`;
        }

        this.updateThumbPosition();
        this.updateLabel();
    }

    /**
     * Get the current calculated window size
     */
    getWindowSize() {
        return this.windowSize;
    }

    /**
     * Update current position
     */
    setOffset(offset) {
        this.currentOffset = offset;
        this.updateThumbPosition();
        this.updateLabel();
    }

    /**
     * Position thumb based on current offset
     */
    updateThumbPosition() {
        if (!this.track || !this.thumb || this.totalFiles <= this.windowSize) return;

        const trackHeight = this.track.clientHeight;
        const thumbHeight = this.thumb.clientHeight;
        const usableHeight = trackHeight - thumbHeight;

        const maxOffset = this.totalFiles - this.windowSize;
        const progress = maxOffset > 0 ? this.currentOffset / maxOffset : 0;
        const top = progress * usableHeight;

        this.thumb.style.top = `${top}px`;
    }

    /**
     * Update label (placeholder - top label removed for cleaner UI)
     */
    updateLabel() {
        // Position info now shown via tooltip during drag only
    }

    startDrag(e) {
        this.isDragging = true;
        this.track.classList.add('dragging');
        this.thumb.classList.add('dragging');
        this.showTooltip();
    }

    onDrag(e) {
        if (!this.isDragging || !this.track) return;

        const rect = this.track.getBoundingClientRect();
        const thumbHeight = this.thumb.clientHeight;
        const usableHeight = rect.height - thumbHeight;

        let y = e.clientY - rect.top - thumbHeight / 2;
        y = Math.max(0, Math.min(y, usableHeight));

        // Update thumb position visually
        this.thumb.style.top = `${y}px`;

        // Calculate offset
        const progress = usableHeight > 0 ? y / usableHeight : 0;
        const maxOffset = Math.max(0, this.totalFiles - this.windowSize);
        const offset = Math.round(progress * maxOffset);

        // Update tooltip
        this.updateTooltip(offset);

        // Live update with throttling
        const now = Date.now();
        if (offset !== this.lastDispatchedOffset &&
            now - this.lastDragDispatch >= this.dragThrottleMs) {
            this.lastDragDispatch = now;
            this.lastDispatchedOffset = offset;
            this.dispatchOffsetChange(offset);
        }
    }

    /**
     * Dispatch offset change event (used by both drag and final position)
     */
    dispatchOffsetChange(offset) {
        window.dispatchEvent(new CustomEvent('sliderOffsetChange', {
            detail: { offset, limit: this.windowSize }
        }));
    }

    endDrag() {
        if (!this.isDragging) return;

        this.isDragging = false;
        this.track.classList.remove('dragging');
        this.thumb.classList.remove('dragging');

        // Calculate final offset from thumb position
        const rect = this.track.getBoundingClientRect();
        const thumbTop = parseFloat(this.thumb.style.top) || 0;
        const thumbHeight = this.thumb.clientHeight;
        const usableHeight = rect.height - thumbHeight;

        const progress = usableHeight > 0 ? thumbTop / usableHeight : 0;
        const maxOffset = Math.max(0, this.totalFiles - this.windowSize);
        const offset = Math.round(progress * maxOffset);

        this.hideTooltip();

        // Final update (even if same as last throttled update, ensure consistency)
        this.currentOffset = offset;
        this.updateThumbPosition();
        this.updateLabel();

        // Only dispatch if different from last dispatched
        if (offset !== this.lastDispatchedOffset) {
            this.lastDispatchedOffset = offset;
            this.dispatchOffsetChange(offset);
        }
    }

    jumpToPosition(e) {
        const rect = this.track.getBoundingClientRect();
        const thumbHeight = this.thumb.clientHeight;
        const usableHeight = rect.height - thumbHeight;

        let y = e.clientY - rect.top - thumbHeight / 2;
        y = Math.max(0, Math.min(y, usableHeight));

        const progress = usableHeight > 0 ? y / usableHeight : 0;
        const maxOffset = Math.max(0, this.totalFiles - this.windowSize);
        const offset = Math.round(progress * maxOffset);

        this.goToOffset(offset);
    }

    goToOffset(offset) {
        const maxOffset = Math.max(0, this.totalFiles - this.windowSize);
        offset = Math.max(0, Math.min(offset, maxOffset));

        if (offset === this.currentOffset) return;

        this.currentOffset = offset;
        this.lastDispatchedOffset = offset;
        this.updateThumbPosition();
        this.updateLabel();

        // Notify results handler to load new window
        this.dispatchOffsetChange(offset);
    }

    showTooltip() {
        let tooltip = this.track.querySelector('.slider-tooltip');
        if (!tooltip) {
            tooltip = document.createElement('div');
            tooltip.className = 'slider-tooltip';
            this.track.appendChild(tooltip);
        }
        this.updateTooltip(this.currentOffset);
    }

    updateTooltip(offset) {
        const tooltip = this.track.querySelector('.slider-tooltip');
        if (!tooltip) return;

        const startFile = offset + 1;
        const endFile = Math.min(offset + this.windowSize, this.totalFiles);
        tooltip.textContent = `${startFile.toLocaleString()} - ${endFile.toLocaleString()}`;

        // Position tooltip next to thumb
        const thumbTop = parseFloat(this.thumb.style.top) || 0;
        tooltip.style.top = `${thumbTop}px`;
    }

    hideTooltip() {
        const tooltip = this.track.querySelector('.slider-tooltip');
        tooltip?.remove();
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.positionSlider = new PositionSliderHandler();
    });
} else {
    window.positionSlider = new PositionSliderHandler();
}
