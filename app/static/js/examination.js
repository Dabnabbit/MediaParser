/**
 * Examination Handler
 *
 * Manages the file examination modal using native <dialog>.
 * Features:
 * - Single file detailed view
 * - Prev/Next navigation within selection or all files
 * - Keyboard shortcuts (arrows, escape)
 * - Loads full file details from API
 */

class ExaminationHandler {
    constructor() {
        this.dialog = document.getElementById('examination-dialog');
        this.files = [];           // Files to navigate through
        this.currentIndex = 0;
        this.currentFile = null;

        // Cache DOM elements
        this.elements = {
            image: document.getElementById('exam-image'),
            loading: document.getElementById('exam-loading'),
            filename: document.getElementById('exam-filename'),
            position: document.getElementById('exam-position'),
            prevBtn: document.getElementById('exam-prev'),
            nextBtn: document.getElementById('exam-next'),
            closeBtn: document.getElementById('exam-close'),
            filesize: document.getElementById('exam-filesize'),
            mimetype: document.getElementById('exam-mimetype'),
            dimensions: document.getElementById('exam-dimensions'),
            confidence: document.getElementById('exam-confidence'),
            timestampContainer: document.getElementById('timestamp-sources-container'),
            tagsContainer: document.getElementById('tags-container'),
            confirmBtn: document.getElementById('exam-confirm'),
            unreviewBtn: document.getElementById('exam-unreview')
        };

        this.initEventListeners();
    }

    initEventListeners() {
        // Listen for file examination requests
        window.addEventListener('fileExamine', (e) => {
            const { fileId, selectedIds, files } = e.detail;
            this.open(files, fileId, selectedIds);
        });

        // Navigation buttons
        this.elements.prevBtn?.addEventListener('click', () => this.previous());
        this.elements.nextBtn?.addEventListener('click', () => this.next());
        this.elements.closeBtn?.addEventListener('click', () => this.close());

        // Dialog keyboard handling (native dialog handles Escape)
        this.dialog?.addEventListener('keydown', (e) => {
            if (e.defaultPrevented) return;

            switch (e.key) {
                case 'ArrowLeft':
                    this.previous();
                    e.preventDefault();
                    break;
                case 'ArrowRight':
                    this.next();
                    e.preventDefault();
                    break;
                case 'Enter':
                    if (e.ctrlKey || e.metaKey) {
                        // Ctrl+Enter = Confirm & Next
                        if (!this.currentFile?.reviewed_at) {
                            this.confirmAndNext();
                            e.preventDefault();
                        }
                    }
                    break;
            }
        });

        // Click outside to close (on backdrop)
        this.dialog?.addEventListener('click', (e) => {
            if (e.target === this.dialog) {
                this.close();
            }
        });

        // Dialog close event (handles Escape automatically)
        this.dialog?.addEventListener('close', () => {
            this.onClose();
        });

        // Action buttons
        this.elements.confirmBtn?.addEventListener('click', () => this.confirmAndNext());
        this.elements.unreviewBtn?.addEventListener('click', () => this.unreviewFile());
    }

    open(files, targetFileId, selectedIds = []) {
        // Determine which files to navigate
        if (selectedIds && selectedIds.length > 1) {
            // Multiple selection - navigate through selected files
            this.files = files.filter(f => selectedIds.includes(f.id));
        } else {
            // Single or no selection - navigate all files
            this.files = files;
        }

        // Find index of target file
        this.currentIndex = this.files.findIndex(f => f.id === targetFileId);
        if (this.currentIndex === -1) this.currentIndex = 0;

        // Show dialog
        this.dialog?.showModal();

        // Load current file
        this.loadCurrentFile();
    }

    close() {
        this.dialog?.close();
    }

    onClose() {
        // Cleanup when dialog closes
        this.currentFile = null;
        if (this.elements.image) {
            this.elements.image.src = '';
        }

        // Reset timestamp handler
        if (window.timestampHandler) {
            window.timestampHandler.reset();
        }

        // Reset tags handler
        if (window.tagsHandler) {
            window.tagsHandler.reset();
        }
    }

    previous() {
        if (this.currentIndex > 0) {
            this.currentIndex--;
            this.loadCurrentFile();
        }
    }

    next() {
        if (this.currentIndex < this.files.length - 1) {
            this.currentIndex++;
            this.loadCurrentFile();
        }
    }

    async loadCurrentFile() {
        const file = this.files[this.currentIndex];
        if (!file) return;

        // Update navigation state
        this.updateNavigation();

        // Show loading
        this.showLoading(true);

        try {
            // Fetch full file details from API
            const response = await fetch(`/api/files/${file.id}`);
            if (!response.ok) throw new Error('Failed to load file');

            this.currentFile = await response.json();
            this.render();

            // Notify timestamp handler if available
            if (window.timestampHandler) {
                window.timestampHandler.loadForFile(this.currentFile);
            }

            // Notify tags handler if available
            if (window.tagsHandler) {
                window.tagsHandler.loadForFile(this.currentFile);
            }

        } catch (error) {
            console.error('Error loading file:', error);
            this.showError('Failed to load file details');
        } finally {
            this.showLoading(false);
        }
    }

    render() {
        const file = this.currentFile;
        if (!file) return;

        // Preview image
        const imgSrc = file.thumbnail_path
            ? `/${file.thumbnail_path}`
            : '/static/img/placeholder.svg';
        this.elements.image.src = imgSrc;
        this.elements.image.alt = file.original_filename;

        // Filename
        this.elements.filename.textContent = file.original_filename;
        this.elements.filename.title = file.original_filename;

        // File info
        this.elements.filesize.textContent = this.formatFileSize(file.file_size_bytes);
        this.elements.mimetype.textContent = file.mime_type || 'Unknown';
        this.elements.dimensions.textContent = this.formatDimensions(file);
        this.elements.confidence.textContent = file.confidence?.toUpperCase() || 'Unknown';
        this.elements.confidence.className = `confidence-badge confidence-${file.confidence}`;

        // Action buttons based on reviewed state
        const isReviewed = !!file.reviewed_at;
        if (this.elements.confirmBtn) {
            this.elements.confirmBtn.style.display = isReviewed ? 'none' : '';
        }
        if (this.elements.unreviewBtn) {
            this.elements.unreviewBtn.style.display = isReviewed ? '' : 'none';
        }
    }

    updateNavigation() {
        const total = this.files.length;
        const current = this.currentIndex + 1;

        this.elements.position.textContent = `${current} of ${total}`;

        // Enable/disable nav buttons
        this.elements.prevBtn.disabled = this.currentIndex === 0;
        this.elements.nextBtn.disabled = this.currentIndex === total - 1;
    }

    showLoading(show) {
        if (this.elements.loading) {
            this.elements.loading.style.display = show ? 'flex' : 'none';
        }
    }

    showError(message) {
        // Simple error display
        this.elements.filename.textContent = 'Error';
        this.elements.timestampContainer.innerHTML = `<p class="error">${message}</p>`;
    }

    async confirmAndNext() {
        if (!this.currentFile) return;

        // Get selected timestamp from timestamp handler
        const selectedTimestamp = window.timestampHandler?.getSelectedTimestamp();

        // For files without timestamp sources, allow confirming with detected_timestamp
        const timestampToSave = selectedTimestamp || {
            value: this.currentFile.detected_timestamp,
            source: this.currentFile.timestamp_source || 'detected'
        };

        if (!timestampToSave?.value) {
            alert('Please select or enter a timestamp first');
            return;
        }

        // Disable button during save
        if (this.elements.confirmBtn) {
            this.elements.confirmBtn.disabled = true;
            this.elements.confirmBtn.textContent = 'Saving...';
        }

        try {
            // Submit review decision
            const response = await fetch(`/api/files/${this.currentFile.id}/review`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    final_timestamp: timestampToSave.value,
                    source: timestampToSave.source
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to save review');
            }

            const updatedFile = await response.json();

            // Update local file data
            this.currentFile.reviewed_at = updatedFile.reviewed_at;
            this.currentFile.final_timestamp = updatedFile.final_timestamp;

            // Update files array
            const fileInList = this.files.find(f => f.id === this.currentFile.id);
            if (fileInList) {
                fileInList.reviewed_at = updatedFile.reviewed_at;
                fileInList.final_timestamp = updatedFile.final_timestamp;
            }

            // Update grid and counts
            this.updateGridItem(this.currentFile.id, {
                reviewed_at: updatedFile.reviewed_at,
                final_timestamp: updatedFile.final_timestamp
            });
            this.refreshFilterCounts();

            // Move to next unreviewed file or next file
            this.moveToNextUnreviewed();

        } catch (error) {
            console.error('Error saving review:', error);
            alert(`Failed to save review: ${error.message}`);
        } finally {
            if (this.elements.confirmBtn) {
                this.elements.confirmBtn.disabled = false;
                this.elements.confirmBtn.textContent = 'Confirm & Next';
            }
        }
    }

    moveToNextUnreviewed() {
        // Find next unreviewed file after current index
        for (let i = this.currentIndex + 1; i < this.files.length; i++) {
            if (!this.files[i].reviewed_at) {
                this.currentIndex = i;
                this.loadCurrentFile();
                return;
            }
        }

        // No more unreviewed files after current - check before
        for (let i = 0; i < this.currentIndex; i++) {
            if (!this.files[i].reviewed_at) {
                this.currentIndex = i;
                this.loadCurrentFile();
                return;
            }
        }

        // All files reviewed
        this.showAllReviewedMessage();
    }

    showAllReviewedMessage() {
        // Show completion message in examination view
        const unreviewedCount = this.files.filter(f => !f.reviewed_at).length;

        if (unreviewedCount === 0) {
            // All done!
            const proceed = confirm(
                'All files in this selection have been reviewed!\n\n' +
                'Would you like to close the review and return to the grid?'
            );
            if (proceed) {
                this.close();

                // Optionally prompt for output generation
                window.dispatchEvent(new CustomEvent('allFilesReviewed'));
            }
        } else {
            // Just move to next
            this.next();
        }
    }

    refreshFilterCounts() {
        // Trigger a count refresh
        if (window.resultsHandler) {
            window.resultsHandler.loadSummary();
        }
    }

    async unreviewFile() {
        if (!this.currentFile) return;

        if (this.elements.unreviewBtn) {
            this.elements.unreviewBtn.disabled = true;
            this.elements.unreviewBtn.textContent = 'Removing...';
        }

        try {
            const response = await fetch(`/api/files/${this.currentFile.id}/review`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to unreview');
            }

            // Clear reviewed state
            this.currentFile.reviewed_at = null;
            this.currentFile.final_timestamp = null;

            // Update files array
            const fileInList = this.files.find(f => f.id === this.currentFile.id);
            if (fileInList) {
                fileInList.reviewed_at = null;
                fileInList.final_timestamp = null;
            }

            // Update UI
            this.render();
            this.updateGridItem(this.currentFile.id, { reviewed_at: null, final_timestamp: null });
            this.refreshFilterCounts();

        } catch (error) {
            console.error('Error unreviewing:', error);
            alert(`Failed to unreview: ${error.message}`);
        } finally {
            if (this.elements.unreviewBtn) {
                this.elements.unreviewBtn.disabled = false;
                this.elements.unreviewBtn.textContent = 'Unreview';
            }
        }
    }

    updateGridItem(fileId, updates) {
        // Update the file in resultsHandler's data
        if (window.resultsHandler) {
            const file = window.resultsHandler.allFiles.find(f => f.id === fileId);
            if (file) {
                Object.assign(file, updates);
            }
        }

        // Update visual in grid
        const thumb = document.querySelector(`.thumbnail[data-file-id="${fileId}"]`);
        if (thumb && updates.reviewed_at) {
            // Add reviewed badge
            let badgeRight = thumb.querySelector('.badge-right');
            if (badgeRight && !badgeRight.querySelector('.reviewed')) {
                badgeRight.innerHTML = '<span class="thumb-badge reviewed">&#10003;</span>' + badgeRight.innerHTML;
            }
        } else if (thumb && updates.reviewed_at === null) {
            // Remove reviewed badge
            thumb.querySelector('.thumb-badge.reviewed')?.remove();
        }
    }

    formatFileSize(bytes) {
        if (!bytes) return 'Unknown';
        const units = ['B', 'KB', 'MB', 'GB'];
        let size = bytes;
        let unitIndex = 0;
        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }
        return `${size.toFixed(1)} ${units[unitIndex]}`;
    }

    formatDimensions(file) {
        // Dimensions may come from EXIF data or stored separately
        if (file.width && file.height) {
            return `${file.width} x ${file.height}`;
        }
        return 'Unknown';
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.examinationHandler = new ExaminationHandler();
    });
} else {
    window.examinationHandler = new ExaminationHandler();
}
