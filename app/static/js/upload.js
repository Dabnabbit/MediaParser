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
        this.uploadProgress = document.getElementById('upload-progress');
        this.uploadProgressFill = document.getElementById('upload-progress-fill');
        this.uploadProgressText = document.getElementById('upload-progress-text');

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
            alert('Please enter a server path');
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
                alert(`Error: ${result.error || 'Failed to import from server path'}`);
            }
        } catch (error) {
            console.error('Server import error:', error);
            alert('Failed to import from server path');
        }
    }

    uploadFiles(files) {
        const validFiles = this.filterFiles(files);

        if (validFiles.length === 0) {
            alert('No valid media files selected. Supported formats: ' + this.allowedExtensions.join(', '));
            return;
        }

        if (validFiles.length < files.length) {
            console.warn(`Filtered out ${files.length - validFiles.length} unsupported files`);
        }

        // Use XMLHttpRequest for upload progress tracking
        const formData = new FormData();
        validFiles.forEach(file => {
            formData.append('files', file);
        });

        const xhr = new XMLHttpRequest();

        // Upload progress
        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const percentComplete = Math.round((e.loaded / e.total) * 100);
                this.updateUploadProgress(percentComplete);
            }
        });

        // Upload complete
        xhr.addEventListener('load', () => {
            this.hideUploadProgress();

            if (xhr.status === 200) {
                const result = JSON.parse(xhr.responseText);
                console.log('Upload complete:', result);

                // Start polling for job progress
                if (window.progressHandler && result.job_id) {
                    window.progressHandler.startPolling(result.job_id);
                }
            } else {
                const error = JSON.parse(xhr.responseText);
                alert(`Upload failed: ${error.error || 'Unknown error'}`);
            }
        });

        // Upload error
        xhr.addEventListener('error', () => {
            this.hideUploadProgress();
            alert('Upload failed: Network error');
        });

        // Upload aborted
        xhr.addEventListener('abort', () => {
            this.hideUploadProgress();
            alert('Upload cancelled');
        });

        // Start upload
        this.showUploadProgress();
        xhr.open('POST', '/api/upload');
        xhr.send(formData);
    }

    showUploadProgress() {
        this.uploadProgress.style.display = 'block';
        this.updateUploadProgress(0);
    }

    hideUploadProgress() {
        setTimeout(() => {
            this.uploadProgress.style.display = 'none';
        }, 500);
    }

    updateUploadProgress(percent) {
        this.uploadProgressFill.style.width = percent + '%';
        this.uploadProgressText.textContent = percent + '%';
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
