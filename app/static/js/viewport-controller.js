/**
 * ViewportController - Orchestrates viewport mode for image examination
 *
 * Manages the transition between grid and viewport (carousel) modes,
 * handles navigation between files, and coordinates with the details panel.
 *
 * Usage:
 *   const viewport = new ViewportController(tileManager);
 *   viewport.enter(fileId, navigableFileIds);
 *   viewport.next();
 *   viewport.previous();
 *   viewport.exit();
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

            // Scroll the last viewed tile into view
            const lastTile = this.tileManager.getTile(this.getCurrentFileId());
            if (lastTile?.element) {
                lastTile.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
    // Navigation
    // ==========================================

    /**
     * Navigate to the next file
     * @returns {boolean} Whether navigation occurred
     */
    next() {
        if (!this.isActive) return false;
        if (this.currentIndex >= this.navigationFiles.length - 1) return false;

        this.currentIndex++;
        this.updateTilePositions();
        this.updateUI();
        this.notifyNavigation('next');

        return true;
    }

    /**
     * Navigate to the previous file
     * @returns {boolean} Whether navigation occurred
     */
    previous() {
        if (!this.isActive) return false;
        if (this.currentIndex <= 0) return false;

        this.currentIndex--;
        this.updateTilePositions();
        this.updateUI();
        this.notifyNavigation('previous');

        return true;
    }

    /**
     * Navigate to a specific file
     * @param {number} fileId
     * @returns {boolean} Whether navigation occurred
     */
    goToFile(fileId) {
        if (!this.isActive) return false;

        const index = this.navigationFiles.indexOf(fileId);
        if (index === -1) return false;

        this.currentIndex = index;
        this.updateTilePositions();
        this.updateUI();
        this.notifyNavigation('goto');

        return true;
    }

    /**
     * Navigate to a specific index
     * @param {number} index
     * @returns {boolean} Whether navigation occurred
     */
    goToIndex(index) {
        if (!this.isActive) return false;
        if (index < 0 || index >= this.navigationFiles.length) return false;

        this.currentIndex = index;
        this.updateTilePositions();
        this.updateUI();
        this.notifyNavigation('goto');

        return true;
    }

    /**
     * Navigate to the first file
     */
    goToFirst() {
        return this.goToIndex(0);
    }

    /**
     * Navigate to the last file
     */
    goToLast() {
        return this.goToIndex(this.navigationFiles.length - 1);
    }

    /**
     * Notify listeners of navigation
     * @param {string} direction
     */
    notifyNavigation(direction) {
        const file = this.getCurrentFile();

        // In compare mode, ensure all visible tiles have full resolution
        if (this.viewMode === ViewportController.VIEW_MODES.COMPARE) {
            this.upgradeVisibleTilesToFullRes();
        }

        if (this.options.onNavigate) {
            this.options.onNavigate(direction, file, this.currentIndex);
        }

        if (this.options.onFileChange) {
            this.options.onFileChange(file);
        }

        // Emit event
        window.dispatchEvent(new CustomEvent('viewportNavigate', {
            detail: {
                direction,
                fileId: this.getCurrentFileId(),
                file,
                index: this.currentIndex,
                total: this.navigationFiles.length,
                hasNext: this.hasNext(),
                hasPrev: this.hasPrev()
            }
        }));
    }

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
    updateTilePositions() {
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
    }

    /**
     * Clear inline z-indices set during navigation transitions
     */
    _clearViewportZIndices() {
        if (this._viewportZTiles) {
            this._viewportZTiles.forEach(tile => {
                if (tile?.element) {
                    tile.element.style.zIndex = '';
                }
            });
            this._viewportZTiles = null;
        }
    }

    /**
     * Clean up inline styles from FLIP navigation animations.
     * Called at the start of each navigation to handle rapid input,
     * and after transitions complete for normal cleanup.
     */
    _cleanupFlipStyles() {
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
    }

    // ==========================================
    // UI Elements
    // ==========================================

    /**
     * Create viewport UI elements
     */
    createUI() {
        const container = this.tileManager.container;

        // Close button
        this.closeButton = document.createElement('button');
        this.closeButton.className = 'viewport-close';
        this.closeButton.innerHTML = '&times;';
        this.closeButton.title = 'Close (Escape)';
        this.closeButton.addEventListener('click', () => this.exit());
        container.appendChild(this.closeButton);

        // View mode toggle
        this.modeToggle = document.createElement('div');
        this.modeToggle.className = 'viewport-mode-toggle';
        this.modeToggle.innerHTML = `
            <button class="viewport-mode-btn active" data-mode="carousel" title="Carousel view (V)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="7" y="5" width="10" height="14" rx="1"/>
                    <rect x="2" y="7" width="4" height="10" rx="1" opacity="0.5"/>
                    <rect x="18" y="7" width="4" height="10" rx="1" opacity="0.5"/>
                </svg>
            </button>
            <button class="viewport-mode-btn" data-mode="compare" title="Compare view (V)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="2" y="6" width="6" height="12" rx="1"/>
                    <rect x="9" y="6" width="6" height="12" rx="1"/>
                    <rect x="16" y="6" width="6" height="12" rx="1"/>
                </svg>
            </button>
            <button class="viewport-mode-btn" data-mode="fullscreen" title="Fullscreen view (V)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                    <path d="M3 3l18 18M21 3l-18 18" opacity="0.3"/>
                </svg>
            </button>
        `;
        this.modeToggle.addEventListener('click', (e) => {
            const btn = e.target.closest('.viewport-mode-btn');
            if (btn) {
                this.setViewMode(btn.dataset.mode);
            }
        });
        container.appendChild(this.modeToggle);

        // Counter
        this.counter = document.createElement('div');
        this.counter.className = 'viewport-counter';
        container.appendChild(this.counter);

        // Keyboard hints
        this.hints = document.createElement('div');
        this.hints.className = 'viewport-hints';
        this.hints.innerHTML = `
            <span class="viewport-hint"><kbd>&larr;</kbd> Prev</span>
            <span class="viewport-hint"><kbd>&rarr;</kbd> Next</span>
            <span class="viewport-hint"><kbd>V</kbd> View</span>
            <span class="viewport-hint"><kbd>Esc</kbd> Close</span>
        `;
        container.appendChild(this.hints);
    }

    /**
     * Set the view mode
     * @param {string} mode - One of ViewportController.VIEW_MODES
     */
    setViewMode(mode) {
        if (!Object.values(ViewportController.VIEW_MODES).includes(mode)) {
            console.warn('Invalid view mode:', mode);
            return;
        }

        const container = this.tileManager.container;

        // Remove existing mode classes
        container.classList.remove('view-carousel', 'view-compare', 'view-fullscreen');

        // Add new mode class (carousel is default, no class needed)
        if (mode !== ViewportController.VIEW_MODES.CAROUSEL) {
            container.classList.add(`view-${mode}`);
        }

        this.viewMode = mode;

        // In compare mode, all visible tiles need full resolution
        if (mode === ViewportController.VIEW_MODES.COMPARE) {
            this.upgradeVisibleTilesToFullRes();
        }

        // Update toggle button states
        if (this.modeToggle) {
            this.modeToggle.querySelectorAll('.viewport-mode-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.mode === mode);
            });
        }

        // Emit event
        window.dispatchEvent(new CustomEvent('viewportModeChange', {
            detail: { mode, file: this.getCurrentFile() }
        }));
    }

    /**
     * Upgrade all visible tiles (prev, current, next) to full resolution
     * @param {boolean} [delayed=false] - If true, also schedule a delayed re-check
     */
    upgradeVisibleTilesToFullRes(delayed = true) {
        const currentId = this.navigationFiles[this.currentIndex];
        const prevId = this.navigationFiles[this.currentIndex - 1];
        const nextId = this.navigationFiles[this.currentIndex + 1];

        console.log('[ViewportController] upgradeVisibleTilesToFullRes:', {
            prevId, currentId, nextId, viewMode: this.viewMode
        });

        const upgradeTiles = () => {
            [prevId, currentId, nextId].forEach(fileId => {
                if (fileId !== undefined) {
                    const tile = this.tileManager.getTile(fileId);
                    if (tile) {
                        console.log(`[ViewportController] Tile ${fileId}:`, {
                            hasFullRes: tile.hasFullResSource(),
                            currentResolution: tile.currentResolution,
                            position: tile.position
                        });
                        if (tile.hasFullResSource()) {
                            tile.setResolution('full');
                        }
                    } else {
                        console.warn(`[ViewportController] Tile not found for fileId: ${fileId}`);
                    }
                }
            });
        };

        // Upgrade immediately
        upgradeTiles();

        // Also schedule a delayed upgrade after CSS transitions complete
        // This ensures resolution is updated even if the initial call
        // happens before the tile size has changed
        if (delayed) {
            setTimeout(upgradeTiles, 400); // Slightly longer than transition duration
        }
    }

    /**
     * Cycle to next view mode
     */
    cycleViewMode() {
        const modes = Object.values(ViewportController.VIEW_MODES);
        const currentIndex = modes.indexOf(this.viewMode);
        const nextIndex = (currentIndex + 1) % modes.length;
        this.setViewMode(modes[nextIndex]);
    }

    /**
     * Remove viewport UI elements
     */
    removeUI() {
        this.closeButton?.remove();
        this.modeToggle?.remove();
        this.counter?.remove();
        this.hints?.remove();

        this.closeButton = null;
        this.modeToggle = null;
        this.counter = null;
        this.hints = null;

        // Reset view mode classes
        this.tileManager?.container?.classList.remove('view-carousel', 'view-compare', 'view-fullscreen');
    }

    /**
     * Update UI to reflect current state
     */
    updateUI() {
        if (this.counter) {
            this.counter.textContent = `${this.currentIndex + 1} / ${this.navigationFiles.length}`;
        }
    }

    // ==========================================
    // Event Handlers
    // ==========================================

    /**
     * Handle keyboard events
     * @param {KeyboardEvent} e
     */
    handleKeydown(e) {
        if (!this.isActive) return;

        switch (e.key) {
            case 'ArrowLeft':
            case 'ArrowUp':
                e.preventDefault();
                this.previous();
                break;

            case 'ArrowRight':
            case 'ArrowDown':
                e.preventDefault();
                this.next();
                break;

            case 'Home':
                e.preventDefault();
                this.goToFirst();
                break;

            case 'End':
                e.preventDefault();
                this.goToLast();
                break;

            case 'Escape':
                e.preventDefault();
                this.exit();
                break;

            case ' ':  // Spacebar
                e.preventDefault();
                // Toggle details panel if available
                this.toggleDetailsPanel();
                break;

            case 'v':
            case 'V':
                e.preventDefault();
                this.cycleViewMode();
                break;
        }
    }

    /**
     * Handle click events on the viewport
     * @param {MouseEvent} e
     */
    handleClick(e) {
        if (!this.isActive) return;

        const target = e.target.closest('.thumbnail');
        if (!target) {
            // Clicked on backdrop - could close or do nothing
            return;
        }

        const position = target.dataset.vpPos;

        if (position === 'prev') {
            e.preventDefault();
            this.previous();
        } else if (position === 'next') {
            e.preventDefault();
            this.next();
        }
        // Click on current tile - could open details or do nothing
    }

    /**
     * Handle wheel events for navigation
     * @param {WheelEvent} e
     */
    handleWheel(e) {
        if (!this.isActive) return;

        // Prevent page scroll
        e.preventDefault();

        // Debounce wheel events
        if (this._wheelTimeout) return;

        this._wheelTimeout = setTimeout(() => {
            this._wheelTimeout = null;
        }, 150);

        if (e.deltaY > 0 || e.deltaX > 0) {
            this.next();
        } else if (e.deltaY < 0 || e.deltaX < 0) {
            this.previous();
        }
    }

    // ==========================================
    // Details Panel
    // ==========================================

    /**
     * Toggle details panel visibility
     */
    toggleDetailsPanel() {
        const container = this.tileManager.container;
        container.classList.toggle('with-details');

        // Emit event for details panel to respond
        window.dispatchEvent(new CustomEvent('viewportToggleDetails', {
            detail: {
                visible: container.classList.contains('with-details'),
                file: this.getCurrentFile()
            }
        }));
    }

    /**
     * Show details panel
     */
    showDetailsPanel() {
        this.tileManager.container.classList.add('with-details');
        window.dispatchEvent(new CustomEvent('viewportToggleDetails', {
            detail: { visible: true, file: this.getCurrentFile() }
        }));
    }

    /**
     * Hide details panel
     */
    hideDetailsPanel() {
        this.tileManager.container.classList.remove('with-details');
        window.dispatchEvent(new CustomEvent('viewportToggleDetails', {
            detail: { visible: false, file: this.getCurrentFile() }
        }));
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
     * Check if there's a next file
     * @returns {boolean}
     */
    hasNext() {
        return this.currentIndex < this.navigationFiles.length - 1;
    }

    /**
     * Check if there's a previous file
     * @returns {boolean}
     */
    hasPrev() {
        return this.currentIndex > 0;
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

    // ==========================================
    // FLIP Animation Helpers
    // ==========================================

    /**
     * Capture starting positions of tiles before viewport mode
     * @param {Tile[]} tiles - Array of tiles to capture
     * @returns {Map} Map of tile -> {rect, element}
     */
    captureStartPositions(tiles) {
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
    }

    /**
     * Apply captured positions as inline styles
     * @param {Map} positions - Map from captureStartPositions
     */
    applyStartPositions(positions) {
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
    }

    /**
     * Clear inline positions to allow CSS transitions to take over
     * @param {Map} positions - Map from captureStartPositions
     */
    clearStartPositions(positions) {
        positions.forEach(({ element }) => {
            element.style.position = '';
            element.style.left = '';
            element.style.top = '';
            element.style.width = '';
            element.style.height = '';
            element.style.transform = '';
            element.style.transition = '';
        });
    }

    // ==========================================
    // Grid Position Locking
    // ==========================================

    /**
     * Lock the grid layout so tiles don't shift when viewport tiles
     * leave flow. Freezes the grid template and assigns every tile
     * to an explicit row/column based on display order.
     */
    lockGridPositions() {
        const container = this.tileManager.container;
        const cs = getComputedStyle(container);

        // Lock grid tracks at their current pixel sizes
        container.style.gridTemplateRows = cs.gridTemplateRows;
        container.style.gridTemplateColumns = cs.gridTemplateColumns;

        // Calculate column count from resolved template
        const cols = cs.gridTemplateColumns.split(/\s+/).length;

        // Pin every tile to its exact cell
        const fileOrder = this.tileManager.getFileOrder();
        fileOrder.forEach((fileId, index) => {
            const tile = this.tileManager.getTile(fileId);
            if (tile?.element) {
                tile.element.style.gridRow = String(Math.floor(index / cols) + 1);
                tile.element.style.gridColumn = String((index % cols) + 1);
            }
        });
    }

    /**
     * Unlock grid positions, returning to auto-placement
     */
    unlockGridPositions() {
        const container = this.tileManager.container;
        container.style.gridTemplateRows = '';
        container.style.gridTemplateColumns = '';

        this.tileManager.getAllTiles().forEach(tile => {
            if (tile.element) {
                tile.element.style.gridRow = '';
                tile.element.style.gridColumn = '';
            }
        });
    }

    // ==========================================
    // Navigation Set Management
    // ==========================================

    /**
     * Update the navigation set (e.g., when filter changes)
     * @param {number[]} newFileIds
     */
    updateNavigationSet(newFileIds) {
        const currentFileId = this.getCurrentFileId();
        this.navigationFiles = newFileIds;

        // Try to stay on current file
        const newIndex = newFileIds.indexOf(currentFileId);
        if (newIndex !== -1) {
            this.currentIndex = newIndex;
        } else if (newFileIds.length > 0) {
            // Current file no longer in set, go to first
            this.currentIndex = 0;
        } else {
            // No files, exit viewport
            this.exit();
            return;
        }

        this.updateTilePositions();
        this.updateUI();
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

    /**
     * Get current view mode
     * @returns {string}
     */
    getViewMode() {
        return this.viewMode;
    }
}

// Export for use in other modules
window.ViewportController = ViewportController;
