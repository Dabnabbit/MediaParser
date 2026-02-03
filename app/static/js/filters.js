/**
 * Filter Handler
 *
 * Manages filter chip state for the unified grid.
 * Filter chips are additive - selecting HIGH and MEDIUM shows both.
 * Empty selection shows all files (no filtering).
 */

class FilterHandler {
    constructor() {
        this.activeFilters = new Set();
        this.counts = {
            high: 0,
            medium: 0,
            low: 0,
            reviewed: 0,
            duplicates: 0,
            failed: 0,
            total: 0
        };

        // Cache DOM elements
        this.filterBar = document.getElementById('filter-bar');
        this.clearButton = document.getElementById('clear-filters');
        this.chips = document.querySelectorAll('.filter-chip');

        // Sort state
        this.sortField = 'detected_timestamp';
        this.sortOrder = 'asc';

        this.initEventListeners();
        this.loadState();
    }

    initEventListeners() {
        // Filter chip clicks
        this.chips.forEach(chip => {
            chip.addEventListener('click', (e) => {
                const filter = chip.dataset.filter;
                this.toggleFilter(filter);
            });
        });

        // Clear filters button
        if (this.clearButton) {
            this.clearButton.addEventListener('click', () => {
                this.clearFilters();
            });
        }

        // Sort select
        const sortSelect = document.getElementById('sort-select');
        if (sortSelect) {
            sortSelect.addEventListener('change', (e) => {
                this.sortField = e.target.value;
                this.saveState();
                this.emitChange();
            });
        }

        // Sort order button
        const sortOrder = document.getElementById('sort-order');
        if (sortOrder) {
            sortOrder.addEventListener('click', () => {
                this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
                sortOrder.dataset.order = this.sortOrder;
                sortOrder.innerHTML = this.sortOrder === 'asc' ? '&#x2191;' : '&#x2193;';
                sortOrder.title = this.sortOrder === 'asc' ? 'Sort ascending' : 'Sort descending';
                this.saveState();
                this.emitChange();
            });
        }
    }

    toggleFilter(filterName) {
        if (this.activeFilters.has(filterName)) {
            this.activeFilters.delete(filterName);
        } else {
            this.activeFilters.add(filterName);
        }
        this.updateChipStyles();
        this.updateClearButton();
        this.saveState();
        this.emitChange();
    }

    clearFilters() {
        this.activeFilters.clear();
        this.updateChipStyles();
        this.updateClearButton();
        this.saveState();
        this.emitChange();
    }

    updateChipStyles() {
        this.chips.forEach(chip => {
            const filter = chip.dataset.filter;
            const isActive = this.activeFilters.has(filter);
            chip.classList.toggle('active', isActive);
        });
    }

    updateClearButton() {
        if (this.clearButton) {
            this.clearButton.style.display = this.activeFilters.size > 0 ? '' : 'none';
        }
    }

    updateCounts(newCounts) {
        this.counts = { ...this.counts, ...newCounts };

        // Update count displays
        Object.keys(this.counts).forEach(key => {
            const countEl = document.querySelector(`[data-count="${key}"]`);
            if (countEl) {
                countEl.textContent = this.counts[key];
            }
        });

        // Hide chips with zero count (except 'reviewed' which shows progress)
        this.chips.forEach(chip => {
            const filter = chip.dataset.filter;
            const count = this.counts[filter] || 0;

            // Always show reviewed chip if there are files to review
            if (filter === 'reviewed') {
                chip.style.display = (this.counts.total || 0) > 0 ? '' : 'none';
            } else {
                chip.style.display = count > 0 ? '' : 'none';
            }
        });

        // Update clear filters button
        const hasActiveFilters = this.activeFilters.size > 0;
        if (this.clearButton) {
            this.clearButton.style.display = hasActiveFilters ? '' : 'none';
        }

        // Emit counts updated event for other components
        window.dispatchEvent(new CustomEvent('filterCountsUpdated', {
            detail: this.counts
        }));
    }

    getActiveFilters() {
        return Array.from(this.activeFilters);
    }

    getQueryParams() {
        const params = new URLSearchParams();

        // Confidence filters (high, medium, low)
        const confidenceFilters = this.getActiveFilters().filter(
            f => ['high', 'medium', 'low'].includes(f)
        );
        if (confidenceFilters.length > 0) {
            params.set('confidence', confidenceFilters.join(','));
        }

        // Reviewed filter
        if (this.activeFilters.has('reviewed')) {
            params.set('reviewed', 'true');
        }

        // Duplicates filter
        if (this.activeFilters.has('duplicates')) {
            params.set('has_duplicates', 'true');
        }

        // Failed filter - handled separately (different endpoint or param)
        if (this.activeFilters.has('failed')) {
            params.set('failed', 'true');
        }

        // Sort
        params.set('sort', this.sortField);
        params.set('order', this.sortOrder);

        return params;
    }

    saveState() {
        const state = {
            filters: this.getActiveFilters(),
            sortField: this.sortField,
            sortOrder: this.sortOrder
        };
        try {
            localStorage.setItem('filterState', JSON.stringify(state));
        } catch (e) {
            console.warn('Failed to save filter state:', e);
        }
    }

    loadState() {
        try {
            const saved = localStorage.getItem('filterState');
            if (saved) {
                const state = JSON.parse(saved);
                state.filters?.forEach(f => this.activeFilters.add(f));
                this.sortField = state.sortField || 'detected_timestamp';
                this.sortOrder = state.sortOrder || 'asc';

                // Update UI to match loaded state
                this.updateChipStyles();
                this.updateClearButton();

                const sortSelect = document.getElementById('sort-select');
                if (sortSelect) sortSelect.value = this.sortField;

                const sortOrderBtn = document.getElementById('sort-order');
                if (sortOrderBtn) {
                    sortOrderBtn.dataset.order = this.sortOrder;
                    sortOrderBtn.innerHTML = this.sortOrder === 'asc' ? '&#x2191;' : '&#x2193;';
                }
            }
        } catch (e) {
            console.warn('Failed to load filter state:', e);
        }
    }

    emitChange() {
        // Dispatch custom event for results handler to listen to
        window.dispatchEvent(new CustomEvent('filterChange', {
            detail: {
                filters: this.getActiveFilters(),
                queryParams: this.getQueryParams(),
                sortField: this.sortField,
                sortOrder: this.sortOrder
            }
        }));
    }

    reset() {
        this.activeFilters.clear();
        this.counts = { high: 0, medium: 0, low: 0, reviewed: 0, duplicates: 0, failed: 0, total: 0 };
        this.updateChipStyles();
        this.updateClearButton();
        this.chips.forEach(chip => chip.style.display = '');
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.filterHandler = new FilterHandler();
    });
} else {
    window.filterHandler = new FilterHandler();
}
