/**
 * Position Slider Handler (Scroll Sync)
 *
 * Custom scrollbar that syncs bidirectionally with the grid's native scroll.
 * Thumb height is proportional to viewport/content ratio.
 * Dragging the thumb scrolls the grid; scrolling the grid moves the thumb.
 */

class PositionSliderHandler {
    constructor() {
        this.slider = document.getElementById('position-slider');
        this.track = document.getElementById('slider-track');
        this.thumb = document.getElementById('slider-thumb');
        this.gridContainer = document.querySelector('.grid-with-slider');
        this.grid = document.getElementById('unified-grid');

        this.isDragging = false;
        this.totalFiles = 0;

        // Minimum thumb height in px
        this.minThumbHeight = 24;

        this.initEventListeners();
        this.initResizeObserver();
    }

    /**
     * Watch for grid resize and update thumb sizing
     */
    initResizeObserver() {
        if (!this.grid) return;

        this.resizeObserver = new ResizeObserver(() => {
            this.syncThumb();
        });
        this.resizeObserver.observe(this.grid);
    }

    initEventListeners() {
        if (!this.track || !this.thumb) return;

        // Sync thumb when grid scrolls (native wheel/touch/keyboard)
        this.grid?.addEventListener('scroll', () => {
            if (!this.isDragging) {
                this.syncThumbPosition();
            }
        }, { passive: true });

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

        // Mouse wheel on slider → forward to grid
        this.slider?.addEventListener('wheel', (e) => {
            e.preventDefault();
            if (this.grid) {
                this.grid.scrollTop += e.deltaY;
            }
        }, { passive: false });

        // Keyboard navigation
        this.track.setAttribute('tabindex', '0');
        this.track.addEventListener('keydown', (e) => {
            if (!this.grid) return;
            const step = e.shiftKey ? this.grid.clientHeight : this.grid.clientHeight * 0.25;

            if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
                this.grid.scrollTop -= step;
                e.preventDefault();
            } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
                this.grid.scrollTop += step;
                e.preventDefault();
            } else if (e.key === 'Home') {
                this.grid.scrollTop = 0;
                e.preventDefault();
            } else if (e.key === 'End') {
                this.grid.scrollTop = this.grid.scrollHeight;
                e.preventDefault();
            }
        });
    }

    /**
     * Called after grid content changes to show/hide slider and size thumb
     */
    syncThumb() {
        if (!this.grid || !this.slider) return;

        const contentOverflows = this.grid.scrollHeight > this.grid.clientHeight + 1;

        // Show slider, but disable if no overflow
        this.slider.style.display = 'flex';
        this.slider.classList.toggle('slider-disabled', !contentOverflows);

        if (contentOverflows) {
            this.sizeThumb();
            this.syncThumbPosition();
        }
    }

    /**
     * Size thumb proportional to viewport/content ratio
     */
    sizeThumb() {
        if (!this.grid || !this.track || !this.thumb) return;

        const viewportRatio = this.grid.clientHeight / this.grid.scrollHeight;
        const trackHeight = this.track.clientHeight;
        const thumbHeight = Math.max(this.minThumbHeight, Math.round(viewportRatio * trackHeight));

        this.thumb.style.height = `${thumbHeight}px`;
    }

    /**
     * Position thumb based on grid's current scrollTop
     */
    syncThumbPosition() {
        if (!this.grid || !this.track || !this.thumb) return;

        const maxScroll = this.grid.scrollHeight - this.grid.clientHeight;
        if (maxScroll <= 0) return;

        const progress = this.grid.scrollTop / maxScroll;
        const trackHeight = this.track.clientHeight;
        const thumbHeight = this.thumb.clientHeight;
        const usableHeight = trackHeight - thumbHeight;

        this.thumb.style.top = `${progress * usableHeight}px`;
    }

    /**
     * Set total file count (for label display)
     */
    setTotal(total) {
        this.totalFiles = total;

        const totalLabel = this.slider?.querySelector('.slider-total');
        if (totalLabel) {
            totalLabel.textContent = `${total.toLocaleString()} files`;
        }

        // Defer sync to after DOM has rendered the new tiles
        requestAnimationFrame(() => {
            this.syncThumb();
        });
    }

    startDrag(e) {
        this.isDragging = true;
        this.track.classList.add('dragging');
        this.thumb.classList.add('dragging');
    }

    onDrag(e) {
        if (!this.isDragging || !this.track || !this.grid) return;

        const rect = this.track.getBoundingClientRect();
        const thumbHeight = this.thumb.clientHeight;
        const usableHeight = rect.height - thumbHeight;

        let y = e.clientY - rect.top - thumbHeight / 2;
        y = Math.max(0, Math.min(y, usableHeight));

        // Update thumb position visually
        this.thumb.style.top = `${y}px`;

        // Scroll grid to match
        const progress = usableHeight > 0 ? y / usableHeight : 0;
        const maxScroll = this.grid.scrollHeight - this.grid.clientHeight;
        this.grid.scrollTop = Math.round(progress * maxScroll);
    }

    endDrag() {
        if (!this.isDragging) return;

        this.isDragging = false;
        this.track.classList.remove('dragging');
        this.thumb.classList.remove('dragging');
    }

    jumpToPosition(e) {
        if (!this.grid) return;

        const rect = this.track.getBoundingClientRect();
        const thumbHeight = this.thumb.clientHeight;
        const usableHeight = rect.height - thumbHeight;

        let y = e.clientY - rect.top - thumbHeight / 2;
        y = Math.max(0, Math.min(y, usableHeight));

        const progress = usableHeight > 0 ? y / usableHeight : 0;
        const maxScroll = this.grid.scrollHeight - this.grid.clientHeight;
        this.grid.scrollTop = Math.round(progress * maxScroll);
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
