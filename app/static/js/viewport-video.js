/**
 * ViewportController - Video playback module
 *
 * Swaps the <img> for a <video> element when a video file becomes the
 * current viewport tile. Restores the <img> when navigating away or exiting.
 *
 * Wired via viewport custom events (viewportEnter, viewportNavigate, viewportExit).
 * Load after viewport-core.js.
 */
(function() {
    /**
     * Check if a file is a video
     */
    function isVideoFile(file) {
        return file?.mime_type?.startsWith('video/');
    }

    /**
     * Get the video source URL for a file
     */
    function getVideoSrc(file) {
        if (file.original_path) return `/uploads/${file.original_path}`;
        return null;
    }

    /**
     * Swap <img> for <video> on the current tile
     */
    function activateVideo(tile, file) {
        if (!tile?.element) return;

        const img = tile.element.querySelector('.tile-image');
        if (!img || tile._videoActive) return;

        const src = getVideoSrc(file);
        if (!src) return;

        const video = document.createElement('video');
        video.className = 'tile-video';
        video.src = src;
        video.controls = true;
        video.autoplay = true;
        video.loop = false;
        video.playsInline = true;
        video.poster = img.src; // Use current image as poster
        video.preload = 'auto';

        // Stop clicks on video from bubbling to grid/viewport click handlers
        video.addEventListener('click', (e) => e.stopPropagation());

        // Hide img, insert video
        img.style.display = 'none';
        img.insertAdjacentElement('afterend', video);

        // Hide play overlay while video is active
        const overlay = tile.element.querySelector('.video-play-overlay');
        if (overlay) overlay.style.display = 'none';

        // Add class to suppress overlays that block native video controls
        tile.element.classList.add('video-playing');

        tile._videoActive = true;
        tile._videoElement = video;
    }

    /**
     * Restore <img> and remove <video> from a tile
     */
    function deactivateVideo(tile) {
        if (!tile?.element || !tile._videoActive) return;

        const video = tile._videoElement;
        if (video) {
            video.pause();
            video.removeAttribute('src');
            video.load(); // Release media resources
            video.remove();
        }

        const img = tile.element.querySelector('.tile-image');
        if (img) img.style.display = '';

        // Restore play overlay and overlays
        const overlay = tile.element.querySelector('.video-play-overlay');
        if (overlay) overlay.style.display = '';
        tile.element.classList.remove('video-playing');

        tile._videoActive = false;
        tile._videoElement = null;
    }

    // --- Event wiring ---

    // Track the last video tile so we can deactivate on navigation
    let activeVideoTile = null;

    function handleCurrentFile(detail) {
        const { file, fileId } = detail;

        // Deactivate previous video if any
        if (activeVideoTile) {
            deactivateVideo(activeVideoTile);
            activeVideoTile = null;
        }

        if (!isVideoFile(file)) return;

        // Small delay to let FLIP animation finish positioning the tile
        requestAnimationFrame(() => {
            const vc = window.selectionHandler?.viewportController;
            if (!vc?.isActive) return;

            const tile = vc.tileManager.getTile(fileId);
            if (tile) {
                activateVideo(tile, file);
                activeVideoTile = tile;
            }
        });
    }

    window.addEventListener('viewportEnter', (e) => {
        handleCurrentFile(e.detail);
    });

    window.addEventListener('viewportNavigate', (e) => {
        handleCurrentFile(e.detail);
    });

    window.addEventListener('viewportExit', () => {
        if (activeVideoTile) {
            deactivateVideo(activeVideoTile);
            activeVideoTile = null;
        }
    });
})();
