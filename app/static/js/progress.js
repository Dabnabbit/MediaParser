/**
 * ProgressHandler - Manages job progress polling and UI updates
 *
 * Features:
 * - Polls /api/progress/:id every 1.5 seconds
 * - Updates all progress UI elements
 * - Handles pause/cancel/resume via /api/jobs/:id/control
 * - Session resume via localStorage
 * - Transitions to results on completion
 */
class ProgressHandler {
    constructor() {
        this.jobId = null;
        this.pollInterval = null;
        this.pollDelay = 1500; // 1.5 seconds

        // Progress section elements
        this.progressSection = document.querySelector('[data-section="progress"]');
        this.statusBadge = document.getElementById('job-status-badge');
        this.statusText = document.getElementById('job-status-text');
        this.progressFill = document.getElementById('job-progress-fill');
        this.progressText = document.getElementById('job-progress-text');
        this.filesProcessed = document.getElementById('files-processed');
        this.currentFilename = document.getElementById('current-filename');
        this.elapsedTime = document.getElementById('elapsed-time');
        this.eta = document.getElementById('eta');
        this.errorBadgeContainer = document.getElementById('error-badge-container');
        this.errorCount = document.getElementById('error-count');

        // Control buttons
        this.pauseBtn = document.getElementById('pause-btn');
        this.cancelBtn = document.getElementById('cancel-btn');

        this.initEventListeners();
        this.checkForExistingJob();
    }

    initEventListeners() {
        this.pauseBtn.addEventListener('click', () => this.handlePause());
        this.cancelBtn.addEventListener('click', () => this.handleCancel());
    }

    async checkForExistingJob() {
        // Check localStorage for job ID
        const storedJobId = localStorage.getItem('currentJobId');
        if (storedJobId) {
            try {
                const response = await fetch(`/api/progress/${storedJobId}`);
                if (response.ok) {
                    const data = await response.json();
                    // Only resume if job is still active
                    if (['PENDING', 'RUNNING', 'PAUSED'].includes(data.status)) {
                        this.startPolling(storedJobId);
                    } else if (data.status === 'COMPLETED') {
                        // Show completed job
                        this.startPolling(storedJobId);
                    } else {
                        // Job failed or cancelled, clear localStorage
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
    }

    startPolling(jobId) {
        this.jobId = jobId;
        localStorage.setItem('currentJobId', jobId);

        // Show progress section
        this.progressSection.style.display = 'block';

        // Start polling
        this.poll();
        this.pollInterval = setInterval(() => this.poll(), this.pollDelay);
    }

    stopPolling() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    }

    async poll() {
        if (!this.jobId) return;

        try {
            const response = await fetch(`/api/progress/${this.jobId}`);
            if (response.ok) {
                const data = await response.json();
                this.updateUI(data);

                // Stop polling if job is complete
                if (['COMPLETED', 'FAILED', 'CANCELLED', 'HALTED'].includes(data.status)) {
                    this.stopPolling();
                    if (data.status === 'COMPLETED') {
                        this.handleJobComplete(data);
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
        // Status badge
        this.statusBadge.dataset.status = data.status;
        this.statusText.textContent = data.status;

        // Progress bar
        const progress = data.progress_total > 0
            ? Math.round((data.progress_current / data.progress_total) * 100)
            : 0;
        this.progressFill.style.width = progress + '%';
        this.progressText.textContent = progress + '%';

        // Files processed
        this.filesProcessed.textContent = `${data.progress_current} / ${data.progress_total}`;

        // Current filename
        if (data.current_filename) {
            this.currentFilename.textContent = data.current_filename;
        }

        // Elapsed time
        if (data.started_at) {
            const elapsed = data.completed_at
                ? new Date(data.completed_at) - new Date(data.started_at)
                : Date.now() - new Date(data.started_at);
            this.elapsedTime.textContent = this.formatTime(Math.floor(elapsed / 1000));
        }

        // ETA
        if (data.eta_seconds && data.status === 'RUNNING') {
            this.eta.textContent = this.formatTime(data.eta_seconds);
        } else {
            this.eta.textContent = '-';
        }

        // Error badge
        if (data.error_count > 0) {
            this.errorBadgeContainer.style.display = 'block';
            this.errorCount.textContent = data.error_count;
        } else {
            this.errorBadgeContainer.style.display = 'none';
        }

        // Update control buttons
        this.updateControlButtons(data.status);
    }

    updateControlButtons(status) {
        if (status === 'RUNNING') {
            this.pauseBtn.style.display = 'inline-block';
            this.pauseBtn.textContent = 'Pause';
            this.pauseBtn.dataset.action = 'pause';
            this.cancelBtn.style.display = 'inline-block';
        } else if (status === 'PAUSED') {
            this.pauseBtn.style.display = 'inline-block';
            this.pauseBtn.textContent = 'Resume';
            this.pauseBtn.dataset.action = 'resume';
            this.cancelBtn.style.display = 'inline-block';
        } else {
            this.pauseBtn.style.display = 'none';
            this.cancelBtn.style.display = 'none';
        }
    }

    async handlePause() {
        const action = this.pauseBtn.dataset.action;
        await this.sendControlCommand(action);
    }

    async handleCancel() {
        if (!confirm('Are you sure you want to cancel this job?')) {
            return;
        }
        await this.sendControlCommand('cancel');
    }

    async sendControlCommand(action) {
        if (!this.jobId) return;

        try {
            const response = await fetch(`/api/jobs/${this.jobId}/control`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ action: action })
            });

            if (response.ok) {
                // Poll immediately to update UI
                this.poll();
            } else {
                const error = await response.json();
                alert(`Failed to ${action} job: ${error.error || 'Unknown error'}`);
            }
        } catch (error) {
            console.error(`Control command error (${action}):`, error);
            alert(`Failed to ${action} job`);
        }
    }

    handleJobComplete(data) {
        // Clear localStorage
        localStorage.removeItem('currentJobId');

        // Trigger results handler if available
        if (window.resultsHandler) {
            window.resultsHandler.showResults(this.jobId, data);
        }
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
