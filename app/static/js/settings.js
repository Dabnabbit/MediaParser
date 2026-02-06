/**
 * Settings UI interaction handler.
 *
 * Manages settings drawer visibility, loading current settings from API,
 * saving updated settings with validation, and resetting to defaults.
 */

class SettingsHandler {
    constructor() {
        this.drawer = document.getElementById('settings-drawer');
        this.backdrop = document.getElementById('settings-drawer-backdrop');
        this.gearBtn = document.getElementById('settings-gear-btn');
        this.closeBtn = document.getElementById('settings-drawer-close');
        this.outputDirInput = document.getElementById('output-directory');
        this.resetOutputDirBtn = document.getElementById('reset-output-dir-btn');
        this.saveBtn = document.getElementById('save-settings-btn');
        this.statusText = document.getElementById('settings-status');
        this.errorContainer = document.getElementById('settings-error');
        this.errorText = document.getElementById('settings-error-text');

        // Debug section elements
        this.debugSection = document.getElementById('debug-section');
        this.dbSizeEl = document.getElementById('db-size');
        this.dbTablesEl = document.getElementById('db-tables');
        this.storageSizeEl = document.getElementById('storage-size');
        this.clearDbBtn = document.getElementById('clear-db-btn');
        this.clearStorageBtn = document.getElementById('clear-storage-btn');
        this.clearAllBtn = document.getElementById('clear-all-btn');

        this.defaults = {};

        this.initializeEventListeners();
        this.loadSettings();
        this.loadDebugInfo();
    }

    /**
     * Initialize event listeners for settings UI.
     */
    initializeEventListeners() {
        // Open drawer
        if (this.gearBtn) {
            this.gearBtn.addEventListener('click', () => this.openDrawer());
        }

        // Close drawer
        if (this.closeBtn) {
            this.closeBtn.addEventListener('click', () => this.closeDrawer());
        }

        // Backdrop click to close
        if (this.backdrop) {
            this.backdrop.addEventListener('click', () => this.closeDrawer());
        }

        // Escape key to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen()) {
                this.closeDrawer();
            }
        });

        // Reset button
        this.resetOutputDirBtn.addEventListener('click', () => this.resetSetting('output_directory'));

        // Save button
        this.saveBtn.addEventListener('click', () => this.saveSettings());

        // Clear status/error on input change
        this.outputDirInput.addEventListener('input', () => {
            this.clearFeedback();
        });

        // Debug buttons
        if (this.clearDbBtn) {
            this.clearDbBtn.addEventListener('click', () => this.clearDatabase());
        }
        if (this.clearStorageBtn) {
            this.clearStorageBtn.addEventListener('click', () => this.clearStorage());
        }
        if (this.clearAllBtn) {
            this.clearAllBtn.addEventListener('click', () => this.clearAll());
        }

        // Strict workflow toggle
        const strictToggle = document.getElementById('strict-workflow-toggle');
        if (strictToggle) {
            strictToggle.checked = localStorage.getItem('strictWorkflow') === 'true';
            strictToggle.addEventListener('change', () => {
                localStorage.setItem('strictWorkflow', strictToggle.checked);
                // Notify filter handler immediately
                if (window.filterHandler) {
                    window.filterHandler.strictMode = strictToggle.checked;
                    window.filterHandler.updateCounts(window.filterHandler.counts);
                }
            });
        }
    }

    /**
     * Check if drawer is currently open.
     */
    isOpen() {
        return this.drawer && this.drawer.classList.contains('visible');
    }

    /**
     * Open settings drawer.
     */
    openDrawer() {
        if (this.backdrop) this.backdrop.classList.add('visible');
        if (this.drawer) this.drawer.classList.add('visible');
    }

    /**
     * Close settings drawer.
     */
    closeDrawer() {
        if (this.backdrop) this.backdrop.classList.remove('visible');
        if (this.drawer) this.drawer.classList.remove('visible');
    }

    /**
     * Load current settings from API.
     */
    async loadSettings() {
        try {
            const response = await fetch('/api/settings');

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            // Store defaults for reset functionality
            this.defaults = data.defaults || {};

            // Populate form fields
            this.outputDirInput.value = data.output_directory || '';

        } catch (error) {
            console.error('Failed to load settings:', error);
            this.showError('Failed to load settings. Please refresh the page.');
        }
    }

    /**
     * Save settings to API.
     */
    async saveSettings() {
        this.clearFeedback();

        // Disable save button during save
        this.saveBtn.disabled = true;
        this.saveBtn.textContent = 'Saving...';

        const settings = {
            output_directory: this.outputDirInput.value.trim()
        };

        // Basic client-side validation
        if (!settings.output_directory) {
            this.showError('Output directory cannot be empty');
            this.saveBtn.disabled = false;
            this.saveBtn.textContent = 'Save Settings';
            return;
        }

        try {
            const response = await fetch('/api/settings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(settings)
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.error || 'Failed to save settings');
            }

            // Show success message
            this.showStatus('Settings saved successfully');

            // Hide success message after 3 seconds
            setTimeout(() => {
                this.clearFeedback();
            }, 3000);

        } catch (error) {
            console.error('Failed to save settings:', error);
            this.showError(error.message || 'Failed to save settings. Please try again.');
        } finally {
            this.saveBtn.disabled = false;
            this.saveBtn.textContent = 'Save Settings';
        }
    }

    /**
     * Reset a setting to its default value.
     *
     * @param {string} key - Setting key to reset
     */
    resetSetting(key) {
        if (key === 'output_directory' && this.defaults.output_directory) {
            this.outputDirInput.value = this.defaults.output_directory;
            this.clearFeedback();
        }
    }

    /**
     * Show success status message.
     *
     * @param {string} message - Status message to display
     */
    showStatus(message) {
        this.clearFeedback();
        this.statusText.textContent = message;
        this.statusText.style.display = 'inline';
    }

    /**
     * Show error message.
     *
     * @param {string} message - Error message to display
     */
    showError(message) {
        this.clearFeedback();
        this.errorText.textContent = message;
        this.errorContainer.style.display = 'flex';
    }

    /**
     * Clear all feedback messages.
     */
    clearFeedback() {
        this.statusText.textContent = '';
        this.statusText.style.display = 'none';
        this.errorContainer.style.display = 'none';
        this.errorText.textContent = '';
    }

    // =========================================================================
    // Debug Methods
    // =========================================================================

    /**
     * Load debug information from API.
     */
    async loadDebugInfo() {
        try {
            const response = await fetch('/api/debug/info');
            const data = await response.json();

            if (!data.enabled) {
                // Debug mode disabled - hide section
                if (this.debugSection) {
                    this.debugSection.style.display = 'none';
                }
                return;
            }

            // Show debug section
            if (this.debugSection) {
                this.debugSection.style.display = 'block';
            }

            // Update database info
            if (this.dbSizeEl && data.database) {
                this.dbSizeEl.textContent = data.database.size_human;
            }

            if (this.dbTablesEl && data.database?.tables) {
                const tables = data.database.tables;
                this.dbTablesEl.textContent =
                    `Files: ${tables.files} | Jobs: ${tables.jobs} | Tags: ${tables.tags}`;
            }

            // Update storage info
            if (this.storageSizeEl && data.storage) {
                this.storageSizeEl.textContent =
                    `Uploads: ${data.storage.uploads_size_human} | Thumbnails: ${data.storage.thumbnails_size_human}`;
            }

        } catch (error) {
            console.error('Failed to load debug info:', error);
            // Don't show error to user - debug info is optional
        }
    }

    /**
     * Clear database tables.
     */
    async clearDatabase() {
        if (!confirm('Clear all data from database? This cannot be undone.')) {
            return;
        }

        try {
            this.clearDbBtn.disabled = true;
            this.clearDbBtn.textContent = 'Clearing...';

            const response = await fetch('/api/debug/clear-database', {
                method: 'POST'
            });
            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || 'Failed to clear database');
            }

            this.showStatus('Database cleared');
            await this.loadDebugInfo();

        } catch (error) {
            console.error('Failed to clear database:', error);
            this.showError(error.message);
        } finally {
            this.clearDbBtn.disabled = false;
            this.clearDbBtn.textContent = 'Clear Database';
        }
    }

    /**
     * Clear storage folders.
     */
    async clearStorage() {
        if (!confirm('Delete all uploaded files and thumbnails? This cannot be undone.')) {
            return;
        }

        try {
            this.clearStorageBtn.disabled = true;
            this.clearStorageBtn.textContent = 'Clearing...';

            const response = await fetch('/api/debug/clear-storage', {
                method: 'POST'
            });
            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || 'Failed to clear storage');
            }

            this.showStatus('Storage cleared');
            await this.loadDebugInfo();

        } catch (error) {
            console.error('Failed to clear storage:', error);
            this.showError(error.message);
        } finally {
            this.clearStorageBtn.disabled = false;
            this.clearStorageBtn.textContent = 'Clear Storage';
        }
    }

    /**
     * Clear both database and storage.
     */
    async clearAll() {
        if (!confirm('Clear ALL data (database AND files)? This cannot be undone.')) {
            return;
        }

        try {
            this.clearAllBtn.disabled = true;
            this.clearAllBtn.textContent = 'Clearing...';

            // Clear database first
            const dbResponse = await fetch('/api/debug/clear-database', {
                method: 'POST'
            });
            const dbData = await dbResponse.json();
            if (!dbData.success) {
                throw new Error(dbData.error || 'Failed to clear database');
            }

            // Then clear storage
            const storageResponse = await fetch('/api/debug/clear-storage', {
                method: 'POST'
            });
            const storageData = await storageResponse.json();
            if (!storageData.success) {
                throw new Error(storageData.error || 'Failed to clear storage');
            }

            this.showStatus('All data cleared');
            await this.loadDebugInfo();

            // Reload page to reset UI state
            setTimeout(() => {
                window.location.reload();
            }, 1000);

        } catch (error) {
            console.error('Failed to clear all:', error);
            this.showError(error.message);
        } finally {
            this.clearAllBtn.disabled = false;
            this.clearAllBtn.textContent = 'Clear All';
        }
    }
}

// Initialize settings handler when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new SettingsHandler();
});
