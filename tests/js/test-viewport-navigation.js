/**
 * ViewportController — Navigation & View Mode Tests
 *
 * Tests next/previous/goTo navigation, view mode cycling,
 * and updateNavigationSet. Uses a mock TileManager with
 * updateTilePositions/updateUI stubbed to no-ops.
 */

describe('ViewportController — next() / previous()', () => {

    function makeVC(fileIds) {
        if (typeof ViewportController === 'undefined') return null;

        const tiles = new Map();
        fileIds.forEach(id => {
            const el = document.createElement('div');
            el.className = 'thumbnail';
            el.dataset.vpPos = 'grid';
            el.innerHTML = '<img class="tile-image" src="" alt="">';
            tiles.set(id, new Tile({ element: el, file: { id } }));
        });

        const tm = {
            container: document.createElement('div'),
            tiles,
            getFileOrder: () => [...fileIds],
            getTile: (id) => tiles.get(id),
            ensureTile: (id) => tiles.get(id),
            getAllTiles: () => [...tiles.values()],
            getFile: (id) => ({ id }),
            setupViewport: () => {},
            resetToGrid: () => {},
            virtualScroll: {
                _paused: false, exemptedIds: new Set(),
                pause() { this._paused = true; },
                resume() { this._paused = false; },
                clearExemptions() { this.exemptedIds.clear(); },
                exemptFromRecycling(ids) { ids.forEach(i => this.exemptedIds.add(i)); },
            },
        };

        const vc = new ViewportController(tm);
        // Simulate active viewport at index 2
        vc.isActive = true;
        vc.navigationFiles = [...fileIds];
        vc.currentIndex = 2;

        // Stub FLIP-dependent methods
        vc.updateTilePositions = function() {};
        vc.updateUI = function() {};

        return vc;
    }

    it('next() increments currentIndex', () => {
        const vc = makeVC([10, 20, 30, 40, 50]);
        if (!vc) { assert.ok(true, 'skipped'); return; }
        assert.equal(vc.currentIndex, 2);
        const result = vc.next();
        assert.equal(result, true);
        assert.equal(vc.currentIndex, 3);
        assert.equal(vc.getCurrentFileId(), 40);
    });

    it('next() returns false at last index', () => {
        const vc = makeVC([10, 20, 30, 40, 50]);
        if (!vc) { assert.ok(true, 'skipped'); return; }
        vc.currentIndex = 4;
        const result = vc.next();
        assert.equal(result, false);
        assert.equal(vc.currentIndex, 4);
    });

    it('previous() decrements currentIndex', () => {
        const vc = makeVC([10, 20, 30, 40, 50]);
        if (!vc) { assert.ok(true, 'skipped'); return; }
        const result = vc.previous();
        assert.equal(result, true);
        assert.equal(vc.currentIndex, 1);
        assert.equal(vc.getCurrentFileId(), 20);
    });

    it('previous() returns false at first index', () => {
        const vc = makeVC([10, 20, 30, 40, 50]);
        if (!vc) { assert.ok(true, 'skipped'); return; }
        vc.currentIndex = 0;
        const result = vc.previous();
        assert.equal(result, false);
        assert.equal(vc.currentIndex, 0);
    });

    it('next/previous are no-ops when inactive', () => {
        const vc = makeVC([10, 20, 30]);
        if (!vc) { assert.ok(true, 'skipped'); return; }
        vc.isActive = false;
        assert.equal(vc.next(), false);
        assert.equal(vc.previous(), false);
        assert.equal(vc.currentIndex, 2);
    });
});

describe('ViewportController — goToFile() / goToIndex()', () => {

    function makeVC(fileIds) {
        if (typeof ViewportController === 'undefined') return null;

        const tiles = new Map();
        fileIds.forEach(id => {
            const el = document.createElement('div');
            el.className = 'thumbnail';
            el.innerHTML = '<img class="tile-image" src="" alt="">';
            tiles.set(id, new Tile({ element: el, file: { id } }));
        });

        const tm = {
            container: document.createElement('div'),
            tiles,
            getFileOrder: () => [...fileIds],
            getTile: (id) => tiles.get(id),
            ensureTile: (id) => tiles.get(id),
            getAllTiles: () => [...tiles.values()],
            getFile: (id) => ({ id }),
            setupViewport: () => {},
            resetToGrid: () => {},
            virtualScroll: null,
        };

        const vc = new ViewportController(tm);
        vc.isActive = true;
        vc.navigationFiles = [...fileIds];
        vc.currentIndex = 0;
        vc.updateTilePositions = function() {};
        vc.updateUI = function() {};
        return vc;
    }

    it('goToFile jumps to correct index', () => {
        const vc = makeVC([10, 20, 30, 40, 50]);
        if (!vc) { assert.ok(true, 'skipped'); return; }
        const result = vc.goToFile(40);
        assert.equal(result, true);
        assert.equal(vc.currentIndex, 3);
        assert.equal(vc.getCurrentFileId(), 40);
    });

    it('goToFile returns false for unknown ID', () => {
        const vc = makeVC([10, 20, 30]);
        if (!vc) { assert.ok(true, 'skipped'); return; }
        const result = vc.goToFile(999);
        assert.equal(result, false);
        assert.equal(vc.currentIndex, 0);
    });

    it('goToIndex jumps to correct index', () => {
        const vc = makeVC([10, 20, 30, 40]);
        if (!vc) { assert.ok(true, 'skipped'); return; }
        const result = vc.goToIndex(3);
        assert.equal(result, true);
        assert.equal(vc.getCurrentFileId(), 40);
    });

    it('goToIndex returns false for out-of-range', () => {
        const vc = makeVC([10, 20, 30]);
        if (!vc) { assert.ok(true, 'skipped'); return; }
        assert.equal(vc.goToIndex(-1), false);
        assert.equal(vc.goToIndex(3), false);
        assert.equal(vc.currentIndex, 0);
    });

    it('goToFirst goes to index 0', () => {
        const vc = makeVC([10, 20, 30, 40]);
        if (!vc) { assert.ok(true, 'skipped'); return; }
        vc.currentIndex = 3;
        vc.goToFirst();
        assert.equal(vc.currentIndex, 0);
        assert.equal(vc.getCurrentFileId(), 10);
    });

    it('goToLast goes to last index', () => {
        const vc = makeVC([10, 20, 30, 40]);
        if (!vc) { assert.ok(true, 'skipped'); return; }
        vc.goToLast();
        assert.equal(vc.currentIndex, 3);
        assert.equal(vc.getCurrentFileId(), 40);
    });

    it('goToFile is no-op when inactive', () => {
        const vc = makeVC([10, 20, 30]);
        if (!vc) { assert.ok(true, 'skipped'); return; }
        vc.isActive = false;
        assert.equal(vc.goToFile(30), false);
    });

    it('goToIndex is no-op when inactive', () => {
        const vc = makeVC([10, 20, 30]);
        if (!vc) { assert.ok(true, 'skipped'); return; }
        vc.isActive = false;
        assert.equal(vc.goToIndex(2), false);
    });
});

describe('ViewportController — View Mode Cycling', () => {

    function makeVC() {
        if (typeof ViewportController === 'undefined') return null;

        const container = document.createElement('div');
        const tm = {
            container,
            tiles: new Map(),
            getFileOrder: () => [],
            getTile: () => null,
            ensureTile: () => {},
            getAllTiles: () => [],
            getFile: () => null,
            setupViewport: () => {},
            resetToGrid: () => {},
            virtualScroll: null,
        };

        const vc = new ViewportController(tm);
        vc.isActive = true;
        vc.navigationFiles = [1, 2, 3];
        vc.currentIndex = 1;

        // Stub compare mode methods that need DOM
        vc.upgradeVisibleTilesToFullRes = function() {};
        vc._setupCompareResize = function() {};
        vc.updateCompareLayout = function() {};
        vc._clearCompareLayout = function() {};

        return vc;
    }

    it('starts in carousel mode', () => {
        const vc = makeVC();
        if (!vc) { assert.ok(true, 'skipped'); return; }
        assert.equal(vc.viewMode, 'carousel');
    });

    it('setViewMode changes to compare', () => {
        const vc = makeVC();
        if (!vc) { assert.ok(true, 'skipped'); return; }
        vc.setViewMode('compare');
        assert.equal(vc.viewMode, 'compare');
    });

    it('setViewMode changes to fullscreen', () => {
        const vc = makeVC();
        if (!vc) { assert.ok(true, 'skipped'); return; }
        vc.setViewMode('fullscreen');
        assert.equal(vc.viewMode, 'fullscreen');
    });

    it('setViewMode ignores invalid mode', () => {
        const vc = makeVC();
        if (!vc) { assert.ok(true, 'skipped'); return; }
        vc.setViewMode('bogus');
        assert.equal(vc.viewMode, 'carousel');
    });

    it('setViewMode adds view-compare class to container', () => {
        const vc = makeVC();
        if (!vc) { assert.ok(true, 'skipped'); return; }
        vc.setViewMode('compare');
        assert.ok(vc.tileManager.container.classList.contains('view-compare'));
    });

    it('setViewMode removes old mode class', () => {
        const vc = makeVC();
        if (!vc) { assert.ok(true, 'skipped'); return; }
        vc.setViewMode('compare');
        vc.setViewMode('fullscreen');
        assert.notOk(vc.tileManager.container.classList.contains('view-compare'));
        assert.ok(vc.tileManager.container.classList.contains('view-fullscreen'));
    });

    it('carousel mode has no view- class (it is the default)', () => {
        const vc = makeVC();
        if (!vc) { assert.ok(true, 'skipped'); return; }
        vc.setViewMode('compare');
        vc.setViewMode('carousel');
        assert.notOk(vc.tileManager.container.classList.contains('view-carousel'));
        assert.notOk(vc.tileManager.container.classList.contains('view-compare'));
    });

    it('cycleViewMode rotates compare -> carousel -> fullscreen -> compare', () => {
        const vc = makeVC();
        if (!vc) { assert.ok(true, 'skipped'); return; }
        // Default is carousel. VIEW_MODES order: compare, carousel, fullscreen
        // carousel is index 1, so cycling goes: carousel -> fullscreen -> compare -> carousel
        vc.cycleViewMode();
        assert.equal(vc.viewMode, 'fullscreen');
        vc.cycleViewMode();
        assert.equal(vc.viewMode, 'compare');
        vc.cycleViewMode();
        assert.equal(vc.viewMode, 'carousel');
    });
});

describe('ViewportController — updateNavigationSet()', () => {

    function makeVC() {
        if (typeof ViewportController === 'undefined') return null;

        const tm = {
            container: document.createElement('div'),
            tiles: new Map(),
            getFileOrder: () => [],
            getTile: () => null,
            ensureTile: () => {},
            getAllTiles: () => [],
            getFile: (id) => ({ id }),
            setupViewport: () => {},
            resetToGrid: () => {},
            virtualScroll: null,
        };

        const vc = new ViewportController(tm);
        vc.isActive = true;
        vc.navigationFiles = [10, 20, 30, 40, 50];
        vc.currentIndex = 2; // file 30

        vc.updateTilePositions = function() {};
        vc.updateUI = function() {};

        return vc;
    }

    it('keeps currentIndex on same file when file still exists', () => {
        const vc = makeVC();
        if (!vc) { assert.ok(true, 'skipped'); return; }
        // Remove file 20, keep 30
        vc.updateNavigationSet([10, 30, 40, 50]);
        assert.equal(vc.getCurrentFileId(), 30);
        assert.equal(vc.currentIndex, 1); // 30 is now at index 1
    });

    it('goes to first when current file removed', () => {
        const vc = makeVC();
        if (!vc) { assert.ok(true, 'skipped'); return; }
        // Remove file 30
        vc.updateNavigationSet([10, 20, 40, 50]);
        assert.equal(vc.currentIndex, 0);
        assert.equal(vc.getCurrentFileId(), 10);
    });

    it('exits viewport when navigation set becomes empty', () => {
        const vc = makeVC();
        if (!vc) { assert.ok(true, 'skipped'); return; }
        let exitCalled = false;
        vc.exit = function() { exitCalled = true; };
        vc.updateNavigationSet([]);
        assert.ok(exitCalled);
    });

    it('updates hasNext/hasPrev after set change', () => {
        const vc = makeVC();
        if (!vc) { assert.ok(true, 'skipped'); return; }
        vc.updateNavigationSet([30]);
        assert.equal(vc.hasNext(), false);
        assert.equal(vc.hasPrev(), false);
    });
});
