/**
 * ViewportController - Core module
 *
 * Defines the ViewportController class, constructor, state management,
 * and mode transitions (enter/exit).
 *
 * Other viewport-*.js files extend this class via prototype.
 * Load order: viewport-core.js → viewport-animation.js → viewport-navigation.js → viewport-ui.js
 */

class ViewportController {
    // View modes — ordered by center image size (small → medium → large)
    // Carousel is the default mode on enter
    static VIEW_MODES = {
        COMPARE: 'compare',      // Equal size tiles (smallest center)
        CAROUSEL: 'carousel',    // Large center, small prev/next (default)
        FULLSCREEN: 'fullscreen' // Single large image (largest)
    };

    /**
     * Create a ViewportController
     * @param {TileManager} tileManager - The tile manager instance
     * @param {Object} options
     * @param {HTMLElement} [options.detailsPanel] - Details panel element
     * @param {Function} [options.onEnter] - Callback when entering viewport
     * @param {Function} [options.onExit] - Callback when exiting viewport
     * @param {Function} [options.onNavigate] - Callback when navigating
     * @param {Function} [options.onFileChange] - Callback when current file changes
     */
    constructor(tileManager, options = {}) {
        this.tileManager = tileManager;
        this.options = {
            detailsPanel: null,
            onEnter: null,
            onExit: null,
            onNavigate: null,
            onFileChange: null,
            ...options
        };

        // State
        this.isActive = false;
        this.isTransitioning = false;  // Guard against clicks during enter/exit animation
        this.navigationFiles = [];    // File IDs available for navigation
        this.currentIndex = 0;
        this.lastScrollPosition = 0;
        this.viewMode = ViewportController.VIEW_MODES.CAROUSEL;

        // UI Elements (created on demand)
        this.closeButton = null;
        this.counter = null;
        this.hints = null;
        this.modeToggle = null;

        // Bind methods for event listeners
        this.handleKeydown = this.handleKeydown.bind(this);
        this.handleClick = this.handleClick.bind(this);
        this.handleWheel = this.handleWheel.bind(this);
    }

    // ==========================================
    // Mode Transitions
    // ==========================================

    /**
     * Enter viewport mode
     * @param {number} fileId - The file to show initially
     * @param {number[]} [navigableFileIds] - File IDs available for navigation (defaults to all)
     */
    enter(fileId, navigableFileIds = null) {
        if (this.isActive || this.isTransitioning) return;

        this.isTransitioning = true;

        // Get navigation set
        this.navigationFiles = navigableFileIds || this.tileManager.getFileOrder();
        this.currentIndex = this.navigationFiles.indexOf(fileId);

        if (this.currentIndex === -1) {
            console.warn('ViewportController: File not in navigation set:', fileId);
            // Try to find the file anyway
            if (this.tileManager.getTile(fileId)) {
                this.navigationFiles = [fileId];
                this.currentIndex = 0;
            } else {
                this.isTransitioning = false;
                return;
            }
        }

        // Save scroll position for restoration
        this.lastScrollPosition = window.scrollY;

        // Lock every tile's grid position so the grid doesn't reflow
        // when viewport tiles leave flow via position:fixed
        this.lockGridPositions();

        // Pause virtual scroll so ResizeObserver doesn't override locked grid
        if (this.tileManager.virtualScroll) {
            this.tileManager.virtualScroll.pause();
        }

        // Capture viewport tiles' grid positions BEFORE mode switch
        const currentTile = this.tileManager.getTile(fileId);
        const prevTile = this.tileManager.getTile(this.navigationFiles[this.currentIndex - 1]);
        const nextTile = this.tileManager.getTile(this.navigationFiles[this.currentIndex + 1]);
        const viewportTiles = [currentTile, prevTile, nextTile].filter(Boolean);
        const startPositions = this.captureStartPositions(viewportTiles);

        // Freeze viewport tiles at their grid positions
        this.applyStartPositions(startPositions);

        // Activate viewport mode — grid stays intact behind the backdrop
        this.isActive = true;
        document.body.classList.add('viewport-active');
        const container = this.tileManager.container;
        container.classList.add('viewport-mode');

        // Create UI elements
        this.createUI();

        // Set tile positions directly — enter() has its own FLIP animation,
        // so skip updateTilePositions() which would add conflicting FLIP logic
        this.tileManager.setupViewport(this.getCurrentFileId(), this.navigationFiles);
        this.updateUI();

        // Force reflow, then release the current tile to animate from grid to center
        void container.offsetHeight;
        requestAnimationFrame(() => {
            this.clearStartPositions(startPositions);
        });

        // Read transition duration from CSS variable
        const durationStr = getComputedStyle(container).getPropertyValue('--vp-transition-duration').trim();
        const durationMs = parseFloat(durationStr) * (durationStr.includes('ms') ? 1 : 1000) || 350;

        // Clear transition guard after animation completes
        setTimeout(() => {
            this.isTransitioning = false;
        }, durationMs);

        // Ensure visible tiles use full resolution
        this.upgradeVisibleTilesToFullRes();

        // Add event listeners
        document.addEventListener('keydown', this.handleKeydown);
        container.addEventListener('click', this.handleClick);
        container.addEventListener('wheel', this.handleWheel, { passive: false });

        // Automatically show details panel
        this.showDetailsPanel();

        // Callback
        if (this.options.onEnter) {
            this.options.onEnter(this.getCurrentFile());
        }

        // Emit event
        window.dispatchEvent(new CustomEvent('viewportEnter', {
            detail: {
                fileId: this.getCurrentFileId(),
                file: this.getCurrentFile(),
                index: this.currentIndex,
                total: this.navigationFiles.length
            }
        }));
    }

    /**
     * Exit viewport mode with reverse FLIP animation.
     * Uses position:fixed freeze + animate (same pattern as navigation FLIP
     * for leaving tiles in updateTilePositions). Tiles animate from their
     * viewport positions back to their grid cells via left/top/width/height.
     */
    exit() {
        if (!this.isActive || this.isTransitioning) return;

        this.isActive = false;
        this.isTransitioning = true;

        const container = this.tileManager.container;

        // Clear compare inline styles and pending nav FLIP before capturing
        this._clearCompareLayout();
        this._cleanupFlipStyles();
        if (this._flipCleanupTimeout) {
            clearTimeout(this._flipCleanupTimeout);
            this._flipCleanupTimeout = null;
        }
        this._clearViewportZIndices();

        // --- FLIP: First ---
        // Capture viewport tiles' current screen positions (position:fixed from CSS)
        const flipEntries = [];
        this.tileManager.tiles.forEach(tile => {
            if (tile.position !== Tile.POSITIONS.GRID &&
                tile.position !== Tile.POSITIONS.HIDDEN &&
                tile.element) {
                flipEntries.push({
                    tile,
                    firstRect: tile.element.getBoundingClientRect()
                });
            }
        });

        // Suppress CSS transitions BEFORE changing data-vp-pos
        // (prevents browser from starting CSS animations on the attribute change)
        flipEntries.forEach(({ tile }) => {
            tile.element.style.transition = 'none';
        });

        // Start backdrop fade
        container.classList.add('viewport-exiting');

        // Switch tiles to grid position (removes position:fixed via CSS).
        // Don't use setPosition() — it triggers resolution downgrade.
        // Don't use resetToGrid() — it clears VS exemptions.
        this.tileManager.tiles.forEach(tile => {
            if (tile.position !== Tile.POSITIONS.GRID) {
                tile.position = Tile.POSITIONS.GRID;
                if (tile.element) {
                    tile.element.dataset.vpPos = 'grid';
                    tile.element.classList.remove('vp-prev', 'vp-current', 'vp-next', 'vp-hidden');
                    tile.element.classList.add('vp-grid');
                    tile.unobserveSize();
                }
            }
        });

        // --- FLIP: Last ---
        // Force layout — tiles are now in grid flow
        void container.offsetHeight;

        flipEntries.forEach(entry => {
            if (entry.tile.element) {
                entry.lastRect = entry.tile.element.getBoundingClientRect();
            }
        });

        // --- Freeze at First positions ---
        // Pin tiles at their viewport positions using inline position:fixed.
        // This prevents any visual snap to grid — tiles stay exactly where they were.
        flipEntries.forEach(({ tile, firstRect }) => {
            const el = tile.element;
            el.style.position = 'fixed';
            el.style.left = `${firstRect.left}px`;
            el.style.top = `${firstRect.top}px`;
            el.style.width = `${firstRect.width}px`;
            el.style.height = `${firstRect.height}px`;
            el.style.transform = 'none';
            el.style.zIndex = '1001';
            // transition: none already set above
        });

        // Force reflow to lock frozen state
        void container.offsetHeight;

        // Read transition timing from CSS
        const cs = getComputedStyle(container);
        const durationStr = cs.getPropertyValue('--vp-transition-duration').trim() || '0.35s';
        const durationMs = parseFloat(durationStr) * (durationStr.includes('ms') ? 1 : 1000) || 350;
        const easingStr = cs.getPropertyValue('--vp-transition-easing').trim() ||
            'cubic-bezier(0.4, 0, 0.2, 1)';

        // --- FLIP: Animate to grid positions ---
        // Animate left/top/width/height from viewport positions to grid positions
        requestAnimationFrame(() => {
            flipEntries.forEach(({ tile, lastRect }) => {
                if (tile.element && lastRect) {
                    tile.element.style.transition = [
                        `left ${durationStr} ${easingStr}`,
                        `top ${durationStr} ${easingStr}`,
                        `width ${durationStr} ${easingStr}`,
                        `height ${durationStr} ${easingStr}`,
                    ].join(', ');
                    tile.element.style.left = `${lastRect.left}px`;
                    tile.element.style.top = `${lastRect.top}px`;
                    tile.element.style.width = `${lastRect.width}px`;
                    tile.element.style.height = `${lastRect.height}px`;
                }
            });
        });

        // Phase 2: Full teardown after animation completes
        setTimeout(() => {
            // Clean up inline styles — tiles return to grid flow
            flipEntries.forEach(({ tile }) => {
                if (tile.element) {
                    tile.element.style.position = '';
                    tile.element.style.left = '';
                    tile.element.style.top = '';
                    tile.element.style.width = '';
                    tile.element.style.height = '';
                    tile.element.style.transform = '';
                    tile.element.style.transition = '';
                    tile.element.style.zIndex = '';
                }
            });

            // Remove viewport mode
            document.body.classList.remove('viewport-active');
            container.classList.remove(
                'viewport-mode', 'viewport-exiting', 'with-details',
                'view-carousel', 'view-compare', 'view-fullscreen'
            );

            // Clear exemptions and unlock grid
            if (this.tileManager.virtualScroll) {
                this.tileManager.virtualScroll.clearExemptions();
                this.tileManager.virtualScroll.resume();
            }
            this.unlockGridPositions();

            // Remove UI elements
            this.removeUI();

            // Remove event listeners
            document.removeEventListener('keydown', this.handleKeydown);
            container.removeEventListener('click', this.handleClick);
            container.removeEventListener('wheel', this.handleWheel);

            // Restore scroll position
            window.scrollTo(0, this.lastScrollPosition);

            // Callback
            if (this.options.onExit) {
                this.options.onExit();
            }

            // Emit event — results.js handles scroll-to-file after grid rebuild
            window.dispatchEvent(new CustomEvent('viewportExit', {
                detail: { lastFileId: this.getCurrentFileId() }
            }));

            this.isTransitioning = false;
        }, durationMs + 50);
    }

    /**
     * Toggle viewport mode
     * @param {number} fileId - File to show if entering
     * @param {number[]} [navigableFileIds] - Navigation set
     */
    toggle(fileId, navigableFileIds = null) {
        if (this.isActive) {
            this.exit();
        } else {
            this.enter(fileId, navigableFileIds);
        }
    }

    // ==========================================
    // State Queries
    // ==========================================

    /**
     * Get the current file ID
     * @returns {number|undefined}
     */
    getCurrentFileId() {
        return this.navigationFiles[this.currentIndex];
    }

    /**
     * Get the current file data
     * @returns {Object|undefined}
     */
    getCurrentFile() {
        const fileId = this.getCurrentFileId();
        return this.tileManager.getFile(fileId);
    }

    /**
     * Get the current tile
     * @returns {Tile|undefined}
     */
    getCurrentTile() {
        const fileId = this.getCurrentFileId();
        return this.tileManager.getTile(fileId);
    }

    /**
     * Get navigation state
     * @returns {Object}
     */
    getState() {
        return {
            isActive: this.isActive,
            currentIndex: this.currentIndex,
            currentFileId: this.getCurrentFileId(),
            total: this.navigationFiles.length,
            hasNext: this.hasNext(),
            hasPrev: this.hasPrev()
        };
    }

    /**
     * Get current view mode
     * @returns {string}
     */
    getViewMode() {
        return this.viewMode;
    }

    // ==========================================
    // Cleanup
    // ==========================================

    /**
     * Destroy the controller
     */
    destroy() {
        if (this.isActive) {
            // Force immediate cleanup without animation
            this.isActive = false;
            document.body.classList.remove('viewport-active');
            this.tileManager.container.classList.remove(
                'viewport-mode', 'viewport-entering', 'viewport-exiting', 'with-details',
                'view-carousel', 'view-compare', 'view-fullscreen'
            );
            this._cleanupFlipStyles();
            if (this._flipCleanupTimeout) {
                clearTimeout(this._flipCleanupTimeout);
                this._flipCleanupTimeout = null;
            }
            this._clearViewportZIndices();
            this.tileManager.resetToGrid();
            this.unlockGridPositions();
            if (this.tileManager.virtualScroll) {
                this.tileManager.virtualScroll.resume();
            }
            this.removeUI();
            document.removeEventListener('keydown', this.handleKeydown);
            this.tileManager.container.removeEventListener('click', this.handleClick);
            this.tileManager.container.removeEventListener('wheel', this.handleWheel);
        }

        this.tileManager = null;
        this.navigationFiles = [];
        this.viewMode = ViewportController.VIEW_MODES.CAROUSEL;
    }
}

// Export for use in other modules
window.ViewportController = ViewportController;
