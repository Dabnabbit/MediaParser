---
phase: 06-duplicate-detection---perceptual
plan: 04
subsystem: ui
tags: [ui, similar-mode, viewport, workflow-enforcement, mode-selector, perceptual-duplicates]
requires:
  - phase: 06-03
    provides: similar-groups-api, resolution-endpoints, mode-filtering
  - phase: 05-04
    provides: viewport-system, examination-mode
provides:
  - similar-mode-ui
  - workflow-enforcement
  - similar-group-viewport
  - similar-mode-actions
  - group-type-display
affects: [06-05, 07-output-generation]
tech-stack:
  added: []
  patterns: [sequential-workflow-enforcement, mode-based-ui, toast-warnings, group-navigation]
key-files:
  created: []
  modified:
    - app/templates/index.html
    - app/static/js/filters.js
    - app/static/js/examination.js
    - app/static/js/selection.js
    - app/static/js/viewport-details.js
    - app/static/css/main.css
decisions:
  - "Sequential workflow enforcement: Duplicates → Similar → Unreviewed with warning toasts for skipping"
  - "Similar mode uses same viewport system as duplicates with group-scoped navigation"
  - "Group type badges (burst/panorama/similar) styled by color to indicate detection reason"
  - "Keep All action marks entire group as not-similar instead of discarding"
metrics:
  duration: "4 minutes"
  completed: "2026-02-05"
---

# Phase 6 Plan 04: Similar Mode UI Integration Summary

**Complete Similar mode with workflow enforcement, group viewport navigation, type badges, and multi-keep resolution actions**

## Performance

- **Duration:** 4 minutes
- **Started:** 2026-02-05T15:09:02Z
- **Completed:** 2026-02-05T15:13:12Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- Similar mode chip appears in mode selector with ≈ icon
- Workflow enforcement: auto-selects Duplicates → Similar → Unreviewed in order
- Warning toasts when user skips ahead in workflow
- Viewport navigates through similar group members (burst/panorama sequences)
- Action buttons: Keep This, Keep All, Not Similar, Discard
- Group type badges display in viewport (burst=blue, panorama=yellow, similar=gray)
- Resolution actions call correct API endpoints from 06-03

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Similar Mode Chip + Workflow Enforcement** - `bbc6df3` (feat)
2. **Task 2: Similar Group Loading + Viewport Navigation** - `6422760` (feat)
3. **Task 3: Similar Mode Action Buttons + Resolution** - `0bcddb1` (feat)

## Files Modified

### app/templates/index.html
Added Similar mode chip to mode selector between Duplicates and Unreviewed with ≈ icon (approximately equal symbol)

### app/static/js/filters.js
- Added `similar` to counts tracking
- Implemented `autoSelectMode()` for sequential workflow: Duplicates → Similar → Unreviewed
- Added `_showModeWarning()` toast notification for workflow violations
- Warning shown when skipping Duplicates or Similar modes
- Similar mode chip highlights when has unresolved groups

### app/static/js/examination.js
- Added `similarGroups` cache and `currentSimilarGroup` state
- Implemented `fetchSimilarGroups(jobId)` to load all similar groups
- Implemented `loadSimilarGroupForFile(fileId, jobId)` for group context
- Returns group metadata: files, group_id, group_type, confidence, recommended_id

### app/static/js/selection.js
- Updated `getNavigableFileIds()` to handle similar mode navigation
- In similar mode, viewport navigates only similar group members (not all files)
- Filters by `similar_group_id` to get group members

### app/static/js/viewport-details.js
- Added similar group info section with position, type badge, and confidence
- Implemented `renderSimilarInfo()` to display group context
- Added action buttons for similar mode: Keep This, Keep All, Not Similar, Discard
- Implemented `keepSimilar()` - keeps current file, discards others via `/api/similar-groups/:id/resolve`
- Implemented `keepAllSimilar()` - marks all as not-similar via `/api/similar-groups/:id/keep-all`
- Implemented `markNotSimilar()` - removes current file via `/api/files/bulk/not-similar`
- Added similar badge to status badges display

### app/static/css/main.css
- Added `.similar-type-badge` styling with data-type variants
- Burst groups: blue (accent color)
- Panorama groups: yellow (warning color)
- Generic similar: gray (hover color)
- Added `.similar-confidence` styling
- Added toast animation keyframes for mode warnings
- Added `.vp-badge.similar` and `.thumb-badge.similar` styling

## Decisions Made

### 1. Sequential workflow enforcement with soft warnings
**Decision:** Auto-select enforces Duplicates → Similar → Unreviewed order, but shows warning toast if user manually skips ahead instead of blocking.

**Rationale:**
- Duplicates should be resolved first (exact matches, easier decisions)
- Similar groups next (perceptual matches, harder decisions)
- Unreviewed last (timestamp detection only)
- Warnings respect user agency while guiding best practices

**Impact:** Users can skip if needed but are encouraged to follow optimal workflow

### 2. Similar mode reuses viewport system
**Decision:** Similar groups use the same ViewportController and details panel as duplicate groups, with mode-specific action buttons.

**Rationale:**
- Consistent UX between duplicates and similar modes
- Same navigation patterns (arrow keys, click prev/next)
- Reduced code duplication
- Viewport already handles group-scoped navigation

**Impact:** Minimal new UI code, leverages existing FLIP animations and navigation

### 3. Keep All marks as not-similar instead of accepting
**Decision:** "Keep All" button calls `/api/similar-groups/:id/keep-all` which clears the similar_group_id (marks files as unrelated).

**Rationale:**
- Unlike exact duplicates (pick one), similar groups may legitimately want to keep all files
- Burst sequences: user might want first, middle, and last shots
- Panoramas: keep all if they're sequential parts of a panorama stitch
- Clearing group treats them as distinct images

**Impact:** Users can preserve entire burst sequences or panorama sets

### 4. Group type badges color-coded by detection reason
**Decision:** Badge colors indicate why files were grouped: burst (blue), panorama (yellow), generic similar (gray).

**Rationale:**
- Visual distinction helps users understand grouping logic
- Blue (accent) for burst = fast sequences (clearest case)
- Yellow (warning) for panorama = potentially related wide-angle shots
- Gray for generic similar = lower confidence, needs user judgment

**Impact:** Users can quickly assess group type without reading text

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all API endpoints from 06-03 worked as expected, viewport system integrated cleanly.

## Next Phase Readiness

**Ready for 06-05 (Testing & Polish):**
- ✅ Similar mode fully integrated into UI
- ✅ Workflow enforcement guides users through optimal resolution order
- ✅ Viewport navigation works for similar groups
- ✅ Action buttons call correct API endpoints
- ✅ Group type and confidence displayed to aid decisions
- ✅ Resolution actions update counts and refresh grid

**Ready for Phase 7 (Output Generation):**
- ✅ Similar groups can be resolved (discarded or marked not-similar)
- ✅ Unreviewed count excludes both exact duplicates and similar groups
- ✅ Clean separation between duplicates, similar, and unreviewed workflows

**Blockers:** None

**Considerations:**
- Testing with real perceptual duplicate data needed to validate UX
- Group type detection (burst vs panorama) relies on 06-02 algorithm accuracy
- Multi-select within viewport (checkbox UI) deferred to future enhancement

## UI Workflow

### Similar Mode Entry
1. Job completes → auto-selects Duplicates mode if count > 0
2. User resolves all duplicates → auto-switches to Similar mode if count > 0
3. Or user manually clicks Similar chip (shows warning if duplicates remain)

### Similar Group Resolution
1. Click file in similar mode → viewport opens showing group members
2. Navigate with arrow keys or click prev/next tiles
3. View group type badge and confidence
4. Choose action:
   - **Keep This, Discard Others** - standard duplicate resolution
   - **Keep All** - mark entire group as not-similar (preserve all)
   - **Not Similar** - remove current file from group (continue reviewing others)
   - **Discard** - discard current file only

### Post-Resolution
- Viewport exits or navigates to next file
- Grid refreshes to remove resolved files
- Similar count updates
- When similar count reaches 0, auto-switches to Unreviewed mode

## Code Quality

- ✅ Flask app starts without errors
- ✅ Similar mode integrated with existing FilterHandler
- ✅ ViewportController handles similar mode navigation
- ✅ Action buttons call correct API endpoints with proper error handling
- ✅ CSS maintains consistent styling with existing mode chips
- ✅ Group type badges use semantic colors
- ✅ Warning toasts provide user feedback without blocking

---
*Phase: 06-duplicate-detection---perceptual*
*Completed: 2026-02-05*
