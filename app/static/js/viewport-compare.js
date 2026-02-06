/**
 * viewport-compare.js — Compare-mode equal-box layout
 *
 * Extends ViewportController.prototype with methods that compute
 * equal-sized tile boxes in a row, maximizing box size within the
 * available viewport. Images use object-fit:contain inside their
 * equal boxes for fair visual comparison.
 *
 * Layout is always a horizontal row: [prev] [current] [next]
 * Every tile gets the same width and height. Consistent, predictable.
 */
(function() {
    'use strict';

    if (typeof ViewportController === 'undefined') return;
    const proto = ViewportController.prototype;

    const COMPARE_GAP = 4;      // px between tiles
    const MIN_TILE_DIM = 60;    // px minimum width or height

    // ==========================================
    // Viewport Bounds
    // ==========================================

    /**
     * Returns available {W, H} for compare layout, accounting for
     * details panel and edge padding.
     */
    proto._getCompareViewportBounds = function() {
        const container = this.tileManager.container;
        const hasDetails = container.classList.contains('with-details');
        const detailsWidth = hasDetails ? 380 : 0;
        const padding = 24; // edge padding each side
        const W = window.innerWidth - detailsWidth - padding * 2;
        const H = window.innerHeight - padding * 2;
        return { W: Math.max(W, 200), H: Math.max(H, 200), padding };
    };

    // ==========================================
    // Equal-Box Row Layout
    // ==========================================

    /**
     * Compute a row of N equal-sized tile boxes that maximizes box area.
     *
     * @param {number} W - available width
     * @param {number} H - available height
     * @param {number} n - number of tiles (1, 2, or 3)
     * @param {number} gap - pixel gap between tiles
     * @returns {{ tileW: number, tileH: number, tiles: Array<{left,top,width,height}> }}
     */
    function computeEqualRow(W, H, n, gap) {
        const totalGap = (n - 1) * gap;

        // Each tile gets 1/N of available width (minus gaps)
        const tileW = Math.max(MIN_TILE_DIM, (W - totalGap) / n);
        // Height fills the viewport
        const tileH = Math.max(MIN_TILE_DIM, H);

        const totalW = tileW * n + totalGap;
        const offsetX = (W - totalW) / 2;
        const offsetY = (H - tileH) / 2;

        const tiles = [];
        for (let i = 0; i < n; i++) {
            tiles.push({
                left: offsetX + i * (tileW + gap),
                top: offsetY,
                width: tileW,
                height: tileH,
            });
        }

        return { tileW, tileH, tiles };
    }

    // ==========================================
    // Main Entry: Update Compare Layout
    // ==========================================

    /**
     * Calculate and apply the equal-box compare layout for current viewport tiles.
     */
    proto.updateCompareLayout = function() {
        if (this.viewMode !== ViewportController.VIEW_MODES.COMPARE) return;

        const { W, H, padding } = this._getCompareViewportBounds();
        const currentId = this.getCurrentFileId();
        if (currentId === undefined) return;

        const prevId = this.navigationFiles[this.currentIndex - 1];
        const nextId = this.navigationFiles[this.currentIndex + 1];

        const hasPrev = prevId !== undefined;
        const hasNext = nextId !== undefined;

        // Build ordered tile list: [prev?, current, next?]
        const tileEntries = [];
        if (hasPrev) tileEntries.push(this.tileManager.getTile(prevId));
        tileEntries.push(this.tileManager.getTile(currentId));
        if (hasNext) tileEntries.push(this.tileManager.getTile(nextId));

        const n = tileEntries.length;
        const layout = computeEqualRow(W, H, n, COMPARE_GAP);

        this._applyCompareLayout(layout, tileEntries, padding);
    };

    // ==========================================
    // Apply / Clear Layout
    // ==========================================

    /**
     * Apply computed positions as inline styles on tile elements.
     * @param {Object} layout - { tiles: [{left,top,width,height}, ...] }
     * @param {Tile[]} tiles - tile objects in matching order
     * @param {number} padding - viewport edge padding
     */
    proto._applyCompareLayout = function(layout, tiles, padding) {
        tiles.forEach((tile, i) => {
            if (!tile || !tile.element) return;
            const pos = layout.tiles[i];
            if (!pos) return;

            const el = tile.element;
            el.style.position = 'fixed';
            el.style.left = `${padding + pos.left}px`;
            el.style.top = `${padding + pos.top}px`;
            el.style.width = `${pos.width}px`;
            el.style.height = `${pos.height}px`;
            el.style.transform = 'none';
            el.dataset.compareManaged = 'true';
        });
    };

    /**
     * Remove solver inline styles from all compare-managed tiles.
     */
    proto._clearCompareLayout = function() {
        if (this._compareResizeHandler) {
            window.removeEventListener('resize', this._compareResizeHandler);
            this._compareResizeHandler = null;
        }

        const managed = this.tileManager.container.querySelectorAll('[data-compare-managed]');
        managed.forEach(el => {
            el.style.position = '';
            el.style.left = '';
            el.style.top = '';
            el.style.width = '';
            el.style.height = '';
            el.style.transform = '';
            delete el.dataset.compareManaged;
        });
    };

    // ==========================================
    // Resize Handler
    // ==========================================

    /**
     * Set up debounced resize handler for compare mode.
     */
    proto._setupCompareResize = function() {
        if (this._compareResizeHandler) return;

        let resizeTimeout;
        this._compareResizeHandler = () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                if (this.viewMode === ViewportController.VIEW_MODES.COMPARE) {
                    this.updateCompareLayout();
                }
            }, 100);
        };
        window.addEventListener('resize', this._compareResizeHandler);
    };

})();
