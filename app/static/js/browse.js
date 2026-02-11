/**
 * DirectoryBrowser — reusable server-side directory picker.
 *
 * Attaches to a text input + button. Clicking the button opens an inline
 * panel listing subdirectories fetched from /api/browse. User navigates
 * into directories and selects one to fill the input.
 *
 * Usage:
 *   new DirectoryBrowser(inputEl, browseBtn);
 *   // or for dynamically created elements:
 *   DirectoryBrowser.attach(containerEl);  // auto-finds .modal-input + .dir-browse-btn
 */
class DirectoryBrowser {
    constructor(input, button, options = {}) {
        this.input = input;
        this.button = button;
        this.panel = null;
        this.currentPath = '';
        this.onSelect = options.onSelect || null;

        this.button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.toggle();
        });

        // Close on outside click
        this._onDocClick = (e) => {
            if (this.panel && !this.panel.contains(e.target) && e.target !== this.button) {
                this.close();
            }
        };
    }

    toggle() {
        if (this.panel) {
            this.close();
        } else {
            this.open();
        }
    }

    open() {
        // Start from the current input value, or /
        const startPath = this.input.value.trim() || '/';
        this.currentPath = startPath;

        this.panel = document.createElement('div');
        this.panel.className = 'dir-browser';

        // Insert after the input's parent row
        const anchor = this.input.closest('.dir-browse-wrap') || this.input.parentElement;
        anchor.insertAdjacentElement('afterend', this.panel);

        this.load(startPath);
        document.addEventListener('click', this._onDocClick, true);
    }

    close() {
        if (this.panel) {
            this.panel.remove();
            this.panel = null;
        }
        document.removeEventListener('click', this._onDocClick, true);
    }

    async load(path) {
        if (!this.panel) return;
        this.currentPath = path;

        this.panel.innerHTML = '<div class="dir-browser-loading">Loading...</div>';

        try {
            const resp = await fetch(`/api/browse?path=${encodeURIComponent(path)}`);
            if (!resp.ok) {
                const err = await resp.json();
                this.panel.innerHTML = `<div class="dir-browser-error">${err.error || 'Failed to browse'}</div>`;
                return;
            }
            const data = await resp.json();
            this.render(data);
        } catch (e) {
            this.panel.innerHTML = '<div class="dir-browser-error">Failed to connect</div>';
        }
    }

    render(data) {
        if (!this.panel) return;
        this.panel.innerHTML = '';

        // Navigation bar: up button + current path
        const nav = document.createElement('div');
        nav.className = 'dir-browser-nav';

        if (data.parent !== null) {
            const upBtn = document.createElement('button');
            upBtn.className = 'dir-browser-up';
            upBtn.type = 'button';
            upBtn.innerHTML = '&#x2191;';
            upBtn.title = 'Parent directory';
            upBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.load(data.parent);
            });
            nav.appendChild(upBtn);
        }

        const pathLabel = document.createElement('span');
        pathLabel.className = 'dir-browser-path';
        pathLabel.textContent = data.path;
        pathLabel.title = data.path;
        nav.appendChild(pathLabel);

        const selectBtn = document.createElement('button');
        selectBtn.className = 'dir-browser-select';
        selectBtn.type = 'button';
        selectBtn.textContent = 'Select';
        selectBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.select(data.path);
        });
        nav.appendChild(selectBtn);

        this.panel.appendChild(nav);

        // Directory list
        const list = document.createElement('div');
        list.className = 'dir-browser-list';

        if (data.dirs.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'dir-browser-empty';
            empty.textContent = 'No subdirectories';
            list.appendChild(empty);
        } else {
            for (const dir of data.dirs) {
                const item = document.createElement('button');
                item.type = 'button';
                item.className = 'dir-browser-item';
                item.innerHTML = `<span class="dir-browser-icon">&#x1F4C1;</span> ${this._escHtml(dir)}`;
                item.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.load(data.path === '/' ? '/' + dir : data.path + '/' + dir);
                });
                list.appendChild(item);
            }
        }

        this.panel.appendChild(list);
    }

    select(path) {
        this.input.value = path;
        this.input.dispatchEvent(new Event('input', { bubbles: true }));
        if (this.onSelect) this.onSelect(path);
        this.close();
    }

    _escHtml(str) {
        const d = document.createElement('span');
        d.textContent = str;
        return d.innerHTML;
    }

    /**
     * Auto-attach to all .dir-browse-btn elements within a container.
     * Each button should be next to an input inside a .dir-browse-wrap.
     */
    static attachAll(container = document) {
        container.querySelectorAll('.dir-browse-btn').forEach(btn => {
            const wrap = btn.closest('.dir-browse-wrap');
            const input = wrap ? wrap.querySelector('input[type="text"], input.modal-input, input.form-input') : null;
            if (input && !btn._dirBrowser) {
                btn._dirBrowser = new DirectoryBrowser(input, btn);
            }
        });
    }
}

// Auto-attach on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => DirectoryBrowser.attachAll());
} else {
    DirectoryBrowser.attachAll();
}
