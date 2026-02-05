/**
 * Tile - Universal, scale-aware media tile container
 *
 * Core component of the carousel viewport system. Tiles:
 * - Observe their own size and auto-switch image resolution (MIPMAP)
 * - Support position states for grid and viewport modes
 * - Handle smooth transitions between states
 *
 * Works in multiple contexts:
 * - Results grid (various thumbnail sizes)
 * - Examination viewport (prev/current/next carousel)
 * - Any size via CSS - resolution auto-adjusts
 */

class Tile {
    // Resolution thresholds (pixels)
    static THRESHOLDS = {
        THUMBNAIL: 0,      // Use thumbnail below full threshold
        FULL: 400,         // Use full-res at or above this size
    };

    // Position states
    static POSITIONS = {
        GRID: 'grid',
        PREV: 'prev',
        CURRENT: 'current',
        NEXT: 'next',
        HIDDEN: 'hidden',
    };

    /**
     * Create a Tile instance
     * @param {Object} options
     * @param {HTMLElement} [options.element] - Existing DOM element to wrap (optional)
     * @param {Object} options.file - File data object
     * @param {Function} [options.getGroupColor] - Function to get duplicate group color
     * @param {boolean} [options.observeSize=true] - Auto-start size observation
     * @param {Function} [options.onResolutionChange] - Callback when resolution changes
     * @param {Function} [options.onPositionChange] - Callback when position changes
     */
    constructor(options = {}) {
        this.file = options.file;
        this.getGroupColor = options.getGroupColor || null;
        this.onResolutionChange = options.onResolutionChange || null;
        this.onPositionChange = options.onPositionChange || null;

        // State
        this.currentResolution = 'thumbnail';  // 'thumbnail' | 'full'
        this.position = Tile.POSITIONS.GRID;
        this.selected = false;
        this.isImageLoading = false;
        this.preloadedFullRes = false;

        // DOM
        this.element = options.element || null;
        this.imageElement = null;
        this.resizeObserver = null;

        // If element provided, attach to it; otherwise create new
        if (this.element) {
            this.attachToElement(this.element);
        } else if (this.file) {
            this.element = this.createElement();
        }

        // Start observing size if requested (default: true)
        if (options.observeSize !== false && this.element) {
            this.observeSize();
        }
    }

    /**
     * Attach to an existing DOM element
     * @param {HTMLElement} element
     */
    attachToElement(element) {
        this.element = element;
        this.imageElement = element.querySelector('img');

        // Store reference on element for reverse lookup
        element._tile = this;

        // Extract file ID if not provided
        if (!this.file && element.dataset.fileId) {
            this.file = { id: parseInt(element.dataset.fileId) };
        }
    }

    /**
     * Create a new tile DOM element
     * @returns {HTMLElement}
     */
    createElement() {
        const { file } = this;
        if (!file) return null;

        const tile = document.createElement('div');
        tile.className = this.buildClassName();
        tile.dataset.fileId = file.id;
        tile._tile = this;  // Store reference for reverse lookup

        // Apply group colors as CSS custom properties (badges inherit via cascade)
        const mode = Tile.getCurrentMode();
        if (file.is_duplicate && mode !== 'similar' && this.getGroupColor) {
            const groupColor = this.getGroupColor(file.exact_group_id);
            tile.style.setProperty('--duplicate-color', groupColor.solid);
            tile.style.setProperty('--duplicate-color-light', groupColor.light);
        }
        if (file.is_similar && file.similar_group_id && mode !== 'duplicates' && this.getGroupColor) {
            const groupColor = this.getGroupColor(file.similar_group_id);
            tile.style.setProperty('--similar-color', groupColor.solid);
            tile.style.setProperty('--similar-color-light', groupColor.light);
        }

        // Build content
        tile.innerHTML = this.buildInnerHTML();

        this.element = tile;
        this.imageElement = tile.querySelector('img');

        return tile;
    }

    /**
     * Build CSS class names for the tile
     * Mode-aware: only applies group class relevant to current mode
     */
    buildClassName() {
        const { file } = this;
        const classes = ['thumbnail'];
        const mode = Tile.getCurrentMode();

        if (this.selected) classes.push('selected');
        if (file?.is_duplicate && mode !== 'similar') classes.push('duplicate-group');
        if (file?.is_similar && mode !== 'duplicates') classes.push('similar-group');
        if (file?.discarded) classes.push('discarded');
        if (file?.reviewed_at) classes.push('reviewed');

        return classes.join(' ');
    }

    /**
     * Build inner HTML for the tile
     * Mode-aware: only renders badges relevant to current mode
     */
    buildInnerHTML() {
        const { file } = this;
        if (!file) return '';

        const imgSrc = this.getThumbnailSrc();
        const confidenceClass = `confidence-${file.confidence}`;
        const confidenceLabel = file.confidence?.charAt(0).toUpperCase() || '?';
        const isVideo = file.mime_type?.startsWith('video/');
        const isReviewed = !!file.reviewed_at;
        const isFailed = !!file.processing_error;
        const isDiscarded = !!file.discarded;
        const mode = Tile.getCurrentMode();

        // Duplicate badge — hidden in similar mode (not actionable yet/already resolved)
        // Badge background comes from CSS var(--duplicate-color) set on parent tile
        const showDuplicate = !!file.is_duplicate && mode !== 'similar';
        let duplicateBadge = '';
        if (showDuplicate) {
            duplicateBadge = `<span class="thumb-badge duplicate" title="Duplicate group">&#x29C9;</span>`;
        }

        // Similar badge — hidden in duplicates mode (not actionable yet)
        // Badge background comes from CSS var(--similar-color) set on parent tile
        const showSimilar = !!file.is_similar && mode !== 'duplicates';
        let similarBadge = '';
        if (showSimilar) {
            const typeLabel = file.similar_group_type || 'similar';
            similarBadge = `<span class="thumb-badge similar" title="Similar group (${typeLabel})">&#x2248;</span>`;
        }

        return `
            <div class="thumbnail-badges">
                <div class="badge-top">
                    <label class="thumb-checkbox" title="Select file">
                        <input type="checkbox" data-file-id="${file.id}" ${this.selected ? 'checked' : ''}>
                        <span class="checkmark"></span>
                    </label>
                    <div class="badge-status">
                        ${isReviewed ? '<span class="thumb-badge reviewed">&#10003;</span>' : ''}
                        ${isFailed ? '<span class="thumb-badge failed">&#10007;</span>' : ''}
                        ${isDiscarded ? '<span class="thumb-badge discarded">&#x1F5D1;</span>' : ''}
                    </div>
                </div>
                <div class="badge-bottom">
                    <span class="thumb-badge ${confidenceClass}">${confidenceLabel}</span>
                    ${isVideo ? '<span class="thumb-badge media-video">&#9658;</span>' : ''}
                    ${duplicateBadge}
                    ${similarBadge}
                </div>
            </div>
            <img class="tile-image"
                 src="${imgSrc}"
                 alt="${this.escapeHtml(file.original_filename)}"
                 draggable="false">
            <div class="thumbnail-filename">${this.escapeHtml(file.original_filename)}</div>
        `;
    }

    // ==========================================
    // MIPMAP Resolution Management
    // ==========================================

    /**
     * Start observing element size for MIPMAP resolution switching
     */
    observeSize() {
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }

        this.resizeObserver = new ResizeObserver(entries => {
            for (const entry of entries) {
                const width = entry.contentRect.width;
                this.updateResolution(width);
            }
        });

        if (this.element) {
            this.resizeObserver.observe(this.element);
        }
    }

    /**
     * Stop observing element size
     */
    unobserveSize() {
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }
    }

    /**
     * Check size and upgrade/downgrade image resolution
     * @param {number} width - Current rendered width in pixels
     */
    updateResolution(width) {
        const needsFullRes = width >= Tile.THRESHOLDS.FULL;
        const hasFullRes = this.currentResolution === 'full';

        // In viewport mode (not grid), always prefer full resolution when tile is visible
        const inViewport = this.isInViewport() && this.position !== Tile.POSITIONS.HIDDEN;
        const shouldUpgrade = (needsFullRes || inViewport) && !hasFullRes && this.hasFullResSource();

        if (shouldUpgrade) {
            this.setResolution('full');
        } else if (!needsFullRes && !inViewport && hasFullRes) {
            // Only downgrade if NOT in viewport and size is below threshold
            this.setResolution('thumbnail');
        }
    }

    /**
     * Set the image resolution
     * @param {'thumbnail'|'full'} resolution
     */
    setResolution(resolution) {
        if (resolution === this.currentResolution) return;

        const src = resolution === 'full' ? this.getFullResSrc() : this.getThumbnailSrc();

        // Debug logging for resolution changes
        console.log(`[Tile ${this.file?.id}] Resolution: ${this.currentResolution} → ${resolution}`, {
            src,
            hasImageElement: !!this.imageElement,
            isLoading: this.isImageLoading,
            position: this.position
        });

        this.setImageSource(src, resolution === 'full');

        const oldResolution = this.currentResolution;
        this.currentResolution = resolution;

        if (this.onResolutionChange) {
            this.onResolutionChange(this, resolution, oldResolution);
        }
    }

    /**
     * Set image source with optional crossfade transition
     * @param {string} src - Image source URL
     * @param {boolean} [crossfade=false] - Use crossfade transition
     */
    setImageSource(src, crossfade = false) {
        if (!this.imageElement) {
            console.warn(`[Tile ${this.file?.id}] setImageSource: No image element!`);
            return;
        }
        if (this.isImageLoading) {
            console.log(`[Tile ${this.file?.id}] setImageSource: Skipped, already loading`);
            return;
        }

        const currentSrc = this.imageElement.src;
        if (currentSrc.endsWith(src) || currentSrc === src) {
            console.log(`[Tile ${this.file?.id}] setImageSource: Same src, skipped`);
            return;
        }

        console.log(`[Tile ${this.file?.id}] setImageSource: ${currentSrc} → ${src} (crossfade: ${crossfade})`);

        if (crossfade) {
            this.crossfadeImage(src);
        } else {
            this.imageElement.src = src;
        }
    }

    /**
     * Crossfade to a new image source
     * @param {string} src
     */
    crossfadeImage(src) {
        this.isImageLoading = true;
        console.log(`[Tile ${this.file?.id}] crossfadeImage: Loading ${src}`);

        // Preload new image
        const newImg = new Image();
        newImg.onload = () => {
            console.log(`[Tile ${this.file?.id}] crossfadeImage: Loaded successfully, swapping`);
            // Add transition class
            this.imageElement.classList.add('tile-image-fade');

            // Wait for next frame, then swap
            requestAnimationFrame(() => {
                this.imageElement.src = src;
                this.imageElement.classList.remove('tile-image-fade');
                this.isImageLoading = false;
                console.log(`[Tile ${this.file?.id}] crossfadeImage: Swap complete`);
            });
        };
        newImg.onerror = (e) => {
            this.isImageLoading = false;
            console.error(`[Tile ${this.file?.id}] crossfadeImage: FAILED to load ${src}`, e);
        };
        newImg.src = src;
    }

    /**
     * Get current rendered dimensions
     * @returns {{width: number, height: number}}
     */
    getRenderedSize() {
        if (!this.element) return { width: 0, height: 0 };
        return {
            width: this.element.offsetWidth,
            height: this.element.offsetHeight,
        };
    }

    /**
     * Preload full-resolution image in background
     * @returns {Promise<boolean>} - Resolves true if preload successful
     */
    preloadFullRes() {
        if (this.preloadedFullRes || !this.hasFullResSource()) {
            return Promise.resolve(this.preloadedFullRes);
        }

        return new Promise(resolve => {
            const img = new Image();
            img.onload = () => {
                this.preloadedFullRes = true;
                resolve(true);
            };
            img.onerror = () => {
                resolve(false);
            };
            img.src = this.getFullResSrc();
        });
    }

    // ==========================================
    // Position State Management
    // ==========================================

    /**
     * Set tile position state
     * @param {'grid'|'prev'|'current'|'next'|'hidden'} position
     */
    setPosition(position) {
        if (position === this.position) return;

        const oldPosition = this.position;
        this.position = position;

        if (this.element) {
            // Update data attribute for CSS styling
            this.element.dataset.vpPos = position;

            // Update classes
            this.element.classList.remove('vp-grid', 'vp-prev', 'vp-current', 'vp-next', 'vp-hidden');
            this.element.classList.add(`vp-${position}`);

            // Auto-upgrade resolution for visible viewport positions
            // All visible tiles in viewport mode should use full resolution
            if ((position === Tile.POSITIONS.CURRENT ||
                 position === Tile.POSITIONS.PREV ||
                 position === Tile.POSITIONS.NEXT) && this.hasFullResSource()) {
                this.setResolution('full');
            }
            // Downgrade when going back to grid (if below threshold)
            else if (position === Tile.POSITIONS.GRID) {
                const width = this.getRenderedSize().width;
                if (width < Tile.THRESHOLDS.FULL) {
                    this.setResolution('thumbnail');
                }
            }
        }

        if (this.onPositionChange) {
            this.onPositionChange(this, position, oldPosition);
        }
    }

    /**
     * Check if tile is in viewport mode (not in grid)
     */
    isInViewport() {
        return this.position !== Tile.POSITIONS.GRID;
    }

    // ==========================================
    // Selection & Badge State
    // ==========================================

    /**
     * Set selected state
     * @param {boolean} selected
     */
    setSelected(selected) {
        this.selected = selected;

        if (this.element) {
            this.element.classList.toggle('selected', selected);
            const checkbox = this.element.querySelector('input[type="checkbox"]');
            if (checkbox) {
                checkbox.checked = selected;
            }
        }
    }

    /**
     * Update file data and refresh badges
     * @param {Object} updates - Partial file data to merge
     */
    updateFile(updates) {
        this.file = { ...this.file, ...updates };
        this.updateBadges();
    }

    /**
     * Refresh badge display based on current file state
     */
    updateBadges() {
        if (!this.element || !this.file) return;

        const badgesContainer = this.element.querySelector('.thumbnail-badges');
        if (!badgesContainer) return;

        // Rebuild badges HTML (mode-aware)
        const file = this.file;
        const confidenceClass = `confidence-${file.confidence}`;
        const confidenceLabel = file.confidence?.charAt(0).toUpperCase() || '?';
        const isVideo = file.mime_type?.startsWith('video/');
        const isReviewed = !!file.reviewed_at;
        const isFailed = !!file.processing_error;
        const isDiscarded = !!file.discarded;
        const mode = Tile.getCurrentMode();

        const showDuplicate = !!file.is_duplicate && mode !== 'similar';
        let duplicateBadge = '';
        if (showDuplicate) {
            duplicateBadge = `<span class="thumb-badge duplicate" title="Duplicate group">&#x29C9;</span>`;
        }

        const showSimilar = !!file.is_similar && mode !== 'duplicates';
        let similarBadge = '';
        if (showSimilar) {
            const typeLabel = file.similar_group_type || 'similar';
            similarBadge = `<span class="thumb-badge similar" title="Similar group (${typeLabel})">&#x2248;</span>`;
        }

        badgesContainer.innerHTML = `
            <div class="badge-top">
                <label class="thumb-checkbox" title="Select file">
                    <input type="checkbox" data-file-id="${file.id}" ${this.selected ? 'checked' : ''}>
                    <span class="checkmark"></span>
                </label>
                <div class="badge-status">
                    ${isReviewed ? '<span class="thumb-badge reviewed">&#10003;</span>' : ''}
                    ${isFailed ? '<span class="thumb-badge failed">&#10007;</span>' : ''}
                    ${isDiscarded ? '<span class="thumb-badge discarded">&#x1F5D1;</span>' : ''}
                </div>
            </div>
            <div class="badge-bottom">
                <span class="thumb-badge ${confidenceClass}">${confidenceLabel}</span>
                ${isVideo ? '<span class="thumb-badge media-video">&#9658;</span>' : ''}
                ${duplicateBadge}
                ${similarBadge}
            </div>
        `;

        // Update duplicate group styling (mode-aware)
        this.element.classList.toggle('duplicate-group', showDuplicate);
        if (showDuplicate && this.getGroupColor) {
            const groupColor = this.getGroupColor(file.exact_group_id);
            this.element.style.setProperty('--duplicate-color', groupColor.solid);
            this.element.style.setProperty('--duplicate-color-light', groupColor.light);
        }

        // Update similar group styling (mode-aware)
        this.element.classList.toggle('similar-group', showSimilar);
        if (showSimilar && file.similar_group_id && this.getGroupColor) {
            const groupColor = this.getGroupColor(file.similar_group_id);
            this.element.style.setProperty('--similar-color', groupColor.solid);
            this.element.style.setProperty('--similar-color-light', groupColor.light);
        }
    }

    // ==========================================
    // Image Source Helpers
    // ==========================================

    /**
     * Get thumbnail image source
     */
    getThumbnailSrc() {
        if (!this.file) return '/static/img/placeholder.svg';
        return this.file.thumbnail_path ? `/${this.file.thumbnail_path}` : '/static/img/placeholder.svg';
    }

    /**
     * Get full-resolution image source
     */
    getFullResSrc() {
        if (!this.file) return '/static/img/placeholder.svg';
        if (this.file.original_path) return `/uploads/${this.file.original_path}`;
        return this.getThumbnailSrc();
    }

    /**
     * Check if full-res source is available
     */
    hasFullResSource() {
        const has = !!(this.file?.original_path);
        if (!has && this.file) {
            console.warn(`[Tile ${this.file.id}] No original_path available`, this.file);
        }
        return has;
    }

    // ==========================================
    // Utilities
    // ==========================================

    /**
     * Escape HTML special characters
     */
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Destroy the tile and clean up resources
     */
    destroy() {
        this.unobserveSize();

        if (this.element) {
            delete this.element._tile;
            this.element.remove();
        }

        this.element = null;
        this.imageElement = null;
        this.file = null;
    }

    // ==========================================
    // Static Methods
    // ==========================================

    /**
     * Get current filter mode from the global filterHandler.
     * Used to show only mode-relevant badges (e.g. hide similar badge in duplicates mode).
     * @returns {string|null}
     */
    static getCurrentMode() {
        return window.filterHandler?.getCurrentMode?.() || null;
    }

    /**
     * Get Tile instance from a DOM element
     * @param {HTMLElement} element
     * @returns {Tile|null}
     */
    static fromElement(element) {
        return element?._tile || null;
    }

    /**
     * Factory method: create a tile and return its element
     * @param {Object} file - File data
     * @param {Object} options - Tile options
     * @returns {HTMLElement}
     */
    static create(file, options = {}) {
        const tile = new Tile({ file, ...options });
        return tile.element;
    }

    /**
     * Wrap an existing element with a Tile instance
     * @param {HTMLElement} element
     * @param {Object} file - File data
     * @param {Object} options - Additional options
     * @returns {Tile}
     */
    static wrap(element, file, options = {}) {
        return new Tile({ element, file, ...options });
    }
}

// Export for use in other modules
window.Tile = Tile;

// Backward compatibility: alias MediaTile to Tile
window.MediaTile = Tile;
