/**
 * Examination Data Service
 *
 * Provides data fetching utilities for the viewport examination system.
 * Does NOT handle DOM manipulation - that's handled by ViewportController
 * and ViewportDetailsPanel.
 *
 * Primary responsibility: Load duplicate group data from the API.
 */

class ExaminationDataService {
    constructor() {
        this.currentDuplicateGroup = null;
        this.duplicateGroups = [];  // Cache of all duplicate groups
    }

    /**
     * Fetch all duplicate groups for a job
     * @param {number} jobId
     * @returns {Promise<Array>} Array of duplicate group objects
     */
    async fetchDuplicateGroups(jobId) {
        try {
            const response = await fetch(`/api/jobs/${jobId}/duplicates`);
            if (!response.ok) {
                throw new Error('Failed to fetch duplicate groups');
            }
            const data = await response.json();
            this.duplicateGroups = data.duplicate_groups || [];
            return this.duplicateGroups;
        } catch (error) {
            console.error('Error fetching duplicate groups:', error);
            return [];
        }
    }

    /**
     * Find the duplicate group containing a specific file
     * @param {number} fileId
     * @param {Array} [groups] - Optional groups array (uses cached if not provided)
     * @returns {Object|null} The duplicate group or null
     */
    findGroupForFile(fileId, groups = null) {
        const searchGroups = groups || this.duplicateGroups;
        return searchGroups.find(g =>
            g.files && g.files.some(f => f.id === fileId)
        ) || null;
    }

    /**
     * Load duplicate group data for a file
     * Returns the group's files for navigation in viewport
     * @param {number} fileId - The file to find the group for
     * @param {number} jobId - The job ID
     * @returns {Promise<Object>} Object with files array and recommended_id
     */
    async loadDuplicateGroupForFile(fileId, jobId) {
        // Try to find in cache first
        let group = this.findGroupForFile(fileId);

        // If not found, fetch fresh data
        if (!group && jobId) {
            await this.fetchDuplicateGroups(jobId);
            group = this.findGroupForFile(fileId);
        }

        if (!group) {
            console.warn('No duplicate group found for file:', fileId);
            return { files: [], recommended_id: null, hash: null };
        }

        this.currentDuplicateGroup = group;

        return {
            files: group.files || [],
            recommended_id: group.recommended_id,
            hash: group.hash
        };
    }

    /**
     * Get all files in the current duplicate group
     * @returns {Array}
     */
    getCurrentGroupFiles() {
        return this.currentDuplicateGroup?.files || [];
    }

    /**
     * Get the recommended file ID in the current group
     * @returns {number|null}
     */
    getRecommendedId() {
        return this.currentDuplicateGroup?.recommended_id || null;
    }

    /**
     * Clear the current group reference
     */
    clearCurrentGroup() {
        this.currentDuplicateGroup = null;
    }

    /**
     * Clear all cached data
     */
    reset() {
        this.currentDuplicateGroup = null;
        this.duplicateGroups = [];
    }
}

// Create singleton instance
window.examinationDataService = new ExaminationDataService();

// Backward compatibility alias
window.examinationHandler = window.examinationDataService;
