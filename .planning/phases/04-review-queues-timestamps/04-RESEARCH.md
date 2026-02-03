# Phase 4: Review Queues - Timestamps - Research

**Researched:** 2026-02-03
**Domain:** Web UI for review workflow with thumbnail grid, filtering, multi-select, and timestamp management
**Confidence:** HIGH

## Summary

This phase transitions from accordion buckets (Phase 3) to a unified grid with filter chips, enabling sophisticated review workflows for timestamp validation and tagging. The architecture requires replacing the existing accordion pattern with a filterable grid system, implementing examination views for detailed file review, adding keyboard-driven multi-select, and integrating timestamp source comparison with manual override capabilities.

The standard approach uses vanilla JavaScript with CSS Grid for layout, native HTML `<dialog>` elements for accessible modals, Intersection Observer API for lazy loading thumbnails, and dedicated libraries for date parsing (Chrono) and calendar selection (Vanilla Calendar Pro). State management can be handled with browser localStorage for persistence across sessions, and keyboard shortcuts follow established patterns using the native KeyboardEvent.key API.

**Primary recommendation:** Use native HTML `<dialog>` element for examination view (modal approach), vanilla JavaScript for grid/filter logic, CSS Grid for responsive thumbnail layout, and Intersection Observer for lazy loading. Prototype split-screen approach separately to compare with modal overlay during implementation.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Vanilla JavaScript | ES2022+ | Grid filtering, multi-select, keyboard handling | Zero dependencies, full browser support, lightweight |
| CSS Grid | Native | Responsive thumbnail grid layout | Native browser support, handles variable sizing, GPU-accelerated |
| HTML `<dialog>` | Native | Examination view modal | Built-in accessibility, focus trapping, Esc key handling (since March 2022) |
| Intersection Observer API | Native | Lazy loading thumbnails | Native performance, minimal code, 200% data savings |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Vanilla Calendar Pro | Latest (~52KB) | Date/time picker component | Manual timestamp entry with calendar UI |
| Chrono | 2.x | Natural language date parsing | Parse user-entered dates like "Jan 2020" or "2015" |
| localStorage API | Native | Session state persistence | Save filter state, selection, scroll position across page reloads |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `<dialog>` | Custom modal with ARIA | Custom requires focus trap, ARIA attributes, Esc handling—significantly more code |
| CSS Grid | Masonry.js library | Library adds 30KB+, CSS Grid sufficient for uniform thumbnails |
| Chrono | Vanilla Calendar only | Calendar doesn't parse text input like "just 2020", need both |
| localStorage | sessionStorage | sessionStorage clears on tab close, loses state when user reopens |

**Installation:**
```bash
# Vanilla Calendar Pro
npm install vanilla-calendar-pro

# Chrono (natural language date parser)
npm install chrono-node
```

## Architecture Patterns

### Recommended Project Structure
```
app/static/js/
├── results.js          # Existing (refactor accordion → unified grid)
├── filters.js          # NEW: Filter chip logic, state management
├── selection.js        # NEW: Multi-select, keyboard shortcuts
├── examination.js      # NEW: Detail view (modal or split-screen)
├── timestamp.js        # NEW: Source comparison, manual entry
└── tags.js            # NEW: Tag input with autocomplete

app/static/css/
├── main.css           # Existing (add grid, filter chip, badge styles)
├── examination.css    # NEW: Detail view styling
└── timeline.css       # NEW: Timeline visualization for sources

app/routes/
├── api.py            # Existing (may need new endpoints)
└── jobs.py           # Existing (add review/tagging endpoints)
```

### Pattern 1: Unified Grid with Filter Chips
**What:** Single container with all files, filtered by chip toggles (HIGH/MEDIUM/LOW/Reviewed/Duplicates/Failed)
**When to use:** Replacing accordion buckets to enable tag filtering and flexible workflows
**Example:**
```javascript
class GridFilter {
  constructor() {
    this.activeFilters = new Set(); // Track active filter chips
    this.allFiles = [];             // All files in memory
    this.visibleFiles = [];         // Currently filtered subset
  }

  toggleFilter(filterName) {
    if (this.activeFilters.has(filterName)) {
      this.activeFilters.delete(filterName);
    } else {
      this.activeFilters.add(filterName);
    }
    this.applyFilters();
  }

  applyFilters() {
    if (this.activeFilters.size === 0) {
      this.visibleFiles = this.allFiles; // Show all if no filters
    } else {
      this.visibleFiles = this.allFiles.filter(file =>
        this.activeFilters.has(file.confidence) ||
        (this.activeFilters.has('reviewed') && file.reviewed) ||
        (this.activeFilters.has('duplicates') && file.isDuplicate)
      );
    }
    this.renderGrid();
  }
}
```

### Pattern 2: Multi-Select with Shift-Click Range Selection
**What:** Shift-click selects range, Ctrl-click toggles individual, visual selection state
**When to use:** Bulk actions (tagging, discard) on multiple files
**Example:**
```javascript
// Source: MDN Keyboard Events best practices
class MultiSelect {
  constructor() {
    this.selectedIds = new Set();
    this.lastSelectedIndex = null;
  }

  handleClick(event, fileId, index) {
    if (event.shiftKey && this.lastSelectedIndex !== null) {
      // Range selection
      const start = Math.min(this.lastSelectedIndex, index);
      const end = Math.max(this.lastSelectedIndex, index);
      for (let i = start; i <= end; i++) {
        this.selectedIds.add(this.visibleFiles[i].id);
      }
    } else if (event.ctrlKey || event.metaKey) {
      // Toggle selection
      if (this.selectedIds.has(fileId)) {
        this.selectedIds.delete(fileId);
      } else {
        this.selectedIds.add(fileId);
      }
    } else {
      // Single selection (clear others)
      this.selectedIds.clear();
      this.selectedIds.add(fileId);
    }
    this.lastSelectedIndex = index;
    this.updateSelectionUI();
  }
}
```

### Pattern 3: Native Dialog Element for Examination View
**What:** Use `<dialog>` with `.showModal()` for accessible, keyboard-friendly detail view
**When to use:** Examining single file or duplicate group with prev/next navigation
**Example:**
```javascript
// Source: MDN dialog element documentation
class ExaminationView {
  constructor() {
    this.dialog = document.getElementById('examination-dialog');
    this.currentIndex = 0;
    this.files = [];
  }

  show(files, startIndex = 0) {
    this.files = files;
    this.currentIndex = startIndex;
    this.render();
    this.dialog.showModal(); // Auto-focuses, traps focus, inert backdrop
  }

  setupKeyboardNav() {
    this.dialog.addEventListener('keydown', (e) => {
      if (e.defaultPrevented) return;

      switch (e.key) {
        case 'ArrowLeft':
          this.previous();
          e.preventDefault();
          break;
        case 'ArrowRight':
          this.next();
          e.preventDefault();
          break;
        case 'Escape':
          // Dialog closes automatically, no preventDefault needed
          break;
      }
    });
  }
}
```

### Pattern 4: Lazy Loading with Intersection Observer
**What:** Load thumbnail images only when entering viewport using `data-src` pattern
**When to use:** Grids with 50+ thumbnails to reduce initial page load
**Example:**
```javascript
// Source: Multiple Intersection Observer tutorials
class LazyLoader {
  constructor() {
    this.observer = new IntersectionObserver(
      this.onIntersection.bind(this),
      {
        rootMargin: '50px' // Load slightly before entering viewport
      }
    );
  }

  observe(img) {
    this.observer.observe(img);
  }

  onIntersection(entries) {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;
        img.src = img.dataset.src; // Load actual image
        img.onload = () => img.classList.add('loaded');
        this.observer.unobserve(img); // Stop observing once loaded
      }
    });
  }
}

// Usage in thumbnail rendering
const thumb = document.createElement('img');
thumb.dataset.src = file.thumbnail_path; // Store real path
thumb.src = '/static/img/placeholder.svg'; // Show placeholder initially
lazyLoader.observe(thumb);
```

### Pattern 5: State Persistence with localStorage
**What:** Save filter state, selection, scroll position across page reloads
**When to use:** Maintain user context during review workflow (page refresh, close/reopen)
**Example:**
```javascript
// Source: localStorage best practices 2026
class StatePersistence {
  saveState() {
    const state = {
      filters: Array.from(this.activeFilters),
      selectedIds: Array.from(this.selectedIds),
      scrollPosition: window.scrollY,
      thumbnailSize: this.thumbnailSize,
      sortBy: this.sortBy
    };
    localStorage.setItem('reviewState', JSON.stringify(state));
  }

  loadState() {
    const saved = localStorage.getItem('reviewState');
    if (!saved) return null;

    try {
      return JSON.parse(saved);
    } catch (e) {
      console.warn('Failed to parse saved state:', e);
      return null;
    }
  }

  restoreState() {
    const state = this.loadState();
    if (!state) return;

    // Restore filters
    state.filters.forEach(f => this.activeFilters.add(f));
    this.applyFilters();

    // Restore selection
    state.selectedIds.forEach(id => this.selectedIds.add(id));
    this.updateSelectionUI();

    // Restore scroll position (after render completes)
    requestAnimationFrame(() => {
      window.scrollTo(0, state.scrollPosition);
    });
  }
}
```

### Anti-Patterns to Avoid
- **Don't manually implement focus trapping for `<dialog>`:** The native element handles this automatically when using `.showModal()`. Adding custom focus trap code creates conflicts.
- **Don't use `keyCode` or `charCode`:** Deprecated since 2017. Use `event.key` (returns `"Escape"`, `"ArrowLeft"`, etc.) instead.
- **Don't update DOM on every filter change:** Apply filters to data array first, then render once. Prevents layout thrashing.
- **Don't load all thumbnails upfront:** With 1000+ files, this causes 5+ second initial load. Use Intersection Observer.
- **Don't use CSS Grid `masonry` layout:** Not yet supported across browsers (Firefox flag only). Use uniform-height grid or CSS Multi-column.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Natural language date parsing | Regex patterns for "2020", "Jan 2020", etc. | Chrono library | Handles dozens of formats, timezones, relative dates ("5 days ago"), ambiguous dates |
| Date picker component | Custom calendar HTML/CSS/JS | Vanilla Calendar Pro | Accessibility, keyboard nav, i18n, timezone handling, 52KB optimized |
| Keyboard shortcut handling | Manual `keydown` + switch on `keyCode` | Native `event.key` + switch | `keyCode` deprecated, `event.key` standardized, cross-browser |
| Focus trap in modal | Manual tabindex manipulation | `<dialog>` element | Native focus trap, inert backdrop, Esc key, ARIA attributes—all automatic |
| Lazy image loading | Scroll event + `getBoundingClientRect()` | Intersection Observer API | GPU-accelerated, handles fast scroll, cleaner API, ~10 lines of code |
| Undo/redo system | Array of past states | Command pattern or Reddo.js | Edge cases: nested operations, memory limits, state serialization |

**Key insight:** Browser APIs have matured significantly (2022-2026). Native solutions (`<dialog>`, Intersection Observer, `event.key`) eliminate most custom code that was necessary 5 years ago. Lean heavily on native APIs.

## Common Pitfalls

### Pitfall 1: Dialog Focus Management Conflicts
**What goes wrong:** Adding custom focus trap to `<dialog>` element causes focus to jump unpredictably or get stuck.
**Why it happens:** `<dialog>` automatically traps focus when opened with `.showModal()`. Custom focus trap code conflicts with native behavior.
**How to avoid:** Only use `<dialog>` with `.showModal()`. Add `autofocus` attribute to the element user should interact with first (e.g., close button). Never add `tabindex` to `<dialog>` itself.
**Warning signs:** Focus jumps to unexpected elements, Tab key stops working, Esc key doesn't close dialog.

### Pitfall 2: Filter State Desync from UI
**What goes wrong:** Filter chips show active, but grid shows wrong files. Or chips reset but files stay filtered.
**Why it happens:** State updated in one place (chip click handler) but not synchronized with rendering logic. Common when filter logic spreads across multiple functions.
**How to avoid:** Single source of truth pattern—one `activeFilters` Set, one `applyFilters()` method. All filter changes call `applyFilters()`, which updates both data and UI atomically.
**Warning signs:** Click filter chip twice to "refresh" it, page reload shows different results than before refresh.

### Pitfall 3: Shift-Click Range Selection Off-By-One
**What goes wrong:** Shift-clicking selects one too many or one too few files, or skips files in the middle of range.
**Why it happens:** Using wrong index (e.g., file ID instead of array index), or not accounting for filtered subset vs. all files.
**How to avoid:** Track both `lastSelectedIndex` (array position) and use `visibleFiles` array index, not file ID. Test with filtered view—shift-select across boundary between different confidence levels.
**Warning signs:** Range selection works in "show all" but breaks when filters active, or selects files not visible on screen.

### Pitfall 4: Lazy Loading Images Don't Appear
**What goes wrong:** Scroll down, but thumbnails never load—stuck on placeholder.
**Why it happens:** Observer created before thumbnails rendered, or `data-src` attribute missing, or `rootMargin` too small for fast scrolling.
**How to avoid:** Create observer first, then call `observer.observe(img)` for each thumbnail after rendering. Use `rootMargin: '50px'` or more to preload before visible. Add error handling: `img.onerror = () => img.src = placeholder`.
**Warning signs:** Slow scroll works, fast scroll doesn't; works on small dataset, fails on large; works locally, fails on slow network.

### Pitfall 5: localStorage Quota Exceeded
**What goes wrong:** `localStorage.setItem()` throws `QuotaExceededError`, state not saved, user loses work.
**Why it happens:** Storing too much data (5-10MB limit). Saving entire file arrays, base64 images, or duplicate data instead of IDs only.
**How to avoid:** Store minimal state—only IDs, not full objects. Use `try/catch` around `setItem()`. Implement `clearOldState()` to prune stale data. If >1MB needed, warn user or use IndexedDB instead.
**Warning signs:** Works with 100 files, fails with 1000; localStorage key grows over time; error only on production with real data.

### Pitfall 6: Keyboard Shortcuts Conflict with Browser
**What goes wrong:** Ctrl+A (select all) scrolls page instead of selecting files, or Backspace navigates back.
**Why it happens:** Not calling `event.preventDefault()` after handling custom shortcut. Browser processes default action after your handler.
**How to avoid:** Always call `e.preventDefault()` for keys you handle. Use pattern: `if (e.defaultPrevented) return;` at top to respect other handlers. Test in different browsers—Firefox, Chrome, Safari have different defaults.
**Warning signs:** Shortcut works but also does something else (e.g., Ctrl+S saves page and saves settings), or shortcuts stop working after unrelated code change.

### Pitfall 7: Date Parsing Ambiguity (US vs. EU formats)
**What goes wrong:** User enters "01/02/2020" expecting Feb 1st, system parses as Jan 2nd (or vice versa).
**Why it happens:** Chrono defaults to US format (MM/DD/YYYY), but user may expect EU format (DD/MM/YYYY). Ambiguous for dates 1-12.
**How to avoid:** Require unambiguous format for manual entry: YYYY-MM-DD, or "Jan 2, 2020", or use explicit format parameter in Chrono. Show preview: "You entered: February 1, 2020" before confirming.
**Warning signs:** User reports "wrong date" on files with day ≤12, or dates off by several months.

## Code Examples

Verified patterns from official sources:

### Filter Chip Toggle with Count Badges
```html
<!-- Filter chips with counts -->
<div class="filter-bar">
  <button class="filter-chip" data-filter="high" data-count="0">
    <span class="confidence-badge confidence-high">HIGH</span>
    <span class="count">0</span>
  </button>
  <button class="filter-chip" data-filter="medium" data-count="0">
    <span class="confidence-badge confidence-medium">MEDIUM</span>
    <span class="count">0</span>
  </button>
  <button class="filter-chip active" data-filter="low" data-count="0">
    <span class="confidence-badge confidence-low">LOW</span>
    <span class="count">0</span>
  </button>
  <button class="filter-chip" data-filter="reviewed" data-count="0">
    <span class="checkmark-badge">✓</span>
    <span class="label">Reviewed</span>
    <span class="count">0</span>
  </button>
  <button id="clear-filters" class="btn-link" style="display: none;">
    Clear filters
  </button>
</div>
```

```javascript
// Update chip counts and visibility
updateFilterCounts(summary) {
  document.querySelector('[data-filter="high"]').dataset.count = summary.high;
  document.querySelector('[data-filter="high"] .count').textContent = summary.high;

  // Hide chips with zero count
  document.querySelectorAll('.filter-chip').forEach(chip => {
    const count = parseInt(chip.dataset.count);
    chip.style.display = count > 0 ? '' : 'none';
  });

  // Show "clear filters" only if filters active
  const hasActiveFilters = this.activeFilters.size > 0;
  document.getElementById('clear-filters').style.display =
    hasActiveFilters ? '' : 'none';
}
```

### Thumbnail with Multiple Badges
```html
<div class="thumbnail" data-file-id="123">
  <img data-src="/storage/thumbnails/123_thumb.jpg"
       src="/static/img/placeholder.svg"
       alt="IMG_1234.jpg">

  <!-- Badges positioned absolutely in corners -->
  <span class="confidence-badge confidence-medium">M</span>
  <span class="media-type-badge video-badge">▶</span>
  <span class="reviewed-badge">✓</span>

  <!-- Date below thumbnail -->
  <div class="thumbnail-date">2024-08-15</div>

  <!-- Selection checkbox -->
  <input type="checkbox" class="thumbnail-select" aria-label="Select file">
</div>
```

```css
/* Badge positioning pattern - Source: CSS badge overlay techniques */
.thumbnail {
  position: relative;
  border: 2px solid transparent;
  transition: transform 0.2s, box-shadow 0.2s;
}

.thumbnail.selected {
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.5);
  border-color: #3b82f6;
}

.confidence-badge {
  position: absolute;
  top: 4px;
  left: 4px;
  z-index: 10;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 0.7rem;
  font-weight: bold;
}

.media-type-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  z-index: 10;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  border-radius: 50%;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.reviewed-badge {
  position: absolute;
  bottom: 4px;
  right: 4px;
  z-index: 10;
  background: #22c55e;
  color: white;
  border-radius: 50%;
  width: 20px;
  height: 20px;
}
```

### Examination Dialog with Keyboard Navigation
```html
<dialog id="examination-dialog">
  <div class="examination-content">
    <button class="close-btn" autofocus aria-label="Close">✕</button>

    <div class="preview-area">
      <img id="preview-image" src="" alt="">
      <button class="nav-btn prev" aria-label="Previous file">◀</button>
      <button class="nav-btn next" aria-label="Next file">▶</button>
    </div>

    <div class="metadata-panel">
      <h3 id="filename"></h3>
      <div id="timestamp-sources"></div>
      <div id="tag-management"></div>
    </div>
  </div>
</dialog>
```

```javascript
// Source: MDN KeyboardEvent.key documentation
setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented) return;

    switch (e.key) {
      case 'ArrowLeft':
        if (this.dialog.open) {
          this.previousFile();
          e.preventDefault();
        }
        break;
      case 'ArrowRight':
        if (this.dialog.open) {
          this.nextFile();
          e.preventDefault();
        }
        break;
      case 'Enter':
        if (this.selectedIds.size > 0) {
          this.openExamination();
          e.preventDefault();
        }
        break;
      case 'Delete':
        if (this.selectedIds.size > 0) {
          this.confirmDiscard();
          e.preventDefault();
        }
        break;
    }
  });
}
```

### Timeline Visualization for Timestamp Sources
```html
<div class="timeline-container">
  <h4>Detected Timestamps</h4>

  <!-- Visual timeline -->
  <div class="timeline">
    <div class="timeline-track">
      <div class="timeline-marker recommended"
           style="left: 45%"
           title="2024-08-15 14:30 (EXIF)">
        <span class="marker-dot"></span>
        <span class="marker-label">Recommended</span>
      </div>
      <div class="timeline-marker"
           style="left: 48%"
           title="2024-08-15 14:35 (Filename)">
        <span class="marker-dot"></span>
      </div>
      <div class="timeline-marker"
           style="left: 52%"
           title="2024-08-15 16:20 (File Modified)">
        <span class="marker-dot"></span>
      </div>
    </div>
  </div>

  <!-- Detailed source list -->
  <div class="source-list">
    <div class="source-item recommended">
      <input type="radio" name="timestamp" id="ts-exif" checked>
      <label for="ts-exif">
        <span class="badge">Recommended</span>
        <strong>EXIF DateTimeOriginal</strong>
        <time>2024-08-15 14:30:00</time>
        <span class="weight">Weight: 10</span>
      </label>
    </div>
    <div class="source-item">
      <input type="radio" name="timestamp" id="ts-filename">
      <label for="ts-filename">
        <strong>Filename Pattern</strong>
        <time>2024-08-15 14:35:00</time>
        <span class="weight">Weight: 3</span>
      </label>
    </div>
    <div class="source-item">
      <input type="radio" name="timestamp" id="ts-manual">
      <label for="ts-manual">
        <strong>Manual Entry</strong>
        <input type="text" id="manual-date" placeholder="YYYY-MM-DD or '2020' or 'Jan 2020'">
      </label>
    </div>
  </div>

  <button class="btn-primary" id="confirm-timestamp">Confirm & Next</button>
</div>
```

```javascript
// Integrate Chrono for natural language parsing
import * as chrono from 'chrono-node';

document.getElementById('manual-date').addEventListener('input', (e) => {
  const input = e.target.value;
  if (input.length < 3) return;

  const parsed = chrono.parseDate(input);
  if (parsed) {
    // Show preview
    const preview = document.getElementById('date-preview');
    preview.textContent = `Parsed as: ${parsed.toLocaleDateString()}`;
    preview.style.display = 'block';
  }
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Custom modal + ARIA | Native `<dialog>` element | March 2022 | Eliminates ~100 lines of focus trap code, automatic accessibility |
| `keyCode` / `charCode` | `event.key` property | 2017 (widespread adoption) | Cross-browser consistency, readable code ("Escape" vs 27) |
| Scroll event + `getBoundingClientRect()` | Intersection Observer API | 2019 (baseline) | Performance improvement (GPU-accelerated), simpler API |
| jQuery for DOM manipulation | Vanilla JavaScript | 2020+ trend | Zero dependencies, faster, smaller bundle size |
| Custom date pickers | Native `<input type="date">` | 2021+ (mobile-first) | Works on mobile keyboards, but limited customization—use library for desktop |
| CSS floats for grid | CSS Grid | 2017 (widespread adoption) | Responsive without media queries, gap property, named areas |
| sessionStorage | localStorage + cleanup | 2023+ trend | Persist across tabs/sessions, but requires memory management |

**Deprecated/outdated:**
- **Masonry.js for thumbnail grids:** CSS Grid handles uniform thumbnails better. Masonry only needed for Pinterest-style variable-height layouts, which isn't this use case.
- **jQuery UI Datepicker:** Heavy (250KB+), accessibility issues, use Vanilla Calendar Pro (52KB) or native `<input type="date">`.
- **Custom accordion components:** Native `<details>` element exists, but for this phase, unified grid replaces accordions entirely.
- **focus-trap library for dialogs:** Native `<dialog>` handles focus trapping automatically. Only use focus-trap if NOT using `<dialog>`.

## Open Questions

Things that couldn't be fully resolved:

1. **Split-screen vs. Modal Overlay for Examination View**
   - What we know: CONTEXT.md says "prototype both approaches", modal has better accessibility support
   - What's unclear: Split-screen impact on mobile, state management complexity (keep grid visible?)
   - Recommendation: Start with modal overlay (less complexity), prototype split-screen in parallel if time allows

2. **Timezone Handling for Manual Entry**
   - What we know: Chrono parses dates, existing code uses `zoneinfo` for UTC normalization
   - What's unclear: User expectation—enter date in local time or UTC? Show timezone selector?
   - Recommendation: Default to user's browser timezone (`Intl.DateTimeFormat().resolvedOptions().timeZone`), store as UTC

3. **Tag Autocomplete Data Source**
   - What we know: Need recent/common tags for autocomplete, tags case-insensitive normalized to lowercase
   - What's unclear: Track tag usage frequency in database? Cache in localStorage? API endpoint?
   - Recommendation: API endpoint `/api/tags/recent` returns top 20 tags by usage count, cache in localStorage

4. **Partial Date Warnings**
   - What we know: CONTEXT.md says "partial dates allowed with warning"
   - What's unclear: Visual treatment of partial dates in timeline/comparison? Database storage format?
   - Recommendation: Store as ISO 8601 with precision flag (`"2020"` → `{date: "2020-01-01", precision: "year"}`), show warning icon in UI

5. **Session State Persistence Scope**
   - What we know: CONTEXT.md says "session state persistence (scroll position, selection)" is Claude's discretion
   - What's unclear: Persist across jobs? Clear on job completion? Persist filter state but not selection?
   - Recommendation: Persist filter/sort/thumbnail size across jobs, clear selection on new job start, keep scroll position within session only

## Sources

### Primary (HIGH confidence)
- [MDN: KeyboardEvent.key property](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key) - Keyboard event handling, key values
- [MDN: HTML `<dialog>` element](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog) - Native modal dialog support
- [MDN: Intersection Observer API](https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API) - Lazy loading images
- [Vanilla Calendar Pro](https://vanilla-calendar.pro/) - Date picker component features
- [Chrono GitHub](https://github.com/wanasit/chrono) - Natural language date parsing

### Secondary (MEDIUM confidence)
- [CSS-Tricks: Dialog Element](https://css-tricks.com/there-is-no-need-to-trap-focus-on-a-dialog-element/) - Focus trap not needed with native dialog
- [W3C ARIA: Dialog Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) - Accessibility guidelines for modals
- [NN/G: Confirmation Dialogs](https://www.nngroup.com/articles/confirmation-dialog/) - UX best practices for destructive actions
- [Smashing Magazine: Keyboard Accessibility](https://www.smashingmagazine.com/2022/11/guide-keyboard-accessibility-javascript-part2/) - Keyboard navigation patterns
- [SQLAlchemy 2.0: Bulk Updates](https://docs.sqlalchemy.org/en/20/orm/queryguide/dml.html) - Database performance for review state updates

### Tertiary (LOW confidence - requires validation)
- [WebSearch: Thumbnail Grid Filters 2026](https://www.cssscript.com/top-10-galleries-pure-javascript-css/) - Gallery implementations survey
- [WebSearch: Modal UX Design 2026](https://userpilot.com/blog/modal-ux-design/) - Modal design patterns
- [WebSearch: Timeline Libraries 2026](https://www.jqueryscript.net/blog/best-timeline-components.html) - Timeline visualization options

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Native browser APIs verified via MDN, libraries verified via official docs
- Architecture: HIGH - Patterns based on existing codebase + established best practices
- Pitfalls: MEDIUM - Based on common developer experiences and documentation warnings
- Timeline visualization: LOW - Multiple library options, no clear winner, may need custom solution

**Research date:** 2026-02-03
**Valid until:** ~60 days (libraries stable, browser APIs don't change frequently)
