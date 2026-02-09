/**
 * TileManager — Pure Logic Tests
 *
 * Tests file data management, selection, navigation helpers,
 * setupViewport position assignment, and ensureTile creation.
 * Uses virtualScroll: false to avoid needing a real CSS grid layout.
 */

describe('TileManager — File Data Store', () => {

    function makeTM() {
        if (typeof TileManager === 'undefined') return null;
        const container = document.createElement('div');
        container.className = 'thumbnail-grid';
        document.body.appendChild(container);
        const tm = new TileManager(container, { virtualScroll: false });
        return tm;
    }

    function cleanup(tm) {
        if (tm) {
            tm.destroy();
            tm.container?.remove();
        }
    }

    const sampleFiles = [
        { id: 1, original_filename: 'a.jpg' },
        { id: 2, original_filename: 'b.jpg' },
        { id: 3, original_filename: 'c.jpg' },
        { id: 4, original_filename: 'd.jpg' },
        { id: 5, original_filename: 'e.jpg' },
    ];

    it('renderFiles stores all file data', () => {
        const tm = makeTM();
        if (!tm) { assert.ok(true, 'skipped'); return; }
        tm.renderFiles(sampleFiles);
        assert.equal(tm.allFileData.size, 5);
        assert.equal(tm.fileOrder.length, 5);
        cleanup(tm);
    });

    it('getFileOrder returns IDs in display order', () => {
        const tm = makeTM();
        if (!tm) { assert.ok(true, 'skipped'); return; }
        tm.renderFiles(sampleFiles);
        assert.deepEqual(tm.getFileOrder(), [1, 2, 3, 4, 5]);
        cleanup(tm);
    });

    it('getFile returns file data for any file', () => {
        const tm = makeTM();
        if (!tm) { assert.ok(true, 'skipped'); return; }
        tm.renderFiles(sampleFiles);
        const f = tm.getFile(3);
        assert.equal(f.id, 3);
        assert.equal(f.original_filename, 'c.jpg');
        cleanup(tm);
    });

    it('getFile returns undefined for unknown ID', () => {
        const tm = makeTM();
        if (!tm) { assert.ok(true, 'skipped'); return; }
        tm.renderFiles(sampleFiles);
        assert.equal(tm.getFile(999), undefined);
        cleanup(tm);
    });

    it('getFileIndex returns correct index', () => {
        const tm = makeTM();
        if (!tm) { assert.ok(true, 'skipped'); return; }
        tm.renderFiles(sampleFiles);
        assert.equal(tm.getFileIndex(1), 0);
        assert.equal(tm.getFileIndex(3), 2);
        assert.equal(tm.getFileIndex(5), 4);
        assert.equal(tm.getFileIndex(999), -1);
        cleanup(tm);
    });

    it('getAllFiles returns all file data in order', () => {
        const tm = makeTM();
        if (!tm) { assert.ok(true, 'skipped'); return; }
        tm.renderFiles(sampleFiles);
        const all = tm.getAllFiles();
        assert.equal(all.length, 5);
        assert.equal(all[0].id, 1);
        assert.equal(all[4].id, 5);
        cleanup(tm);
    });

    it('clear removes all data and tiles', () => {
        const tm = makeTM();
        if (!tm) { assert.ok(true, 'skipped'); return; }
        tm.renderFiles(sampleFiles);
        tm.clear();
        assert.equal(tm.tiles.size, 0);
        assert.equal(tm.allFileData.size, 0);
        assert.equal(tm.fileOrder.length, 0);
        cleanup(tm);
    });

    it('updateFiles merges partial data', () => {
        const tm = makeTM();
        if (!tm) { assert.ok(true, 'skipped'); return; }
        tm.renderFiles(sampleFiles);
        tm.updateFiles([{ id: 2, reviewed_at: '2026-01-01' }]);
        const f = tm.getFile(2);
        assert.equal(f.reviewed_at, '2026-01-01');
        assert.equal(f.original_filename, 'b.jpg'); // preserved
        cleanup(tm);
    });
});

describe('TileManager — Selection', () => {

    function makeTM() {
        if (typeof TileManager === 'undefined') return null;
        const container = document.createElement('div');
        container.className = 'thumbnail-grid';
        document.body.appendChild(container);
        const tm = new TileManager(container, { virtualScroll: false });
        return tm;
    }

    function cleanup(tm) {
        if (tm) {
            tm.destroy();
            tm.container?.remove();
        }
    }

    const files = [
        { id: 1, original_filename: 'a.jpg' },
        { id: 2, original_filename: 'b.jpg' },
        { id: 3, original_filename: 'c.jpg' },
    ];

    it('setSelected adds/removes from selectedIds', () => {
        const tm = makeTM();
        if (!tm) { assert.ok(true, 'skipped'); return; }
        tm.renderFiles(files);
        tm.setSelected(2, true);
        assert.ok(tm.selectedIds.has(2));
        tm.setSelected(2, false);
        assert.notOk(tm.selectedIds.has(2));
        cleanup(tm);
    });

    it('setMultipleSelected handles sets', () => {
        const tm = makeTM();
        if (!tm) { assert.ok(true, 'skipped'); return; }
        tm.renderFiles(files);
        tm.setMultipleSelected(new Set([1, 3]), true);
        assert.ok(tm.selectedIds.has(1));
        assert.ok(tm.selectedIds.has(3));
        assert.notOk(tm.selectedIds.has(2));
        cleanup(tm);
    });

    it('getSelectedFileIds returns IDs in display order', () => {
        const tm = makeTM();
        if (!tm) { assert.ok(true, 'skipped'); return; }
        tm.renderFiles(files);
        tm.setSelected(3, true);
        tm.setSelected(1, true);
        const selected = tm.getSelectedFileIds();
        assert.deepEqual(selected, [1, 3]); // display order, not selection order
        cleanup(tm);
    });

    it('clearSelection empties everything', () => {
        const tm = makeTM();
        if (!tm) { assert.ok(true, 'skipped'); return; }
        tm.renderFiles(files);
        tm.setMultipleSelected([1, 2, 3], true);
        tm.clearSelection();
        assert.equal(tm.selectedIds.size, 0);
        assert.equal(tm.getSelectedFileIds().length, 0);
        cleanup(tm);
    });

    it('selection survives renderFiles with selectedIds option', () => {
        const tm = makeTM();
        if (!tm) { assert.ok(true, 'skipped'); return; }
        tm.renderFiles(files, { selectedIds: new Set([2]) });
        assert.ok(tm.selectedIds.has(2));
        const tile = tm.getTile(2);
        assert.ok(tile.selected);
        cleanup(tm);
    });
});

describe('TileManager — getNavigableFiles', () => {

    function makeTM() {
        if (typeof TileManager === 'undefined') return null;
        const container = document.createElement('div');
        container.className = 'thumbnail-grid';
        document.body.appendChild(container);
        const tm = new TileManager(container, { virtualScroll: false });
        return tm;
    }

    function cleanup(tm) {
        if (tm) {
            tm.destroy();
            tm.container?.remove();
        }
    }

    const files = [
        { id: 1, original_filename: 'a.jpg', discarded: false },
        { id: 2, original_filename: 'b.jpg', discarded: true },
        { id: 3, original_filename: 'c.jpg', discarded: false },
        { id: 4, original_filename: 'd.jpg', discarded: true },
    ];

    it('returns all files when no filter', () => {
        const tm = makeTM();
        if (!tm) { assert.ok(true, 'skipped'); return; }
        tm.renderFiles(files);
        assert.deepEqual(tm.getNavigableFiles(), [1, 2, 3, 4]);
        cleanup(tm);
    });

    it('filters by predicate', () => {
        const tm = makeTM();
        if (!tm) { assert.ok(true, 'skipped'); return; }
        tm.renderFiles(files);
        const notDiscarded = tm.getNavigableFiles(f => !f.discarded);
        assert.deepEqual(notDiscarded, [1, 3]);
        cleanup(tm);
    });

    it('returns empty array when no match', () => {
        const tm = makeTM();
        if (!tm) { assert.ok(true, 'skipped'); return; }
        tm.renderFiles(files);
        const none = tm.getNavigableFiles(f => f.id > 100);
        assert.deepEqual(none, []);
        cleanup(tm);
    });
});

describe('TileManager — setupViewport', () => {

    function makeTM() {
        if (typeof TileManager === 'undefined') return null;
        const container = document.createElement('div');
        container.className = 'thumbnail-grid';
        document.body.appendChild(container);
        const tm = new TileManager(container, { virtualScroll: false });
        return tm;
    }

    function cleanup(tm) {
        if (tm) {
            tm.destroy();
            tm.container?.remove();
        }
    }

    const files = [
        { id: 10, original_filename: 'a.jpg' },
        { id: 20, original_filename: 'b.jpg' },
        { id: 30, original_filename: 'c.jpg' },
        { id: 40, original_filename: 'd.jpg' },
        { id: 50, original_filename: 'e.jpg' },
    ];

    it('sets current tile to CURRENT position', () => {
        const tm = makeTM();
        if (!tm) { assert.ok(true, 'skipped'); return; }
        tm.renderFiles(files);
        tm.setupViewport(30, [10, 20, 30, 40, 50]);
        assert.equal(tm.getTile(30).position, 'current');
        cleanup(tm);
    });

    it('sets prev and next tiles', () => {
        const tm = makeTM();
        if (!tm) { assert.ok(true, 'skipped'); return; }
        tm.renderFiles(files);
        tm.setupViewport(30, [10, 20, 30, 40, 50]);
        assert.equal(tm.getTile(20).position, 'prev');
        assert.equal(tm.getTile(40).position, 'next');
        cleanup(tm);
    });

    it('non-viewport tiles stay in GRID', () => {
        const tm = makeTM();
        if (!tm) { assert.ok(true, 'skipped'); return; }
        tm.renderFiles(files);
        tm.setupViewport(30, [10, 20, 30, 40, 50]);
        assert.equal(tm.getTile(10).position, 'grid');
        assert.equal(tm.getTile(50).position, 'grid');
        cleanup(tm);
    });

    it('first file has no prev', () => {
        const tm = makeTM();
        if (!tm) { assert.ok(true, 'skipped'); return; }
        tm.renderFiles(files);
        tm.setupViewport(10, [10, 20, 30, 40, 50]);
        assert.equal(tm.getTile(10).position, 'current');
        assert.equal(tm.getTile(20).position, 'next');
        // No tile should be prev
        const prevTiles = tm.getAllTiles().filter(t => t.position === 'prev');
        assert.equal(prevTiles.length, 0);
        cleanup(tm);
    });

    it('last file has no next', () => {
        const tm = makeTM();
        if (!tm) { assert.ok(true, 'skipped'); return; }
        tm.renderFiles(files);
        tm.setupViewport(50, [10, 20, 30, 40, 50]);
        assert.equal(tm.getTile(50).position, 'current');
        assert.equal(tm.getTile(40).position, 'prev');
        const nextTiles = tm.getAllTiles().filter(t => t.position === 'next');
        assert.equal(nextTiles.length, 0);
        cleanup(tm);
    });

    it('resetToGrid sets all tiles back to GRID', () => {
        const tm = makeTM();
        if (!tm) { assert.ok(true, 'skipped'); return; }
        tm.renderFiles(files);
        tm.setupViewport(30, [10, 20, 30, 40, 50]);
        tm.resetToGrid();
        tm.getAllTiles().forEach(tile => {
            assert.equal(tile.position, 'grid', `Tile ${tile.file.id} should be grid`);
        });
        cleanup(tm);
    });

    it('setAllPositions sets every tile', () => {
        const tm = makeTM();
        if (!tm) { assert.ok(true, 'skipped'); return; }
        tm.renderFiles(files);
        tm.setAllPositions('hidden');
        tm.getAllTiles().forEach(tile => {
            assert.equal(tile.position, 'hidden');
        });
        cleanup(tm);
    });
});

describe('TileManager — ensureTile', () => {

    function makeTM() {
        if (typeof TileManager === 'undefined') return null;
        const container = document.createElement('div');
        container.className = 'thumbnail-grid';
        document.body.appendChild(container);
        const tm = new TileManager(container, { virtualScroll: false });
        return tm;
    }

    function cleanup(tm) {
        if (tm) {
            tm.destroy();
            tm.container?.remove();
        }
    }

    it('returns existing tile if already rendered', () => {
        const tm = makeTM();
        if (!tm) { assert.ok(true, 'skipped'); return; }
        tm.renderFiles([{ id: 1, original_filename: 'a.jpg' }]);
        const tile1 = tm.getTile(1);
        const tile2 = tm.ensureTile(1);
        assert.equal(tile1, tile2);
        cleanup(tm);
    });

    it('returns undefined for unknown file ID', () => {
        const tm = makeTM();
        if (!tm) { assert.ok(true, 'skipped'); return; }
        tm.renderFiles([{ id: 1, original_filename: 'a.jpg' }]);
        const result = tm.ensureTile(999);
        assert.equal(result, undefined);
        cleanup(tm);
    });
});

describe('TileManager — Tile Count', () => {

    function makeTM() {
        if (typeof TileManager === 'undefined') return null;
        const container = document.createElement('div');
        container.className = 'thumbnail-grid';
        document.body.appendChild(container);
        const tm = new TileManager(container, { virtualScroll: false });
        return tm;
    }

    function cleanup(tm) {
        if (tm) {
            tm.destroy();
            tm.container?.remove();
        }
    }

    it('size property returns rendered tile count', () => {
        const tm = makeTM();
        if (!tm) { assert.ok(true, 'skipped'); return; }
        tm.renderFiles([
            { id: 1, original_filename: 'a.jpg' },
            { id: 2, original_filename: 'b.jpg' },
        ]);
        assert.equal(tm.size, 2);
        cleanup(tm);
    });

    it('removeTile decrements count', () => {
        const tm = makeTM();
        if (!tm) { assert.ok(true, 'skipped'); return; }
        tm.renderFiles([
            { id: 1, original_filename: 'a.jpg' },
            { id: 2, original_filename: 'b.jpg' },
        ]);
        tm.removeTile(1);
        assert.equal(tm.size, 1);
        assert.equal(tm.getTile(1), undefined);
        cleanup(tm);
    });
});
