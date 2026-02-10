/**
 * UploadHandler - Manages all file upload interactions
 *
 * Features:
 * - Drag and drop with visual feedback
 * - File picker (click on drop zone)
 * - Folder picker (webkitdirectory)
 * - Server path import
 * - Upload progress via XMLHttpRequest
 * - Client-side extension filtering
 */
class UploadHandler {
    constructor() {
        this.allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'heic', 'mp4', 'mov', 'avi', 'mkv'];
        this.uploadBox = document.getElementById('upload-box');
        this.fileInput = document.getElementById('file-input');
        this.folderInput = document.getElementById('folder-input');
        this.serverPathInput = document.getElementById('server-path');

        this.initEventListeners();
    }

    initEventListeners() {
        // Drag and drop on upload box
        this.uploadBox.addEventListener('click', () => this.fileInput.click());
        this.uploadBox.addEventListener('dragover', (e) => this.handleDragOver(e));
        this.uploadBox.addEventListener('dragleave', (e) => this.handleDragLeave(e));
        this.uploadBox.addEventListener('drop', (e) => this.handleDrop(e));

        // File and folder picker buttons
        document.getElementById('select-files-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.fileInput.click();
        });

        document.getElementById('select-folder-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.folderInput.click();
        });

        // File input changes
        this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        this.folderInput.addEventListener('change', (e) => this.handleFileSelect(e));

        // Server path import
        document.getElementById('import-path-btn').addEventListener('click', () => this.handleServerImport());
        this.serverPathInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.handleServerImport();
            }
        });
    }

    handleDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
        this.uploadBox.classList.add('drag-over');
    }

    handleDragLeave(e) {
        e.preventDefault();
        e.stopPropagation();
        this.uploadBox.classList.remove('drag-over');
    }

    handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        this.uploadBox.classList.remove('drag-over');

        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) {
            this.uploadFiles(files);
        }
    }

    handleFileSelect(e) {
        const files = Array.from(e.target.files);
        if (files.length > 0) {
            this.uploadFiles(files);
        }
        // Reset input value so same file can be selected again
        e.target.value = '';
    }

    filterFiles(files) {
        return files.filter(file => {
            const ext = file.name.split('.').pop().toLowerCase();
            return this.allowedExtensions.includes(ext);
        });
    }

    async handleServerImport() {
        const path = this.serverPathInput.value.trim();
        if (!path) {
            window.showToast('Please enter a server path', 'error');
            return;
        }

        try {
            const response = await fetch('/api/import-path', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ path: path })
            });

            const result = await response.json();

            if (response.ok) {
                this.serverPathInput.value = '';
                // Start polling for job progress
                if (window.progressHandler && result.job_id) {
                    window.progressHandler.startPolling(result.job_id);
                }
            } else {
                window.showToast(`Error: ${result.error || 'Failed to import from server path'}`, 'error');
            }
        } catch (error) {
            console.error('Server import error:', error);
            window.showToast('Failed to import from server path', 'error');
        }
    }

    async uploadFiles(files) {
        const validFiles = this.filterFiles(files);

        if (validFiles.length === 0) {
            window.showToast('No valid media files selected. Supported: ' + this.allowedExtensions.join(', '), 'error', 5000);
            return;
        }

        if (validFiles.length < files.length) {
            console.warn(`Filtered out ${files.length - validFiles.length} unsupported files`);
        }

        // Check if worker is running before uploading
        try {
            const healthResponse = await fetch('/api/worker-health');
            const healthData = await healthResponse.json();

            if (!healthData.worker_alive) {
                await showModal({
                    title: 'Worker Not Running',
                    body: '<p>Background worker is not running.</p><p>Please start the worker with:</p><code style="display:block;margin-top:8px;padding:8px;background:var(--color-bg-alt);border-radius:4px;">python run_worker.py</code>',
                    confirmText: 'OK',
                    cancelText: null
                });
                return;
            }
        } catch (error) {
            console.error('Worker health check failed:', error);
            await showModal({
                title: 'Worker Status Unknown',
                body: '<p>Cannot verify worker status. The background worker may not be running.</p><p>Please ensure the worker is started with:</p><code style="display:block;margin-top:8px;padding:8px;background:var(--color-bg-alt);border-radius:4px;">python run_worker.py</code>',
                confirmText: 'OK',
                cancelText: null
            });
            return;
        }

        // Show job section immediately with PENDING status
        if (window.progressHandler) {
            window.progressHandler.showPending(validFiles.length);
        }

        // Use XMLHttpRequest for upload progress tracking
        const formData = new FormData();
        const timestamps = [];
        validFiles.forEach(file => {
            formData.append('files', file);
            // Preserve original modification time (milliseconds since epoch)
            timestamps.push(file.lastModified || null);
        });
        // Send timestamps as JSON for backend to restore after saving
        formData.append('timestamps', JSON.stringify(timestamps));

        const xhr = new XMLHttpRequest();

        // Upload progress - update job section progress bar
        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const percentComplete = Math.round((e.loaded / e.total) * 100);
                if (window.progressHandler) {
                    window.progressHandler.updateUploadProgress(percentComplete);
                }
            }
        });

        // Upload complete
        xhr.addEventListener('load', () => {
            if (xhr.status === 200) {
                const result = JSON.parse(xhr.responseText);
                const uploadEnd = performance.now();
                console.log(`Upload complete | job_id=${result.job_id} | files=${result.file_count} | server took ${Math.round(uploadEnd - window._uploadStart)}ms`);

                // Start polling for job progress (processing begins)
                if (window.progressHandler && result.job_id) {
                    window.progressHandler.startPolling(result.job_id);
                }
            } else {
                // Hide job section on upload failure
                if (window.progressHandler) {
                    window.progressHandler.hideJobSection();
                }
                const error = JSON.parse(xhr.responseText);
                window.showToast(`Upload failed: ${error.error || 'Unknown error'}`, 'error');
            }
        });

        // Upload error
        xhr.addEventListener('error', () => {
            if (window.progressHandler) {
                window.progressHandler.hideJobSection();
            }
            window.showToast('Upload failed: Network error', 'error');
        });

        // Upload aborted
        xhr.addEventListener('abort', () => {
            if (window.progressHandler) {
                window.progressHandler.hideJobSection();
            }
            window.showToast('Upload cancelled', 'error');
        });

        // Start upload
        window._uploadStart = performance.now();
        console.log('Upload starting...');
        xhr.open('POST', '/api/upload');
        xhr.send(formData);
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.uploadHandler = new UploadHandler();
    });
} else {
    window.uploadHandler = new UploadHandler();
}
