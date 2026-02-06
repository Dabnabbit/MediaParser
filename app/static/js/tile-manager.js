/**
 * TileManager - Manages Tile instances and file↔tile mapping
 *
 * Responsibilities:
 * - Creates and tracks Tile instances
 * - Maintains file ID to Tile mapping
 * - Provides navigation helpers for viewport mode
 * - Handles bulk operations (render, clear)
 *
 * Works with ResultsHandler to manage the thumbnail grid.
 */

class TileManager {
    /**
     * Create a TileManager
     * @param {HTMLElement} container - The grid container element
     * @param {Object} options
     * @param {Function} [options.getGroupColor] - Function to get duplicate group color
     * @param {Function} [options.onTileClick] - Callback when tile is clicked
     * @param {Function} [options.onTileCreated] - Callback when tile is created
     * @param {boolean} [options.lazyLoad=true] - Use lazy loading for images
     */
    constructor(container, options = {}) {
        this.container = container;
        this.options = {
            getGroupColor: null,
            onTileClick: null,
            onTileCreated: null,
            lazyLoad: true,
            ...options
        };

        // Tile tracking
        this.tiles = new Map();        // fileId → Tile instance
        this.fileOrder = [];           // Array of fileIds in display order

        // Lazy loading observer
        this.lazyLoader = null;
        if (this.options.lazyLoad) {
            this.initLazyLoader();
        }
    }

    /**
     * Initialize Intersection Observer for lazy loading
     */
    initLazyLoader() {
        this.lazyLoader = new IntersectionObserver(
            (entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const img = entry.target;
                        if (img.dataset.src) {
                            img.src = img.dataset.src;
                            img.removeAttribute('data-src');
                            img.addEventListener('load', () => img.classList.add('loaded'), { once: true });
                            img.addEventListener('error', () => {
                                img.src = '/static/img/placeholder.svg';
                            }, { once: true });
                        }
                        this.lazyLoader.unobserve(img);
                    }
                });
            },
            { rootMargin: '100px' }
        );
    }

    // ==========================================
    // Tile Lifecycle
    // ==========================================

    /**
     * Create a tile for a file and register it
     * @param {Object} fileData - File data object
     * @param {number} [index] - Optional index in display order
     * @returns {Tile}
     */
    createTile(fileData, index) {
        // Check if tile already exists
        if (this.tiles.has(fileData.id)) {
            const existing = this.tiles.get(fileData.id);
            existing.updateFile(fileData);
            // Update index for shift-click range selection
            if (typeof index === 'number' && existing.element) {
                existing.element.dataset.index = index;
            }
            return existing;
        }

        // Create new Tile instance
        const tile = new Tile({
            file: fileData,
            getGroupColor: this.options.getGroupColor,
            observeSize: true,  // Enable MIPMAP resolution
        });

        // Set index for shift-click range selection
        if (typeof index === 'number' && tile.element) {
            tile.element.dataset.index = index;
        }

        // Store in map
        this.tiles.set(fileData.id, tile);

        // Track order
        if (typeof index === 'number') {
            this.fileOrder[index] = fileData.id;
        } else {
            this.fileOrder.push(fileData.id);
        }

        // Set up lazy loading if enabled
        if (this.lazyLoader && tile.imageElement) {
            this.setupLazyLoad(tile);
        }

        // Callback
        if (this.options.onTileCreated) {
            this.options.onTileCreated(tile);
        }

        return tile;
    }

    /**
     * Set up lazy loading for a tile's image
     * @param {Tile} tile
     */
    setupLazyLoad(tile) {
        const img = tile.imageElement;
        if (!img) return;

        // Convert src to data-src for lazy loading
        const src = img.src;
        if (src && !src.includes('placeholder')) {
            img.dataset.src = src;
            img.src = '/static/img/placeholder.svg';
        }

        this.lazyLoader.observe(img);
    }

    /**
     * Remove a tile by file ID
     * @param {number} fileId
     */
    removeTile(fileId) {
        const tile = this.tiles.get(fileId);
        if (!tile) return;

        // Unobserve lazy loader
        if (this.lazyLoader && tile.imageElement) {
            this.lazyLoader.unobserve(tile.imageElement);
        }

        // Destroy tile
        tile.destroy();

        // Remove from tracking
        this.tiles.delete(fileId);
        this.fileOrder = this.fileOrder.filter(id => id !== fileId);
    }

    /**
     * Get a tile by file ID
     * @param {number} fileId
     * @returns {Tile|undefined}
     */
    getTile(fileId) {
        return this.tiles.get(fileId);
    }

    /**
     * Get all tile instances
     * @returns {Tile[]}
     */
    getAllTiles() {
        return Array.from(this.tiles.values());
    }

    /**
     * Get tile count
     * @returns {number}
     */
    get size() {
        return this.tiles.size;
    }

    // ==========================================
    // Bulk Operations
    // ==========================================

    /**
     * Render files to the grid
     * Creates/updates tiles and appends to container
     * @param {Object[]} files - Array of file data objects
     * @param {Object} options
     * @param {boolean} [options.clear=true] - Clear existing tiles first
     * @param {Set} [options.selectedIds] - Set of selected file IDs
     */
    renderFiles(files, options = {}) {
        const { clear = true, selectedIds = new Set() } = options;

        if (clear) {
            this.clear();
        }

        // Create document fragment for batch DOM insertion
        const fragment = document.createDocumentFragment();

        files.forEach((file, index) => {
            const tile = this.createTile(file, index);

            // Set selection state
            if (selectedIds.has(file.id)) {
                tile.setSelected(true);
            }

            fragment.appendChild(tile.element);
        });

        // Append all at once
        this.container.appendChild(fragment);
    }

    /**
     * Update tiles for a subset of files (without clearing)
     * @param {Object[]} files - Array of file data objects
     */
    updateFiles(files) {
        files.forEach(file => {
            const tile = this.tiles.get(file.id);
            if (tile) {
                tile.updateFile(file);
            }
        });
    }

    /**
     * Clear all tiles from the grid
     */
    clear() {
        // Destroy all tiles
        this.tiles.forEach(tile => {
            if (this.lazyLoader && tile.imageElement) {
                this.lazyLoader.unobserve(tile.imageElement);
            }
            tile.destroy();
        });

        // Clear tracking
        this.tiles.clear();
        this.fileOrder = [];

        // Clear container
        if (this.container) {
            this.container.innerHTML = '';
        }
    }

    // ==========================================
    // Navigation Helpers
    // ==========================================

    /**
     * Get file IDs in display order
     * @returns {number[]}
     */
    getFileOrder() {
        return [...this.fileOrder];
    }

    /**
     * Get file IDs matching a filter function
     * @param {Function} filterFn - Filter function (file) => boolean
     * @returns {number[]}
     */
    getNavigableFiles(filterFn) {
        if (!filterFn) {
            return this.getFileOrder();
        }

        return this.fileOrder.filter(fileId => {
            const tile = this.tiles.get(fileId);
            return tile && filterFn(tile.file);
        });
    }

    /**
     * Get tile at a specific index in display order
     * @param {number} index
     * @returns {Tile|undefined}
     */
    getTileAtIndex(index) {
        const fileId = this.fileOrder[index];
        return fileId !== undefined ? this.tiles.get(fileId) : undefined;
    }

    /**
     * Get index of a file in display order
     * @param {number} fileId
     * @returns {number} -1 if not found
     */
    getFileIndex(fileId) {
        return this.fileOrder.indexOf(fileId);
    }

    /**
     * Get the file data for a file ID
     * @param {number} fileId
     * @returns {Object|undefined}
     */
    getFile(fileId) {
        return this.tiles.get(fileId)?.file;
    }

    /**
     * Get all file data objects in display order
     * @returns {Object[]}
     */
    getAllFiles() {
        return this.fileOrder.map(id => this.tiles.get(id)?.file).filter(Boolean);
    }

    // ==========================================
    // Selection Helpers
    // ==========================================

    /**
     * Set selection state for a file
     * @param {number} fileId
     * @param {boolean} selected
     */
    setSelected(fileId, selected) {
        const tile = this.tiles.get(fileId);
        if (tile) {
            tile.setSelected(selected);
        }
    }

    /**
     * Set selection state for multiple files
     * @param {Set<number>|number[]} fileIds
     * @param {boolean} selected
     */
    setMultipleSelected(fileIds, selected) {
        const ids = fileIds instanceof Set ? fileIds : new Set(fileIds);
        this.tiles.forEach((tile, fileId) => {
            if (ids.has(fileId)) {
                tile.setSelected(selected);
            }
        });
    }

    /**
     * Clear all selections
     */
    clearSelection() {
        this.tiles.forEach(tile => tile.setSelected(false));
    }

    /**
     * Get all selected file IDs
     * @returns {number[]}
     */
    getSelectedFileIds() {
        return this.fileOrder.filter(id => {
            const tile = this.tiles.get(id);
            return tile?.selected;
        });
    }

    // ==========================================
    // Viewport Mode Helpers
    // ==========================================

    /**
     * Set all tiles to a specific position
     * @param {string} position
     */
    setAllPositions(position) {
        this.tiles.forEach(tile => tile.setPosition(position));
    }

    /**
     * Reset all tiles to grid position
     */
    resetToGrid() {
        this.tiles.forEach(tile => tile.setPosition(Tile.POSITIONS.GRID));
    }

    /**
     * Prepare tiles for viewport mode
     * Sets tiles to appropriate positions for carousel display
     * @param {number} currentFileId - The file to show as current
     * @param {number[]} [navigableIds] - Optional subset of navigable file IDs
     */
    setupViewport(currentFileId, navigableIds = null) {
        const navOrder = navigableIds || this.fileOrder;
        const currentIndex = navOrder.indexOf(currentFileId);

        if (currentIndex === -1) {
            console.warn('Current file not in navigation order:', currentFileId);
            return;
        }

        const prevId = navOrder[currentIndex - 1];
        const nextId = navOrder[currentIndex + 1];
        const viewportIds = new Set([prevId, currentFileId, nextId].filter(id => id !== undefined));

        // Only move non-viewport tiles to grid — never bounce viewport tiles through GRID,
        // as that would reset their transition starting point to the grid position
        this.tiles.forEach((tile, fileId) => {
            if (!viewportIds.has(fileId) && tile.position !== Tile.POSITIONS.GRID) {
                tile.setPosition(Tile.POSITIONS.GRID);
            }
        });

        // Set viewport positions directly (PREV→CURRENT, CURRENT→NEXT, etc. transition smoothly)
        if (prevId !== undefined) {
            this.getTile(prevId)?.setPosition(Tile.POSITIONS.PREV);
        }
        this.getTile(currentFileId)?.setPosition(Tile.POSITIONS.CURRENT);
        if (nextId !== undefined) {
            this.getTile(nextId)?.setPosition(Tile.POSITIONS.NEXT);
        }
    }

    // ==========================================
    // Cleanup
    // ==========================================

    /**
     * Destroy the manager and all tiles
     */
    destroy() {
        this.clear();

        if (this.lazyLoader) {
            this.lazyLoader.disconnect();
            this.lazyLoader = null;
        }

        this.container = null;
    }
}

// Export for use in other modules
window.TileManager = TileManager;
