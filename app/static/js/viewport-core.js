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
    // View modes
    static VIEW_MODES = {
        CAROUSEL: 'carousel',   // Large center, small prev/next
        COMPARE: 'compare',     // Equal size tiles
        FULLSCREEN: 'fullscreen' // Single large image
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
     * Exit viewport mode
     */
    exit() {
        if (!this.isActive || this.isTransitioning) return;

        // Set inactive and transitioning immediately to prevent re-entry during animation
        this.isActive = false;
        this.isTransitioning = true;

        const container = this.tileManager.container;

        // Clear compare layout before exit animation
        this._clearCompareLayout();

        // Add exit animation class
        container.classList.add('viewport-exiting');

        // Clean up after animation
        setTimeout(() => {
            document.body.classList.remove('viewport-active');
            container.classList.remove(
                'viewport-mode', 'viewport-exiting', 'with-details',
                'view-carousel', 'view-compare', 'view-fullscreen'
            );

            // Reset all tile positions to grid and unlock grid positions
            this._cleanupFlipStyles();
            if (this._flipCleanupTimeout) {
                clearTimeout(this._flipCleanupTimeout);
                this._flipCleanupTimeout = null;
            }
            this._clearViewportZIndices();
            this.tileManager.resetToGrid();
            this.unlockGridPositions();

            // Remove UI elements
            this.removeUI();

            // Remove event listeners
            document.removeEventListener('keydown', this.handleKeydown);
            container.removeEventListener('click', this.handleClick);
            container.removeEventListener('wheel', this.handleWheel);

            // Restore scroll position
            window.scrollTo(0, this.lastScrollPosition);

            // Scroll the grid to show the last viewed tile.
            // Use VirtualScrollManager.scrollToIndex if available (ensures tile is rendered),
            // otherwise fall back to scrollIntoView on the tile element.
            const lastFileId = this.getCurrentFileId();
            const vs = this.tileManager.virtualScroll;
            if (vs) {
                const fileIdx = this.tileManager.getFileIndex(lastFileId);
                if (fileIdx >= 0) {
                    vs.scrollToIndex(fileIdx);
                }
            } else {
                const lastTile = this.tileManager.getTile(lastFileId);
                if (lastTile?.element) {
                    lastTile.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }

            // Callback
            if (this.options.onExit) {
                this.options.onExit();
            }

            // Emit event
            window.dispatchEvent(new CustomEvent('viewportExit', {
                detail: { lastFileId: this.getCurrentFileId() }
            }));

            // Clear transition guard
            this.isTransitioning = false;
        }, 300);
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
