/**
 * Timestamp Handler
 *
 * Manages timestamp source display and selection in examination view.
 * Features:
 * - Displays grouped timestamp options from backend
 * - Shows confidence levels and source agreement
 * - Highlights earliest and highest-scored options
 * - Manual entry with Chrono parsing
 */

class TimestampHandler {
    constructor() {
        this.container = document.getElementById('timestamp-sources-container');
        this.currentFile = null;
        this.options = [];  // Grouped options from backend
        this.selectedTimestamp = null;
        this.manualTimestamp = null;
    }

    /**
     * Set the container element for rendering timestamps
     * Used by ViewportDetailsPanel to specify its own container
     * @param {HTMLElement} container
     */
    setContainer(container) {
        this.container = container;
    }

    loadForFile(file) {
        this.currentFile = file;
        this.selectedTimestamp = null;
        this.manualTimestamp = null;

        // Use pre-processed options from backend
        this.options = file.timestamp_options || [];

        // Pre-select the backend's selected option (earliest)
        const selected = this.options.find(o => o.selected);
        if (selected) {
            this.selectedTimestamp = selected.timestamp;
        } else if (file.detected_timestamp) {
            this.selectedTimestamp = file.detected_timestamp;
        }

        this.render();
    }

    render() {
        if (!this.container) return;

        if (this.options.length === 0 && !this.currentFile?.detected_timestamp) {
            this.container.innerHTML = `
                <p class="no-sources">No timestamp sources detected</p>
                ${this.renderManualEntry()}
            `;
            this.attachEventListeners();
            return;
        }

        let html = '<div class="timestamp-sources">';

        this.options.forEach(option => {
            const isSelected = this.selectedTimestamp === option.timestamp;
            const formattedDate = this.formatTimestamp(option.timestamp);

            // Build description badges
            let badges = [];
            if (option.is_earliest && option.is_highest_scored) {
                badges.push('<span class="option-badge recommended">Recommended</span>');
            } else {
                if (option.is_earliest) {
                    badges.push('<span class="option-badge earliest">Earliest</span>');
                }
                if (option.is_highest_scored) {
                    badges.push('<span class="option-badge highest-scored">Most Reliable</span>');
                }
            }

            // Source count indicator
            const sourceInfo = option.source_count > 1
                ? `${option.source_count} sources agree`
                : '1 source';

            html += `
                <div class="timestamp-source ${isSelected ? 'selected' : ''} ${option.selected ? 'system-pick' : ''}"
                     data-timestamp="${option.timestamp}"
                     data-confidence="${option.confidence}">
                    <div class="source-radio">
                        <input type="radio" name="timestamp-source"
                               id="ts-${option.timestamp}"
                               ${isSelected ? 'checked' : ''}
                               value="${option.timestamp}">
                    </div>
                    <div class="source-info">
                        <label for="ts-${option.timestamp}">
                            <span class="source-time-primary">${formattedDate}</span>
                            ${badges.join('')}
                        </label>
                        <span class="source-meta">
                            <span class="confidence-badge confidence-${option.confidence}">${option.confidence.toUpperCase()}</span>
                            <span class="source-count">${sourceInfo}</span>
                        </span>
                    </div>
                </div>
            `;
        });

        html += '</div>';

        // Add manual entry section
        html += this.renderManualEntry();

        this.container.innerHTML = html;
        this.attachEventListeners();
    }

    renderManualEntry() {
        const isManualSelected = this.selectedTimestamp === 'manual';

        // Pre-fill with selected timestamp for editing
        let prefilledValue = '';
        if (this.selectedTimestamp && this.selectedTimestamp !== 'manual') {
            try {
                const date = new Date(this.selectedTimestamp);
                if (!isNaN(date.getTime())) {
                    prefilledValue = date.toISOString().split('T')[0];
                }
            } catch (e) {
                prefilledValue = '';
            }
        }

        const previewText = this.manualTimestamp
            ? `Parsed: ${this.formatTimestamp(this.manualTimestamp)}`
            : (prefilledValue ? `Pre-filled from selected date` : '');
        const previewClass = this.manualTimestamp ? 'parsed' : 'hint';

        return `
            <div class="timestamp-source manual ${isManualSelected ? 'selected' : ''}" data-timestamp="manual">
                <div class="source-radio">
                    <input type="radio" name="timestamp-source"
                           id="ts-manual"
                           ${isManualSelected ? 'checked' : ''}
                           value="manual">
                </div>
                <div class="source-info manual-entry">
                    <label for="ts-manual">
                        <span class="source-label">Manual Entry</span>
                    </label>
                    <div class="manual-input-group">
                        <input type="text"
                               id="manual-date-input"
                               class="form-input form-input-sm"
                               placeholder="e.g., Jan 2020, 2019-08-15, 2020"
                               value="${prefilledValue}">
                        <span class="date-preview ${previewClass}" id="date-preview">${previewText}</span>
                    </div>
                </div>
            </div>
        `;
    }

    attachEventListeners() {
        // Source selection via radio or row click
        this.container.querySelectorAll('.timestamp-source').forEach(row => {
            row.addEventListener('click', (e) => {
                // Don't trigger if clicking inside input
                if (e.target.tagName === 'INPUT' && e.target.type === 'text') return;

                const timestamp = row.dataset.timestamp;
                this.selectTimestamp(timestamp);
            });

            const radio = row.querySelector('input[type="radio"]');
            radio?.addEventListener('change', () => {
                this.selectTimestamp(row.dataset.timestamp);
            });
        });

        // Manual entry input
        const manualInput = document.getElementById('manual-date-input');
        const preview = document.getElementById('date-preview');

        if (manualInput) {
            // If pre-filled, parse immediately
            if (manualInput.value && this.selectedTimestamp === 'manual') {
                const parsed = this.parseDate(manualInput.value);
                if (parsed) {
                    this.manualTimestamp = parsed.toISOString();
                }
            }

            manualInput.addEventListener('input', (e) => {
                const input = e.target.value.trim();
                if (input.length < 2) {
                    preview.textContent = '';
                    preview.className = 'date-preview hint';
                    this.manualTimestamp = null;
                    return;
                }

                // Parse with Chrono
                const parsed = this.parseDate(input);
                if (parsed) {
                    preview.textContent = `Parsed: ${this.formatTimestamp(parsed.toISOString())}`;
                    preview.className = 'date-preview parsed';
                    this.manualTimestamp = parsed.toISOString();
                } else {
                    preview.textContent = 'Could not parse date';
                    preview.className = 'date-preview error';
                    this.manualTimestamp = null;
                }
            });

            manualInput.addEventListener('focus', () => {
                this.selectTimestamp('manual');
            });
        }
    }

    selectTimestamp(timestamp) {
        this.selectedTimestamp = timestamp;

        // Update visual state
        this.container.querySelectorAll('.timestamp-source').forEach(row => {
            row.classList.toggle('selected', row.dataset.timestamp === timestamp);
            const radio = row.querySelector('input[type="radio"]');
            if (radio) radio.checked = row.dataset.timestamp === timestamp;
        });

        // Clear manual timestamp if selecting a different option
        if (timestamp !== 'manual') {
            this.manualTimestamp = null;
        }
    }

    parseDate(input) {
        // Use Chrono if available
        if (typeof chrono !== 'undefined') {
            try {
                return chrono.parseDate(input);
            } catch (e) {
                console.warn('Chrono parse error:', e);
            }
        }

        // Fallback to native Date parsing
        const date = new Date(input);
        return isNaN(date.getTime()) ? null : date;
    }

    getSelectedTimestamp() {
        if (!this.selectedTimestamp) return null;

        if (this.selectedTimestamp === 'manual') {
            if (!this.manualTimestamp) return null;
            return {
                value: this.manualTimestamp,
                source: 'manual'
            };
        }

        return {
            value: this.selectedTimestamp,
            source: 'grouped'  // Indicates this came from a grouped option
        };
    }

    formatTimestamp(timestamp) {
        if (!timestamp) return 'No date';

        try {
            const date = new Date(timestamp);
            if (isNaN(date.getTime())) return timestamp;
            return date.toLocaleString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (e) {
            return timestamp;
        }
    }

    reset() {
        this.currentFile = null;
        this.options = [];
        this.selectedTimestamp = null;
        this.manualTimestamp = null;
        if (this.container) {
            this.container.innerHTML = '<p class="placeholder">Select a file to view timestamps</p>';
        }
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.timestampHandler = new TimestampHandler();
    });
} else {
    window.timestampHandler = new TimestampHandler();
}
