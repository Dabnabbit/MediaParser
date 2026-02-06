/**
 * ViewportController - UI module
 *
 * UI elements, event handlers, view modes, and details panel.
 * Extends ViewportController.prototype.
 *
 * Load order: viewport-core.js → viewport-animation.js → viewport-navigation.js → viewport-ui.js
 */

(function() {
    const proto = ViewportController.prototype;

    // ==========================================
    // UI Elements
    // ==========================================

    /**
     * Create viewport UI elements
     */
    proto.createUI = function() {
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
    };

    /**
     * Remove viewport UI elements
     */
    proto.removeUI = function() {
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
    };

    /**
     * Update UI to reflect current state
     */
    proto.updateUI = function() {
        if (this.counter) {
            this.counter.textContent = `${this.currentIndex + 1} / ${this.navigationFiles.length}`;
        }
    };

    // ==========================================
    // View Modes
    // ==========================================

    /**
     * Set the view mode
     * @param {string} mode - One of ViewportController.VIEW_MODES
     */
    proto.setViewMode = function(mode) {
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
    };

    /**
     * Cycle to next view mode
     */
    proto.cycleViewMode = function() {
        const modes = Object.values(ViewportController.VIEW_MODES);
        const currentIndex = modes.indexOf(this.viewMode);
        const nextIndex = (currentIndex + 1) % modes.length;
        this.setViewMode(modes[nextIndex]);
    };

    /**
     * Upgrade all visible tiles (prev, current, next) to full resolution
     * @param {boolean} [delayed=false] - If true, also schedule a delayed re-check
     */
    proto.upgradeVisibleTilesToFullRes = function(delayed = true) {
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
    };

    // ==========================================
    // Event Handlers
    // ==========================================

    /**
     * Handle keyboard events
     * @param {KeyboardEvent} e
     */
    proto.handleKeydown = function(e) {
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
    };

    /**
     * Handle click events on the viewport
     * @param {MouseEvent} e
     */
    proto.handleClick = function(e) {
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
    };

    /**
     * Handle wheel events for navigation
     * @param {WheelEvent} e
     */
    proto.handleWheel = function(e) {
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
    };

    // ==========================================
    // Details Panel
    // ==========================================

    /**
     * Toggle details panel visibility
     */
    proto.toggleDetailsPanel = function() {
        const container = this.tileManager.container;
        container.classList.toggle('with-details');

        // Emit event for details panel to respond
        window.dispatchEvent(new CustomEvent('viewportToggleDetails', {
            detail: {
                visible: container.classList.contains('with-details'),
                file: this.getCurrentFile()
            }
        }));
    };

    /**
     * Show details panel
     */
    proto.showDetailsPanel = function() {
        this.tileManager.container.classList.add('with-details');
        window.dispatchEvent(new CustomEvent('viewportToggleDetails', {
            detail: { visible: true, file: this.getCurrentFile() }
        }));
    };

    /**
     * Hide details panel
     */
    proto.hideDetailsPanel = function() {
        this.tileManager.container.classList.remove('with-details');
        window.dispatchEvent(new CustomEvent('viewportToggleDetails', {
            detail: { visible: false, file: this.getCurrentFile() }
        }));
    };
})();
