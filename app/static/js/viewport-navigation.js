/**
 * ViewportController - Navigation module
 *
 * Navigation logic: next, previous, goTo*, hasNext, hasPrev.
 * Extends ViewportController.prototype.
 *
 * Load order: viewport-core.js → viewport-animation.js → viewport-navigation.js → viewport-ui.js
 */

(function() {
    const proto = ViewportController.prototype;

    // ==========================================
    // Navigation
    // ==========================================

    /**
     * Navigate to the next file
     * @returns {boolean} Whether navigation occurred
     */
    proto.next = function() {
        if (!this.isActive) return false;
        if (this.currentIndex >= this.navigationFiles.length - 1) return false;

        this.currentIndex++;
        this.updateTilePositions();
        this.updateUI();
        this.notifyNavigation('next');

        return true;
    };

    /**
     * Navigate to the previous file
     * @returns {boolean} Whether navigation occurred
     */
    proto.previous = function() {
        if (!this.isActive) return false;
        if (this.currentIndex <= 0) return false;

        this.currentIndex--;
        this.updateTilePositions();
        this.updateUI();
        this.notifyNavigation('previous');

        return true;
    };

    /**
     * Navigate to a specific file
     * @param {number} fileId
     * @returns {boolean} Whether navigation occurred
     */
    proto.goToFile = function(fileId) {
        if (!this.isActive) return false;

        const index = this.navigationFiles.indexOf(fileId);
        if (index === -1) return false;

        this.currentIndex = index;
        this.updateTilePositions();
        this.updateUI();
        this.notifyNavigation('goto');

        return true;
    };

    /**
     * Navigate to a specific index
     * @param {number} index
     * @returns {boolean} Whether navigation occurred
     */
    proto.goToIndex = function(index) {
        if (!this.isActive) return false;
        if (index < 0 || index >= this.navigationFiles.length) return false;

        this.currentIndex = index;
        this.updateTilePositions();
        this.updateUI();
        this.notifyNavigation('goto');

        return true;
    };

    /**
     * Navigate to the first file
     */
    proto.goToFirst = function() {
        return this.goToIndex(0);
    };

    /**
     * Navigate to the last file
     */
    proto.goToLast = function() {
        return this.goToIndex(this.navigationFiles.length - 1);
    };

    /**
     * Check if there's a next file
     * @returns {boolean}
     */
    proto.hasNext = function() {
        return this.currentIndex < this.navigationFiles.length - 1;
    };

    /**
     * Check if there's a previous file
     * @returns {boolean}
     */
    proto.hasPrev = function() {
        return this.currentIndex > 0;
    };

    /**
     * Notify listeners of navigation
     * @param {string} direction
     */
    proto.notifyNavigation = function(direction) {
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
    };

    // ==========================================
    // Navigation Set Management
    // ==========================================

    /**
     * Update the navigation set (e.g., when filter changes)
     * @param {number[]} newFileIds
     */
    proto.updateNavigationSet = function(newFileIds) {
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
    };
})();
