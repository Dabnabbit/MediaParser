# Carousel Viewport Implementation Plan

**STATUS: IMPLEMENTED** (2026-02-04)

All 6 phases completed. Orphaned code from old examination system cleaned up.
FLIP enter animation, grid position locking, and z-index layering added.

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

Refactor tiles into **universal, scale-aware containers** that work seamlessly across all view contexts. The grid stays in document flow at all times. When entering examination (viewport) mode, the grid remains visible behind a semi-transparent backdrop while three tiles (prev/current/next) are pulled out of grid flow with `position: fixed` and positioned as a carousel overlay.

## Core Principles

1. **Tiles are the universal unit** - Same element renders at any size
2. **MIPMAP-style resolution** - Image source auto-upgrades based on rendered size
3. **View modes are filters** - Duplicates, Unreviewed, etc. just filter which tiles are visible/navigable
4. **Grid stays in document flow** - Never yanked out of position; viewport tiles overlay on top
5. **Consistent UX everywhere** - Same examination behavior, controls, and animations across all modes

---

## The Tile as Universal Container

### Visual Structure
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

Uses `ResizeObserver` to detect size changes and trigger resolution updates.
Threshold: 400px width triggers full-res upgrade.

```javascript
class Tile {
  static THRESHOLDS = {
    THUMBNAIL: 0,
    FULL: 400,
  };

  updateResolution(width) {
    const needsFullRes = width >= Tile.THRESHOLDS.FULL;
    const inViewport = this.isInViewport();
    const shouldUpgrade = (needsFullRes || inViewport) && this.hasFullResSource();
    if (shouldUpgrade) this.setResolution('full');
    else if (!needsFullRes && !inViewport) this.setResolution('thumbnail');
  }
}
```

Viewport tiles (prev/current/next) always upgrade to full-res regardless of threshold.

### Position States

Tiles use a `data-vp-pos` attribute for CSS-driven positioning:

| Position | Description | CSS Behavior |
|----------|-------------|--------------|
| `grid` | Normal grid cell | `pointer-events: none; z-index: 0` (behind backdrop) |
| `prev` | Left side of carousel | `position: fixed; z-index: 5; opacity: 0.6` |
| `current` | Center of carousel | `position: fixed; z-index: 10; opacity: 1` |
| `next` | Right side of carousel | `position: fixed; z-index: 5; opacity: 0.6` |
| `hidden` | Not visible | Legacy state, unused — non-viewport tiles stay in `grid` |

**Key design decision:** Non-viewport tiles remain at `grid` position (not `hidden`). They stay in their grid cells behind the backdrop, preserving grid layout. Only 3 tiles are ever pulled out via `position: fixed`.

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

When examination opens, navigation is constrained to the filtered file set only.

---

## Architecture

### Component Responsibilities

```
┌─────────────────────────────────────────────────────────────┐
│ TileManager                                                  │
│ - Creates and manages Tile instances                         │
│ - Maintains file ID → Tile mapping                           │
│ - Handles lazy loading via IntersectionObserver              │
│ - setupViewport(): assigns prev/current/next positions       │
│   without bouncing tiles through GRID                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ ViewportController                                           │
│ - FLIP animation on enter (grid → viewport)                 │
│ - Grid position locking (prevents reflow)                   │
│ - Z-index priority management during navigation              │
│ - Keyboard navigation (arrows, escape, space, V)            │
│ - Coordinates with details panel                             │
│ - Reads transition duration from CSS variable                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ Tile (class)                                                 │
│ - Wraps a DOM element with file data                         │
│ - Observes own size, updates image resolution (MIPMAP)       │
│ - Renders badges at appropriate scale                        │
│ - Position state via data-vp-pos attribute                   │
│ - Auto-upgrades to full-res in viewport positions            │
└─────────────────────────────────────────────────────────────┘
```

### Mode Comparison

| Aspect | Grid Mode | Viewport Mode |
|--------|-----------|---------------|
| Container | CSS Grid, auto-fill columns | Grid stays in place, `position: relative; z-index: 1000` |
| Grid tiles | Normal flow | Stay in cells, `z-index: 0` (behind backdrop) |
| Viewport tiles | N/A | `position: fixed` above backdrop (z-index: 5/10) |
| Backdrop | N/A | `::before` pseudo-element, `position: fixed; z-index: 1` |
| Tile sizing | `repeat(auto-fill, 100px/150px/200px)` | CSS custom properties for viewport dimensions |
| Image resolution | Thumbnail (auto-upgrade if large) | All viewport tiles upgraded to full-res |
| Interaction | Click=select, dblclick=examine | Click sides=navigate, arrows=navigate, Esc=exit |
| Badges | Compact | Hidden on side tiles, scaled up on current tile |

---

## Z-Index Layering System

The container (`viewport-mode`) creates a stacking context at `z-index: 1000`. Within it:

```
Layer                    z-index    Element
─────────────────────────────────────────────────
UI controls              1010       close button, counter, hints, mode toggle
Current tile             10         .thumbnail[data-vp-pos="current"]
Prev/Next tiles          5          .thumbnail[data-vp-pos="prev/next"]
Entering tiles (nav)     2          Inline z-index on tiles entering from grid
Backdrop                 1          ::before pseudo-element (fixed overlay)
Grid tiles               0          .thumbnail[data-vp-pos="grid"] (stacking context contains badges)
```

### Z-Index Management During Navigation

When navigating, z-indices are shuffled **before** position changes so the correct tile is always on top:

1. **Clear** inline z-indices from previous navigation (CSS takes over)
2. **Promote** upcoming current tile to `z-index: 10` inline
3. **Demote** tiles entering from grid to `z-index: 2` inline (below existing viewport tiles)
4. **Apply** position changes via `setupViewport()`
5. **Cleanup** happens at the start of the next navigation call, or on exit

This ensures:
- The tile becoming `current` is always visually on top during the crossover animation
- Tiles entering from the grid animate in behind the existing viewport tiles
- CSS defaults resume once transitions settle

---

## FLIP Animation (Enter)

When entering viewport mode, tiles animate from their grid positions to their viewport positions using the FLIP technique (First, Last, Invert, Play):

```
1. lockGridPositions()
   └─ Freeze grid template rows/columns to pixel values
   └─ Assign explicit gridRow/gridColumn to every tile (calculated from index + column count)
   └─ Prevents grid reflow when viewport tiles leave flow

2. captureStartPositions(viewportTiles)
   └─ getBoundingClientRect() on the 3 viewport tiles while still in grid

3. applyStartPositions(positions)
   └─ Set inline position:fixed + left/top/width/height matching grid position
   └─ Set inline transition:none to prevent premature animation

4. Activate viewport mode
   └─ body.classList.add('viewport-active')
   └─ container.classList.add('viewport-mode')
   └─ Backdrop ::before appears (animated fade-in via @keyframes)

5. updateTilePositions()
   └─ setupViewport() assigns prev/current/next via data-vp-pos
   └─ CSS target positions now differ from inline frozen positions

6. Force reflow → requestAnimationFrame → clearStartPositions()
   └─ Remove all inline overrides
   └─ CSS transitions take over: tiles animate from grid positions to viewport positions
   └─ Transition duration read from --vp-transition-duration CSS variable

7. setTimeout(durationMs) → isTransitioning = false
```

### Grid Position Locking

When viewport tiles get `position: fixed`, they leave grid flow. Without locking, the remaining grid tiles would reflow to fill the gaps. The locking system:

```javascript
lockGridPositions() {
    // Freeze grid tracks at computed pixel sizes
    container.style.gridTemplateRows = getComputedStyle(container).gridTemplateRows;
    container.style.gridTemplateColumns = getComputedStyle(container).gridTemplateColumns;

    // Pin every tile to its exact cell (calculated, not read — Chrome returns "auto")
    const cols = gridTemplateColumns.split(/\s+/).length;
    fileOrder.forEach((fileId, index) => {
        tile.element.style.gridRow = String(Math.floor(index / cols) + 1);
        tile.element.style.gridColumn = String((index % cols) + 1);
    });
}
```

On exit, `unlockGridPositions()` clears all inline grid styles, returning to auto-placement.

**Why calculate instead of read:** `getComputedStyle(el).gridRowStart` returns `"auto"` for auto-placed items in Chrome, so we calculate row/column from the tile's index in display order and the column count.

---

## Navigation (setupViewport)

The `TileManager.setupViewport()` method handles position assignment during navigation. Critical design: it **never bounces viewport tiles through GRID**, which would reset their transition starting point.

```javascript
setupViewport(currentFileId, navigableIds) {
    const viewportIds = new Set([prevId, currentFileId, nextId]);

    // Only move NON-viewport tiles to grid
    this.tiles.forEach((tile, fileId) => {
        if (!viewportIds.has(fileId) && tile.position !== Tile.POSITIONS.GRID) {
            tile.setPosition(Tile.POSITIONS.GRID);
        }
    });

    // Set viewport positions directly — tiles transition smoothly
    // between viewport positions (PREV→CURRENT, CURRENT→NEXT, etc.)
    this.getTile(prevId)?.setPosition(Tile.POSITIONS.PREV);
    this.getTile(currentFileId)?.setPosition(Tile.POSITIONS.CURRENT);
    this.getTile(nextId)?.setPosition(Tile.POSITIONS.NEXT);
}
```

This means a tile going from `next` to `current` transitions directly (its CSS properties change and the transition animates) rather than going `next → grid → current` which would cause it to fly from its grid cell.

---

## CSS Architecture

### Custom Properties

```css
:root {
    --vp-current-width: min(70vw, 800px);
    --vp-current-height: min(70vh, 600px);
    --vp-side-width: min(15vw, 180px);
    --vp-side-height: min(25vh, 220px);
    --vp-gap: 24px;
    --vp-side-offset: calc(var(--vp-current-width) / 2 + var(--vp-side-width) / 2 + var(--vp-gap));
    --vp-transition-duration: 0.35s;
    --vp-transition-easing: cubic-bezier(0.4, 0, 0.2, 1);
    --vp-backdrop: rgba(0, 0, 0, 0.85);
}
```

### Container (stays in document flow)

```css
.thumbnail-grid.viewport-mode {
    position: relative;    /* NOT fixed — grid stays where it is */
    z-index: 1000;         /* Creates stacking context for all layers */
}
```

### Backdrop (::before pseudo-element)

```css
.thumbnail-grid.viewport-mode::before {
    content: '';
    position: fixed;
    inset: 0;
    background: var(--vp-backdrop);
    z-index: 1;            /* Above grid tiles (0), below viewport tiles (5/10) */
    animation: backdropFadeIn var(--vp-transition-duration) ease forwards;
}
```

### Grid Tiles

```css
.thumbnail-grid.viewport-mode .thumbnail[data-vp-pos="grid"] {
    pointer-events: none;
    z-index: 0;            /* Creates stacking context → contains badge z-indices */
}
```

The `z-index: 0` is critical: it creates a stacking context so `.thumbnail-badges` (z-index: 5 within the tile) cannot escape above the backdrop (z-index: 1).

### Viewport Tiles

```css
/* Shared: pulled out of grid flow */
.thumbnail-grid.viewport-mode .thumbnail[data-vp-pos="prev"],
.thumbnail-grid.viewport-mode .thumbnail[data-vp-pos="current"],
.thumbnail-grid.viewport-mode .thumbnail[data-vp-pos="next"] {
    position: fixed;
    left: 50%;
    top: 50%;
    aspect-ratio: auto;
    transition:
        transform var(--vp-transition-duration) var(--vp-transition-easing),
        left var(--vp-transition-duration) var(--vp-transition-easing),
        top var(--vp-transition-duration) var(--vp-transition-easing),
        opacity var(--vp-transition-duration) ease,
        width var(--vp-transition-duration) var(--vp-transition-easing),
        height var(--vp-transition-duration) var(--vp-transition-easing);
    will-change: transform, opacity;
}

/* Previous: left side */
[data-vp-pos="prev"] {
    width: var(--vp-side-width);
    height: var(--vp-side-height);
    transform: translate(calc(-50% - var(--vp-side-offset)), -50%);
    opacity: 0.6;
    z-index: 5;
}

/* Current: center */
[data-vp-pos="current"] {
    width: var(--vp-current-width);
    height: var(--vp-current-height);
    transform: translate(-50%, -50%);
    opacity: 1;
    z-index: 10;
}

/* Next: right side */
[data-vp-pos="next"] {
    width: var(--vp-side-width);
    height: var(--vp-side-height);
    transform: translate(calc(-50% + var(--vp-side-offset)), -50%);
    opacity: 0.6;
    z-index: 5;
}
```

### View Modes

Three viewport display modes, cycled with `V` key:

| Mode | Behavior |
|------|----------|
| **Carousel** (default) | Large center, small prev/next |
| **Compare** | Three equal-width tiles side by side |
| **Fullscreen** | Single large image, side tiles hidden |

---

## Exit Flow

1. Add `viewport-exiting` class (backdrop fade-out animation)
2. After timeout:
   - Clear inline z-indices
   - `resetToGrid()` — all tiles back to `data-vp-pos="grid"`
   - `unlockGridPositions()` — remove inline grid-row/column, restore auto-placement
   - Remove `viewport-mode` class
   - Restore scroll position
   - Scroll last-viewed tile into view

---

## Event Flow

```
User double-clicks tile
        │
        ▼
SelectionHandler detects examination trigger
        │
        ▼
Determine navigation set:
  - If filter active: use filtered file IDs
  - Else: use all visible file IDs
        │
        ▼
ViewportController.enter(clickedFileId, navigationSet)
        │
        ├─ lockGridPositions() — freeze grid layout
        ├─ captureStartPositions() — record grid positions
        ├─ applyStartPositions() — freeze tiles at grid coords
        ├─ Add viewport-mode class — backdrop appears
        ├─ updateTilePositions() — assign prev/current/next (with z-index priority)
        ├─ clearStartPositions() — release to animate (FLIP play)
        ├─ upgradeVisibleTilesToFullRes()
        └─ showDetailsPanel()
        │
        ▼
User navigates (arrows/clicks/wheel)
        │
        ▼
ViewportController.next() / previous()
        │
        ├─ _clearViewportZIndices() — reset previous inline z
        ├─ Set z:10 on upcoming current, z:2 on entering-from-grid tiles
        └─ setupViewport() — tiles transition between positions (CSS animated)
        │
        ▼
User exits (Escape/close button)
        │
        ▼
ViewportController.exit()
        │
        ├─ _clearViewportZIndices()
        ├─ resetToGrid()
        ├─ unlockGridPositions()
        └─ Restore scroll position
```

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `←` / `↑` | Previous file |
| `→` / `↓` | Next file |
| `Home` | First file |
| `End` | Last file |
| `Escape` | Exit viewport |
| `Space` | Toggle details panel |
| `V` | Cycle view mode (carousel → compare → fullscreen) |
| Mouse wheel | Navigate prev/next (debounced 150ms) |

---

## File Structure

```
app/static/
├── css/
│   ├── main.css          # Grid layout, thumbnail base styles, badges
│   ├── viewport.css      # Viewport mode: backdrop, positions, transitions, details panel
│   └── tile.css          # Scale-aware badge/element sizing
│
├── js/
│   ├── tile.js           # Tile class: MIPMAP resolution, position states
│   ├── tile-manager.js   # TileManager: lifecycle, file mapping, setupViewport()
│   ├── viewport-controller.js  # ViewportController: FLIP, grid locking, z-index, navigation
│   ├── viewport-details.js     # ViewportDetails: file info, action buttons
│   ├── results.js        # ResultsHandler: uses TileManager for grid rendering
│   ├── selection.js      # SelectionHandler: triggers viewport.enter()
│   ├── filters.js        # FilterHandler: provides navigable file lists
│   └── examination.js    # ExaminationHandler: duplicate group loading (legacy)
```

---

## Acceptance Criteria

### Core Functionality
- [x] Tiles are scale-aware containers with MIPMAP resolution
- [x] Thumbnail slider triggers resolution upgrades when tiles grow
- [x] Grid transforms to viewport on double-click/Enter
- [x] Three tiles visible: prev (small), current (large), next (small)
- [x] FLIP animation on enter: tiles fly from grid positions to viewport positions
- [x] Grid stays in document flow, doesn't move or reflow
- [x] Navigation animates smoothly (tiles slide between viewport positions)
- [x] Tiles entering from grid stay behind existing viewport tiles (z-index: 2)
- [x] Current tile always on top (z-index: 10) during transitions
- [x] Escape/close returns to grid at same scroll position

### Resolution Management
- [x] Small tiles (≤150px) use thumbnail source
- [x] Large tiles (>400px) use full-res source
- [x] Viewport tiles always upgrade to full-res
- [x] Resolution transitions use crossfade (no flash/jump)

### View Mode Consistency
- [x] All view modes (All, Unreviewed, Duplicates, Discarded) work identically
- [x] View mode determines navigation set, not behavior
- [x] Filters constrain which tiles are navigable

### Integration
- [x] Details panel shows file info, timestamps, tags
- [x] Action buttons context-aware (different for duplicates vs review)
- [x] Keyboard navigation (arrows, escape, space, V) works
- [x] Three view modes (carousel, compare, fullscreen)

### Performance
- [x] Smooth GPU-accelerated animations (transform, opacity)
- [x] No jank with 500+ tiles in grid
- [x] Grid position locking prevents reflow
- [x] Memory usage reasonable (tiles don't leak)
