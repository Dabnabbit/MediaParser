/**
 * Timestamp Handler
 *
 * Manages timestamp source display and selection in examination view.
 * Features:
 * - Displays all detected timestamp sources
 * - Shows system recommendation
 * - Allows source selection via click
 * - Manual entry with Chrono parsing
 * - PRE-FILLS manual entry with recommended timestamp (per CONTEXT.md)
 */

class TimestampHandler {
    constructor() {
        this.container = document.getElementById('timestamp-sources-container');
        this.currentFile = null;
        this.sources = [];
        this.selectedSource = null;
        this.manualTimestamp = null;
        this.recommendedTimestamp = null;  // Store for pre-fill

        // Weight labels for tooltips
        this.weightLabels = {
            'exif_datetime_original': { label: 'EXIF DateTimeOriginal', weight: 10 },
            'exif_datetime_digitized': { label: 'EXIF DateTimeDigitized', weight: 8 },
            'exif_datetime': { label: 'EXIF DateTime', weight: 6 },
            'filename_pattern': { label: 'Filename Pattern', weight: 3 },
            'filename_date': { label: 'Filename Date', weight: 2 },
            'file_modified': { label: 'File Modified', weight: 1 },
            'file_created': { label: 'File Created', weight: 1 },
            'manual': { label: 'Manual Entry', weight: 0 }
        };
    }

    loadForFile(file) {
        this.currentFile = file;
        this.selectedSource = null;
        this.manualTimestamp = null;
        this.recommendedTimestamp = null;

        // Parse timestamp_candidates from JSON string if needed
        let candidates = file.timestamp_candidates;
        if (typeof candidates === 'string') {
            try {
                candidates = JSON.parse(candidates);
            } catch (e) {
                candidates = [];
            }
        }

        this.sources = candidates || [];

        // Determine recommended timestamp for pre-fill
        this.determineRecommendedTimestamp();

        this.render();
    }

    determineRecommendedTimestamp() {
        // Sort sources by weight (highest first)
        const sortedSources = [...this.sources].sort((a, b) => {
            const weightA = this.weightLabels[a.source]?.weight || 0;
            const weightB = this.weightLabels[b.source]?.weight || 0;
            return weightB - weightA;
        });

        // Find recommended (highest weight with valid date)
        const recommended = sortedSources.find(s => s.value);
        if (recommended?.value) {
            this.recommendedTimestamp = recommended.value;
        } else if (this.currentFile?.detected_timestamp) {
            this.recommendedTimestamp = this.currentFile.detected_timestamp;
        }
    }

    render() {
        if (!this.container) return;

        if (this.sources.length === 0 && !this.currentFile?.detected_timestamp) {
            this.container.innerHTML = `
                <p class="no-sources">No timestamp sources detected</p>
                ${this.renderManualEntry()}
            `;
            this.attachEventListeners();
            return;
        }

        // Sort sources by weight (highest first)
        const sortedSources = [...this.sources].sort((a, b) => {
            const weightA = this.weightLabels[a.source]?.weight || 0;
            const weightB = this.weightLabels[b.source]?.weight || 0;
            return weightB - weightA;
        });

        // Find recommended (highest weight with valid date)
        const recommended = sortedSources.find(s => s.value) || sortedSources[0];

        // Pre-select the recommended source
        if (!this.selectedSource) {
            this.selectedSource = recommended?.source;
        }

        // Render timeline visualization (simplified)
        let html = '<div class="timestamp-sources">';

        sortedSources.forEach(source => {
            const isSelected = this.selectedSource === source.source;
            const isRecommended = source === recommended;
            const labelInfo = this.weightLabels[source.source] || { label: source.source, weight: 0 };
            const formattedDate = this.formatTimestamp(source.value);

            html += `
                <div class="timestamp-source ${isSelected ? 'selected' : ''} ${isRecommended ? 'recommended' : ''}"
                     data-source="${source.source}"
                     data-value="${source.value || ''}"
                     title="Weight: ${labelInfo.weight}">
                    <div class="source-radio">
                        <input type="radio" name="timestamp-source"
                               id="ts-${source.source}"
                               ${isSelected ? 'checked' : ''}
                               value="${source.source}">
                    </div>
                    <div class="source-info">
                        <label for="ts-${source.source}">
                            ${isRecommended ? '<span class="recommended-badge">Recommended</span>' : ''}
                            <span class="source-label">${labelInfo.label}</span>
                        </label>
                        <time class="source-time">${formattedDate}</time>
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
        const isManualSelected = this.selectedSource === 'manual';

        // PRE-FILL with recommended timestamp (per CONTEXT.md)
        // Format the recommended timestamp for the input field
        let prefilledValue = '';
        if (this.recommendedTimestamp) {
            try {
                const date = new Date(this.recommendedTimestamp);
                if (!isNaN(date.getTime())) {
                    // Format as YYYY-MM-DD for cleaner display
                    prefilledValue = date.toISOString().split('T')[0];
                }
            } catch (e) {
                prefilledValue = '';
            }
        }

        const previewText = this.manualTimestamp
            ? `Parsed: ${this.formatTimestamp(this.manualTimestamp)}`
            : (prefilledValue ? `Pre-filled from recommended timestamp` : '');

        return `
            <div class="timestamp-source manual ${isManualSelected ? 'selected' : ''}" data-source="manual">
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
                        <span class="date-preview" id="date-preview">${previewText}</span>
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

                const source = row.dataset.source;
                this.selectSource(source, row.dataset.value);
            });

            const radio = row.querySelector('input[type="radio"]');
            radio?.addEventListener('change', () => {
                this.selectSource(row.dataset.source, row.dataset.value);
            });
        });

        // Manual entry input
        const manualInput = document.getElementById('manual-date-input');
        const preview = document.getElementById('date-preview');

        if (manualInput) {
            // If pre-filled, parse immediately
            if (manualInput.value) {
                const parsed = this.parseDate(manualInput.value);
                if (parsed) {
                    this.manualTimestamp = parsed.toISOString();
                }
            }

            manualInput.addEventListener('input', (e) => {
                const input = e.target.value.trim();
                if (input.length < 2) {
                    preview.textContent = '';
                    this.manualTimestamp = null;
                    return;
                }

                // Parse with Chrono
                const parsed = this.parseDate(input);
                if (parsed) {
                    preview.textContent = `Parsed: ${this.formatTimestamp(parsed.toISOString())}`;
                    preview.classList.remove('error');
                    this.manualTimestamp = parsed.toISOString();
                } else {
                    preview.textContent = 'Could not parse date';
                    preview.classList.add('error');
                    this.manualTimestamp = null;
                }
            });

            manualInput.addEventListener('focus', () => {
                this.selectSource('manual');
            });
        }
    }

    selectSource(source, value = null) {
        this.selectedSource = source;

        // Update visual state
        this.container.querySelectorAll('.timestamp-source').forEach(row => {
            row.classList.toggle('selected', row.dataset.source === source);
            const radio = row.querySelector('input[type="radio"]');
            if (radio) radio.checked = row.dataset.source === source;
        });

        // If selecting a non-manual source, store its value
        if (source !== 'manual' && value) {
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
        if (!this.selectedSource) return null;

        if (this.selectedSource === 'manual') {
            if (!this.manualTimestamp) return null;
            return {
                value: this.manualTimestamp,
                source: 'manual'
            };
        }

        // Find the source data
        const source = this.sources.find(s => s.source === this.selectedSource);
        if (!source) return null;

        return {
            value: source.value,
            source: source.source
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
        this.sources = [];
        this.selectedSource = null;
        this.manualTimestamp = null;
        this.recommendedTimestamp = null;
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
