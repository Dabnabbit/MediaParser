/**
 * Tile — Resolution & Class Building Tests
 *
 * Tests MIPMAP resolution logic, image source helpers,
 * and mode-aware class/badge building.
 */

describe('Tile — Image Source Helpers', () => {

    it('getThumbnailSrc returns thumbnail path', () => {
        if (typeof Tile === 'undefined') { assert.ok(true, 'skipped'); return; }
        const tile = new Tile({ file: { id: 1, thumbnail_path: 'storage/thumbnails/1.jpg' } });
        assert.equal(tile.getThumbnailSrc(), '/storage/thumbnails/1.jpg');
    });

    it('getThumbnailSrc returns placeholder when no path', () => {
        if (typeof Tile === 'undefined') { assert.ok(true, 'skipped'); return; }
        const tile = new Tile({ file: { id: 1 } });
        assert.equal(tile.getThumbnailSrc(), '/static/img/placeholder.svg');
    });

    it('getFullResSrc returns uploads path', () => {
        if (typeof Tile === 'undefined') { assert.ok(true, 'skipped'); return; }
        const tile = new Tile({ file: { id: 1, original_path: 'photos/test.jpg' } });
        assert.equal(tile.getFullResSrc(), '/uploads/photos/test.jpg');
    });

    it('getFullResSrc falls back to thumbnail when no original', () => {
        if (typeof Tile === 'undefined') { assert.ok(true, 'skipped'); return; }
        const tile = new Tile({ file: { id: 1, thumbnail_path: 'storage/thumbnails/1.jpg' } });
        assert.equal(tile.getFullResSrc(), '/storage/thumbnails/1.jpg');
    });

    it('hasFullResSource returns true when original_path exists', () => {
        if (typeof Tile === 'undefined') { assert.ok(true, 'skipped'); return; }
        const tile = new Tile({ file: { id: 1, original_path: 'photos/test.jpg' } });
        assert.equal(tile.hasFullResSource(), true);
    });

    it('hasFullResSource returns false when no original_path', () => {
        if (typeof Tile === 'undefined') { assert.ok(true, 'skipped'); return; }
        const tile = new Tile({ file: { id: 1 } });
        assert.equal(tile.hasFullResSource(), false);
    });
});

describe('Tile — Resolution State', () => {

    it('starts at thumbnail resolution', () => {
        if (typeof Tile === 'undefined') { assert.ok(true, 'skipped'); return; }
        const tile = new Tile({ file: { id: 1 } });
        assert.equal(tile.currentResolution, 'thumbnail');
    });

    it('setResolution changes currentResolution', () => {
        if (typeof Tile === 'undefined') { assert.ok(true, 'skipped'); return; }
        const el = document.createElement('div');
        el.innerHTML = '<img class="tile-image" src="/static/img/placeholder.svg" alt="">';
        const tile = new Tile({
            element: el,
            file: { id: 1, original_path: 'photos/test.jpg', thumbnail_path: 'storage/thumbnails/1.jpg' },
        });
        tile.setResolution('full');
        assert.equal(tile.currentResolution, 'full');
    });

    it('setResolution is no-op for same resolution', () => {
        if (typeof Tile === 'undefined') { assert.ok(true, 'skipped'); return; }
        const tile = new Tile({ file: { id: 1 } });
        let callCount = 0;
        tile.onResolutionChange = () => callCount++;
        tile.setResolution('thumbnail'); // same as initial
        assert.equal(callCount, 0);
    });

    it('setResolution fires callback on change', () => {
        if (typeof Tile === 'undefined') { assert.ok(true, 'skipped'); return; }
        const el = document.createElement('div');
        el.innerHTML = '<img class="tile-image" src="/static/img/placeholder.svg" alt="">';
        const tile = new Tile({
            element: el,
            file: { id: 1, original_path: 'photos/test.jpg', thumbnail_path: 'storage/thumbnails/1.jpg' },
        });
        let received = null;
        tile.onResolutionChange = (t, newRes, oldRes) => { received = { newRes, oldRes }; };
        tile.setResolution('full');
        assert.equal(received.newRes, 'full');
        assert.equal(received.oldRes, 'thumbnail');
    });
});

describe('Tile — updateResolution Logic', () => {

    function makeTileWithEl() {
        if (typeof Tile === 'undefined') return null;
        const el = document.createElement('div');
        el.innerHTML = '<img class="tile-image" src="/static/img/placeholder.svg" alt="">';
        return new Tile({
            element: el,
            file: { id: 1, original_path: 'photos/test.jpg', thumbnail_path: 'storage/thumbnails/1.jpg' },
        });
    }

    it('upgrades to full at threshold', () => {
        const tile = makeTileWithEl();
        if (!tile) { assert.ok(true, 'skipped'); return; }
        tile.updateResolution(180); // exactly at FULL threshold
        assert.equal(tile.currentResolution, 'full');
    });

    it('upgrades to full above threshold', () => {
        const tile = makeTileWithEl();
        if (!tile) { assert.ok(true, 'skipped'); return; }
        tile.updateResolution(300);
        assert.equal(tile.currentResolution, 'full');
    });

    it('stays thumbnail below threshold in grid', () => {
        const tile = makeTileWithEl();
        if (!tile) { assert.ok(true, 'skipped'); return; }
        tile.updateResolution(150);
        assert.equal(tile.currentResolution, 'thumbnail');
    });

    it('upgrades when in viewport regardless of size', () => {
        const tile = makeTileWithEl();
        if (!tile) { assert.ok(true, 'skipped'); return; }
        tile.position = Tile.POSITIONS.CURRENT; // in viewport
        tile.updateResolution(100); // below threshold but in viewport
        assert.equal(tile.currentResolution, 'full');
    });

    it('does not upgrade hidden viewport tiles', () => {
        const tile = makeTileWithEl();
        if (!tile) { assert.ok(true, 'skipped'); return; }
        tile.position = Tile.POSITIONS.HIDDEN;
        tile.updateResolution(100);
        assert.equal(tile.currentResolution, 'thumbnail');
    });

    it('does not upgrade without full res source', () => {
        if (typeof Tile === 'undefined') { assert.ok(true, 'skipped'); return; }
        const el = document.createElement('div');
        el.innerHTML = '<img class="tile-image" src="/static/img/placeholder.svg" alt="">';
        const tile = new Tile({ element: el, file: { id: 1 } }); // no original_path
        tile.updateResolution(300);
        assert.equal(tile.currentResolution, 'thumbnail');
    });

    it('downgrades when back in grid below threshold', () => {
        const tile = makeTileWithEl();
        if (!tile) { assert.ok(true, 'skipped'); return; }
        // Upgrade first
        tile.updateResolution(200);
        assert.equal(tile.currentResolution, 'full');
        // Back to grid, small size
        tile.position = Tile.POSITIONS.GRID;
        tile.updateResolution(100);
        assert.equal(tile.currentResolution, 'thumbnail');
    });
});

describe('Tile — buildClassName', () => {

    it('always includes "thumbnail"', () => {
        if (typeof Tile === 'undefined') { assert.ok(true, 'skipped'); return; }
        const tile = new Tile({ file: { id: 1 } });
        assert.ok(tile.buildClassName().includes('thumbnail'));
    });

    it('includes "selected" when selected', () => {
        if (typeof Tile === 'undefined') { assert.ok(true, 'skipped'); return; }
        const tile = new Tile({ file: { id: 1 } });
        tile.selected = true;
        assert.ok(tile.buildClassName().includes('selected'));
    });

    it('includes "discarded" when file is discarded', () => {
        if (typeof Tile === 'undefined') { assert.ok(true, 'skipped'); return; }
        const tile = new Tile({ file: { id: 1, discarded: true } });
        assert.ok(tile.buildClassName().includes('discarded'));
    });

    it('includes "reviewed" when file has reviewed_at', () => {
        if (typeof Tile === 'undefined') { assert.ok(true, 'skipped'); return; }
        const tile = new Tile({ file: { id: 1, reviewed_at: '2026-01-01' } });
        assert.ok(tile.buildClassName().includes('reviewed'));
    });

    it('includes "duplicate-group" when is_duplicate', () => {
        if (typeof Tile === 'undefined') { assert.ok(true, 'skipped'); return; }
        const tile = new Tile({ file: { id: 1, is_duplicate: true } });
        assert.ok(tile.buildClassName().includes('duplicate-group'));
    });

    it('includes "similar-group" when is_similar', () => {
        if (typeof Tile === 'undefined') { assert.ok(true, 'skipped'); return; }
        const tile = new Tile({ file: { id: 1, is_similar: true } });
        assert.ok(tile.buildClassName().includes('similar-group'));
    });
});

describe('Tile — escapeHtml', () => {

    it('escapes angle brackets', () => {
        if (typeof Tile === 'undefined') { assert.ok(true, 'skipped'); return; }
        const tile = new Tile({ file: { id: 1 } });
        const result = tile.escapeHtml('<script>alert("xss")</script>');
        assert.notOk(result.includes('<script>'));
        assert.ok(result.includes('&lt;'));
    });

    it('returns empty string for null', () => {
        if (typeof Tile === 'undefined') { assert.ok(true, 'skipped'); return; }
        const tile = new Tile({ file: { id: 1 } });
        assert.equal(tile.escapeHtml(null), '');
    });

    it('passes through safe strings', () => {
        if (typeof Tile === 'undefined') { assert.ok(true, 'skipped'); return; }
        const tile = new Tile({ file: { id: 1 } });
        assert.equal(tile.escapeHtml('hello world'), 'hello world');
    });
});
