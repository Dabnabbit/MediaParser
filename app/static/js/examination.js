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
        this.currentSimilarGroup = null;
        this.similarGroups = [];    // Cache of all similar groups
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
     * Fetch all similar groups for a job
     * @param {number} jobId
     * @returns {Promise<Array>} Array of similar group objects
     */
    async fetchSimilarGroups(jobId) {
        try {
            const response = await fetch(`/api/jobs/${jobId}/similar-groups`);
            if (!response.ok) {
                throw new Error('Failed to fetch similar groups');
            }
            const data = await response.json();
            this.similarGroups = data.similar_groups || [];
            return this.similarGroups;
        } catch (error) {
            console.error('Error fetching similar groups:', error);
            return [];
        }
    }

    /**
     * Find the similar group containing a specific file
     * @param {number} fileId
     * @returns {Object|null} The similar group or null
     */
    findSimilarGroupForFile(fileId) {
        return this.similarGroups.find(g =>
            g.files && g.files.some(f => f.id === fileId)
        ) || null;
    }

    /**
     * Load similar group data for a file
     * Returns the group's files for navigation in viewport
     * @param {number} fileId - The file to find the group for
     * @param {number} jobId - The job ID
     * @returns {Promise<Object>} Object with files array, group metadata
     */
    async loadSimilarGroupForFile(fileId, jobId) {
        // Try to find in cache first
        let group = this.findSimilarGroupForFile(fileId);

        // If not found, fetch fresh data
        if (!group && jobId) {
            await this.fetchSimilarGroups(jobId);
            group = this.findSimilarGroupForFile(fileId);
        }

        if (!group) {
            console.warn('No similar group found for file:', fileId);
            return {
                files: [],
                group_id: null,
                group_type: null,
                confidence: null,
                recommended_id: null
            };
        }

        this.currentSimilarGroup = group;

        return {
            files: group.files || [],
            group_id: group.group_id,
            group_type: group.group_type,
            confidence: group.confidence,
            recommended_id: group.recommended_id
        };
    }

    /**
     * Get all files in the current similar group
     * @returns {Array}
     */
    getCurrentSimilarGroupFiles() {
        return this.currentSimilarGroup?.files || [];
    }

    /**
     * Get the recommended file ID in the current similar group
     * @returns {number|null}
     */
    getSimilarRecommendedId() {
        return this.currentSimilarGroup?.recommended_id || null;
    }

    /**
     * Clear the current similar group reference
     */
    clearCurrentSimilarGroup() {
        this.currentSimilarGroup = null;
    }

    /**
     * Clear all cached data
     */
    reset() {
        this.currentDuplicateGroup = null;
        this.duplicateGroups = [];
        this.currentSimilarGroup = null;
        this.similarGroups = [];
    }
}

// Create singleton instance
window.examinationDataService = new ExaminationDataService();

// Backward compatibility alias
window.examinationHandler = window.examinationDataService;
