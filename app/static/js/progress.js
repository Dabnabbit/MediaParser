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
        this.jobTitle = document.getElementById('job-title');
        this.statusBadge = document.getElementById('job-status-badge');
        this.statusText = document.getElementById('job-status-text');
        this.uploadArea = document.getElementById('upload-area');

        // Progress elements
        this.jobProgress = document.getElementById('job-progress');
        this.progressFill = document.getElementById('job-progress-fill');
        this.progressText = document.getElementById('job-progress-text');
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
     * Set tile state and update visibility of areas
     */
    setState(state) {
        if (this.jobSection) {
            this.jobSection.dataset.state = state;
            // Reset status color when going to idle
            if (state === 'idle') {
                this.jobSection.dataset.status = '';
            }
        }

        // Upload area: visible only in idle state
        if (this.uploadArea) {
            this.uploadArea.style.display = state === 'idle' ? 'block' : 'none';
        }

        // Progress area: visible in uploading, processing, and complete states
        if (this.jobProgress) {
            this.jobProgress.style.display = ['uploading', 'processing', 'complete'].includes(state) ? 'block' : 'none';
        }

        // Status badge: hidden in idle state
        if (this.statusBadge) {
            this.statusBadge.style.display = state === 'idle' ? 'none' : 'inline-flex';
        }

        // Job title
        if (this.jobTitle) {
            const titles = {
                'idle': 'Import Media',
                'uploading': 'Uploading',
                'processing': 'Processing',
                'complete': 'Results'
            };
            this.jobTitle.textContent = titles[state] || 'Import Media';
        }

        // Controls visibility
        if (this.jobControls) {
            if (state === 'complete') {
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
        localStorage.removeItem('currentJobId');

        // Reset progress bar
        if (this.progressFill) {
            this.progressFill.style.transition = 'none';
            this.progressFill.style.width = '0%';
            void this.progressFill.offsetHeight;
            this.progressFill.style.transition = '';
        }
        if (this.progressText) {
            this.progressText.textContent = '0%';
        }

        // Hide summary
        if (this.jobSummary) {
            this.jobSummary.style.display = 'none';
        }

        // Reset results
        if (window.resultsHandler) {
            window.resultsHandler.reset();
        }

        // Set to idle state
        this.setState('idle');
    }

    async checkForExistingJob() {
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
                        this.startPolling(storedJobId);
                        return;
                    } else {
                        localStorage.removeItem('currentJobId');
                    }
                } else {
                    localStorage.removeItem('currentJobId');
                }
            } catch (error) {
                console.error('Error checking existing job:', error);
                localStorage.removeItem('currentJobId');
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
        if (this.statusBadge) {
            this.statusBadge.dataset.status = 'UPLOADING';
        }
        if (this.statusText) {
            this.statusText.textContent = 'UPLOADING';
        }
        if (this.filesProcessed) {
            this.filesProcessed.textContent = `0 / ${fileCount}`;
        }
        if (this.progressFill) {
            // Disable transition and force reflow to prevent animation
            this.progressFill.style.transition = 'none';
            this.progressFill.style.width = '0%';
            void this.progressFill.offsetHeight;
            this.progressFill.style.transition = '';
        }
        if (this.progressText) {
            this.progressText.textContent = '0%';
        }
        if (this.currentFilename) {
            this.currentFilename.textContent = 'Uploading...';
        }
        // Show metrics row during upload/processing
        if (this.metricsRow) {
            this.metricsRow.style.display = 'flex';
        }
        if (this.jobSummary) {
            this.jobSummary.style.display = 'none';
        }
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
        if (this.progressFill) {
            // No animation for upload progress - uploads are fast and animation causes visual confusion
            this.progressFill.style.transition = 'none';
            this.progressFill.style.width = percent + '%';
            void this.progressFill.offsetHeight;
            this.progressFill.style.transition = '';
        }
        if (this.progressText) {
            this.progressText.textContent = `Uploading ${percent}%`;
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

        // Reset progress bar from upload (100%) to processing (0%) without animation
        if (this.progressFill) {
            this.progressFill.style.transition = 'none';
            this.progressFill.style.width = '0%';
            void this.progressFill.offsetHeight;
            this.progressFill.style.transition = '';
        }
        if (this.progressText) {
            this.progressText.textContent = '0%';
        }
        // Keep status as "Processing" while waiting for worker to pick up
        // (avoids grey PENDING flash between purple upload and blue processing)
        if (this.statusText) {
            this.statusText.textContent = 'PROCESSING';
        }
        if (this.statusBadge) {
            this.statusBadge.dataset.status = 'RUNNING';
        }
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

        // Update status badge and section
        if (this.statusBadge) {
            this.statusBadge.dataset.status = displayStatus;
        }
        if (this.statusText) {
            this.statusText.textContent = displayText;
        }
        if (this.jobSection) {
            this.jobSection.dataset.status = displayStatus;
        }

        // Progress bar
        const progress = data.progress_total > 0
            ? Math.round((data.progress_current / data.progress_total) * 100)
            : 0;
        if (this.progressFill) {
            // Get current width to detect backwards movement (e.g., upload 100% -> processing 0%)
            const currentWidth = parseFloat(this.progressFill.style.width) || 0;
            if (progress < currentWidth) {
                // Disable transition and force reflow to prevent animation
                this.progressFill.style.transition = 'none';
                this.progressFill.style.width = progress + '%';
                void this.progressFill.offsetHeight;
                this.progressFill.style.transition = '';
            } else {
                this.progressFill.style.width = progress + '%';
            }
        }
        if (this.progressText) {
            this.progressText.textContent = progress + '%';
        }

        // Files processed
        if (this.filesProcessed) {
            this.filesProcessed.textContent = `${data.progress_current} / ${data.progress_total}`;
        }

        // Current filename
        if (this.currentFilename) {
            if (data.current_filename) {
                this.currentFilename.textContent = data.current_filename;
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

        if (state === 'complete') {
            // Job is done - this is "New" functionality
            if (!confirm('Start a new import? Current results will be cleared.')) {
                return;
            }
            this.resetToIdle();
        } else {
            // Job is running - this is "Cancel" functionality
            if (!confirm('Cancel this job and start over?')) {
                return;
            }
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
                alert(`Failed to ${action} job: ${error.error || 'Unknown error'}`);
                return false;
            }
        } catch (error) {
            console.error(`Control command error (${action}):`, error);
            alert(`Failed to ${action} job`);
            return false;
        }
    }

    handleJobComplete(jobId, data) {
        // Keep job ID in localStorage so refresh shows results
        // (removed when user clicks "New")

        // Set complete state
        this.setState('complete');

        // Keep progress bar visible at 100%
        if (this.progressFill) {
            this.progressFill.style.width = '100%';
        }
        if (this.progressText) {
            this.progressText.textContent = '100%';
        }
        // Hide metrics row (current file, ETA no longer relevant)
        if (this.metricsRow) {
            this.metricsRow.style.display = 'none';
        }

        // Show summary
        if (this.jobSummary) {
            this.jobSummary.style.display = 'block';

            // Populate summary
            const summary = data.summary || {};
            const counts = summary.confidence_counts || {};
            const total = (counts.high || 0) + (counts.medium || 0) + (counts.low || 0) + (counts.none || 0);

            if (this.summaryTotal) this.summaryTotal.textContent = total;
            if (this.summarySuccess) this.summarySuccess.textContent = summary.success_count || 0;
            if (this.summaryErrors) this.summaryErrors.textContent = summary.error_count || 0;
            if (this.summaryTime) this.summaryTime.textContent = this.formatTime(summary.duration_seconds || 0);
        }

        // Trigger results handler
        if (window.resultsHandler) {
            window.resultsHandler.showResults(jobId, data);
        }
    }

    showWorkerWarning() {
        console.warn('Worker may not be running - job stuck in pending state');
        if (this.currentFilename) {
            this.currentFilename.innerHTML = '<span style="color: #dc3545;">Worker not responding - is Huey running?</span>';
        }
        if (this.statusText) {
            this.statusText.textContent = 'WAITING';
        }
        if (this.statusBadge) {
            this.statusBadge.dataset.status = 'HALTED';
        }
    }

    hideWorkerWarning() {
        // Warning will be cleared by normal updateUI on next poll
    }

    formatTime(seconds) {
        if (!seconds || seconds < 0) return '0:00';

        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;

        if (hours > 0) {
            return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        } else {
            return `${minutes}:${String(secs).padStart(2, '0')}`;
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
