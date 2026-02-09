/**
 * Viewport Debug Toolkit
 *
 * In-app diagnostics for the carousel viewport system.
 * Always available but no-op until called — zero overhead in normal use.
 *
 * Usage from dev console:
 *   vpDebug.capture()           — snapshot current state
 *   vpDebug.assertCleanExit()   — verify clean exit invariants
 *   vpDebug.assertCleanEnter()  — verify clean enter invariants
 *   vpDebug.watch()             — auto-capture on viewport events
 *   vpDebug.overlay()           — toggle visual debug overlay
 *   vpDebug.dump()              — pretty-print state to console
 */

window.vpDebug = (function() {

    // ==========================================
    // State Snapshots
    // ==========================================

    const snapshots = [];
    const history = [];

    function getViewportController() {
        return window.viewportController || window.viewport || null;
    }

    function getTileManager() {
        const vc = getViewportController();
        return vc?.tileManager || window.tileManager || null;
    }

    function getVirtualScroll() {
        const tm = getTileManager();
        return tm?.virtualScroll || null;
    }

    function getContainer() {
        const tm = getTileManager();
        return tm?.container || document.querySelector('.thumbnail-grid');
    }

    function capture() {
        const vc = getViewportController();
        const tm = getTileManager();
        const vs = getVirtualScroll();
        const container = getContainer();

        const tileData = [];
        if (tm?.tiles) {
            tm.tiles.forEach((tile, fileId) => {
                const el = tile.element;
                tileData.push({
                    fileId,
                    position: tile.position,
                    vpPos: el?.dataset?.vpPos || null,
                    classes: el?.className || '',
                    rect: el ? el.getBoundingClientRect().toJSON() : null,
                    inlineStyles: el ? extractInlineStyles(el) : {},
                    hasElement: !!el,
                });
            });
        }

        const snap = {
            timestamp: Date.now(),
            viewport: {
                isActive: vc?.isActive ?? null,
                isTransitioning: vc?.isTransitioning ?? null,
                viewMode: vc?.viewMode ?? null,
                currentIndex: vc?.currentIndex ?? null,
                totalFiles: vc?.navigationFiles?.length ?? 0,
            },
            tiles: tileData,
            container: {
                classes: container?.className || '',
                gridTemplateRows: container?.style.gridTemplateRows || '',
                gridTemplateColumns: container?.style.gridTemplateColumns || '',
                scrollTop: container?.scrollTop ?? 0,
            },
            body: {
                classes: document.body.className,
            },
            virtualScroll: {
                paused: vs?._paused ?? null,
                startIdx: vs?.startIdx ?? null,
                endIdx: vs?.endIdx ?? null,
                columns: vs?.columns ?? null,
                totalRows: vs?.totalRows ?? null,
                exemptedIds: vs?.exemptedIds ? [...vs.exemptedIds] : [],
            },
            detailsPanel: {
                visible: !!document.querySelector('.viewport-details-panel.visible'),
                fileId: null,
            },
        };

        snapshots.push(snap);
        return snap;
    }

    function extractInlineStyles(el) {
        const style = el.style;
        const props = {};
        const check = ['position', 'left', 'top', 'width', 'height',
                        'transform', 'transition', 'zIndex', 'opacity'];
        check.forEach(p => {
            const v = style.getPropertyValue(p === 'zIndex' ? 'z-index' : p);
            if (v) props[p] = v;
        });
        return props;
    }

    function diff(a, b) {
        const changes = {};

        // Viewport state
        if (a.viewport && b.viewport) {
            const vpDiff = {};
            for (const key of Object.keys(a.viewport)) {
                if (a.viewport[key] !== b.viewport[key]) {
                    vpDiff[key] = { from: a.viewport[key], to: b.viewport[key] };
                }
            }
            if (Object.keys(vpDiff).length) changes.viewport = vpDiff;
        }

        // Body classes
        if (a.body?.classes !== b.body?.classes) {
            changes.body = { from: a.body?.classes, to: b.body?.classes };
        }

        // Container classes
        if (a.container?.classes !== b.container?.classes) {
            changes.container = { classes: { from: a.container?.classes, to: b.container?.classes } };
        }

        // Grid templates
        if (a.container?.gridTemplateRows !== b.container?.gridTemplateRows) {
            changes.gridTemplateRows = {
                from: a.container?.gridTemplateRows,
                to: b.container?.gridTemplateRows,
            };
        }

        // Virtual scroll
        if (a.virtualScroll && b.virtualScroll) {
            const vsDiff = {};
            for (const key of Object.keys(a.virtualScroll)) {
                const av = JSON.stringify(a.virtualScroll[key]);
                const bv = JSON.stringify(b.virtualScroll[key]);
                if (av !== bv) {
                    vsDiff[key] = { from: a.virtualScroll[key], to: b.virtualScroll[key] };
                }
            }
            if (Object.keys(vsDiff).length) changes.virtualScroll = vsDiff;
        }

        // Tile count
        if (a.tiles?.length !== b.tiles?.length) {
            changes.tileCount = { from: a.tiles?.length, to: b.tiles?.length };
        }

        return changes;
    }

    function dump() {
        const snap = capture();

        console.group('%c[vpDebug] State Dump', 'color: #4fc3f7; font-weight: bold');

        console.log('%cViewport', 'font-weight: bold');
        console.table(snap.viewport);

        console.log('%cContainer', 'font-weight: bold');
        console.table(snap.container);

        console.log('%cBody', 'font-weight: bold');
        console.log('  classes:', snap.body.classes);

        console.log('%cVirtual Scroll', 'font-weight: bold');
        console.table(snap.virtualScroll);

        if (snap.tiles.length > 0) {
            console.log('%cTiles (%d)', 'font-weight: bold', snap.tiles.length);
            console.table(snap.tiles.map(t => ({
                fileId: t.fileId,
                position: t.position,
                vpPos: t.vpPos,
                hasInline: Object.keys(t.inlineStyles).length > 0,
                inlineStyles: Object.keys(t.inlineStyles).join(', ') || '(none)',
            })));
        }

        console.groupEnd();
        return snap;
    }

    // ==========================================
    // Invariant Assertions
    // ==========================================

    function assertCleanExit() {
        const failures = [];
        const container = getContainer();
        const vs = getVirtualScroll();

        // Check all .thumbnail elements for leaked inline styles
        const tiles = document.querySelectorAll('.thumbnail');
        tiles.forEach(el => {
            const s = el.style;
            if (s.position === 'fixed') {
                failures.push(`Tile ${el.dataset.fileId}: has position:fixed`);
            }
            const leaked = ['left', 'top', 'width', 'height', 'transform', 'transition', 'z-index', 'opacity'];
            leaked.forEach(prop => {
                if (s.getPropertyValue(prop)) {
                    failures.push(`Tile ${el.dataset.fileId}: leaked inline ${prop}="${s.getPropertyValue(prop)}"`);
                }
            });

            if (el.dataset.vpPos && el.dataset.vpPos !== 'grid') {
                failures.push(`Tile ${el.dataset.fileId}: data-vp-pos="${el.dataset.vpPos}" (expected "grid")`);
            }
        });

        // Body should not have viewport-active
        if (document.body.classList.contains('viewport-active')) {
            failures.push('body still has "viewport-active" class');
        }

        // Container should not have viewport classes
        if (container) {
            ['viewport-mode', 'viewport-exiting', 'with-details'].forEach(cls => {
                if (container.classList.contains(cls)) {
                    failures.push(`Container still has "${cls}" class`);
                }
            });
        }

        // VirtualScroll should not be paused
        if (vs?._paused) {
            failures.push('VirtualScroll is still paused');
        }

        // VirtualScroll should have no exempted IDs
        if (vs?.exemptedIds?.size > 0) {
            failures.push(`VirtualScroll has ${vs.exemptedIds.size} exempted IDs: [${[...vs.exemptedIds].join(', ')}]`);
        }

        const pass = failures.length === 0;
        logAssertion('assertCleanExit', pass, failures);
        return { pass, failures };
    }

    function assertCleanEnter() {
        const failures = [];
        const container = getContainer();
        const vc = getViewportController();
        const vs = getVirtualScroll();

        // Body should have viewport-active
        if (!document.body.classList.contains('viewport-active')) {
            failures.push('body missing "viewport-active" class');
        }

        // Container should have viewport-mode
        if (container && !container.classList.contains('viewport-mode')) {
            failures.push('Container missing "viewport-mode" class');
        }

        // Exactly one tile with data-vp-pos="current"
        const currentTiles = document.querySelectorAll('.thumbnail[data-vp-pos="current"]');
        if (currentTiles.length !== 1) {
            failures.push(`Expected 1 tile with data-vp-pos="current", found ${currentTiles.length}`);
        }

        // VirtualScroll should be paused
        if (vs && !vs._paused) {
            failures.push('VirtualScroll is not paused');
        }

        // Grid positions should be locked (pixel values, not repeat(...))
        if (container) {
            const rows = container.style.gridTemplateRows;
            if (rows && rows.startsWith('repeat(')) {
                failures.push(`Grid rows still using repeat(): "${rows.substring(0, 60)}..."`);
            }
        }

        const pass = failures.length === 0;
        logAssertion('assertCleanEnter', pass, failures);
        return { pass, failures };
    }

    function assertGridStable(beforeSnap, afterSnap) {
        const failures = [];

        if (!beforeSnap || !afterSnap) {
            failures.push('Missing snapshot(s)');
            return { pass: false, failures };
        }

        if (beforeSnap.container.gridTemplateRows !== afterSnap.container.gridTemplateRows) {
            failures.push(`gridTemplateRows changed: "${beforeSnap.container.gridTemplateRows}" -> "${afterSnap.container.gridTemplateRows}"`);
        }
        if (beforeSnap.container.gridTemplateColumns !== afterSnap.container.gridTemplateColumns) {
            failures.push(`gridTemplateColumns changed: "${beforeSnap.container.gridTemplateColumns}" -> "${afterSnap.container.gridTemplateColumns}"`);
        }

        const pass = failures.length === 0;
        logAssertion('assertGridStable', pass, failures);
        return { pass, failures };
    }

    function assertNoOrphanStyles() {
        const failures = [];
        const vc = getViewportController();
        const inViewport = vc?.isActive;

        const tiles = document.querySelectorAll('.thumbnail');
        tiles.forEach(el => {
            const isVpTile = el.dataset.vpPos && el.dataset.vpPos !== 'grid';

            // In grid mode (or after exit), NO tile should have viewport inline styles
            // In viewport mode, only non-grid tiles may have inline position styles
            if (!inViewport || !isVpTile) {
                const s = el.style;
                const orphans = ['position', 'left', 'top', 'width', 'height',
                                 'transform', 'z-index', 'opacity'];
                orphans.forEach(prop => {
                    const val = s.getPropertyValue(prop);
                    // Allow transition (might be in progress)
                    if (val) {
                        failures.push(`Tile ${el.dataset.fileId} (${el.dataset.vpPos || 'grid'}): orphan ${prop}="${val}"`);
                    }
                });
            }
        });

        const pass = failures.length === 0;
        logAssertion('assertNoOrphanStyles', pass, failures);
        return { pass, failures };
    }

    function logAssertion(name, pass, failures) {
        if (pass) {
            console.log(`%c PASS %c ${name}`, 'background:#4caf50;color:#fff;padding:1px 4px;border-radius:2px', '');
        } else {
            console.log(`%c FAIL %c ${name} (${failures.length} issue${failures.length !== 1 ? 's' : ''})`,
                'background:#f44336;color:#fff;padding:1px 4px;border-radius:2px', 'color:#f44336');
            failures.forEach(f => console.log(`    - ${f}`));
        }
    }

    // ==========================================
    // Auto-Instrumentation
    // ==========================================

    let watching = false;
    const watchHandlers = {};

    function watch() {
        if (watching) {
            console.log('[vpDebug] Already watching');
            return;
        }
        watching = true;

        watchHandlers.enter = (e) => {
            const snap = capture();
            // Run assertCleanEnter after transition completes
            setTimeout(() => {
                const result = assertCleanEnter();
                history.push({
                    event: 'viewportEnter',
                    timestamp: Date.now(),
                    snapshot: snap,
                    assertions: { cleanEnter: result },
                    detail: e.detail,
                });
            }, 500);
        };

        watchHandlers.exit = (e) => {
            const snapBefore = capture();
            // Run assertCleanExit after transition completes
            setTimeout(() => {
                const snapAfter = capture();
                const exitResult = assertCleanExit();
                const orphanResult = assertNoOrphanStyles();
                history.push({
                    event: 'viewportExit',
                    timestamp: Date.now(),
                    snapshot: snapAfter,
                    snapshotBefore: snapBefore,
                    assertions: { cleanExit: exitResult, noOrphanStyles: orphanResult },
                    detail: e.detail,
                });
            }, 500);
        };

        watchHandlers.navigate = (e) => {
            const snap = capture();
            history.push({
                event: 'viewportNavigate',
                timestamp: Date.now(),
                snapshot: snap,
                detail: e.detail,
            });
        };

        window.addEventListener('viewportEnter', watchHandlers.enter);
        window.addEventListener('viewportExit', watchHandlers.exit);
        window.addEventListener('viewportNavigate', watchHandlers.navigate);

        console.log('%c[vpDebug] Watching viewport events', 'color: #4fc3f7');
    }

    function unwatch() {
        if (!watching) return;
        watching = false;

        window.removeEventListener('viewportEnter', watchHandlers.enter);
        window.removeEventListener('viewportExit', watchHandlers.exit);
        window.removeEventListener('viewportNavigate', watchHandlers.navigate);

        console.log('%c[vpDebug] Stopped watching', 'color: #aaa');
    }

    // ==========================================
    // Visual Debug Overlay
    // ==========================================

    let overlayActive = false;
    let overlayEl = null;
    let overlayRafId = null;

    const POSITION_COLORS = {
        current: 'rgba(76, 175, 80, 0.3)',   // green
        prev: 'rgba(33, 150, 243, 0.3)',      // blue
        next: 'rgba(255, 152, 0, 0.3)',       // orange
        grid: 'rgba(158, 158, 158, 0.15)',    // gray
        hidden: 'rgba(244, 67, 54, 0.2)',     // red
    };

    const POSITION_BORDERS = {
        current: '#4caf50',
        prev: '#2196f3',
        next: '#ff9800',
        grid: '#9e9e9e',
        hidden: '#f44336',
    };

    function overlay(show) {
        if (show === false) {
            destroyOverlay();
            return;
        }

        if (overlayActive) {
            destroyOverlay();
            return;
        }

        overlayActive = true;
        overlayEl = document.createElement('div');
        overlayEl.id = 'vp-debug-overlay';
        overlayEl.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:99999;';
        document.body.appendChild(overlayEl);

        function renderFrame() {
            if (!overlayActive) return;

            overlayEl.innerHTML = '';
            const tiles = document.querySelectorAll('.thumbnail');

            tiles.forEach(el => {
                const pos = el.dataset.vpPos || 'grid';
                const rect = el.getBoundingClientRect();
                const fileId = el.dataset.fileId || '?';

                const box = document.createElement('div');
                box.style.cssText = `
                    position:fixed;
                    left:${rect.left}px;top:${rect.top}px;
                    width:${rect.width}px;height:${rect.height}px;
                    background:${POSITION_COLORS[pos] || POSITION_COLORS.grid};
                    border:2px solid ${POSITION_BORDERS[pos] || POSITION_BORDERS.grid};
                    box-sizing:border-box;
                    pointer-events:none;
                `;

                const label = document.createElement('div');
                label.style.cssText = `
                    position:absolute;bottom:2px;left:2px;
                    font:10px/1 monospace;
                    color:${POSITION_BORDERS[pos] || '#999'};
                    background:rgba(0,0,0,0.7);
                    padding:1px 3px;border-radius:2px;
                    white-space:nowrap;
                `;
                label.textContent = `#${fileId} ${pos}`;
                box.appendChild(label);

                // Show inline style indicator
                const s = el.style;
                if (s.position || s.getPropertyValue('left') || s.getPropertyValue('z-index')) {
                    const indicator = document.createElement('div');
                    indicator.style.cssText = `
                        position:absolute;top:2px;right:2px;
                        font:9px/1 monospace;
                        color:#ff5722;
                        background:rgba(0,0,0,0.7);
                        padding:1px 3px;border-radius:2px;
                    `;
                    indicator.textContent = 'inline';
                    box.appendChild(indicator);
                }

                overlayEl.appendChild(box);
            });

            overlayRafId = requestAnimationFrame(renderFrame);
        }

        renderFrame();
        console.log('%c[vpDebug] Overlay ON', 'color: #4fc3f7');
    }

    function destroyOverlay() {
        overlayActive = false;
        if (overlayRafId) {
            cancelAnimationFrame(overlayRafId);
            overlayRafId = null;
        }
        if (overlayEl) {
            overlayEl.remove();
            overlayEl = null;
        }
        console.log('%c[vpDebug] Overlay OFF', 'color: #aaa');
    }

    // ==========================================
    // Public API
    // ==========================================

    return {
        // Snapshots
        capture,
        snapshots,
        diff,
        dump,

        // Assertions
        assertCleanExit,
        assertCleanEnter,
        assertGridStable,
        assertNoOrphanStyles,

        // Auto-instrumentation
        watch,
        unwatch,
        history,

        // Visual overlay
        overlay,
    };

})();
