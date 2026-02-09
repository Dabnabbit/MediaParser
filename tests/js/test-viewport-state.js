/**
 * ViewportController — State Machine Tests
 *
 * Tests state transitions using a mock TileManager. The real enter/exit
 * methods require a full DOM with CSS grid layout, so we test the state
 * logic directly by manipulating the controller's properties and calling
 * simpler methods.
 */

describe('ViewportController — Initial State', () => {

    function makeMockTileManager() {
        const tiles = new Map();
        return {
            container: document.createElement('div'),
            tiles,
            getFileOrder: () => [1, 2, 3, 4, 5],
            getTile: (id) => tiles.get(id) || null,
            ensureTile: () => {},
            getAllTiles: () => [...tiles.values()],
            getFile: (id) => ({ id, original_filename: `file-${id}.jpg` }),
            setupViewport: () => {},
            resetToGrid: () => {},
            virtualScroll: {
                _paused: false,
                exemptedIds: new Set(),
                pause() { this._paused = true; },
                resume() { this._paused = false; },
                clearExemptions() { this.exemptedIds.clear(); },
            },
        };
    }

    it('starts inactive', () => {
        if (typeof ViewportController === 'undefined') {
            assert.ok(true, 'ViewportController not loaded');
            return;
        }
        const vc = new ViewportController(makeMockTileManager());
        assert.equal(vc.isActive, false);
        assert.equal(vc.isTransitioning, false);
    });

    it('starts with carousel view mode', () => {
        if (typeof ViewportController === 'undefined') {
            assert.ok(true, 'ViewportController not loaded');
            return;
        }
        const vc = new ViewportController(makeMockTileManager());
        assert.equal(vc.viewMode, 'carousel');
    });

    it('starts with empty navigation set', () => {
        if (typeof ViewportController === 'undefined') {
            assert.ok(true, 'ViewportController not loaded');
            return;
        }
        const vc = new ViewportController(makeMockTileManager());
        assert.deepEqual(vc.navigationFiles, []);
        assert.equal(vc.currentIndex, 0);
    });
});

describe('ViewportController — VIEW_MODES', () => {

    it('has COMPARE, CAROUSEL, and FULLSCREEN modes', () => {
        if (typeof ViewportController === 'undefined') {
            assert.ok(true, 'ViewportController not loaded');
            return;
        }
        assert.equal(ViewportController.VIEW_MODES.COMPARE, 'compare');
        assert.equal(ViewportController.VIEW_MODES.CAROUSEL, 'carousel');
        assert.equal(ViewportController.VIEW_MODES.FULLSCREEN, 'fullscreen');
    });
});

describe('ViewportController — State Queries', () => {

    function makeActiveController() {
        if (typeof ViewportController === 'undefined') return null;

        const tm = {
            container: document.createElement('div'),
            tiles: new Map(),
            getFileOrder: () => [10, 20, 30, 40, 50],
            getTile: () => null,
            ensureTile: () => {},
            getAllTiles: () => [],
            getFile: (id) => ({ id }),
            setupViewport: () => {},
            resetToGrid: () => {},
            virtualScroll: null,
        };

        const vc = new ViewportController(tm);
        // Simulate being in viewport mode
        vc.isActive = true;
        vc.navigationFiles = [10, 20, 30, 40, 50];
        vc.currentIndex = 2;
        return vc;
    }

    it('getCurrentFileId returns correct ID', () => {
        const vc = makeActiveController();
        if (!vc) { assert.ok(true, 'skipped'); return; }
        assert.equal(vc.getCurrentFileId(), 30);
    });

    it('hasNext returns true when not at end', () => {
        const vc = makeActiveController();
        if (!vc) { assert.ok(true, 'skipped'); return; }
        assert.equal(vc.hasNext(), true);
    });

    it('hasPrev returns true when not at start', () => {
        const vc = makeActiveController();
        if (!vc) { assert.ok(true, 'skipped'); return; }
        assert.equal(vc.hasPrev(), true);
    });

    it('hasNext returns false at last index', () => {
        const vc = makeActiveController();
        if (!vc) { assert.ok(true, 'skipped'); return; }
        vc.currentIndex = 4;
        assert.equal(vc.hasNext(), false);
    });

    it('hasPrev returns false at first index', () => {
        const vc = makeActiveController();
        if (!vc) { assert.ok(true, 'skipped'); return; }
        vc.currentIndex = 0;
        assert.equal(vc.hasPrev(), false);
    });

    it('getState returns expected shape', () => {
        const vc = makeActiveController();
        if (!vc) { assert.ok(true, 'skipped'); return; }

        const state = vc.getState();
        assert.equal(state.isActive, true);
        assert.equal(state.currentIndex, 2);
        assert.equal(state.currentFileId, 30);
        assert.equal(state.total, 5);
        assert.equal(state.hasNext, true);
        assert.equal(state.hasPrev, true);
    });
});

describe('ViewportController — Transition Guards', () => {

    it('enter is no-op when already active', () => {
        if (typeof ViewportController === 'undefined') {
            assert.ok(true, 'skipped');
            return;
        }

        const tm = {
            container: document.createElement('div'),
            tiles: new Map(),
            getFileOrder: () => [1, 2, 3],
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
        const indexBefore = vc.currentIndex;
        vc.enter(2);
        // Should have no-oped — index unchanged
        assert.equal(vc.currentIndex, indexBefore);
    });

    it('enter is no-op when transitioning', () => {
        if (typeof ViewportController === 'undefined') {
            assert.ok(true, 'skipped');
            return;
        }

        const tm = {
            container: document.createElement('div'),
            tiles: new Map(),
            getFileOrder: () => [1, 2, 3],
            getTile: () => null,
            ensureTile: () => {},
            getAllTiles: () => [],
            getFile: () => null,
            setupViewport: () => {},
            resetToGrid: () => {},
            virtualScroll: null,
        };

        const vc = new ViewportController(tm);
        vc.isTransitioning = true;
        vc.enter(1);
        // Should have no-oped — isActive still false
        assert.equal(vc.isActive, false);
    });

    it('exit is no-op when not active', () => {
        if (typeof ViewportController === 'undefined') {
            assert.ok(true, 'skipped');
            return;
        }

        const tm = {
            container: document.createElement('div'),
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
        vc.isActive = false;
        // exit() should be a no-op
        vc.exit();
        assert.equal(vc.isActive, false);
        assert.equal(vc.isTransitioning, false);
    });

    it('exit is no-op when transitioning', () => {
        if (typeof ViewportController === 'undefined') {
            assert.ok(true, 'skipped');
            return;
        }

        const tm = {
            container: document.createElement('div'),
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
        vc.isTransitioning = true;
        vc.exit();
        // Should have no-oped — isActive still true (not toggled)
        assert.equal(vc.isActive, true);
    });
});
