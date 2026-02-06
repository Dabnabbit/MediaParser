/**
 * TileManager - Manages Tile instances and file↔tile mapping
 *
 * Responsibilities:
 * - Creates and tracks Tile instances
 * - Maintains file ID to Tile mapping
 * - Provides navigation helpers for viewport mode
 * - Handles bulk operations (render, clear)
 * - Integrates with VirtualScrollManager for efficient rendering
 *
 * With virtual scroll enabled, only visible tiles have DOM elements.
 * File data for ALL files is kept in allFileData Map for navigation.
 */

class TileManager {
    /**
     * Create a TileManager
     * @param {HTMLElement} container - The grid container element
     * @param {Object} options
     * @param {Function} [options.getGroupColor] - Function to get duplicate group color
     * @param {Function} [options.onTileClick] - Callback when tile is clicked
     * @param {Function} [options.onTileCreated] - Callback when tile is created
     * @param {boolean} [options.virtualScroll=true] - Use virtual scrolling
     */
    constructor(container, options = {}) {
        this.container = container;
        this.options = {
            getGroupColor: null,
            onTileClick: null,
            onTileCreated: null,
            virtualScroll: true,
            ...options
        };

        // Tile tracking — only currently rendered tiles
        this.tiles = new Map();        // fileId → Tile instance

        // File data store — ALL files, independent of rendering
        this.allFileData = new Map();  // fileId → file data object
        this.fileOrder = [];           // Array of fileIds in display order

        // Selection state (survives re-renders)
        this.selectedIds = new Set();

        // Virtual scroll manager
        this.virtualScroll = null;
        if (this.options.virtualScroll) {
            this.initVirtualScroll();
        }
    }

    /**
     * Initialize VirtualScrollManager
     */
    initVirtualScroll() {
        if (!this.container || typeof VirtualScrollManager === 'undefined') return;

        this.virtualScroll = new VirtualScrollManager(this.container);
        this.virtualScroll.onRender = (startIdx, endIdx) => {
            this.renderRange(startIdx, endIdx);
        };
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
            if (typeof index === 'number' && existing.element) {
                existing.element.dataset.index = index;
            }
            return existing;
        }

        // Determine initial resolution based on current tile size
        const tileSize = this.virtualScroll?.tileSize || 150;
        const useFullRes = tileSize >= Tile.THRESHOLDS.FULL;

        // Create new Tile instance — no individual ResizeObserver for grid tiles
        const tile = new Tile({
            file: fileData,
            getGroupColor: this.options.getGroupColor,
            observeSize: false,
        });

        // Set initial resolution based on tile size
        if (useFullRes && tile.hasFullResSource()) {
            tile.setResolution('full');
        }

        // Set index for shift-click range selection
        if (typeof index === 'number' && tile.element) {
            tile.element.dataset.index = index;
        }

        // Store in rendered tiles map
        this.tiles.set(fileData.id, tile);

        // Apply selection state
        if (this.selectedIds.has(fileData.id)) {
            tile.setSelected(true);
        }

        // Callback
        if (this.options.onTileCreated) {
            this.options.onTileCreated(tile);
        }

        return tile;
    }

    /**
     * Remove a tile by file ID (destroys DOM)
     * @param {number} fileId
     */
    removeTile(fileId) {
        const tile = this.tiles.get(fileId);
        if (!tile) return;

        tile.destroy();
        this.tiles.delete(fileId);
    }

    /**
     * Get a tile by file ID (only returns rendered tiles)
     * @param {number} fileId
     * @returns {Tile|undefined}
     */
    getTile(fileId) {
        return this.tiles.get(fileId);
    }

    /**
     * Ensure a tile exists for a given file ID (create on-demand if needed).
     * Used by viewport mode for tiles outside the rendered range.
     * @param {number} fileId
     * @returns {Tile|undefined}
     */
    ensureTile(fileId) {
        let tile = this.tiles.get(fileId);
        if (tile) return tile;

        const fileData = this.allFileData.get(fileId);
        if (!fileData) return undefined;

        const index = this.fileOrder.indexOf(fileId);
        tile = this.createTile(fileData, index >= 0 ? index : undefined);

        // Place at correct grid position and append
        if (tile.element) {
            if (this.virtualScroll && index >= 0) {
                const pos = this.virtualScroll.getGridPosition(index);
                tile.element.style.gridRow = String(pos.row);
                tile.element.style.gridColumn = String(pos.col);
            }
            this.container.appendChild(tile.element);
        }

        return tile;
    }

    /**
     * Get all currently rendered tile instances
     * @returns {Tile[]}
     */
    getAllTiles() {
        return Array.from(this.tiles.values());
    }

    /**
     * Get count of rendered tiles
     * @returns {number}
     */
    get size() {
        return this.tiles.size;
    }

    // ==========================================
    // Bulk Operations
    // ==========================================

    /**
     * Render files to the grid.
     * Stores all file data, then either uses virtual scroll or renders all.
     * @param {Object[]} files - Array of file data objects
     * @param {Object} options
     * @param {boolean} [options.clear=true] - Clear existing tiles first
     * @param {Set} [options.selectedIds] - Set of selected file IDs
     */
    renderFiles(files, options = {}) {
        const { clear = true, selectedIds } = options;

        if (clear) {
            this.clear();
        }

        // Store selection state
        if (selectedIds) {
            this.selectedIds = new Set(selectedIds);
        }

        // Store ALL file data
        this.fileOrder = [];
        files.forEach((file, index) => {
            this.allFileData.set(file.id, file);
            this.fileOrder.push(file.id);
        });

        // Use virtual scroll if available
        if (this.virtualScroll) {
            this.virtualScroll.setFiles(files);
        } else {
            // Fallback: render all tiles
            this._renderAll(files);
        }
    }

    /**
     * Fallback: render all files without virtual scrolling
     * @param {Object[]} files
     */
    _renderAll(files) {
        const fragment = document.createDocumentFragment();

        files.forEach((file, index) => {
            const tile = this.createTile(file, index);
            fragment.appendChild(tile.element);
        });

        this.container.appendChild(fragment);
    }

    /**
     * Render a specific range of files (called by VirtualScrollManager).
     * Clears rendered tiles and creates new ones for the range.
     * @param {number} startIdx - First file index to render
     * @param {number} endIdx - One past last file index to render
     */
    renderRange(startIdx, endIdx) {
        // Collect exempted tiles (viewport mode tiles that must stay alive)
        const exemptedTiles = new Map();
        if (this.virtualScroll) {
            this.virtualScroll.exemptedIds.forEach(id => {
                const tile = this.tiles.get(id);
                if (tile) {
                    exemptedTiles.set(id, tile);
                }
            });
        }

        // Destroy non-exempted rendered tiles
        this.tiles.forEach((tile, fileId) => {
            if (!exemptedTiles.has(fileId)) {
                tile.destroy();
            }
        });
        this.tiles.clear();

        // Re-register exempted tiles
        exemptedTiles.forEach((tile, id) => {
            this.tiles.set(id, tile);
        });

        // Create tiles for visible range, placing each at its correct grid cell
        const fragment = document.createDocumentFragment();

        for (let i = startIdx; i < endIdx; i++) {
            const fileId = this.fileOrder[i];
            if (fileId === undefined) continue;

            // Skip if this tile is exempted (already exists)
            if (exemptedTiles.has(fileId)) continue;

            const fileData = this.allFileData.get(fileId);
            if (!fileData) continue;

            const tile = this.createTile(fileData, i);

            // Place tile at its correct grid position (1-indexed)
            if (this.virtualScroll && tile.element) {
                const pos = this.virtualScroll.getGridPosition(i);
                tile.element.style.gridRow = String(pos.row);
                tile.element.style.gridColumn = String(pos.col);
            }

            fragment.appendChild(tile.element);
        }

        // Remove non-exempted elements from container
        const exemptedElements = new Set();
        exemptedTiles.forEach(tile => {
            if (tile.element) exemptedElements.add(tile.element);
        });

        const children = Array.from(this.container.children);
        children.forEach(child => {
            if (!exemptedElements.has(child)) {
                child.remove();
            }
        });

        this.container.appendChild(fragment);
    }

    /**
     * Update tiles for a subset of files (without clearing)
     * @param {Object[]} files - Array of file data objects
     */
    updateFiles(files) {
        files.forEach(file => {
            // Update stored file data
            this.allFileData.set(file.id, file);

            // Update rendered tile if it exists
            const tile = this.tiles.get(file.id);
            if (tile) {
                tile.updateFile(file);
            }
        });
    }

    /**
     * Clear all tiles and file data
     */
    clear() {
        // Destroy all rendered tiles
        this.tiles.forEach(tile => tile.destroy());
        this.tiles.clear();

        // Clear file data
        this.allFileData.clear();
        this.fileOrder = [];

        // Clear container and virtual scroll grid template
        if (this.container) {
            this.container.innerHTML = '';
            this.container.style.gridTemplateRows = '';
            this.container.style.gridTemplateColumns = '';
        }

        // Reset virtual scroll state so recalculateLayout() won't
        // early-return when the same file set is loaded again
        if (this.virtualScroll) {
            this.virtualScroll.clearExemptions();
            this.virtualScroll.files = [];
            this.virtualScroll.startIdx = 0;
            this.virtualScroll.endIdx = 0;
            this.virtualScroll.totalRows = 0;
            this.virtualScroll.columns = 1;
        }
    }

    // ==========================================
    // Navigation Helpers
    // ==========================================

    /**
     * Get file IDs in display order (ALL files, not just rendered)
     * @returns {number[]}
     */
    getFileOrder() {
        return [...this.fileOrder];
    }

    /**
     * Get file IDs matching a filter function (works across ALL files)
     * @param {Function} filterFn - Filter function (file) => boolean
     * @returns {number[]}
     */
    getNavigableFiles(filterFn) {
        if (!filterFn) {
            return this.getFileOrder();
        }

        return this.fileOrder.filter(fileId => {
            const file = this.allFileData.get(fileId);
            return file && filterFn(file);
        });
    }

    /**
     * Get tile at a specific index in display order (only if rendered)
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
     * Get the file data for a file ID (works for ALL files)
     * @param {number} fileId
     * @returns {Object|undefined}
     */
    getFile(fileId) {
        return this.allFileData.get(fileId);
    }

    /**
     * Get all file data objects in display order (ALL files)
     * @returns {Object[]}
     */
    getAllFiles() {
        return this.fileOrder.map(id => this.allFileData.get(id)).filter(Boolean);
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
        if (selected) {
            this.selectedIds.add(fileId);
        } else {
            this.selectedIds.delete(fileId);
        }

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
        ids.forEach(fileId => {
            if (selected) {
                this.selectedIds.add(fileId);
            } else {
                this.selectedIds.delete(fileId);
            }
        });

        // Update rendered tiles
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
        this.selectedIds.clear();
        this.tiles.forEach(tile => tile.setSelected(false));
    }

    /**
     * Get all selected file IDs (from persistent set, not tile DOM)
     * @returns {number[]}
     */
    getSelectedFileIds() {
        return this.fileOrder.filter(id => this.selectedIds.has(id));
    }

    // ==========================================
    // Viewport Mode Helpers
    // ==========================================

    /**
     * Set all rendered tiles to a specific position
     * @param {string} position
     */
    setAllPositions(position) {
        this.tiles.forEach(tile => tile.setPosition(position));
    }

    /**
     * Reset all rendered tiles to grid position.
     * Also clears virtual scroll exemptions.
     */
    resetToGrid() {
        this.tiles.forEach(tile => tile.setPosition(Tile.POSITIONS.GRID));

        if (this.virtualScroll) {
            this.virtualScroll.clearExemptions();
        }
    }

    /**
     * Prepare tiles for viewport mode.
     * Ensures prev/current/next tiles exist and sets positions.
     * Exempts viewport tiles from virtual scroll recycling.
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

        // Exempt viewport tiles from recycling
        if (this.virtualScroll) {
            this.virtualScroll.clearExemptions();
            this.virtualScroll.exemptFromRecycling([...viewportIds]);
        }

        // Ensure viewport tiles exist (they may be outside rendered range)
        viewportIds.forEach(id => this.ensureTile(id));

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

        if (this.virtualScroll) {
            this.virtualScroll.destroy();
            this.virtualScroll = null;
        }

        this.container = null;
    }
}

// Export for use in other modules
window.TileManager = TileManager;
