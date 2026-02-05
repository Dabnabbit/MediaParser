# Carousel Viewport Implementation Plan

**STATUS: IMPLEMENTED** (2026-02-04)

All 6 phases completed. Orphaned code from old examination system cleaned up.

**Files Created:**
- `app/static/js/tile.js` - Tile class with MIPMAP resolution
- `app/static/js/tile-manager.js` - TileManager for lifecycle management
- `app/static/js/viewport-controller.js` - ViewportController for examination mode
- `app/static/js/viewport-details.js` - Details panel for viewport
- `app/static/css/viewport.css` - Viewport-specific CSS

**Files Modified:**
- `app/static/js/results.js` - Integrated TileManager
- `app/static/js/selection.js` - Integrated ViewportController
- `app/templates/base.html` - Script ordering, CSS includes
- `app/static/js/examination.js` - Simplified, removed comparison view
- `app/static/css/examination.css` - Removed comparison styles

**Files Deleted:**
- `app/static/js/duplicates.js`
- `app/static/css/duplicates.css`

---

## Overview

Refactor tiles into **universal, scale-aware containers** that work seamlessly across all view contexts. The grid becomes a flexible rendering area where tiles can animate, scale, and transition between grid layout and examination viewport.

## Core Principles

1. **Tiles are the universal unit** - Same element renders at any size
2. **MIPMAP-style resolution** - Image source auto-upgrades based on rendered size
3. **View modes are filters** - Duplicates, Unreviewed, etc. just filter which tiles are visible/navigable
4. **Consistent UX everywhere** - Same examination behavior, controls, and animations across all modes

## Current State

- `results.js` creates `.thumbnail` elements in `.thumbnail-grid`
- `examination.js` creates a separate modal with its own image elements
- Animation attempts to sync separate elements, causing complexity and bugs
- Thumbnail size slider changes grid column size but doesn't affect tile internals

## Target State

- **Tiles are dynamic containers** that can move, scale, and animate
- **Grid container** toggles between grid layout and viewport layout
- **Image resolution follows tile size** - small=thumbnail, large=full-res
- **Examination is just "zoomed viewport"** - tiles scale up, not replaced
- **All view modes behave identically** - filters change what's navigable, not how

---

## The Tile as Universal Container

### Visual Structure (unchanged)
```
┌─────────────────────────────┐
│ ┌─checkbox    status─────┐  │  ← Badge layer (scales with tile)
│ │                        │  │
│ │                        │  │
│ │      IMAGE             │  │  ← Image (MIPMAP source selection)
│ │                        │  │
│ │                        │  │
│ └─confidence    media────┘  │  ← Badge layer
│ [  filename overlay     ]   │  ← Filename (shows on hover/select)
└─────────────────────────────┘
```

### Scale-Aware Behavior

| Tile Rendered Size | Image Source | Badge Size | Filename |
|-------------------|--------------|------------|----------|
| Small (≤150px) | Thumbnail | Compact | Hidden |
| Medium (150-400px) | Thumbnail | Normal | On hover |
| Large (>400px) | Full-res | Large | Always visible |

### MIPMAP Resolution Logic
```javascript
// Tile observes its own size and loads appropriate image
class Tile {
  updateImageSource() {
    const size = this.element.offsetWidth;
    const file = this.fileData;

    if (size > 400 && file.original_path) {
      this.setImage(`/uploads/${file.original_path}`);
    } else {
      this.setImage(`/${file.thumbnail_path}`);
    }
  }
}
```

Uses `ResizeObserver` to detect size changes and trigger resolution updates.

---

## View Modes as Filters

All view modes share identical examination/navigation behavior. The mode just determines:
1. Which tiles are **visible** in the grid
2. Which tiles are **navigable** in examination viewport

```
┌─────────────────────────────────────────────────────────────┐
│                        All Files                             │
│  [1] [2] [3] [4] [5] [6] [7] [8] [9] [10]                  │
└─────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
    ┌───────────┐      ┌───────────┐      ┌───────────┐
    │ Unreviewed│      │Duplicates │      │ Discarded │
    │ [2][5][8] │      │ [3][4][7] │      │   [6][9]  │
    └───────────┘      └───────────┘      └───────────┘
          │                   │                   │
          ▼                   ▼                   ▼
    Examination          Examination         Examination
    navigates            navigates           navigates
    [2]→[5]→[8]         [3]→[4]→[7]         [6]→[9]
```

### Filter State
```javascript
{
  mode: 'duplicates',           // Current view mode
  visibleFileIds: [3, 4, 7],    // Files shown in grid
  navigationIndex: 0,           // Current position in visibleFileIds
}
```

When examination opens, navigation is constrained to `visibleFileIds` only.

---

## Architecture

### Component Responsibilities

```
┌─────────────────────────────────────────────────────────────┐
│ TileManager (refactored from ResultsHandler)                 │
│ - Creates and manages Tile instances                         │
│ - Maintains tile pool and file→tile mapping                  │
│ - Handles tile recycling for large datasets                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ GridController                                               │
│ - Manages grid layout (columns, sizing)                      │
│ - Handles thumbnail size slider                              │
│ - Triggers tile resize observations                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ ViewportController                                           │
│ - Toggles grid ↔ viewport mode                              │
│ - Positions tiles (prev/current/next) in viewport           │
│ - Handles navigation (next/prev/keyboard)                   │
│ - Coordinates with details panel                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ Tile (class)                                                 │
│ - Wraps a DOM element with file data                         │
│ - Observes own size, updates image resolution                │
│ - Renders badges at appropriate scale                        │
│ - Handles position/scale transitions                         │
└─────────────────────────────────────────────────────────────┘
```

### Mode Comparison

| Aspect | Grid Mode | Viewport Mode |
|--------|-----------|---------------|
| Layout | CSS Grid, auto-flow | Flexbox, centered |
| Tile sizing | `--tile-size` (100-200px) | Position-based (prev: 20%, current: 60%, next: 20%) |
| Visible tiles | All in current page | 3 (prev, current, next) |
| Image resolution | Thumbnail (auto-upgrade if large) | Current=Full, sides=Thumbnail |
| Interaction | Click=select, dblclick=examine | Click sides=navigate, arrows=navigate |
| Badges | Compact | Scaled to tile size |

---

## Implementation Phases

### Phase 1: Tile Class Foundation

**Goal:** Create a Tile class that wraps DOM elements with scale-aware behavior.

**Tile class responsibilities:**
```javascript
class Tile {
  constructor(element, fileData) {
    this.element = element;
    this.file = fileData;
    this.currentResolution = 'thumbnail';  // 'thumbnail' | 'full'
    this.resizeObserver = null;
  }

  // Resolution management (MIPMAP)
  observeSize() {}              // Start watching element size
  updateResolution() {}         // Check size, upgrade/downgrade image
  setImageSource(src) {}        // Swap image with optional transition

  // State management
  setPosition(pos) {}           // 'grid' | 'prev' | 'current' | 'next' | 'hidden'
  setSelected(bool) {}
  updateBadges() {}             // Refresh badge visibility/content

  // Utilities
  getRenderedSize() {}          // Current pixel dimensions
  preloadFullRes() {}           // Start loading full-res in background
}
```

**ResizeObserver for MIPMAP:**
```javascript
observeSize() {
  this.resizeObserver = new ResizeObserver(entries => {
    for (const entry of entries) {
      const width = entry.contentRect.width;
      this.updateResolution(width);
    }
  });
  this.resizeObserver.observe(this.element);
}

updateResolution(width) {
  const needsFullRes = width > 400;
  const hasFullRes = this.currentResolution === 'full';

  if (needsFullRes && !hasFullRes && this.file.original_path) {
    this.setImageSource(`/uploads/${this.file.original_path}`);
    this.currentResolution = 'full';
  } else if (!needsFullRes && hasFullRes) {
    this.setImageSource(`/${this.file.thumbnail_path}`);
    this.currentResolution = 'thumbnail';
  }
}
```

**File changes:**
- New file: `tile.js` (replace existing stub with full implementation)

### Phase 2: TileManager

**Goal:** Manage tile instances and file↔tile mapping.

**Responsibilities:**
```javascript
class TileManager {
  constructor(containerElement) {
    this.container = containerElement;
    this.tiles = new Map();        // fileId → Tile instance
    this.fileOrder = [];           // Array of fileIds in display order
  }

  // Tile lifecycle
  createTile(fileData) {}          // Create and register tile
  removeTile(fileId) {}            // Destroy and unregister
  getTile(fileId) {}               // Lookup by file ID
  getAllTiles() {}                 // All tile instances

  // Bulk operations
  renderFiles(files) {}            // Create/update tiles for file array
  clear() {}                       // Remove all tiles

  // Navigation helpers
  getNavigableFiles(filterFn) {}   // Get file IDs matching filter
  getTileAtIndex(index) {}         // Get tile by navigation index
}
```

**Integration with existing ResultsHandler:**
- ResultsHandler uses TileManager internally
- `createThumbnailElement` delegates to `TileManager.createTile`
- Maintains backward compatibility with existing code

**File changes:**
- New file: `tile-manager.js`
- Modify: `results.js` to use TileManager

### Phase 3: Grid/Viewport CSS Architecture

**Goal:** CSS system that handles both grid and viewport layouts seamlessly.

**Container states:**
```css
/* Grid mode (default) */
.thumbnail-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, var(--tile-size, 150px));
  gap: var(--grid-gap, 8px);
}

/* Viewport mode */
.thumbnail-grid.viewport-mode {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: var(--viewport-gap, 16px);
  overflow: hidden;
}
```

**Tile position states:**
```css
/* Base tile - works in both modes */
.thumbnail {
  --tile-scale: 1;
  --tile-opacity: 1;
  transition:
    transform 0.35s cubic-bezier(0.4, 0, 0.2, 1),
    opacity 0.35s ease,
    width 0.35s ease,
    height 0.35s ease;
}

/* Grid mode: tiles follow grid flow */
.thumbnail-grid:not(.viewport-mode) .thumbnail {
  position: relative;
  width: var(--tile-size);
  aspect-ratio: 1;
}

/* Viewport mode: tiles positioned explicitly */
.thumbnail-grid.viewport-mode .thumbnail {
  position: absolute;
  transform: translateX(var(--vp-x)) scale(var(--tile-scale));
  opacity: var(--tile-opacity);
}

/* Viewport positions */
.thumbnail-grid.viewport-mode .thumbnail[data-vp-pos="hidden"] {
  --tile-opacity: 0;
  pointer-events: none;
}

.thumbnail-grid.viewport-mode .thumbnail[data-vp-pos="prev"] {
  --vp-x: -60%;
  --tile-scale: 0.5;
  --tile-opacity: 0.7;
}

.thumbnail-grid.viewport-mode .thumbnail[data-vp-pos="current"] {
  --vp-x: 0;
  --tile-scale: 1;
  --tile-opacity: 1;
  z-index: 10;
}

.thumbnail-grid.viewport-mode .thumbnail[data-vp-pos="next"] {
  --vp-x: 60%;
  --tile-scale: 0.5;
  --tile-opacity: 0.7;
}
```

**Tile sizing in viewport:**
```css
.thumbnail-grid.viewport-mode .thumbnail[data-vp-pos="current"] {
  /* Large examination size */
  width: min(70vw, 800px);
  height: min(70vh, 600px);
  aspect-ratio: auto;
}

.thumbnail-grid.viewport-mode .thumbnail[data-vp-pos="prev"],
.thumbnail-grid.viewport-mode .thumbnail[data-vp-pos="next"] {
  /* Smaller preview size */
  width: min(20vw, 200px);
  height: min(30vh, 250px);
  aspect-ratio: auto;
}
```

**File changes:**
- New file: `viewport.css`
- Modify: `main.css` to support dynamic tile sizing

### Phase 4: ViewportController

**Goal:** Orchestrate viewport mode, navigation, and details panel.

**Class structure:**
```javascript
class ViewportController {
  constructor(tileManager, detailsPanel) {
    this.tileManager = tileManager;
    this.detailsPanel = detailsPanel;
    this.isActive = false;
    this.navigationFiles = [];     // File IDs available for navigation
    this.currentIndex = 0;
  }

  // Mode transitions
  enter(fileId, navigableFileIds) {
    this.isActive = true;
    this.navigationFiles = navigableFileIds;
    this.currentIndex = navigableFileIds.indexOf(fileId);
    this.tileManager.container.classList.add('viewport-mode');
    this.updateTilePositions();
    this.updateDetailsPanel();
  }

  exit() {
    this.isActive = false;
    this.tileManager.container.classList.remove('viewport-mode');
    this.clearTilePositions();
    // Scroll grid to show last-viewed tile
  }

  // Navigation
  next() {
    if (this.currentIndex < this.navigationFiles.length - 1) {
      this.currentIndex++;
      this.updateTilePositions();
      this.updateDetailsPanel();
    }
  }

  previous() {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      this.updateTilePositions();
      this.updateDetailsPanel();
    }
  }

  // Position management
  updateTilePositions() {
    const current = this.navigationFiles[this.currentIndex];
    const prev = this.navigationFiles[this.currentIndex - 1];
    const next = this.navigationFiles[this.currentIndex + 1];

    // Set all tiles to hidden first
    this.tileManager.getAllTiles().forEach(tile => {
      tile.setPosition('hidden');
    });

    // Set visible tiles
    if (prev) this.tileManager.getTile(prev)?.setPosition('prev');
    this.tileManager.getTile(current)?.setPosition('current');
    if (next) this.tileManager.getTile(next)?.setPosition('next');
  }
}
```

**File changes:**
- New file: `viewport-controller.js`

### Phase 5: Integration & Event Handling

**Goal:** Wire everything together with existing systems.

**Event flow:**
```
User double-clicks tile
        │
        ▼
SelectionHandler detects examination trigger
        │
        ▼
Determine navigation set:
  - If multi-select: use selected file IDs
  - Else if filter active: use filtered file IDs
  - Else: use all visible file IDs
        │
        ▼
ViewportController.enter(clickedFileId, navigationSet)
        │
        ▼
Grid transitions to viewport mode
Tiles animate to positions
Details panel updates
        │
        ▼
User navigates (arrows/clicks)
        │
        ▼
ViewportController.next() / previous()
        │
        ▼
Tile positions update (CSS animates)
MIPMAP triggers resolution changes
Details panel updates
        │
        ▼
User exits (Escape/close button)
        │
        ▼
ViewportController.exit()
        │
        ▼
Grid transitions back
Scroll position restored
```

**Keyboard handling:**
```javascript
document.addEventListener('keydown', (e) => {
  if (!viewportController.isActive) return;

  switch(e.key) {
    case 'ArrowLeft':
      viewportController.previous();
      break;
    case 'ArrowRight':
      viewportController.next();
      break;
    case 'Escape':
      viewportController.exit();
      break;
  }
});
```

**File changes:**
- Modify: `selection.js` for examination trigger
- Modify: `filters.js` to provide filtered file lists
- Deprecate: `examination.js` (replace with ViewportController)

### Phase 6: Details Panel & Actions

**Goal:** Reuse existing details panel with viewport system.

**Panel behavior:**
- Panel slides in when viewport activates
- Shows current file details, timestamps, tags
- Action buttons (confirm, discard, etc.) work as before
- Updates on navigation

**Reuse existing HTML:**
- Keep `.examination-details` panel structure
- Keep timestamp editor components
- Keep tag editor components
- Just wire to ViewportController instead of ExaminationHandler

**File changes:**
- Modify: `timestamp.js` to work with ViewportController
- Modify: `tags.js` to work with ViewportController
- Keep panel HTML in `index.html`

---

## Data Flow

### Tile Lifecycle

```javascript
// File data comes from API/ResultsHandler
const fileData = { id: 123, thumbnail_path: '...', original_path: '...', ... };

// TileManager creates Tile instance
const tile = tileManager.createTile(fileData);
// → Creates DOM element
// → Wraps in Tile class
// → Starts ResizeObserver
// → Registers in tileMap

// Tile exists in grid, observing its own size
tile.getRenderedSize();  // e.g., 150 (thumbnail mode)
tile.currentResolution;  // 'thumbnail'

// User resizes grid (thumbnail slider)
// ResizeObserver fires → tile.updateResolution()
tile.getRenderedSize();  // e.g., 250 (larger)
tile.currentResolution;  // still 'thumbnail' (below threshold)

// User enters viewport mode
viewportController.enter(fileId, navigableIds);
// → tile.setPosition('current')
// → CSS makes tile large (e.g., 600px)
// → ResizeObserver fires → tile.updateResolution()
tile.currentResolution;  // 'full' (above threshold)

// User exits viewport
viewportController.exit();
// → tile.setPosition('grid')
// → CSS returns tile to grid size
// → ResizeObserver fires → tile.updateResolution()
tile.currentResolution;  // 'thumbnail' (below threshold again)
```

### Navigation State

```javascript
// ViewportController maintains navigation state
{
  isActive: true,
  navigationFiles: [5, 12, 3, 8, 1],  // File IDs in order
  currentIndex: 2,                     // Currently viewing file ID 3

  // Computed
  currentFileId: 3,
  prevFileId: 12,
  nextFileId: 8,
  hasNext: true,
  hasPrev: true,
}

// Navigation updates positions
viewportController.next();
// currentIndex: 2 → 3
// Tile positions update:
//   file 12: 'prev' → 'hidden'
//   file 3:  'current' → 'prev'
//   file 8:  'next' → 'current'
//   file 1:  'hidden' → 'next'
```

### Filter → Navigation Flow

```javascript
// FilterHandler provides current filter state
const filterState = filterHandler.getState();
// { mode: 'duplicates', visibleFileIds: [3, 4, 7, 15, 22] }

// When entering viewport, pass filtered set
const navigableIds = filterState.visibleFileIds;
viewportController.enter(clickedFileId, navigableIds);

// Navigation constrained to filtered set
// Even if grid has tiles [1,2,3,4,5,6,7,...],
// viewport only navigates [3,4,7,15,22]
```

### Resolution Thresholds

```javascript
// Tile class constants
const RESOLUTION_THRESHOLDS = {
  thumbnail: 0,      // Always use thumbnail below this
  medium: 300,       // Could use medium-res if available
  full: 400,         // Use full-res above this
};

// In tile.updateResolution():
updateResolution(width) {
  if (width >= RESOLUTION_THRESHOLDS.full && this.file.original_path) {
    this.loadImage('full', `/uploads/${this.file.original_path}`);
  } else {
    this.loadImage('thumbnail', `/${this.file.thumbnail_path}`);
  }
}
```

---

## File Structure

```
app/static/
├── css/
│   ├── main.css          # MODIFY: Base tile styles, grid layout
│   ├── viewport.css      # NEW: Viewport mode positioning & transitions
│   ├── tile.css          # MODIFY: Scale-aware badge/element sizing
│   └── examination.css   # DEPRECATE: Details panel styles move to main.css
│
├── js/
│   ├── tile.js           # NEW: Tile class with MIPMAP resolution
│   ├── tile-manager.js   # NEW: Tile pool and file→tile mapping
│   ├── viewport-controller.js  # NEW: Viewport mode orchestration
│   ├── results.js        # MODIFY: Use TileManager, remove direct DOM creation
│   ├── selection.js      # MODIFY: Trigger viewport on examination
│   ├── filters.js        # MODIFY: Provide navigable file lists
│   ├── examination.js    # DEPRECATE: Replaced by ViewportController
│   ├── timestamp.js      # MODIFY: Work with ViewportController
│   └── tags.js           # MODIFY: Work with ViewportController
```

---

## Migration Strategy

### Step 1: Foundation (Non-breaking)
- Create `Tile` class in `tile.js`
- Create `TileManager` in `tile-manager.js`
- Add to page, but ResultsHandler continues creating tiles directly
- Test Tile class independently

### Step 2: TileManager Integration
- ResultsHandler delegates tile creation to TileManager
- Existing functionality preserved
- Tile instances now wrap DOM elements
- MIPMAP resolution starts working (thumbnail slider benefits immediately)

### Step 3: ViewportController (Parallel System)
- Create ViewportController
- Add viewport.css
- Wire to selection handler with feature flag
- Old examination modal still available as fallback

### Step 4: Switch Default
- ViewportController becomes default examination mode
- Old examination.js disabled
- Gather feedback, fix issues

### Step 5: Cleanup
- Remove examination.js
- Remove old examination modal HTML
- Consolidate CSS

---

## Open Questions (Decisions Needed)

1. **Details panel placement:**
   - Option A: Right side panel (current approach)
   - Option B: Bottom drawer (more horizontal space for image)
   - Option C: Overlay that appears on hover/click
   - **Recommendation:** Keep right side panel for consistency

2. **Viewport tile sizing:**
   - Current tile: What's the max size? `min(70vw, 800px)`?
   - Prev/next tiles: Ratio to current? 0.3x? 0.5x?
   - **Recommendation:** Start with 60%/20%/20% split, tune based on feel

3. **Navigation at boundaries:**
   - At first file: Hide prev tile or show disabled state?
   - At last file: Hide next tile or show disabled state?
   - **Recommendation:** Hide tiles at boundaries (cleaner)

4. **Performance with large datasets:**
   - 500+ tiles: All in DOM, most hidden?
   - Or virtualize: Only render visible + buffer?
   - **Recommendation:** Start simple (all in DOM), optimize if needed

5. **Thumbnail size slider in viewport mode:**
   - Disable slider while in viewport?
   - Or allow resizing viewport tiles?
   - **Recommendation:** Disable slider in viewport mode (it doesn't make sense there)

---

## Acceptance Criteria

### Core Functionality
- [ ] Tiles are scale-aware containers with MIPMAP resolution
- [ ] Thumbnail slider triggers resolution upgrades when tiles grow
- [ ] Grid transforms to viewport on double-click/Enter
- [ ] Three tiles visible: prev (small), current (large), next (small)
- [ ] Navigation animates smoothly (tiles slide and scale)
- [ ] Escape/close returns to grid at same scroll position

### Resolution Management
- [ ] Small tiles (≤150px) use thumbnail source
- [ ] Large tiles (>400px) use full-res source
- [ ] Resolution transitions are seamless (no flash/jump)
- [ ] Full-res images preload when tile approaches current position

### View Mode Consistency
- [ ] All view modes (All, Unreviewed, Duplicates, Discarded) work identically
- [ ] View mode determines navigation set, not behavior
- [ ] Filters constrain which tiles are navigable
- [ ] Multi-selection constrains navigation to selected tiles

### Integration
- [ ] Details panel shows file info, timestamps, tags
- [ ] Timestamp editing works in viewport mode
- [ ] Tag editing works in viewport mode
- [ ] Action buttons (confirm, discard, etc.) work
- [ ] Keyboard navigation (arrows, escape) works

### Performance
- [ ] Smooth 60fps animations
- [ ] No jank with 500+ tiles in grid
- [ ] Resolution switches don't cause layout thrashing
- [ ] Memory usage reasonable (tiles don't leak)
