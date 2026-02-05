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

        // Activate viewport mode
        this.isActive = true;
        document.body.classList.add('viewport-active');

        const container = this.tileManager.container;
        container.classList.add('viewport-mode');
        container.classList.add('viewport-entering');

        // Remove entering class after animation and clear transition guard
        setTimeout(() => {
            container.classList.remove('viewport-entering');
            this.isTransitioning = false;
        }, 300);

        // Create UI elements
        this.createUI();

        // Set tile positions
        this.updateTilePositions();
        this.updateUI();

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

            // Reset all tile positions to grid
            this.tileManager.resetToGrid();

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
     * Update tile positions for current navigation state
     */
    updateTilePositions() {
        const currentId = this.navigationFiles[this.currentIndex];
        const prevId = this.navigationFiles[this.currentIndex - 1];
        const nextId = this.navigationFiles[this.currentIndex + 1];

        // Use TileManager's setupViewport helper
        this.tileManager.setupViewport(currentId, this.navigationFiles);
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
            this.tileManager.resetToGrid();
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
