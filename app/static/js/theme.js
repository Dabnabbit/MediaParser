/**
 * Theme Management
 *
 * Handles light/dark/system theme preference with localStorage persistence.
 * Should be loaded early (in <head>) to prevent flash of wrong theme.
 */

(function() {
    'use strict';

    const STORAGE_KEY = 'theme-preference';
    const VALID_THEMES = ['light', 'dark', 'system'];

    /**
     * Get the stored theme preference or default to 'system'.
     */
    function getStoredTheme() {
        const stored = localStorage.getItem(STORAGE_KEY);
        return VALID_THEMES.includes(stored) ? stored : 'system';
    }

    /**
     * Apply theme to document.
     * @param {string} theme - 'light', 'dark', or 'system'
     */
    function applyTheme(theme) {
        const root = document.documentElement;

        if (theme === 'system') {
            root.setAttribute('data-theme', 'system');
        } else {
            root.setAttribute('data-theme', theme);
        }
    }

    /**
     * Save theme preference to localStorage.
     * @param {string} theme - Theme to save
     */
    function saveTheme(theme) {
        if (VALID_THEMES.includes(theme)) {
            localStorage.setItem(STORAGE_KEY, theme);
        }
    }

    /**
     * Set theme preference and apply it.
     * @param {string} theme - 'light', 'dark', or 'system'
     */
    function setTheme(theme) {
        saveTheme(theme);
        applyTheme(theme);
    }

    // Apply theme immediately on script load (before DOM ready)
    applyTheme(getStoredTheme());

    // Expose API for settings UI
    window.ThemeManager = {
        getTheme: getStoredTheme,
        setTheme: setTheme,
        applyTheme: applyTheme
    };

    // When DOM is ready, sync the select element if it exists
    document.addEventListener('DOMContentLoaded', function() {
        const select = document.getElementById('theme-select');
        if (select) {
            // Set initial value
            select.value = getStoredTheme();

            // Listen for changes
            select.addEventListener('change', function() {
                setTheme(this.value);
            });
        }
    });
})();
