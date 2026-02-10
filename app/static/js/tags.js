/**
 * Tags Handler
 *
 * Manages tag UI in both selection toolbar (quick add) and examination view (full management).
 * Features:
 * - Autocomplete from recent/common tags
 * - Quick add in toolbar (add only)
 * - Full management in examination (add/remove)
 * - Bulk operations on multiple files
 */

class TagsHandler {
    constructor() {
        // Cache for autocomplete
        this.recentTags = [];
        this.lastFetch = 0;
        this.CACHE_TTL = 60000; // 1 minute

        this.currentFile = null;
        this.currentTags = [];

        // DOM elements
        this.examinationContainer = document.getElementById('tags-container');
        this.quickTagInput = document.getElementById('quick-tag-input');
        this.addQuickTagBtn = document.getElementById('add-quick-tag');

        this.initEventListeners();
        this.loadRecentTags();
    }

    /**
     * Set the container element for rendering tags
     * Used by ViewportDetailsPanel to specify its own container
     * @param {HTMLElement} container
     */
    setContainer(container) {
        this.examinationContainer = container;
    }

    initEventListeners() {
        // Quick add in toolbar
        if (this.addQuickTagBtn) {
            this.addQuickTagBtn.addEventListener('click', () => this.addQuickTag());
        }

        if (this.quickTagInput) {
            // Enter key adds tag
            this.quickTagInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.addQuickTag();
                }
            });

            // Autocomplete setup
            this.setupAutocomplete(this.quickTagInput, 'quick-autocomplete');
        }
    }

    setupAutocomplete(input, containerId) {
        // Create autocomplete dropdown if it doesn't exist
        let dropdown = document.getElementById(containerId);
        if (!dropdown) {
            dropdown = document.createElement('div');
            dropdown.id = containerId;
            dropdown.className = 'tag-autocomplete';
            input.parentNode.appendChild(dropdown);
        }

        // Track active index for keyboard nav
        input._acActiveIndex = -1;

        // Show suggestions on input
        input.addEventListener('input', (e) => {
            input._acActiveIndex = -1;
            const value = e.target.value.trim().toLowerCase();
            this.showSuggestions(dropdown, value, input);
        });

        // Keyboard navigation for autocomplete
        input.addEventListener('keydown', (e) => {
            if (!dropdown.classList.contains('show')) return;
            const items = dropdown.querySelectorAll('.autocomplete-item');
            if (items.length === 0) return;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                input._acActiveIndex = Math.min(input._acActiveIndex + 1, items.length - 1);
                this._highlightItem(items, input._acActiveIndex);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                input._acActiveIndex = Math.max(input._acActiveIndex - 1, -1);
                this._highlightItem(items, input._acActiveIndex);
            } else if (e.key === 'Enter' && input._acActiveIndex >= 0) {
                e.preventDefault();
                input.value = items[input._acActiveIndex].dataset.tag;
                dropdown.classList.remove('show');
                input._acActiveIndex = -1;
            } else if (e.key === 'Escape') {
                dropdown.classList.remove('show');
                input._acActiveIndex = -1;
            }
        });

        // Hide on blur (with delay for click)
        input.addEventListener('blur', () => {
            setTimeout(() => {
                dropdown.classList.remove('show');
                input._acActiveIndex = -1;
            }, 200);
        });

        // Show on focus if has value
        input.addEventListener('focus', () => {
            const value = input.value.trim().toLowerCase();
            if (value.length > 0) {
                this.showSuggestions(dropdown, value, input);
            }
        });
    }

    _highlightItem(items, activeIndex) {
        items.forEach((item, i) => {
            item.classList.toggle('ac-active', i === activeIndex);
        });
    }

    showSuggestions(dropdown, query, input) {
        if (query.length === 0) {
            dropdown.classList.remove('show');
            return;
        }

        // Filter recent tags
        const matches = this.recentTags.filter(tag =>
            tag.name.includes(query) && tag.name !== query
        ).slice(0, 5);

        if (matches.length === 0) {
            dropdown.classList.remove('show');
            return;
        }

        dropdown.innerHTML = matches.map(tag => `
            <div class="autocomplete-item" data-tag="${tag.name}">
                ${tag.name}
                <span class="tag-count">(${tag.usage_count})</span>
            </div>
        `).join('');

        // Add click handlers
        dropdown.querySelectorAll('.autocomplete-item').forEach(item => {
            item.addEventListener('mousedown', (e) => {
                e.preventDefault();
                input.value = item.dataset.tag;
                dropdown.classList.remove('show');
                input._acActiveIndex = -1;
            });
        });

        dropdown.classList.add('show');
    }

    async loadRecentTags() {
        // Check cache
        if (Date.now() - this.lastFetch < this.CACHE_TTL && this.recentTags.length > 0) {
            return this.recentTags;
        }

        try {
            const response = await fetch('/api/tags?limit=20');
            if (response.ok) {
                const tags = await response.json();
                this.recentTags = tags;
                this.lastFetch = Date.now();
            }
        } catch (error) {
            console.warn('Failed to load recent tags:', error);
        }

        return this.recentTags;
    }

    async addQuickTag() {
        const input = this.quickTagInput;
        if (!input) return;

        const tagName = input.value.trim().toLowerCase();
        if (!tagName) return;

        // Get selected file IDs
        const selectedIds = window.selectionHandler?.getSelectedIds() || [];
        if (selectedIds.length === 0) {
            this.showToast('Please select files first', 'error');
            return;
        }

        try {
            // Bulk add tag
            const response = await fetch('/api/files/bulk/tags', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    file_ids: selectedIds,
                    tags: [tagName]
                })
            });

            if (!response.ok) throw new Error('Failed to add tags');

            const result = await response.json();
            console.log(`Added tag "${tagName}" to ${result.files_updated} files`);

            // Clear input
            input.value = '';

            // Refresh recent tags cache
            this.lastFetch = 0;
            this.loadRecentTags();

            // Show feedback
            this.showToast(`Added "${tagName}" to ${result.files_updated} files`);

        } catch (error) {
            console.error('Error adding tag:', error);
            this.showToast('Failed to add tag', 'error');
        }
    }

    // Called from examination handler
    loadForFile(file) {
        this.currentFile = file;
        this.currentTags = file.tags || [];
        this.renderExaminationTags();
    }

    renderExaminationTags() {
        if (!this.examinationContainer) return;

        // Inline layout: pills + input on one line, wrapping naturally
        const pillsHtml = this.currentTags.map(tag => `
            <span class="tag-pill" data-tag="${tag.name || tag}">
                ${tag.name || tag}
                <button class="tag-remove" title="Remove tag">&times;</button>
            </span>
        `).join('');

        const emptyHtml = this.currentTags.length === 0
            ? '<span class="tags-empty">No tags</span>'
            : '';

        this.examinationContainer.innerHTML = `
            ${emptyHtml}
            <div class="tags-list">${pillsHtml}</div>
            ${this.renderTagInput()}
        `;

        // Attach remove handlers
        this.examinationContainer.querySelectorAll('.tag-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const pill = e.target.closest('.tag-pill');
                const tagName = pill.dataset.tag;
                this.removeTag(tagName);
            });
        });

        // Setup autocomplete for examination input
        const examInput = this.examinationContainer.querySelector('.tag-input');
        if (examInput) {
            this.setupAutocomplete(examInput, 'exam-tag-autocomplete');

            examInput.addEventListener('keydown', (e) => {
                // Only handle Enter when no autocomplete item is actively selected
                // (autocomplete keyboard nav handles its own Enter)
                if (e.key === 'Enter' && (examInput._acActiveIndex === undefined || examInput._acActiveIndex < 0)) {
                    e.preventDefault();
                    this.addTagToCurrentFile(examInput.value);
                    examInput.value = '';
                }
            });
        }
    }

    renderTagInput() {
        return `
            <div class="tag-input-group">
                <input type="text" class="tag-input"
                       placeholder="Type tag, press Enter">
            </div>
        `;
    }

    async addTagToCurrentFile(tagName) {
        tagName = tagName.trim().toLowerCase();
        if (!tagName || !this.currentFile) return;

        try {
            const response = await fetch(`/api/files/${this.currentFile.id}/tags`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tags: [tagName] })
            });

            if (!response.ok) throw new Error('Failed to add tag');

            const result = await response.json();
            this.currentTags = result.tags || [];
            this.currentFile.tags = this.currentTags;
            this.renderExaminationTags();

            // Refresh cache
            this.lastFetch = 0;
            this.loadRecentTags();

        } catch (error) {
            console.error('Error adding tag:', error);
            this.showToast('Failed to add tag', 'error');
        }
    }

    async removeTag(tagName) {
        if (!this.currentFile) return;

        try {
            const response = await fetch(
                `/api/files/${this.currentFile.id}/tags/${encodeURIComponent(tagName)}`,
                { method: 'DELETE' }
            );

            if (!response.ok) throw new Error('Failed to remove tag');

            const result = await response.json();
            this.currentTags = result.tags || [];
            this.currentFile.tags = this.currentTags;
            this.renderExaminationTags();

        } catch (error) {
            console.error('Error removing tag:', error);
            this.showToast('Failed to remove tag', 'error');
        }
    }

    showToast(message, type = 'success') {
        window.showToast(message, type);
    }

    reset() {
        this.currentFile = null;
        this.currentTags = [];
        if (this.examinationContainer) {
            this.examinationContainer.innerHTML = '<p class="placeholder">No tags</p>';
        }
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.tagsHandler = new TagsHandler();
    });
} else {
    window.tagsHandler = new TagsHandler();
}
