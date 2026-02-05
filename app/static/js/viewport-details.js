/**
 * ViewportDetailsPanel - Details panel for viewport examination mode
 *
 * Shows file information, timestamps, tags, and actions in a slide-out panel.
 * Integrates with timestampHandler and tagsHandler for full functionality.
 * Responds to viewport events to update content.
 */

class ViewportDetailsPanel {
    constructor() {
        this.panel = null;
        this.currentFile = null;
        this.currentMode = null;  // Track current filter mode for context-aware actions
        this.isVisible = false;

        // Create panel element
        this.createPanel();
        this.initEventListeners();
    }

    /**
     * Create the panel DOM structure
     */
    createPanel() {
        this.panel = document.createElement('aside');
        this.panel.className = 'viewport-details-panel';
        this.panel.innerHTML = `
            <header class="vp-panel-header">
                <h3>File Details</h3>
                <button class="vp-panel-close" title="Close panel">&times;</button>
            </header>
            <div class="vp-panel-content">
                <!-- File info section -->
                <section class="vp-detail-section">
                    <h4>File</h4>
                    <dl class="vp-detail-list">
                        <dt>Name</dt>
                        <dd id="vp-filename" class="vp-filename">-</dd>
                        <dt>Size</dt>
                        <dd id="vp-filesize">-</dd>
                        <dt>Type</dt>
                        <dd id="vp-mimetype">-</dd>
                        <dt>Dimensions</dt>
                        <dd id="vp-dimensions">-</dd>
                    </dl>
                </section>

                <!-- Status section -->
                <section class="vp-detail-section">
                    <h4>Status</h4>
                    <div id="vp-status-badges" class="vp-status-badges">
                        <span id="vp-badge-confidence" class="vp-badge">-</span>
                    </div>
                </section>

                <!-- Duplicate info (shown only in duplicates mode) -->
                <section class="vp-detail-section vp-duplicate-info" id="vp-duplicate-section" style="display: none;">
                    <h4>Duplicate Group</h4>
                    <div class="vp-duplicate-context">
                        <span id="vp-duplicate-position">1 of 3</span>
                        <p class="vp-duplicate-quality" id="vp-duplicate-quality"></p>
                    </div>
                </section>

                <!-- Similar info (shown only in similar mode) -->
                <section class="vp-detail-section vp-similar-info" id="vp-similar-section" style="display: none;">
                    <h4>Similar Group</h4>
                    <div class="vp-similar-context">
                        <span id="vp-similar-position">1 of 3</span>
                        <div class="vp-similar-meta">
                            <span class="similar-type-badge" id="vp-similar-type">burst</span>
                            <span class="similar-confidence" id="vp-similar-confidence">high confidence</span>
                        </div>
                    </div>
                </section>

                <!-- Timestamp section - populated by timestampHandler -->
                <section class="vp-detail-section" id="vp-timestamp-section">
                    <h4>Timestamp</h4>
                    <div id="vp-timestamp-container">
                        <p class="vp-placeholder">Loading timestamp sources...</p>
                    </div>
                </section>

                <!-- Tags section - populated by tagsHandler -->
                <section class="vp-detail-section" id="vp-tags-section">
                    <h4>Tags</h4>
                    <div id="vp-tags-container" class="vp-tags">
                        <p class="vp-placeholder">No tags</p>
                    </div>
                </section>
            </div>

            <footer class="vp-panel-actions" id="vp-panel-actions">
                <!-- Actions are dynamically populated based on mode -->
            </footer>
        `;

        document.body.appendChild(this.panel);

        // Cache element references
        this.elements = {
            closeBtn: this.panel.querySelector('.vp-panel-close'),
            filename: this.panel.querySelector('#vp-filename'),
            filesize: this.panel.querySelector('#vp-filesize'),
            mimetype: this.panel.querySelector('#vp-mimetype'),
            dimensions: this.panel.querySelector('#vp-dimensions'),
            statusBadges: this.panel.querySelector('#vp-status-badges'),
            timestampContainer: this.panel.querySelector('#vp-timestamp-container'),
            tagsContainer: this.panel.querySelector('#vp-tags-container'),
            duplicateSection: this.panel.querySelector('#vp-duplicate-section'),
            duplicatePosition: this.panel.querySelector('#vp-duplicate-position'),
            duplicateQuality: this.panel.querySelector('#vp-duplicate-quality'),
            similarSection: this.panel.querySelector('#vp-similar-section'),
            similarPosition: this.panel.querySelector('#vp-similar-position'),
            similarType: this.panel.querySelector('#vp-similar-type'),
            similarConfidence: this.panel.querySelector('#vp-similar-confidence'),
            actionsFooter: this.panel.querySelector('#vp-panel-actions'),
        };
    }

    /**
     * Initialize event listeners
     */
    initEventListeners() {
        // Close button
        this.elements.closeBtn?.addEventListener('click', () => {
            this.hide();
            window.dispatchEvent(new CustomEvent('viewportToggleDetails', {
                detail: { visible: false }
            }));
        });

        // Listen for viewport events
        window.addEventListener('viewportEnter', (e) => {
            this.currentMode = window.filterHandler?.getCurrentMode() || 'unreviewed';
            this.loadFile(e.detail.file);
            this.show();
        });

        window.addEventListener('viewportNavigate', (e) => {
            this.loadFile(e.detail.file);
        });

        // Hide panel when viewport exits
        window.addEventListener('viewportExit', () => {
            this.hide();
            this.reset();
        });

        // Toggle panel visibility
        window.addEventListener('viewportToggleDetails', (e) => {
            if (e.detail.visible) {
                this.show();
                if (e.detail.file) {
                    this.loadFile(e.detail.file);
                }
            } else {
                this.hide();
            }
        });

        // Listen for filter mode changes
        window.addEventListener('filterChange', (e) => {
            this.currentMode = e.detail?.mode || window.filterHandler?.getCurrentMode();
        });
    }

    /**
     * Show the panel
     */
    show() {
        this.isVisible = true;
        this.panel.classList.add('visible');
        document.body.classList.add('viewport-details-open');
    }

    /**
     * Hide the panel
     */
    hide() {
        this.isVisible = false;
        this.panel.classList.remove('visible');
        document.body.classList.remove('viewport-details-open');
    }

    /**
     * Toggle panel visibility
     */
    toggle() {
        if (this.isVisible) {
            this.hide();
        } else {
            this.show();
        }
    }

    /**
     * Reset panel to default state
     */
    reset() {
        this.currentFile = null;
        this.elements.filename.textContent = '-';
        this.elements.filesize.textContent = '-';
        this.elements.mimetype.textContent = '-';
        this.elements.dimensions.textContent = '-';
        this.elements.timestampContainer.innerHTML = '<p class="vp-placeholder">No timestamp data</p>';
        this.elements.tagsContainer.innerHTML = '<p class="vp-placeholder">No tags</p>';
        this.elements.duplicateSection.style.display = 'none';
        this.elements.similarSection.style.display = 'none';
        this.elements.actionsFooter.innerHTML = '';

        // Reset handlers
        if (window.timestampHandler) {
            window.timestampHandler.reset();
        }
        if (window.tagsHandler) {
            window.tagsHandler.reset();
        }
    }

    /**
     * Load file data into the panel
     * @param {Object} file - File data object
     */
    async loadFile(file) {
        if (!file) return;

        // If we only have basic data, fetch full details
        if (!file.detected_timestamp && file.id) {
            try {
                const response = await fetch(`/api/files/${file.id}`);
                if (response.ok) {
                    file = await response.json();
                }
            } catch (error) {
                console.error('Error fetching file details:', error);
            }
        }

        this.currentFile = file;
        this.renderFileDetails();

        // Notify timestamp handler
        if (window.timestampHandler) {
            // Use the viewport's timestamp container
            window.timestampHandler.setContainer(this.elements.timestampContainer);
            window.timestampHandler.loadForFile(file);
        }

        // Notify tags handler
        if (window.tagsHandler) {
            window.tagsHandler.setContainer(this.elements.tagsContainer);
            window.tagsHandler.loadForFile(file);
        }
    }

    /**
     * Render file details in the panel
     */
    renderFileDetails() {
        const file = this.currentFile;
        if (!file) return;

        // Basic info
        this.elements.filename.textContent = file.original_filename || '-';
        this.elements.filename.title = file.original_filename || '';
        this.elements.filesize.textContent = this.formatFileSize(file.file_size_bytes);
        this.elements.mimetype.textContent = file.mime_type || '-';
        this.elements.dimensions.textContent = this.formatDimensions(file);

        // Status badges
        this.renderStatusBadges(file);

        // Duplicate info (if in duplicates mode)
        this.renderDuplicateInfo(file);

        // Similar info (if in similar mode)
        this.renderSimilarInfo(file);

        // Action buttons (context-aware)
        this.renderActionButtons(file);
    }

    /**
     * Render status badges
     */
    renderStatusBadges(file) {
        const badges = [];

        // Confidence
        const confidence = file.confidence || 'none';
        badges.push(`<span class="vp-badge confidence-${confidence}">${confidence.toUpperCase()}</span>`);

        // Reviewed
        if (file.reviewed_at) {
            badges.push('<span class="vp-badge reviewed">Reviewed</span>');
        }

        // Discarded
        if (file.discarded) {
            badges.push('<span class="vp-badge discarded">Discarded</span>');
        }

        // Duplicate
        if (file.exact_group_id || file.is_duplicate) {
            badges.push('<span class="vp-badge duplicate">Duplicate</span>');
        }

        // Similar
        if (file.similar_group_id || file.is_similar) {
            badges.push('<span class="vp-badge similar">Similar</span>');
        }

        this.elements.statusBadges.innerHTML = badges.join('');
    }

    /**
     * Render duplicate group information
     */
    renderDuplicateInfo(file) {
        const section = this.elements.duplicateSection;
        const isDuplicateMode = this.currentMode === 'duplicates';
        const isDuplicate = file.exact_group_id || file.is_duplicate;

        if (!isDuplicateMode || !isDuplicate) {
            section.style.display = 'none';
            return;
        }

        section.style.display = '';

        // Get position info from viewport controller
        const vpState = window.selectionHandler?.viewportController?.getState();
        if (vpState) {
            this.elements.duplicatePosition.textContent =
                `${vpState.currentIndex + 1} of ${vpState.total} in group`;
        }

        // Quality info
        const isRecommended = file.is_recommended ||
            (window.examinationDataService?.getRecommendedId() === file.id);

        if (isRecommended) {
            this.elements.duplicateQuality.innerHTML =
                '<span class="vp-recommended">Recommended to keep</span> (highest quality)';
        } else {
            // Show quality metrics
            const metrics = [];
            if (file.width && file.height) {
                metrics.push(`${file.width}×${file.height}`);
            }
            if (file.file_size_bytes) {
                metrics.push(this.formatFileSize(file.file_size_bytes));
            }
            this.elements.duplicateQuality.textContent = metrics.join(' • ') || '';
        }
    }

    /**
     * Render similar group information
     */
    renderSimilarInfo(file) {
        const section = this.elements.similarSection;
        const isSimilarMode = this.currentMode === 'similar';
        const isSimilar = file.similar_group_id || file.is_similar;

        if (!isSimilarMode || !isSimilar) {
            section.style.display = 'none';
            return;
        }

        section.style.display = '';

        // Get position info from viewport controller
        const vpState = window.selectionHandler?.viewportController?.getState();
        if (vpState) {
            this.elements.similarPosition.textContent =
                `${vpState.currentIndex + 1} of ${vpState.total} in group`;
        }

        // Group type badge
        const groupType = file.similar_group_type || 'similar';
        this.elements.similarType.textContent = groupType;
        this.elements.similarType.setAttribute('data-type', groupType);

        // Confidence
        const confidence = file.similar_confidence || 'medium';
        this.elements.similarConfidence.textContent = `${confidence} confidence`;
    }

    /**
     * Render context-aware action buttons
     */
    renderActionButtons(file) {
        const footer = this.elements.actionsFooter;
        const isReviewed = !!file.reviewed_at;
        const isDiscarded = !!file.discarded;
        const isDuplicate = file.exact_group_id || file.is_duplicate;
        const isSimilar = file.similar_group_id || file.is_similar;
        const mode = this.currentMode;

        let html = '';

        if (mode === 'duplicates' && isDuplicate) {
            // Duplicate mode actions
            if (!isDiscarded) {
                html += `
                    <button class="btn btn-success vp-action" id="vp-keep-duplicate">
                        Keep This, Discard Others
                    </button>
                    <button class="btn btn-secondary vp-action" id="vp-not-duplicate">
                        Not a Duplicate
                    </button>
                    <div class="vp-action-divider"></div>
                    <button class="btn btn-danger vp-action" id="vp-discard">
                        Discard
                    </button>
                `;
            } else {
                html += `
                    <button class="btn btn-secondary vp-action" id="vp-undiscard">
                        Restore
                    </button>
                `;
            }
        } else if (mode === 'similar' && isSimilar) {
            // Similar mode actions
            if (!isDiscarded) {
                html += `
                    <button class="btn btn-success vp-action" id="vp-keep-similar">
                        Keep This, Discard Others
                    </button>
                    <button class="btn btn-secondary vp-action" id="vp-keep-all-similar">
                        Keep All
                    </button>
                    <button class="btn btn-secondary vp-action" id="vp-not-similar">
                        Not Similar
                    </button>
                    <div class="vp-action-divider"></div>
                    <button class="btn btn-danger vp-action" id="vp-discard">
                        Discard
                    </button>
                `;
            } else {
                html += `
                    <button class="btn btn-secondary vp-action" id="vp-undiscard">
                        Restore
                    </button>
                `;
            }
        } else if (mode === 'discarded') {
            // Discarded mode - only restore action
            html += `
                <button class="btn btn-secondary vp-action" id="vp-undiscard">
                    Restore
                </button>
            `;
        } else {
            // Standard review mode actions
            if (!isDiscarded && !isReviewed) {
                html += `
                    <button class="btn btn-primary vp-action" id="vp-confirm">
                        Confirm & Next
                    </button>
                `;
            }
            if (!isDiscarded && isReviewed) {
                html += `
                    <button class="btn btn-secondary vp-action" id="vp-unreview">
                        Clear Review
                    </button>
                `;
            }
            if (!isDiscarded) {
                html += `
                    <div class="vp-action-divider"></div>
                    <button class="btn btn-danger vp-action" id="vp-discard">
                        Discard
                    </button>
                `;
            }
            if (isDiscarded) {
                html += `
                    <button class="btn btn-secondary vp-action" id="vp-undiscard">
                        Restore
                    </button>
                `;
            }
        }

        footer.innerHTML = html;

        // Attach event listeners
        this.attachActionListeners();
    }

    /**
     * Attach event listeners to action buttons
     */
    attachActionListeners() {
        const footer = this.elements.actionsFooter;

        footer.querySelector('#vp-confirm')?.addEventListener('click', () => this.confirmAndNext());
        footer.querySelector('#vp-unreview')?.addEventListener('click', () => this.unreviewFile());
        footer.querySelector('#vp-discard')?.addEventListener('click', () => this.discardFile());
        footer.querySelector('#vp-undiscard')?.addEventListener('click', () => this.undiscardFile());
        footer.querySelector('#vp-keep-duplicate')?.addEventListener('click', () => this.keepDuplicate());
        footer.querySelector('#vp-not-duplicate')?.addEventListener('click', () => this.markNotDuplicate());
        footer.querySelector('#vp-keep-similar')?.addEventListener('click', () => this.keepSimilar());
        footer.querySelector('#vp-keep-all-similar')?.addEventListener('click', () => this.keepAllSimilar());
        footer.querySelector('#vp-not-similar')?.addEventListener('click', () => this.markNotSimilar());
    }

    // ==========================================
    // Actions
    // ==========================================

    async confirmAndNext() {
        if (!this.currentFile) return;

        const btn = this.elements.actionsFooter.querySelector('#vp-confirm');
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Saving...';
        }

        try {
            // Get selected timestamp from timestamp handler or use detected
            const selectedTimestamp = window.timestampHandler?.getSelectedTimestamp();
            const timestampToSave = selectedTimestamp || {
                value: this.currentFile.detected_timestamp,
                source: this.currentFile.timestamp_source || 'detected'
            };

            const response = await fetch(`/api/files/${this.currentFile.id}/review`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    final_timestamp: timestampToSave.value,
                    source: timestampToSave.source
                })
            });

            if (!response.ok) throw new Error('Failed to save review');

            const updated = await response.json();
            this.currentFile.reviewed_at = updated.reviewed_at;
            this.currentFile.final_timestamp = updated.final_timestamp;

            // Update UI and move to next
            this.renderFileDetails();
            this.navigateToNext();
            window.resultsHandler?.loadSummary();

        } catch (error) {
            console.error('Error confirming:', error);
            alert('Failed to save review');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Confirm & Next';
            }
        }
    }

    async unreviewFile() {
        if (!this.currentFile) return;

        const btn = this.elements.actionsFooter.querySelector('#vp-unreview');
        if (btn) btn.disabled = true;

        try {
            const response = await fetch(`/api/files/${this.currentFile.id}/review`, {
                method: 'DELETE'
            });

            if (!response.ok) throw new Error('Failed to unreview');

            this.currentFile.reviewed_at = null;
            this.currentFile.final_timestamp = null;

            this.renderFileDetails();
            window.resultsHandler?.loadSummary();

        } catch (error) {
            console.error('Error unreviewing:', error);
            alert('Failed to unreview');
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    async discardFile() {
        if (!this.currentFile) return;

        if (!confirm(`Discard "${this.currentFile.original_filename}"?`)) return;

        const btn = this.elements.actionsFooter.querySelector('#vp-discard');
        if (btn) btn.disabled = true;

        try {
            const response = await fetch(`/api/files/${this.currentFile.id}/discard`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            if (!response.ok) throw new Error('Failed to discard');

            this.currentFile.discarded = true;
            this.renderFileDetails();
            this.navigateToNext();
            window.resultsHandler?.loadSummary();

        } catch (error) {
            console.error('Error discarding:', error);
            alert('Failed to discard');
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    async undiscardFile() {
        if (!this.currentFile) return;

        const btn = this.elements.actionsFooter.querySelector('#vp-undiscard');
        if (btn) btn.disabled = true;

        try {
            const response = await fetch(`/api/files/${this.currentFile.id}/discard`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' }
            });

            if (!response.ok) throw new Error('Failed to restore');

            this.currentFile.discarded = false;
            this.renderFileDetails();
            window.resultsHandler?.loadSummary();

        } catch (error) {
            console.error('Error restoring:', error);
            alert('Failed to restore');
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    async keepDuplicate() {
        if (!this.currentFile) return;

        const viewportController = window.selectionHandler?.viewportController;
        if (!viewportController) return;

        // Get all files in the navigation set (the duplicate group)
        const allIds = viewportController.navigationFiles;
        const currentId = this.currentFile.id;
        const othersToDiscard = allIds.filter(id => id !== currentId);

        if (othersToDiscard.length === 0) {
            // Only one file, nothing to discard
            this.exitViewportAndRefresh();
            return;
        }

        const confirmMsg = `Keep "${this.currentFile.original_filename}" and discard ${othersToDiscard.length} other file(s)?`;
        if (!confirm(confirmMsg)) return;

        const btn = this.elements.actionsFooter.querySelector('#vp-keep-duplicate');
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Keeping...';
        }

        try {
            // Discard all other files in the group
            const response = await fetch('/api/files/bulk/discard', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    file_ids: othersToDiscard,
                    reason: 'duplicate_resolution'
                })
            });

            if (!response.ok) throw new Error('Failed to discard duplicates');

            // Also clear the kept file's duplicate status
            await fetch('/api/files/bulk/not-duplicate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ file_ids: [currentId] })
            });

            // Exit viewport and refresh
            this.exitViewportAndRefresh();

        } catch (error) {
            console.error('Error keeping duplicate:', error);
            alert(`Failed to resolve duplicates: ${error.message}`);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Keep This, Discard Others';
            }
        }
    }

    async markNotDuplicate() {
        if (!this.currentFile) return;

        const filename = this.currentFile.original_filename;
        if (!confirm(`Remove "${filename}" from the duplicate group?`)) return;

        const btn = this.elements.actionsFooter.querySelector('#vp-not-duplicate');
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Removing...';
        }

        try {
            const response = await fetch('/api/files/bulk/not-duplicate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ file_ids: [this.currentFile.id] })
            });

            if (!response.ok) throw new Error('Failed to remove from duplicate group');

            // Update navigation - remove this file from the set
            const viewportController = window.selectionHandler?.viewportController;
            if (viewportController) {
                const newNavFiles = viewportController.navigationFiles.filter(
                    id => id !== this.currentFile.id
                );

                if (newNavFiles.length === 0) {
                    // No more duplicates to review
                    this.exitViewportAndRefresh();
                } else if (newNavFiles.length === 1) {
                    // Only one file left - it's no longer a duplicate
                    // Remove its duplicate status too
                    await fetch('/api/files/bulk/not-duplicate', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ file_ids: newNavFiles })
                    });
                    this.exitViewportAndRefresh();
                } else {
                    // Continue with remaining files
                    viewportController.updateNavigationSet(newNavFiles);
                }
            }

            window.resultsHandler?.loadSummary();

        } catch (error) {
            console.error('Error removing from duplicate group:', error);
            alert(`Failed to remove from duplicate group: ${error.message}`);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Not a Duplicate';
            }
        }
    }

    async keepSimilar() {
        if (!this.currentFile) return;

        const viewportController = window.selectionHandler?.viewportController;
        if (!viewportController) return;

        // Get similar group context
        const groupId = this.currentFile.similar_group_id;
        if (!groupId) {
            console.warn('No similar_group_id found on file');
            return;
        }

        // Get all files in the navigation set (the similar group)
        const allIds = viewportController.navigationFiles;
        const currentId = this.currentFile.id;
        const othersToDiscard = allIds.filter(id => id !== currentId);

        if (othersToDiscard.length === 0) {
            // Only one file, nothing to discard
            this.exitViewportAndRefresh();
            return;
        }

        const confirmMsg = `Keep "${this.currentFile.original_filename}" and discard ${othersToDiscard.length} other file(s)?`;
        if (!confirm(confirmMsg)) return;

        const btn = this.elements.actionsFooter.querySelector('#vp-keep-similar');
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Keeping...';
        }

        try {
            // Use similar group resolution endpoint
            const response = await fetch(`/api/similar-groups/${groupId}/resolve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    keep_file_ids: [currentId]
                })
            });

            if (!response.ok) throw new Error('Failed to resolve similar group');

            const result = await response.json();
            console.log('Similar group resolved:', result);

            // Exit viewport and refresh
            this.exitViewportAndRefresh();

        } catch (error) {
            console.error('Error keeping similar file:', error);
            alert(`Failed to resolve similar group: ${error.message}`);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Keep This, Discard Others';
            }
        }
    }

    async keepAllSimilar() {
        if (!this.currentFile) return;

        const groupId = this.currentFile.similar_group_id;
        if (!groupId) {
            console.warn('No similar_group_id found on file');
            return;
        }

        if (!confirm('Keep all files in this similar group?')) return;

        const btn = this.elements.actionsFooter.querySelector('#vp-keep-all-similar');
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Keeping All...';
        }

        try {
            const response = await fetch(`/api/similar-groups/${groupId}/keep-all`, {
                method: 'POST'
            });

            if (!response.ok) throw new Error('Failed to keep all similar files');

            const result = await response.json();
            console.log('All similar files kept:', result);

            // Exit viewport and refresh
            this.exitViewportAndRefresh();

        } catch (error) {
            console.error('Error keeping all similar files:', error);
            alert(`Failed to keep all: ${error.message}`);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Keep All';
            }
        }
    }

    async markNotSimilar() {
        if (!this.currentFile) return;

        const filename = this.currentFile.original_filename;
        if (!confirm(`Remove "${filename}" from the similar group?`)) return;

        const btn = this.elements.actionsFooter.querySelector('#vp-not-similar');
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Removing...';
        }

        try {
            const response = await fetch('/api/files/bulk/not-similar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ file_ids: [this.currentFile.id] })
            });

            if (!response.ok) throw new Error('Failed to remove from similar group');

            // Update navigation - remove this file from the set
            const viewportController = window.selectionHandler?.viewportController;
            if (viewportController) {
                const newNavFiles = viewportController.navigationFiles.filter(
                    id => id !== this.currentFile.id
                );

                if (newNavFiles.length === 0) {
                    // No more similar files to review
                    this.exitViewportAndRefresh();
                } else if (newNavFiles.length === 1) {
                    // Only one file left - it's no longer similar
                    // Remove its similar status too
                    await fetch('/api/files/bulk/not-similar', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ file_ids: newNavFiles })
                    });
                    this.exitViewportAndRefresh();
                } else {
                    // Continue with remaining files
                    viewportController.updateNavigationSet(newNavFiles);
                }
            }

            window.resultsHandler?.loadSummary();

        } catch (error) {
            console.error('Error removing from similar group:', error);
            alert(`Failed to remove from similar group: ${error.message}`);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Not Similar';
            }
        }
    }

    /**
     * Navigate to next file in viewport
     */
    navigateToNext() {
        const viewportController = window.selectionHandler?.viewportController;
        if (viewportController?.hasNext()) {
            viewportController.next();
        }
    }

    /**
     * Exit viewport and refresh the grid
     */
    exitViewportAndRefresh() {
        const viewportController = window.selectionHandler?.viewportController;
        if (viewportController) {
            viewportController.exit();
        }
        window.resultsHandler?.loadFiles();
        window.resultsHandler?.loadSummary();
    }

    // ==========================================
    // Utilities
    // ==========================================

    formatFileSize(bytes) {
        if (!bytes) return '-';
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
        if (file.width && file.height) {
            return `${file.width} × ${file.height}`;
        }
        return '-';
    }

    formatTimestamp(ts) {
        if (!ts) return '-';
        try {
            const date = new Date(ts);
            return date.toLocaleString();
        } catch {
            return ts;
        }
    }

    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.viewportDetailsPanel = new ViewportDetailsPanel();
    });
} else {
    window.viewportDetailsPanel = new ViewportDetailsPanel();
}
