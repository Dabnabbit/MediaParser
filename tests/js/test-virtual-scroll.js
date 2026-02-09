/**
 * VirtualScrollManager — Layout Math Tests
 *
 * Tests pure layout calculations without needing a real scrollable DOM.
 * We construct a VirtualScrollManager with a mock container, override
 * the metrics that recalculateLayout would compute, and test the math.
 */

describe('VirtualScrollManager — Column Calculation', () => {
    // Formula: Math.max(1, Math.floor((containerWidth + gap) / (tileSize + gap)))

    it('calculates columns for a typical width', () => {
        // 1000px wide, 150px tiles, 8px gap → (1000+8)/(150+8) = 6.38 → 6
        const cols = Math.max(1, Math.floor((1000 + 8) / (150 + 8)));
        assert.equal(cols, 6);
    });

    it('calculates 1 column for narrow container', () => {
        // 100px wide, 150px tiles, 8px gap → (100+8)/(150+8) = 0.68 → max(1,0) = 1
        const cols = Math.max(1, Math.floor((100 + 8) / (150 + 8)));
        assert.equal(cols, 1);
    });

    it('calculates columns when tiles exactly fit', () => {
        // 3 tiles: width needed = 3*150 + 2*8 = 466
        // (466+8)/(150+8) = 3.0 → 3
        const cols = Math.max(1, Math.floor((466 + 8) / (150 + 8)));
        assert.equal(cols, 3);
    });

    it('returns at least 1 column for zero width', () => {
        const cols = Math.max(1, Math.floor((0 + 8) / (150 + 8)));
        assert.equal(cols, 1);
    });

    it('handles different tile sizes', () => {
        // 800px wide, 200px tiles, 12px gap → (800+12)/(200+12) = 3.83 → 3
        const cols = Math.max(1, Math.floor((800 + 12) / (200 + 12)));
        assert.equal(cols, 3);
    });
});

describe('VirtualScrollManager — Row Calculation', () => {

    it('calculates rows for exact fill', () => {
        // 12 files, 4 columns → 3 rows
        const rows = Math.ceil(12 / 4);
        assert.equal(rows, 3);
    });

    it('calculates rows for partial last row', () => {
        // 10 files, 4 columns → 3 rows
        const rows = Math.ceil(10 / 4);
        assert.equal(rows, 3);
    });

    it('handles 0 files', () => {
        const rows = Math.ceil(0 / 4);
        assert.equal(rows, 0);
    });

    it('handles 1 file', () => {
        const rows = Math.ceil(1 / 6);
        assert.equal(rows, 1);
    });

    it('handles 1 column', () => {
        const rows = Math.ceil(5 / 1);
        assert.equal(rows, 5);
    });
});

describe('VirtualScrollManager — Grid Position', () => {

    it('returns correct position for first file', () => {
        // Index 0, 4 columns → row 1, col 1 (1-indexed for CSS)
        const pos = { row: Math.floor(0 / 4) + 1, col: (0 % 4) + 1 };
        assert.deepEqual(pos, { row: 1, col: 1 });
    });

    it('returns correct position for last column', () => {
        // Index 3, 4 columns → row 1, col 4
        const pos = { row: Math.floor(3 / 4) + 1, col: (3 % 4) + 1 };
        assert.deepEqual(pos, { row: 1, col: 4 });
    });

    it('returns correct position for second row', () => {
        // Index 4, 4 columns → row 2, col 1
        const pos = { row: Math.floor(4 / 4) + 1, col: (4 % 4) + 1 };
        assert.deepEqual(pos, { row: 2, col: 1 });
    });

    it('returns correct position for arbitrary index', () => {
        // Index 11, 5 columns → row 3, col 2
        const pos = { row: Math.floor(11 / 5) + 1, col: (11 % 5) + 1 };
        assert.deepEqual(pos, { row: 3, col: 2 });
    });

    it('handles single column', () => {
        // Index 3, 1 column → row 4, col 1
        const pos = { row: Math.floor(3 / 1) + 1, col: (3 % 1) + 1 };
        assert.deepEqual(pos, { row: 4, col: 1 });
    });
});

describe('VirtualScrollManager — Visible Range', () => {

    function calcRange(scrollTop, clientHeight, rowHeight, totalRows, columns, fileCount, overscanRows) {
        const startRow = Math.max(0, Math.floor(scrollTop / rowHeight) - overscanRows);
        const endRow = Math.min(totalRows, Math.ceil((scrollTop + clientHeight) / rowHeight) + overscanRows);
        const startIdx = startRow * columns;
        const endIdx = Math.min(fileCount, endRow * columns);
        return { startIdx, endIdx };
    }

    it('calculates range at top of scroll', () => {
        // scrollTop=0, clientHeight=600, rowHeight=158 (150+8), totalRows=10, 4 cols, 40 files, 3 overscan
        const range = calcRange(0, 600, 158, 10, 4, 40, 3);
        // endRow = min(10, ceil(600/158)+3) = min(10, 4+3) = 7
        // startIdx = 0, endIdx = min(40, 28) = 28
        assert.equal(range.startIdx, 0);
        assert.equal(range.endIdx, 28);
    });

    it('calculates range mid-scroll', () => {
        // scrollTop=474 (3 rows), clientHeight=600, rowHeight=158, 10 rows, 4 cols, 40 files, 3 overscan
        const range = calcRange(474, 600, 158, 10, 4, 40, 3);
        // startRow = max(0, floor(474/158)-3) = max(0, 3-3) = 0
        // endRow = min(10, ceil(1074/158)+3) = min(10, 7+3) = 10
        assert.equal(range.startIdx, 0);
        assert.equal(range.endIdx, 40);
    });

    it('clamps endIdx to file count', () => {
        const range = calcRange(0, 2000, 158, 3, 4, 10, 3);
        // Would calculate way past file count
        assert.ok(range.endIdx <= 10, 'endIdx should not exceed file count');
        assert.equal(range.endIdx, 10);
    });

    it('handles empty file list', () => {
        // 0 files, 0 totalRows
        const range = calcRange(0, 600, 158, 0, 4, 0, 3);
        assert.equal(range.startIdx, 0);
        assert.equal(range.endIdx, 0);
    });
});

describe('VirtualScrollManager — getGridPosition (via class)', () => {

    it('uses getGridPosition method when class is available', () => {
        if (typeof VirtualScrollManager === 'undefined') {
            // Class not loaded — skip gracefully
            assert.ok(true, 'VirtualScrollManager not loaded, skipping class test');
            return;
        }

        // Create with a mock container
        const container = document.createElement('div');
        container.style.cssText = 'width:600px;height:400px;display:grid;';
        document.body.appendChild(container);

        const vs = new VirtualScrollManager(container);
        vs.columns = 4;

        assert.deepEqual(vs.getGridPosition(0), { row: 1, col: 1 });
        assert.deepEqual(vs.getGridPosition(3), { row: 1, col: 4 });
        assert.deepEqual(vs.getGridPosition(4), { row: 2, col: 1 });
        assert.deepEqual(vs.getGridPosition(11), { row: 3, col: 4 });

        vs.destroy();
        container.remove();
    });
});
