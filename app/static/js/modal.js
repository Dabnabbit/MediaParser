/**
 * Custom Modal System + Toast Notifications
 *
 * Replaces native browser confirm()/alert() with themed modals.
 * Consolidates showToast() into a single global implementation.
 */

/**
 * Show a modal dialog.
 *
 * @param {Object} options
 * @param {string} options.title - Modal header text
 * @param {string|HTMLElement} options.body - innerHTML string or DOM node for the body
 * @param {string} [options.confirmText='OK'] - Confirm button label
 * @param {string|null} [options.cancelText='Cancel'] - Cancel button label (null = no cancel button)
 * @param {string} [options.confirmClass='btn-pill-primary'] - CSS class for confirm button
 * @param {boolean} [options.dangerous=false] - If true, confirm button uses btn-pill-danger
 * @param {Function} [options.onBeforeConfirm] - Async fn called before resolving; return false to prevent close
 * @returns {Promise<{confirmed: boolean, data: object}>}
 */
window.showModal = function(options) {
    return new Promise((resolve) => {
        const {
            title = '',
            body = '',
            confirmText = 'OK',
            cancelText = 'Cancel',
            confirmClass,
            dangerous = false,
            onBeforeConfirm
        } = options;

        // Build backdrop
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop';

        // Build panel
        const panel = document.createElement('div');
        panel.className = 'modal-panel';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');
        if (title) panel.setAttribute('aria-label', title);

        // Header
        const header = document.createElement('div');
        header.className = 'modal-header';
        const h3 = document.createElement('h3');
        h3.textContent = title;
        header.appendChild(h3);
        const closeBtn = document.createElement('button');
        closeBtn.className = 'modal-close';
        closeBtn.innerHTML = '&times;';
        closeBtn.setAttribute('aria-label', 'Close');
        header.appendChild(closeBtn);

        // Body
        const bodyEl = document.createElement('div');
        bodyEl.className = 'modal-body';
        if (typeof body === 'string') {
            bodyEl.innerHTML = body;
        } else if (body instanceof HTMLElement) {
            bodyEl.appendChild(body);
        }

        // Footer
        const footer = document.createElement('div');
        footer.className = 'modal-footer';

        if (cancelText !== null) {
            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'btn-pill btn-pill-subtle modal-cancel-btn';
            cancelBtn.textContent = cancelText;
            footer.appendChild(cancelBtn);
        }

        const confirmBtn = document.createElement('button');
        const btnClass = confirmClass || (dangerous ? 'btn-pill-danger' : 'btn-pill-primary');
        confirmBtn.className = `btn-pill ${btnClass} modal-confirm-btn`;
        confirmBtn.textContent = confirmText;
        footer.appendChild(confirmBtn);

        // Assemble
        panel.appendChild(header);
        panel.appendChild(bodyEl);
        panel.appendChild(footer);
        backdrop.appendChild(panel);
        document.body.appendChild(backdrop);

        // Force reflow then animate in
        void backdrop.offsetHeight;
        backdrop.classList.add('modal-visible');

        // Error display helper for onBeforeConfirm
        let errorEl = null;
        function showInlineError(msg) {
            if (!errorEl) {
                errorEl = document.createElement('div');
                errorEl.className = 'modal-inline-error';
                footer.insertBefore(errorEl, footer.firstChild);
            }
            errorEl.textContent = msg;
        }

        // Collect form data from named inputs
        function collectData() {
            const data = {};
            bodyEl.querySelectorAll('input[name], select[name], textarea[name]').forEach(el => {
                if (el.type === 'checkbox') {
                    data[el.name] = el.checked;
                } else {
                    data[el.name] = el.value;
                }
            });
            return data;
        }

        // Close helper
        function close(confirmed) {
            backdrop.classList.remove('modal-visible');
            backdrop.addEventListener('transitionend', () => backdrop.remove(), { once: true });
            // Fallback removal if transition doesn't fire
            setTimeout(() => { if (backdrop.parentNode) backdrop.remove(); }, 300);
            document.removeEventListener('keydown', keyHandler);
            resolve({ confirmed, data: confirmed ? collectData() : {} });
        }

        // Confirm handler
        async function handleConfirm() {
            if (onBeforeConfirm) {
                confirmBtn.disabled = true;
                confirmBtn.textContent = 'Saving...';
                try {
                    const result = await onBeforeConfirm(collectData());
                    if (result === false) {
                        confirmBtn.disabled = false;
                        confirmBtn.textContent = confirmText;
                        return;
                    }
                    if (typeof result === 'string') {
                        showInlineError(result);
                        confirmBtn.disabled = false;
                        confirmBtn.textContent = confirmText;
                        return;
                    }
                } catch (err) {
                    showInlineError(err.message || 'An error occurred');
                    confirmBtn.disabled = false;
                    confirmBtn.textContent = confirmText;
                    return;
                }
            }
            close(true);
        }

        // Event listeners
        confirmBtn.addEventListener('click', handleConfirm);
        closeBtn.addEventListener('click', () => close(false));
        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) close(false);
        });
        const cancelBtnEl = footer.querySelector('.modal-cancel-btn');
        if (cancelBtnEl) {
            cancelBtnEl.addEventListener('click', () => close(false));
        }

        // Keyboard: Escape to close, trap focus
        function keyHandler(e) {
            if (e.key === 'Escape') {
                e.preventDefault();
                close(false);
            }
            // Focus trap
            if (e.key === 'Tab') {
                const focusable = panel.querySelectorAll('button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])');
                if (focusable.length === 0) return;
                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        }
        document.addEventListener('keydown', keyHandler);

        // Focus the confirm button (or first input if present)
        requestAnimationFrame(() => {
            const firstInput = bodyEl.querySelector('input, select, textarea');
            if (firstInput) {
                firstInput.focus();
            } else {
                confirmBtn.focus();
            }
        });
    });
};

/**
 * Show a toast notification.
 * Consolidated from tags.js and selection-core.js.
 *
 * @param {string} message - Toast message
 * @param {string} [type='success'] - 'success' or 'error'
 * @param {number} [duration=3000] - Display duration in ms
 */
window.showToast = function(message, type = 'success', duration = 3000) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, duration);
};
