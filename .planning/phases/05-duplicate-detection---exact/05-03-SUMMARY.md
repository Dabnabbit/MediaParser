---
phase: 05-duplicate-detection---exact
plan: 03
subsystem: ui-javascript
tags: [javascript, duplicates, comparison, lazy-loading, ui-interaction]
requires:
  - 05-01: Quality metrics API provides recommendations
  - 05-02: HTML/CSS structure for comparison cards
provides:
  - Interactive duplicate group comparison interface
  - Radio button selection with KEEP/DISCARD badges
  - Per-group resolution actions
  - Lazy-loaded thumbnails for performance
affects:
  - 05-04: Resolution handler will integrate with this UI
  - Future bulk duplicate operations
tech-stack:
  added: []
  patterns: [IntersectionObserver, event-delegation, Map-state-management]
key-files:
  created:
    - app/static/js/duplicates.js
  modified: []
decisions:
  - decision: "Pre-select recommended file on load"
    rationale: "Provides sensible default based on quality metrics, user can override"
    impact: "Faster workflow, reduces cognitive load"
  - decision: "Lazy load thumbnails with IntersectionObserver"
    rationale: "Performance - don't load all images at once for large duplicate groups"
    impact: "Follows pattern from results.js, smooth scrolling"
  - decision: "Map-based selection tracking"
    rationale: "Efficient lookup by group hash, clear state management"
    impact: "O(1) selection lookups, easy to validate completeness"
  - decision: "Per-group confirm vs bulk resolve"
    rationale: "Allows incremental resolution, user can resolve groups one at a time"
    impact: "Better UX for reviewing many duplicates, prevents mistakes"
metrics:
  duration: "2 minutes"
  completed: "2026-02-04"
---

# Phase 5 Plan 03: Duplicate Comparison JavaScript Summary

**One-liner:** JavaScript handler for interactive duplicate comparison with radio selections, quality metrics display, and lazy-loaded thumbnails

## What Was Built

### DuplicatesHandler Class (608 lines)

**Core Functionality:**
- Fetches duplicate groups from `/api/jobs/:id/duplicates`
- Renders comparison cards with side-by-side file options
- Pre-selects recommended file based on quality metrics
- Tracks selections via Map (groupHash → fileId)
- Updates KEEP/DISCARD badges in real-time

**Lazy Loading:**
- IntersectionObserver pattern (same as results.js)
- 100px rootMargin for smooth preloading
- Observes thumbnail images, loads on scroll

**Selection Management:**
- `handleRadioChange()` - updates Map and UI on selection
- `updateGroupPreview()` - toggles KEEP/DISCARD badges
- `updateSummary()` - counts groups, files, resolved
- `getResolutionSummary()` - exports keep/discard file IDs

**Group Actions:**
- `handleKeepAll()` - POST to `/api/duplicates/groups/:hash/keep-all`
- `handleConfirmGroup()` - bulk discard non-selected files
- Event delegation for all buttons and radios

**Quality Metrics Display:**
- Resolution (width×height, MP)
- File size (formatted KB/MB/GB)
- Format (MIME type uppercase)
- Timestamp (formatted date)

**Integration:**
- Listens for `filterChange` events to show/hide
- Refreshes filter counts via `resultsHandler.loadSummary()`
- Global `window.duplicatesHandler` for cross-module access

## Technical Decisions

### Pre-selected Recommendations
**Pattern:** Initialize `groupSelections` Map with `recommended_id` on load

**Benefits:**
- User sees sensible default immediately
- Can confirm quickly if recommendation is correct
- Can override by clicking different radio

**Implementation:**
```javascript
this.groups.forEach(group => {
    if (group.recommended_id) {
        this.groupSelections.set(group.hash, group.recommended_id);
    }
});
```

### Map-based State Tracking
**Pattern:** `Map<groupHash, selectedFileId>` for selection state

**Benefits:**
- O(1) lookups by group hash
- Easy to validate completeness (compare Map.size to groups.length)
- Clear separation between groups

**Alternative considered:** Flat array of `{hash, fileId}` pairs
**Rejected because:** Slower lookups, harder to update

### Event Delegation
**Pattern:** Single listener on `groupsList` for all radios and buttons

**Benefits:**
- Works with dynamic DOM (groups added/removed)
- Lower memory footprint
- Follows pattern from selection.js

**Implementation:**
```javascript
this.groupsList?.addEventListener('change', (e) => {
    if (e.target.type === 'radio' && e.target.name.startsWith('keep-')) {
        this.handleRadioChange(e);
    }
});
```

### Radio Button Scoping
**Pattern:** Name radios `keep-{groupHash}` for per-group mutual exclusivity

**Benefits:**
- Browser enforces one selection per group
- No manual deselection logic needed
- Clear which group each radio belongs to

**Impact:** Hash-based naming prevents cross-group interference

## Implementation Highlights

### Lazy Loading Pattern (Reused from results.js)
```javascript
initLazyLoader() {
    this.lazyLoader = new IntersectionObserver(
        (entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    img.src = img.dataset.src;  // Load actual image
                    this.lazyLoader.unobserve(img);
                }
            });
        },
        { rootMargin: '100px' }  // Preload 100px before visible
    );
}
```

### Selection State Update
```javascript
updateGroupPreview(groupHash) {
    const selectedFileId = this.groupSelections.get(groupHash);
    fileOptions.forEach(option => {
        const fileId = parseInt(option.dataset.fileId);
        if (fileId === selectedFileId) {
            option.innerHTML = '<span class="status-badge status-keep">KEEP</span>';
            option.classList.add('selected');
        } else {
            option.innerHTML = '<span class="status-badge status-discard">DISCARD</span>';
            option.classList.remove('selected');
        }
    });
}
```

### Confirmation Flow
1. User selects radio → `handleRadioChange()`
2. Update Map → `groupSelections.set(hash, fileId)`
3. Update UI → `updateGroupPreview(hash)`
4. Enable button → `confirmBtn.disabled = false`
5. Click confirm → `handleConfirmGroup(hash)`
6. Bulk discard → POST `/api/files/bulk/discard`
7. Mark resolved → Add `.resolved` class, change button

## Deviations from Plan

None - plan executed exactly as written.

## Testing Notes

**Manual verification needed:**
1. Load job with duplicates
2. Switch to Duplicates mode filter
3. Verify groups render with recommended pre-selected
4. Change radio selection → KEEP/DISCARD badges update
5. Click "Keep All" → group removed, counts update
6. Click "Confirm Selection" → non-selected files discarded
7. Verify thumbnails lazy load (check Network tab)

**Browser console checks:**
- No JavaScript errors
- `window.duplicatesHandler` exists
- `loadGroups(jobId)` fetches and renders

## Next Phase Readiness

**For 05-04 (Resolution Handler):**
- ✅ `getResolutionSummary()` exports keep/discard lists
- ✅ `getUnresolvedGroups()` returns incomplete groups
- ✅ Selection state accessible via `groupSelections` Map
- ✅ Events dispatched for filter count updates

**For Integration:**
- Need to call `duplicatesHandler.loadGroups(jobId)` when entering Duplicates mode
- Need to hook "Confirm All Selections" button to bulk resolution
- Consider confirmation dialog before bulk discard

## Files Changed

### Created
- **app/static/js/duplicates.js** (608 lines)
  - DuplicatesHandler class
  - Lazy loading with IntersectionObserver
  - Selection state management
  - Per-group and bulk actions
  - Quality metrics rendering

### API Integration Points
- `GET /api/jobs/:id/duplicates` - fetch groups
- `POST /api/duplicates/groups/:hash/keep-all` - remove from duplicates
- `POST /api/files/bulk/discard` - discard non-selected files

### DOM Integration Points
- `#duplicate-groups-container` - main container
- `#duplicate-groups-list` - group cards parent
- `#duplicates-group-count` - summary count
- `#duplicates-file-count` - total files count
- `#duplicates-resolved-count` - resolved count
- `#btn-resolve-all` - bulk confirm button

## Lessons Learned

**Pattern Reuse:** IntersectionObserver pattern from results.js worked perfectly for duplicate thumbnails

**Event Delegation:** Single listener handles all dynamic radios and buttons efficiently

**Map vs Array:** Map for key-value state (hash→fileId) is clearer than array of objects

**Pre-selection UX:** Defaulting to recommended file reduces clicks for typical workflow

## Commit Summary

**Single commit (all tasks):**
- `4af7771`: feat(05-03): create DuplicatesHandler class with lazy loading
  - Full implementation in one cohesive file
  - All 3 tasks delivered atomically
