/**
 * ViewportController - Animation module
 *
 * FLIP animation logic for smooth tile transitions.
 * Extends ViewportController.prototype.
 *
 * Load order: viewport-core.js → viewport-animation.js → viewport-navigation.js → viewport-ui.js
 */

(function() {
    const proto = ViewportController.prototype;

    // ==========================================
    // Position Management
    // ==========================================

    /**
     * Update tile positions for current navigation state.
     * Uses FLIP animation for tiles entering/leaving the viewport so they
     * smoothly animate to/from their grid positions instead of snapping.
     * Sets inline z-indices so that:
     *   - The upcoming current tile is always on top (z:10)
     *   - Tiles leaving the viewport stay above grid tiles during transition (z:3)
     *   - Tiles entering from the grid stay behind existing viewport tiles (z:2)
     *   - Other viewport tiles use CSS defaults (prev/next: z:5)
     */
    proto.updateTilePositions = function() {
        const currentId = this.navigationFiles[this.currentIndex];
        const prevId = this.navigationFiles[this.currentIndex - 1];
        const nextId = this.navigationFiles[this.currentIndex + 1];
        const newViewportIds = new Set([prevId, currentId, nextId].filter(id => id !== undefined));

        // Clean up any pending FLIP animations from rapid navigation
        this._cleanupFlipStyles();
        if (this._flipCleanupTimeout) {
            clearTimeout(this._flipCleanupTimeout);
            this._flipCleanupTimeout = null;
        }

        // --- Identify tiles entering and leaving the viewport ---
        const enteringTiles = [];
        [prevId, currentId, nextId].forEach(id => {
            if (id !== undefined) {
                const tile = this.tileManager.getTile(id);
                if (tile && tile.position === Tile.POSITIONS.GRID && tile.element) {
                    enteringTiles.push(tile);
                }
            }
        });

        const leavingTiles = [];
        this.tileManager.getAllTiles().forEach(tile => {
            if (tile.position !== Tile.POSITIONS.GRID &&
                !newViewportIds.has(tile.file?.id) &&
                tile.element) {
                leavingTiles.push(tile);
            }
        });

        // --- Capture positions BEFORE any changes ---
        const enteringStartRects = new Map();
        enteringTiles.forEach(tile => {
            enteringStartRects.set(tile, tile.element.getBoundingClientRect());
        });

        const leavingStartRects = new Map();
        leavingTiles.forEach(tile => {
            leavingStartRects.set(tile, tile.element.getBoundingClientRect());
        });

        // --- Z-index management ---
        this._clearViewportZIndices();
        this._viewportZTiles = [];

        // Elevate tiles LEAVING the viewport above the backdrop (z:3)
        leavingTiles.forEach(tile => {
            tile.element.style.zIndex = '3';
            this._viewportZTiles.push(tile);
        });

        // Promote upcoming current tile (z:10)
        const currentTile = this.tileManager.getTile(currentId);
        if (currentTile?.element) {
            currentTile.element.style.zIndex = '10';
            this._viewportZTiles.push(currentTile);
        }

        // Demote tiles entering from grid (z:2, behind existing viewport tiles)
        [prevId, nextId].forEach(id => {
            if (id !== undefined) {
                const tile = this.tileManager.getTile(id);
                if (tile && tile.position === Tile.POSITIONS.GRID && tile.element) {
                    tile.element.style.zIndex = '2';
                    this._viewportZTiles.push(tile);
                }
            }
        });

        // --- Suppress CSS transitions on entering/leaving tiles BEFORE position changes ---
        // This prevents the browser from starting CSS animations when data-vp-pos
        // changes, which would fight our FLIP freeze.
        enteringTiles.forEach(tile => {
            tile.element.style.transition = 'none';
        });
        leavingTiles.forEach(tile => {
            tile.element.style.transition = 'none';
        });

        // --- Apply position changes ---
        this.tileManager.setupViewport(currentId, this.navigationFiles);

        // --- Read leaving tiles' grid target rects ---
        // After setupViewport, leaving tiles are back in grid flow.
        // getBoundingClientRect forces layout computation but no paint yet.
        const leavingTargetRects = new Map();
        leavingTiles.forEach(tile => {
            leavingTargetRects.set(tile, tile.element.getBoundingClientRect());
        });

        // --- FLIP: Freeze tiles at their pre-change positions ---

        // Entering tiles: freeze at grid position, start invisible
        enteringTiles.forEach(tile => {
            const rect = enteringStartRects.get(tile);
            if (rect) {
                tile.element.style.position = 'fixed';
                tile.element.style.left = `${rect.left}px`;
                tile.element.style.top = `${rect.top}px`;
                tile.element.style.width = `${rect.width}px`;
                tile.element.style.height = `${rect.height}px`;
                tile.element.style.transform = 'none';
                // transition: none already set above
                tile.element.style.opacity = '0';
            }
        });

        // Leaving tiles: freeze at their viewport position
        leavingTiles.forEach(tile => {
            const rect = leavingStartRects.get(tile);
            if (rect) {
                tile.element.style.position = 'fixed';
                tile.element.style.left = `${rect.left}px`;
                tile.element.style.top = `${rect.top}px`;
                tile.element.style.width = `${rect.width}px`;
                tile.element.style.height = `${rect.height}px`;
                tile.element.style.transform = 'none';
                // transition: none already set above
            }
        });

        // Force reflow to establish frozen state
        void this.tileManager.container.offsetHeight;

        // Read CSS transition timing
        const cs = getComputedStyle(this.tileManager.container);
        const durationStr = cs.getPropertyValue('--vp-transition-duration').trim() || '0.35s';
        const easingStr = cs.getPropertyValue('--vp-transition-easing').trim() || 'cubic-bezier(0.4, 0, 0.2, 1)';
        const durationMs = parseFloat(durationStr) * (durationStr.includes('ms') ? 1 : 1000) || 350;

        // --- FLIP: Release and animate ---
        requestAnimationFrame(() => {
            // Entering tiles: clear inline overrides → CSS transitions to viewport position
            enteringTiles.forEach(tile => {
                if (tile.element) {
                    tile.element.style.position = '';
                    tile.element.style.left = '';
                    tile.element.style.top = '';
                    tile.element.style.width = '';
                    tile.element.style.height = '';
                    tile.element.style.transform = '';
                    tile.element.style.transition = '';
                    tile.element.style.opacity = '';
                }
            });

            // Leaving tiles: animate from viewport position to grid position
            leavingTiles.forEach(tile => {
                const targetRect = leavingTargetRects.get(tile);
                if (targetRect && tile.element) {
                    tile.element.style.transition = [
                        `left ${durationStr} ${easingStr}`,
                        `top ${durationStr} ${easingStr}`,
                        `width ${durationStr} ${easingStr}`,
                        `height ${durationStr} ${easingStr}`,
                        `opacity ${durationStr} ease`,
                    ].join(', ');
                    tile.element.style.left = `${targetRect.left}px`;
                    tile.element.style.top = `${targetRect.top}px`;
                    tile.element.style.width = `${targetRect.width}px`;
                    tile.element.style.height = `${targetRect.height}px`;
                    tile.element.style.opacity = '0';
                }
            });
        });

        // Track leaving tiles for cleanup
        this._flipTiles = [...leavingTiles];

        // Clean up after transition completes
        this._flipCleanupTimeout = setTimeout(() => {
            this._cleanupFlipStyles();
            this._flipCleanupTimeout = null;
        }, durationMs + 50);

        // Upgrade newly visible tiles to full resolution
        this.upgradeVisibleTilesToFullRes();
    };

    /**
     * Clear inline z-indices set during navigation transitions
     */
    proto._clearViewportZIndices = function() {
        if (this._viewportZTiles) {
            this._viewportZTiles.forEach(tile => {
                if (tile?.element) {
                    tile.element.style.zIndex = '';
                }
            });
            this._viewportZTiles = null;
        }
    };

    /**
     * Clean up inline styles from FLIP navigation animations.
     * Called at the start of each navigation to handle rapid input,
     * and after transitions complete for normal cleanup.
     */
    proto._cleanupFlipStyles = function() {
        if (this._flipTiles) {
            this._flipTiles.forEach(tile => {
                if (tile?.element) {
                    tile.element.style.position = '';
                    tile.element.style.left = '';
                    tile.element.style.top = '';
                    tile.element.style.width = '';
                    tile.element.style.height = '';
                    tile.element.style.transform = '';
                    tile.element.style.transition = '';
                    tile.element.style.opacity = '';
                }
            });
            this._flipTiles = null;
        }
    };

    // ==========================================
    // FLIP Animation Helpers
    // ==========================================

    /**
     * Capture starting positions of tiles before viewport mode
     * @param {Tile[]} tiles - Array of tiles to capture
     * @returns {Map} Map of tile -> {rect, element}
     */
    proto.captureStartPositions = function(tiles) {
        const positions = new Map();

        tiles.forEach(tile => {
            if (tile?.element) {
                const rect = tile.element.getBoundingClientRect();
                positions.set(tile, {
                    rect,
                    element: tile.element
                });
            }
        });

        return positions;
    };

    /**
     * Apply captured positions as inline styles
     * @param {Map} positions - Map from captureStartPositions
     */
    proto.applyStartPositions = function(positions) {
        positions.forEach(({ rect, element }) => {
            // Set fixed position matching current screen location
            element.style.position = 'fixed';
            element.style.left = `${rect.left}px`;
            element.style.top = `${rect.top}px`;
            element.style.width = `${rect.width}px`;
            element.style.height = `${rect.height}px`;
            element.style.transform = 'none';
            element.style.transition = 'none';
        });
    };

    /**
     * Clear inline positions to allow CSS transitions to take over
     * @param {Map} positions - Map from captureStartPositions
     */
    proto.clearStartPositions = function(positions) {
        positions.forEach(({ element }) => {
            element.style.position = '';
            element.style.left = '';
            element.style.top = '';
            element.style.width = '';
            element.style.height = '';
            element.style.transform = '';
            element.style.transition = '';
        });
    };

    // ==========================================
    // Grid Position Locking
    // ==========================================

    /**
     * Lock the grid layout so tiles don't shift when viewport tiles
     * leave flow. Freezes the grid template to resolved pixel values
     * and ensures every tile has explicit row/column placement.
     *
     * With virtual scroll, tiles already have grid-row/grid-column set.
     * Without virtual scroll, we assign them here.
     */
    proto.lockGridPositions = function() {
        const container = this.tileManager.container;
        const cs = getComputedStyle(container);

        // Lock grid tracks at their current pixel sizes
        container.style.gridTemplateRows = cs.gridTemplateRows;
        container.style.gridTemplateColumns = cs.gridTemplateColumns;

        // With virtual scroll, tiles already have grid-row/column from renderRange.
        // Without virtual scroll, assign explicit positions now.
        if (!this.tileManager.virtualScroll) {
            const cols = cs.gridTemplateColumns.split(/\s+/).length;
            const fileOrder = this.tileManager.getFileOrder();
            fileOrder.forEach((fileId, index) => {
                const tile = this.tileManager.getTile(fileId);
                if (tile?.element) {
                    tile.element.style.gridRow = String(Math.floor(index / cols) + 1);
                    tile.element.style.gridColumn = String((index % cols) + 1);
                }
            });
        }
    };

    /**
     * Unlock grid positions, returning to auto-placement (or virtual scroll placement).
     */
    proto.unlockGridPositions = function() {
        const container = this.tileManager.container;
        const vs = this.tileManager.virtualScroll;

        if (vs && vs.files.length > 0) {
            // Restore virtual scroll's grid template
            container.style.gridTemplateRows = `repeat(${vs.totalRows}, var(--tile-size))`;
            container.style.gridTemplateColumns = `repeat(${vs.columns}, var(--tile-size))`;
        } else {
            // Clear explicit templates
            container.style.gridTemplateRows = '';
            container.style.gridTemplateColumns = '';
        }

        // If not using virtual scroll, clear tile grid positions
        if (!vs) {
            this.tileManager.getAllTiles().forEach(tile => {
                if (tile.element) {
                    tile.element.style.gridRow = '';
                    tile.element.style.gridColumn = '';
                }
            });
        }
    };
})();
