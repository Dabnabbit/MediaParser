/**
 * ProgressHandler - Manages job progress polling and UI updates
 *
 * Works with unified job section that transforms from progress to results
 */
class ProgressHandler {
    constructor() {
        this.jobId = null;
        this.pollInterval = null;
        this.pollDelay = 1500; // 1.5 seconds for normal polling
        this.fastPollDelay = 300; // 300ms for initial fast polling
        this.fastPollCount = 0;
        this.maxFastPolls = 10; // First 10 polls are fast (3 seconds total)
        this.isProcessingPhase = false; // Track if we've transitioned from upload to processing
        this.pendingStartTime = null; // Track when job entered pending state
        this.pendingWarningShown = false; // Only show warning once
        this.PENDING_TIMEOUT_MS = 10000; // 10 seconds before warning

        // Job section elements
        this.jobSection = document.querySelector('[data-section="job"]');
        this.uploadArea = document.getElementById('upload-area');

        // Progress elements (layered fills)
        this.jobProgress = document.getElementById('job-progress');
        this.uploadFill = document.getElementById('upload-fill');
        this.processingFill = document.getElementById('processing-fill');
        this.reviewedOverlay = document.getElementById('reviewed-overlay');
        this.exportFill = document.getElementById('export-fill');
        this.workflowTrack = document.getElementById('workflow-track');
        this.modeSegments = document.getElementById('mode-segments');
        this.workflowPhases = document.getElementById('workflow-phases');
        this.statsArea = document.getElementById('stats-area');
        this.metricsRow = document.getElementById('metrics-row');
        this.filesProcessed = document.getElementById('files-processed');
        this.currentFilename = document.getElementById('current-filename');
        this.elapsedTime = document.getElementById('elapsed-time');
        this.eta = document.getElementById('eta');
        this.errorMetric = document.getElementById('error-metric');
        this.errorCount = document.getElementById('error-count');

        // Summary elements (shown when complete)
        this.jobSummary = document.getElementById('job-summary');
        this.summaryTotal = document.getElementById('summary-total');
        this.summarySuccess = document.getElementById('summary-success');
        this.summaryErrors = document.getElementById('summary-errors');
        this.summaryTime = document.getElementById('summary-time');

        // Control buttons
        this.jobControls = document.getElementById('job-controls');
        this.pauseBtn = document.getElementById('pause-btn');
        this.cancelBtn = document.getElementById('cancel-btn');

        this.initEventListeners();
        this.checkForExistingJob();
    }

    initEventListeners() {
        if (this.pauseBtn) {
            this.pauseBtn.addEventListener('click', () => this.handlePause());
        }
        if (this.cancelBtn) {
            this.cancelBtn.addEventListener('click', () => this.handleCancelOrNew());
        }
    }

    /**
     * Set the workflow phase breadcrumb
     */
    setPhase(phase) {
        if (!this.workflowPhases) return;
        const phases = this.workflowPhases.querySelectorAll('.phase');
        const order = ['upload', 'process', 'review', 'export'];
        const activeIdx = phase === 'done' ? order.length : order.indexOf(phase);

        phases.forEach(el => {
            const idx = order.indexOf(el.dataset.phase);
            el.classList.remove('active', 'completed');
            if (idx < activeIdx) {
                el.classList.add('completed');
            } else if (idx === activeIdx) {
                el.classList.add('active');
            }
        });
    }

    /**
     * Morph progress bar into mode segments (crossfade animation)
     */
    morphToModes() {
        // Fill processing to 100% first
        if (this.processingFill) {
            this.processingFill.style.width = '100%';
        }

        // After a brief pause, trigger the CSS crossfade
        setTimeout(() => {
            if (this.workflowTrack) {
                this.workflowTrack.dataset.state = 'review';
            }
            this.setPhase('review');
        }, 300);
    }

    /**
     * Show mode segments immediately (no animation), for page refresh
     */
    showModesDirectly() {
        if (this.workflowTrack) {
            this.workflowTrack.dataset.state = 'review';
        }
        // Set both fills to 100% instantly (no transition needed, they'll be hidden by review state)
        [this.uploadFill, this.processingFill].forEach(fill => {
            if (fill) {
                fill.style.transition = 'none';
                fill.style.width = '100%';
                void fill.offsetHeight;
                fill.style.transition = '';
            }
        });
        this.setPhase('review');
    }

    /**
     * Hide mode segments and reset workflow track
     */
    hideSegments() {
        if (this.workflowTrack) {
            delete this.workflowTrack.dataset.state;
        }
    }

    /**
     * Set tile state and update visibility of areas
     */
    setState(state) {
        if (this.jobSection) {
            this.jobSection.dataset.state = state;
            // Reset status color when going to idle or finalized
            if (state === 'idle' || state === 'finalized') {
                this.jobSection.dataset.status = '';
            }
        }

        // Update phase breadcrumb
        if (state === 'uploading') {
            this.setPhase('upload');
        } else if (state === 'processing') {
            this.setPhase(this.exportJobId ? 'export' : 'process');
        } else if (state === 'finalized') {
            this.setPhase('done');
        }
        // 'review' phase is set by morphToModes/showModesDirectly

        // Upload area: visible only in idle state
        if (this.uploadArea) {
            this.uploadArea.style.display = state === 'idle' ? 'block' : 'none';
        }

        // Progress area: visible in uploading, processing, and complete states
        if (this.jobProgress) {
            this.jobProgress.style.display = ['uploading', 'processing', 'complete', 'failed', 'finalized'].includes(state) ? 'block' : 'none';
        }

        // Controls visibility
        if (this.jobControls) {
            if (state === 'complete' || state === 'failed' || state === 'finalized') {
                this.jobControls.style.display = 'flex';
                if (this.pauseBtn) this.pauseBtn.style.display = 'none';
                if (this.cancelBtn) {
                    this.cancelBtn.style.display = 'inline-block';
                    this.cancelBtn.textContent = 'New';
                    this.cancelBtn.className = 'btn btn-primary btn-sm';
                }
            } else if (state === 'processing') {
                this.jobControls.style.display = 'flex';
                if (this.pauseBtn) this.pauseBtn.style.display = 'inline-block';
                if (this.cancelBtn) {
                    this.cancelBtn.style.display = 'inline-block';
                    this.cancelBtn.textContent = 'Cancel';
                    this.cancelBtn.className = 'btn btn-danger btn-sm';
                }
            } else {
                this.jobControls.style.display = 'none';
            }
        }
    }

    /**
     * Reset to idle state for new upload
     */
    resetToIdle() {
        this.stopPolling();
        this.isProcessingPhase = false;
        this.exportJobId = null;
        localStorage.removeItem('currentJobId');
        localStorage.removeItem('exportJobId');
        localStorage.removeItem('exportCleanupOptions');

        // Hide mode segments and reset workflow track
        this.hideSegments();

        // Reset layered fills
        [this.uploadFill, this.processingFill, this.exportFill].forEach(fill => {
            if (fill) {
                fill.style.transition = 'none';
                fill.style.width = '0%';
                fill.style.opacity = '';
                fill.classList.remove('exporting');
                void fill.offsetHeight;
                fill.style.transition = '';
            }
        });
        // Reset reviewed overlay
        if (this.reviewedOverlay) {
            this.reviewedOverlay.style.transition = 'none';
            this.reviewedOverlay.style.width = '0%';
            void this.reviewedOverlay.offsetHeight;
            this.reviewedOverlay.style.transition = '';
        }

        // Reset phase breadcrumb
        if (this.workflowPhases) {
            this.workflowPhases.querySelectorAll('.phase').forEach(el => {
                el.classList.remove('active', 'completed');
            });
        }

        // Reset export phase button
        const exportPhaseBtn = document.querySelector('.phase-export');
        if (exportPhaseBtn) exportPhaseBtn.classList.remove('export-ready');

        // Hide metrics and summary
        if (this.statsArea) this.statsArea.style.display = 'none';
        if (this.metricsRow) this.metricsRow.style.display = 'none';
        if (this.jobSummary) this.jobSummary.style.display = 'none';

        // Hide finalize card if visible
        const finalizeCard = document.getElementById('finalize-complete');
        if (finalizeCard) finalizeCard.style.display = 'none';

        // Reset results
        if (window.resultsHandler) {
            window.resultsHandler.reset();
        }

        // Set to idle state
        this.setState('idle');
    }

    async checkForExistingJob() {
        // Restore exportJobId if page was refreshed during export
        const storedExportId = localStorage.getItem('exportJobId');
        if (storedExportId) {
            this.exportJobId = storedExportId;
        }

        const storedJobId = localStorage.getItem('currentJobId');
        if (storedJobId) {
            try {
                const response = await fetch(`/api/progress/${storedJobId}`);
                if (response.ok) {
                    const data = await response.json();
                    const status = data.status.toUpperCase();
                    if (['PENDING', 'RUNNING', 'PAUSED'].includes(status)) {
                        this.startPolling(storedJobId);
                        return;
                    } else if (status === 'COMPLETED') {
                        // Show segments directly (no morph animation on page refresh)
                        this._resumeCompleted = true;
                        this.startPolling(storedJobId);
                        return;
                    } else if (['FAILED', 'CANCELLED', 'HALTED'].includes(status)) {
                        this.jobId = storedJobId;
                        this.updateUI(data);
                        this.setState('failed');
                        return;
                    } else {
                        localStorage.removeItem('currentJobId');
                    }
                } else {
                    // Job not found (404) — already finalized or deleted
                    localStorage.removeItem('currentJobId');
                    localStorage.removeItem('exportJobId');
                    this.exportJobId = null;
                }
            } catch (error) {
                console.error('Error checking existing job:', error);
                localStorage.removeItem('currentJobId');
                localStorage.removeItem('exportJobId');
                this.exportJobId = null;
            }
        }
        // No existing job - set to idle state
        this.setState('idle');
    }

    /**
     * Show job section immediately with PENDING status (before job ID is known)
     */
    showPending(fileCount) {
        // Stop any existing polling (e.g., from resumed old job)
        this.stopPolling();
        this.isProcessingPhase = false; // Reset - we're in upload phase
        localStorage.removeItem('currentJobId');

        // Set uploading state
        this.setState('uploading');

        if (this.jobSection) {
            this.jobSection.dataset.status = 'UPLOADING';
        }
        if (this.filesProcessed) {
            this.filesProcessed.textContent = `0 / ${fileCount}`;
        }
        // Reset both fills
        [this.uploadFill, this.processingFill].forEach(fill => {
            if (fill) {
                fill.style.transition = 'none';
                fill.style.width = '0%';
                void fill.offsetHeight;
                fill.style.transition = '';
            }
        });
        if (this.currentFilename) {
            this.currentFilename.textContent = 'Uploading...';
        }
        // Show metrics row during upload/processing
        if (this.statsArea) this.statsArea.style.display = 'flex';
        if (this.metricsRow) this.metricsRow.style.display = 'flex';
        if (this.jobSummary) this.jobSummary.style.display = 'none';
        // Reset elapsed time and ETA
        if (this.elapsedTime) {
            this.elapsedTime.textContent = '0:00';
        }
        if (this.eta) {
            this.eta.textContent = '-';
        }
        // Hide any previous results buckets
        if (window.resultsHandler) {
            window.resultsHandler.reset();
        }
    }

    /**
     * Update progress during file upload (before job ID is known)
     */
    updateUploadProgress(percent) {
        if (this.isProcessingPhase) {
            return; // Block upload progress updates after we've started processing
        }
        if (this.uploadFill) {
            // No animation for upload progress - uploads are fast and animation causes visual confusion
            this.uploadFill.style.transition = 'none';
            this.uploadFill.style.width = percent + '%';
            void this.uploadFill.offsetHeight;
            this.uploadFill.style.transition = '';
        }
        if (this.currentFilename) {
            this.currentFilename.textContent = percent < 100 ? 'Uploading...' : 'Processing...';
        }
    }

    hideJobSection() {
        // On error/abort, reset to idle state
        this.resetToIdle();
    }

    startPolling(jobId) {
        this.jobId = jobId;
        this.fastPollCount = 0; // Reset fast poll counter
        this.pollingStartTime = performance.now();
        this.isProcessingPhase = true; // Mark transition to processing phase
        this.pendingStartTime = null; // Reset pending tracking
        this.pendingWarningShown = false;
        localStorage.setItem('currentJobId', jobId);
        console.log(`Polling started for job ${jobId}`);

        // Set processing state
        this.setState('processing');

        // Hide job summary from previous phase (prevents doubled metrics during export)
        if (this.jobSummary) this.jobSummary.style.display = 'none';

        // Upload fill stays at 100% — processing fill layers on top
        // Reset only processing fill to 0%
        if (this.processingFill) {
            this.processingFill.style.transition = 'none';
            this.processingFill.style.width = '0%';
            void this.processingFill.offsetHeight;
            this.processingFill.style.transition = '';
        }
        // Set RUNNING status on section while waiting for worker to pick up
        // (avoids grey PENDING flash between purple upload and blue processing)
        if (this.jobSection) {
            this.jobSection.dataset.status = 'RUNNING';
        }

        // Start with fast polling, then slow down
        this.poll();
        this.schedulePoll();
    }

    schedulePoll() {
        const delay = this.fastPollCount < this.maxFastPolls ? this.fastPollDelay : this.pollDelay;
        this.pollInterval = setTimeout(() => {
            this.fastPollCount++;
            this.poll();
            // Continue polling if job is still active
            if (this.jobId) {
                this.schedulePoll();
            }
        }, delay);
    }

    stopPolling() {
        if (this.pollInterval) {
            clearTimeout(this.pollInterval);
            this.pollInterval = null;
        }
        this.jobId = null; // Stop schedulePoll from continuing
    }

    async poll() {
        if (!this.jobId) return;

        try {
            const pollStart = performance.now();
            const response = await fetch(`/api/progress/${this.jobId}`);
            const pollDuration = Math.round(performance.now() - pollStart);

            if (response.ok) {
                const data = await response.json();
                console.log(
                    `Poll #${this.fastPollCount} | ${data.status} | ` +
                    `${data.progress_current}/${data.progress_total} | ` +
                    `${pollDuration}ms | ${data.current_filename || '-'}`
                );

                const status = data.status.toUpperCase();

                // Track pending state for worker health detection
                if (status === 'PENDING') {
                    if (!this.pendingStartTime) {
                        this.pendingStartTime = performance.now();
                    } else if (!this.pendingWarningShown) {
                        const pendingDuration = performance.now() - this.pendingStartTime;
                        if (pendingDuration > this.PENDING_TIMEOUT_MS) {
                            this.pendingWarningShown = true;
                            this.showWorkerWarning();
                        }
                    }
                } else {
                    // Job is no longer pending - clear warning if shown
                    this.pendingStartTime = null;
                    if (this.pendingWarningShown) {
                        this.pendingWarningShown = false;
                        this.hideWorkerWarning();
                    }
                }

                this.updateUI(data);

                if (['COMPLETED', 'FAILED', 'CANCELLED', 'HALTED'].includes(status)) {
                    const totalTime = Math.round(performance.now() - this.pollingStartTime);
                    console.log(`Job ${status} after ${totalTime}ms total polling time`);
                    const completedJobId = this.jobId; // Save before stopPolling clears it
                    this.stopPolling();
                    if (status === 'COMPLETED') {
                        this.handleJobComplete(completedJobId, data);
                    } else {
                        this.setState('failed');
                    }
                }
            } else {
                console.error('Failed to fetch progress');
                this.stopPolling();
            }
        } catch (error) {
            console.error('Polling error:', error);
        }
    }

    updateUI(data) {
        const status = data.status.toUpperCase();

        // For visual purposes, treat PENDING as RUNNING (blue) to avoid grey flash
        // PENDING just means waiting for worker to pick up the job
        const displayStatus = status === 'PENDING' ? 'RUNNING' : status;
        const displayText = status === 'PENDING' ? 'PROCESSING' : status;

        // Update section status (drives breadcrumb phase indicators + border glow)
        if (this.jobSection) {
            this.jobSection.dataset.status = displayStatus;
        }

        // Ensure stats area + metrics row are visible during active jobs (on resume)
        if (this.statsArea && this.statsArea.style.display === 'none') {
            this.statsArea.style.display = 'flex';
        }
        if (status !== 'COMPLETED' && this.metricsRow && this.metricsRow.style.display === 'none') {
            this.metricsRow.style.display = 'flex';
        }

        // Progress bar — target processing fill (upload fill stays at 100%)
        const progress = data.progress_total > 0
            ? Math.round((data.progress_current / data.progress_total) * 100)
            : 0;
        if (this.exportJobId && this.exportFill) {
            this.exportFill.style.width = progress + '%';
        } else if (this.processingFill) {
            this.processingFill.style.width = progress + '%';
        }
        // Files processed
        if (this.filesProcessed) {
            this.filesProcessed.textContent = `${data.progress_current} / ${data.progress_total}`;
        }

        // Current filename
        if (this.currentFilename) {
            if (data.current_filename) {
                this.currentFilename.textContent = data.current_filename;
                this.currentFilename.parentElement.title = data.current_filename;
            } else if (status === 'COMPLETED') {
                this.currentFilename.textContent = 'Done';
            } else {
                this.currentFilename.textContent = '-';
            }
        }

        // Elapsed time
        if (this.elapsedTime && data.elapsed_seconds !== null && data.elapsed_seconds !== undefined) {
            this.elapsedTime.textContent = this.formatTime(data.elapsed_seconds);
        }

        // ETA
        if (this.eta) {
            if (data.eta_seconds && status === 'RUNNING') {
                this.eta.textContent = this.formatTime(data.eta_seconds);
            } else if (status === 'COMPLETED') {
                this.eta.textContent = 'Done';
            } else {
                this.eta.textContent = '-';
            }
        }

        // Error count
        if (data.error_count > 0) {
            if (this.errorMetric) this.errorMetric.style.display = 'flex';
            if (this.errorCount) this.errorCount.textContent = data.error_count;
        } else {
            if (this.errorMetric) this.errorMetric.style.display = 'none';
        }

        // Control buttons
        this.updateControlButtons(status);
    }

    updateControlButtons(status) {
        if (!this.pauseBtn || !this.cancelBtn) return;

        if (status === 'RUNNING') {
            this.jobControls.style.display = 'flex';
            this.pauseBtn.style.display = 'inline-block';
            this.pauseBtn.textContent = 'Pause';
            this.pauseBtn.dataset.action = 'pause';
            this.cancelBtn.style.display = 'inline-block';
        } else if (status === 'PAUSED') {
            this.jobControls.style.display = 'flex';
            this.pauseBtn.style.display = 'inline-block';
            this.pauseBtn.textContent = 'Resume';
            this.pauseBtn.dataset.action = 'resume';
            this.cancelBtn.style.display = 'inline-block';
        } else {
            this.jobControls.style.display = 'none';
        }
    }

    async handlePause() {
        const action = this.pauseBtn.dataset.action;
        const success = await this.sendControlCommand(action);
        if (success) {
            // Reset to fast polling after any control action
            this.fastPollCount = 0;
            // Poll immediately to update UI with new status
            this.poll();
        }
    }

    async handleCancelOrNew() {
        const state = this.jobSection?.dataset.state;

        if (state === 'finalized') {
            // Export complete — data already cleaned up, just reset UI
            this.resetToIdle();
        } else if (state === 'complete' || state === 'failed') {
            // Job is done - this is "New" functionality
            const { confirmed } = await showModal({
                title: 'New Import',
                body: 'Start a new import? Current results will be cleared.',
                confirmText: 'Start New',
                dangerous: true
            });
            if (!confirmed) return;
            this.resetToIdle();
        } else {
            // Job is running - this is "Cancel" functionality
            const { confirmed } = await showModal({
                title: 'Cancel Job',
                body: 'Cancel this job and start over?',
                confirmText: 'Cancel Job',
                dangerous: true
            });
            if (!confirmed) return;
            const success = await this.sendControlCommand('cancel');
            if (success) {
                this.resetToIdle();
            }
        }
    }

    async sendControlCommand(action) {
        if (!this.jobId) return false;

        try {
            const response = await fetch(`/api/jobs/${this.jobId}/control`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ action: action })
            });

            if (response.ok) {
                return true;
            } else {
                const error = await response.json();
                window.showToast(`Failed to ${action} job: ${error.error || 'Unknown error'}`, 'error');
                return false;
            }
        } catch (error) {
            console.error(`Control command error (${action}):`, error);
            window.showToast(`Failed to ${action} job`, 'error');
            return false;
        }
    }

    async handleJobComplete(jobId, data) {
        // Check if this is an export job completing
        if (this.exportJobId && String(this.exportJobId) === String(jobId)) {
            await this.handleExportComplete(jobId, data);
            return;
        }

        // Keep job ID in localStorage so refresh shows results
        // (removed when user clicks "New")

        // Set complete state
        this.setState('complete');

        // Hide metrics row (current file, ETA no longer relevant)
        if (this.metricsRow) this.metricsRow.style.display = 'none';

        // Show summary (stats-area stays visible)
        if (this.jobSummary) {
            this.jobSummary.style.display = 'flex';

            // Populate summary
            const summary = data.summary || {};
            const successCount = summary.success_count || 0;
            const errorCount = summary.error_count || 0;
            const total = successCount + errorCount;

            if (this.summaryTotal) this.summaryTotal.textContent = total;
            if (this.summarySuccess) this.summarySuccess.textContent = successCount;
            if (this.summaryErrors) this.summaryErrors.textContent = summary.error_count || 0;
            if (this.summaryTime) this.summaryTime.textContent = this.formatTime(summary.duration_seconds || 0);
        }

        // Fart + fail sound when >=10% of files failed processing
        const summary = data.summary || {};
        const failTotal = (summary.success_count || 0) + (summary.error_count || 0);
        const failPct = failTotal > 0 ? (summary.error_count || 0) / failTotal : 0;
        if (failPct >= 0.10 && window.particles) {
            const target = this.workflowPhases?.querySelector('.phase[data-phase="process"]') || this.jobProgress || document.body;
            window.particles.fart(target);
            window.particles.failSound();
        }

        // Trigger results handler (loads counts into filterHandler, which sets segment flex-grow)
        if (window.resultsHandler) {
            await window.resultsHandler.showResults(jobId, data);
        }

        // Morph progress bar into mode segments (counts are now loaded)
        if (this._resumeCompleted) {
            this._resumeCompleted = false;
            this.showModesDirectly();
        } else {
            this.morphToModes();
        }
    }

    async handleExportComplete(exportJobId, data) {
        const errorCount = data.error_count || 0;
        const total = data.progress_total || 0;
        const exported = total - errorCount;

        console.log(`Export complete: ${exported} exported, ${errorCount} errors`);

        // Read cleanup options stored before export started
        const cleanupOptions = JSON.parse(localStorage.getItem('exportCleanupOptions') || '{}');
        localStorage.removeItem('exportCleanupOptions');

        // Auto-finalize: clean up based on user's checklist selections
        let finalizeResult = null;
        try {
            const response = await fetch(`/api/jobs/${exportJobId}/finalize`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(cleanupOptions)
            });

            if (response.ok) {
                finalizeResult = await response.json();
                console.log('Finalize result:', finalizeResult.stats);
            } else {
                console.warn('Finalize failed, export still succeeded');
            }
        } catch (error) {
            console.warn('Finalize request failed:', error);
        }

        // Clean up export fill
        if (this.exportFill) {
            this.exportFill.classList.remove('exporting');
        }

        // Clear all job state
        this.exportJobId = null;
        localStorage.removeItem('exportJobId');
        localStorage.removeItem('currentJobId');

        // If finalize failed, fall back to immediate reset
        if (!finalizeResult) {
            this.resetToIdle();
            return;
        }

        // Show completion card instead of resetting to idle
        this.hideSegments();

        // Hide results grid. Keep statsArea and metricsRow visible for summary context.
        if (this.jobSummary) this.jobSummary.style.display = 'none';
        // Hide stale metrics (ETA and Current are meaningless after completion)
        if (this.eta) this.eta.closest('.metric')?.style.setProperty('display', 'none');
        if (this.currentFilename) this.currentFilename.closest('.metric')?.style.setProperty('display', 'none');
        const resultsContainer = document.getElementById('results-container');
        if (resultsContainer) resultsContainer.style.display = 'none';
        // Set finalized state — header "New" button stays visible via setState
        this.setState('finalized');

        // Populate and show the finalize card
        const card = document.getElementById('finalize-complete');
        const pathEl = document.getElementById('finalize-output-path');

        if (pathEl) {
            pathEl.textContent = finalizeResult.output_directory || 'storage/output';
        }

        if (card) {
            card.style.display = 'block';
        }
    }

    showWorkerWarning() {
        console.warn('Worker may not be running - job stuck in pending state');
        if (this.currentFilename) {
            this.currentFilename.innerHTML = '<span style="color: #dc3545;">Worker not responding - is Huey running?</span>';
        }
        if (this.jobSection) {
            this.jobSection.dataset.status = 'HALTED';
        }
    }

    hideWorkerWarning() {
        // Warning will be cleared by normal updateUI on next poll
    }

    formatTime(seconds) {
        if (!seconds || seconds < 0) return '0s';

        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;

        if (hours > 0) {
            return `${hours}h ${String(minutes).padStart(2, '0')}m`;
        } else if (minutes > 0) {
            return `${minutes}m ${String(secs).padStart(2, '0')}s`;
        } else {
            return `${secs}s`;
        }
    }

    async startExport(importJobId, force = false) {
        // Guard: don't start if already exporting or finalized
        if (this.exportJobId) return;
        const state = this.jobSection?.dataset.state;
        if (state === 'finalized' || state === 'processing') return;

        try {
            // Show confirmation dialog (skip for force-retry on duplicate override)
            if (!force) {
                // Fetch current output directory setting
                let outputDir = '';
                try {
                    const settingsResp = await fetch('/api/settings');
                    const settings = await settingsResp.json();
                    outputDir = settings.output_directory || '';
                } catch (e) {
                    console.warn('Failed to fetch settings for export dialog:', e);
                }

                const counts = window.filterHandler?.counts || {};
                const exportCount = counts.reviewed || 0;
                const discardCount = counts.discards || 0;
                const failedCount = counts.failed || 0;

                // Build export summary line
                const summaryParts = [`${exportCount} file${exportCount !== 1 ? 's' : ''} to export`];
                if (discardCount > 0) summaryParts.push(`${discardCount} discarded`);
                if (failedCount > 0) summaryParts.push(`${failedCount} failed`);

                // Recall previous selections (sessionStorage = tab lifetime)
                const prev = JSON.parse(sessionStorage.getItem('exportCleanupPrefs') || 'null');
                const chk = {
                    clean_working_files: prev ? prev.clean_working_files : true,
                    clear_database: prev ? prev.clear_database : true,
                    delete_sources: prev ? prev.delete_sources : false
                };

                const { confirmed, data } = await showModal({
                    title: 'Export & Finalize',
                    body: `<p>${summaryParts.join(' · ')}</p>
                           <label class="modal-field-label">Output directory</label>
                           <input name="output_directory" class="modal-input" value="${outputDir.replace(/"/g, '&quot;')}">
                           <div class="modal-checklist">
                               <label class="modal-check-item">
                                   <input type="checkbox" name="clean_working_files" ${chk.clean_working_files ? 'checked' : ''}>
                                   <div>
                                       <strong>Clean up working files</strong>
                                       <span class="modal-check-desc">Delete generated thumbnails and uploaded file copies</span>
                                   </div>
                               </label>
                               <label class="modal-check-item">
                                   <input type="checkbox" name="clear_database" ${chk.clear_database ? 'checked' : ''}>
                                   <div>
                                       <strong>Clear processing records</strong>
                                       <span class="modal-check-desc">Remove file metadata, review decisions, tags, and job history</span>
                                   </div>
                               </label>
                               <label class="modal-check-item">
                                   <input type="checkbox" name="delete_sources" ${chk.delete_sources ? 'checked' : ''}>
                                   <div>
                                       <strong>Delete source files</strong>
                                       <span class="modal-check-desc">Remove original files from import directory (irreversible)</span>
                                   </div>
                               </label>
                           </div>
                           <p class="modal-warning">Checked items cannot be undone.</p>`,
                    confirmText: 'Export',
                    dangerous: true,
                    onBeforeConfirm: async (formData) => {
                        if (formData.output_directory !== outputDir) {
                            try {
                                const saveResp = await fetch('/api/settings', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ output_directory: formData.output_directory })
                                });
                                const result = await saveResp.json();
                                if (!saveResp.ok || !result.success) {
                                    return result.error || 'Invalid output directory';
                                }
                            } catch (e) {
                                return 'Failed to save output directory';
                            }
                        }
                        return true;
                    }
                });
                if (!confirmed) return;

                const cleanupOpts = {
                    clean_working_files: data.clean_working_files,
                    delete_sources: data.delete_sources,
                    clear_database: data.clear_database
                };

                // Remember selections for next export in this session
                sessionStorage.setItem('exportCleanupPrefs', JSON.stringify(cleanupOpts));
                // Store for async polling gap (survives page refresh during export)
                localStorage.setItem('exportCleanupOptions', JSON.stringify(cleanupOpts));
            }

            // Revert export breadcrumb to normal style now that export is confirmed
            const exportPhaseBtn = document.querySelector('.phase-export');
            if (exportPhaseBtn) exportPhaseBtn.classList.remove('export-ready');

            // Trigger export
            const response = await fetch(`/api/jobs/${importJobId}/export`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ force })
            });

            if (!response.ok) {
                let error;
                try {
                    error = await response.json();
                } catch {
                    window.showToast(`Export failed: server error (${response.status})`, 'error');
                    return;
                }
                if (error.unresolved_exact_groups || error.unresolved_similar_groups) {
                    const { confirmed } = await showModal({
                        title: 'Unresolved Groups',
                        body: `<p>${error.message}</p>
                               <ul class="modal-list">
                                   <li>Unresolved duplicates: ${error.unresolved_exact_groups || 0}</li>
                                   <li>Unresolved similar: ${error.unresolved_similar_groups || 0}</li>
                               </ul>
                               <p>Force export anyway?</p>`,
                        confirmText: 'Force Export',
                        dangerous: true
                    });
                    if (confirmed) {
                        return this.startExport(importJobId, true);
                    }
                    return;
                }
                window.showToast(`Export failed: ${error.error || 'Unknown error'}`, 'error');
                return;
            }

            const data = await response.json();
            this.exportJobId = data.job_id;
            localStorage.setItem('exportJobId', data.job_id);

            // Activate export fill
            if (this.exportFill) {
                this.exportFill.style.transition = 'none';
                this.exportFill.style.width = '0%';
                void this.exportFill.offsetHeight;
                this.exportFill.style.transition = '';
                this.exportFill.classList.add('exporting');
            }

            // Start polling the export job
            this.startPolling(data.job_id);
        } catch (error) {
            console.error('Export error:', error);
            window.showToast('Failed to start export', 'error');
        }
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.progressHandler = new ProgressHandler();
    });
} else {
    window.progressHandler = new ProgressHandler();
}
