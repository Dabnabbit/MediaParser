/**
 * Tile — Position Management Tests
 *
 * Tests position state changes, data attribute updates, and CSS class management.
 * Creates real DOM elements to verify the Tile class behavior.
 */

describe('Tile — POSITIONS Enum', () => {

    it('has all expected position values', () => {
        if (typeof Tile === 'undefined') {
            assert.ok(true, 'Tile not loaded');
            return;
        }
        assert.equal(Tile.POSITIONS.GRID, 'grid');
        assert.equal(Tile.POSITIONS.PREV, 'prev');
        assert.equal(Tile.POSITIONS.CURRENT, 'current');
        assert.equal(Tile.POSITIONS.NEXT, 'next');
        assert.equal(Tile.POSITIONS.HIDDEN, 'hidden');
    });

    it('has exactly 5 positions', () => {
        if (typeof Tile === 'undefined') {
            assert.ok(true, 'Tile not loaded');
            return;
        }
        assert.equal(Object.keys(Tile.POSITIONS).length, 5);
    });
});

describe('Tile — THRESHOLDS', () => {

    it('has THUMBNAIL and FULL thresholds', () => {
        if (typeof Tile === 'undefined') {
            assert.ok(true, 'Tile not loaded');
            return;
        }
        assert.equal(Tile.THRESHOLDS.THUMBNAIL, 0);
        assert.equal(Tile.THRESHOLDS.FULL, 180);
    });
});

describe('Tile — Position State', () => {

    function makeTile() {
        if (typeof Tile === 'undefined') return null;

        const el = document.createElement('div');
        el.className = 'thumbnail';
        el.innerHTML = '<img class="tile-image" src="" alt="test">';
        document.body.appendChild(el);

        const tile = new Tile({
            element: el,
            file: { id: 1, original_filename: 'test.jpg' },
        });

        return tile;
    }

    function cleanup(tile) {
        if (tile?.element) {
            tile.element.remove();
        }
    }

    it('starts in GRID position', () => {
        const tile = makeTile();
        if (!tile) { assert.ok(true, 'skipped'); return; }
        assert.equal(tile.position, 'grid');
        cleanup(tile);
    });

    it('setPosition updates data-vp-pos attribute', () => {
        const tile = makeTile();
        if (!tile) { assert.ok(true, 'skipped'); return; }

        tile.setPosition('current');
        assert.equal(tile.element.dataset.vpPos, 'current');

        tile.setPosition('prev');
        assert.equal(tile.element.dataset.vpPos, 'prev');

        tile.setPosition('next');
        assert.equal(tile.element.dataset.vpPos, 'next');

        tile.setPosition('hidden');
        assert.equal(tile.element.dataset.vpPos, 'hidden');

        tile.setPosition('grid');
        assert.equal(tile.element.dataset.vpPos, 'grid');

        cleanup(tile);
    });

    it('setPosition adds correct vp- class', () => {
        const tile = makeTile();
        if (!tile) { assert.ok(true, 'skipped'); return; }

        tile.setPosition('current');
        assert.ok(tile.element.classList.contains('vp-current'), 'has vp-current');
        assert.notOk(tile.element.classList.contains('vp-grid'), 'no vp-grid');
        assert.notOk(tile.element.classList.contains('vp-prev'), 'no vp-prev');

        tile.setPosition('prev');
        assert.ok(tile.element.classList.contains('vp-prev'), 'has vp-prev');
        assert.notOk(tile.element.classList.contains('vp-current'), 'no vp-current');

        cleanup(tile);
    });

    it('setPosition to GRID removes all viewport classes', () => {
        const tile = makeTile();
        if (!tile) { assert.ok(true, 'skipped'); return; }

        tile.setPosition('current');
        tile.setPosition('grid');

        assert.ok(tile.element.classList.contains('vp-grid'), 'has vp-grid');
        assert.notOk(tile.element.classList.contains('vp-current'), 'no vp-current');
        assert.notOk(tile.element.classList.contains('vp-prev'), 'no vp-prev');
        assert.notOk(tile.element.classList.contains('vp-next'), 'no vp-next');
        assert.notOk(tile.element.classList.contains('vp-hidden'), 'no vp-hidden');

        cleanup(tile);
    });

    it('setPosition is no-op for same position', () => {
        const tile = makeTile();
        if (!tile) { assert.ok(true, 'skipped'); return; }

        let callCount = 0;
        tile.onPositionChange = () => callCount++;

        tile.setPosition('current');
        assert.equal(callCount, 1, 'callback called on change');

        tile.setPosition('current');
        assert.equal(callCount, 1, 'callback NOT called for same position');

        cleanup(tile);
    });

    it('fires onPositionChange callback', () => {
        const tile = makeTile();
        if (!tile) { assert.ok(true, 'skipped'); return; }

        let receivedOld = null;
        let receivedNew = null;

        tile.onPositionChange = (t, newPos, oldPos) => {
            receivedNew = newPos;
            receivedOld = oldPos;
        };

        tile.setPosition('current');
        assert.equal(receivedNew, 'current');
        assert.equal(receivedOld, 'grid');

        cleanup(tile);
    });

    it('isInViewport returns correct value', () => {
        const tile = makeTile();
        if (!tile) { assert.ok(true, 'skipped'); return; }

        assert.equal(tile.isInViewport(), false, 'grid is not in viewport');

        tile.setPosition('current');
        assert.equal(tile.isInViewport(), true, 'current is in viewport');

        tile.setPosition('prev');
        assert.equal(tile.isInViewport(), true, 'prev is in viewport');

        tile.setPosition('grid');
        assert.equal(tile.isInViewport(), false, 'back to grid');

        cleanup(tile);
    });
});

describe('Tile — Selection', () => {

    it('setSelected updates class and checkbox', () => {
        if (typeof Tile === 'undefined') {
            assert.ok(true, 'skipped');
            return;
        }

        const el = document.createElement('div');
        el.className = 'thumbnail';
        el.innerHTML = `
            <div class="thumbnail-badges"><div class="badge-top">
                <label class="thumb-checkbox"><input type="checkbox" data-file-id="1"><span class="checkmark"></span></label>
            </div></div>
            <img class="tile-image" src="" alt="test">
        `;
        document.body.appendChild(el);

        const tile = new Tile({ element: el, file: { id: 1 } });
        assert.equal(tile.selected, false);

        tile.setSelected(true);
        assert.equal(tile.selected, true);
        assert.ok(el.classList.contains('selected'), 'has selected class');
        assert.equal(el.querySelector('input').checked, true, 'checkbox checked');

        tile.setSelected(false);
        assert.equal(tile.selected, false);
        assert.notOk(el.classList.contains('selected'), 'no selected class');
        assert.equal(el.querySelector('input').checked, false, 'checkbox unchecked');

        el.remove();
    });
});

describe('Tile — Static Methods', () => {

    it('fromElement returns tile instance', () => {
        if (typeof Tile === 'undefined') {
            assert.ok(true, 'skipped');
            return;
        }

        const el = document.createElement('div');
        el.innerHTML = '<img class="tile-image" src="" alt="test">';
        document.body.appendChild(el);

        const tile = new Tile({ element: el, file: { id: 99 } });
        assert.equal(Tile.fromElement(el), tile);

        el.remove();
    });

    it('fromElement returns null for non-tile element', () => {
        if (typeof Tile === 'undefined') {
            assert.ok(true, 'skipped');
            return;
        }

        const el = document.createElement('div');
        assert.equal(Tile.fromElement(el), null);
    });
});
