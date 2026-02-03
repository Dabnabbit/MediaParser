# Phase 4: Review Queues - Timestamps - Context

**Gathered:** 2026-02-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Users review files where timestamp detection isn't confident, see all detected sources side-by-side, resolve conflicts, and manually enter dates when needed. HIGH confidence files auto-confirm. Files move to "reviewed" state after decisions.

**Major architectural change:** This phase replaces the accordion bucket approach (from Phase 3) with a unified grid + filter chips approach. This enables tag filtering and provides a more flexible review workflow.

</domain>

<decisions>
## Implementation Decisions

### Unified Grid (Replacing Buckets)

- **Single unified grid** replaces accordion buckets from Phase 3
- All files in one grid, filtered by toggle chips with counts
- Filter chips: confidence levels (HIGH/MEDIUM/LOW), Reviewed, Duplicates, Failed
- Filter bar positioned above grid, near thumbnail size selector
- Active vs inactive chip styling: Claude's discretion
- "Clear filters" button appears only when filters are active
- Hide filter chips that have zero count

### Page Layout Flow

- **Single pane flow:** Upload → Progress → Grid (all in one frame)
- Upload visible when no job or starting new
- Progress bar replaces upload section once job starts
- Grid populates below progress bar in batches during processing
- Batched population aligns with existing BATCH_COMMIT_SIZE (every 10 files)

### Thumbnail Grid Display

- **Badges on thumbnails:**
  - Confidence badge (colored)
  - Media type badge (different shape: circle=image, play-button=video)
  - Checkmark badge when reviewed
  - Orange exclamation (!) for anomaly/warning
  - Red X for failed files
- **Border color** indicates duplicate group membership
- Numeric date below thumbnail (YYYY-MM-DD format)
- Hover tooltip shows: filename, dimensions, file size
- Three presets: compact (100px), medium (150px), large (200px)
- Always show confidence badges (consistency across all contexts)

### Default View State

- Filters: Show all
- Sort: Derived timestamp, oldest first
- Thumbnail size: Medium (150px)

### Sorting Options

Four sort options within filtered view:
1. Derived timestamp (calculated best)
2. Original timestamp (file system date)
3. Alphabetical (filename)
4. File size

### Selection & Multi-Select

- Selection indication: combination of scale + shadow + colored border
- Shift-click for range selection, Ctrl-click for toggle
- Can deselect individual files from multi-selection
- Multi-file preview: 2-4 files side-by-side, arrow left/right to page through

### Selection Toolbar

- Appears when files are selected (position: Claude's discretion)
- Contains: selection count, tag input, bulk actions (discard), clear selection
- Quick tag input in toolbar is add-only
- Timestamps are single-file only (not bulk)
- Tags and discard can be bulk actions

### Examination View

- **Prototype both approaches:** split layout (grid + preview) and overlay
- Evaluate which works better during implementation
- Prev/next navigation via arrow keys + visible buttons
- Dismiss via X button, click outside, or Escape key
- Controls position: below on narrow screens, beside on wide (responsive)

### Duplicate Handling

- Border color indicates file belongs to a duplicate group
- Click/action auto-selects entire duplicate group
- Actions within group:
  - "Not a duplicate" — removes file from group, returns to main grid
  - "Discard" — excludes file from output entirely
  - "Select best" — keeps this image, others auto-discarded
- Best timestamp auto-recommended from across entire group (any file's sources)
- Duplicate groups only exist in grid with duplicate filter (not cross-listed)

### Reviewed State

- Checkmark badge on reviewed files
- HIGH confidence files auto-confirm (no explicit review needed)
- Unreview capability returns file to original state
- Undo (Ctrl+Z) for immediate reversal + explicit unreview for deliberate reversion
- Progress shown by filter counts changing (reviewed growing, others shrinking)

### Tagging UI

- **Quick add panel** in selection toolbar — add tags only
- **Full management** in examination view — view, add, remove tags
- Input methods: quick-select from recent/common + free text with autocomplete
- Free text can create new tags
- Case insensitive, normalized to lowercase
- No tag colors
- Tags NOT visible on grid thumbnails — only in examination view

### Confirmations & Feedback

- Confirmation dialogs required for all destructive and bulk actions
- Subtle transitions/animations for UI interactions
- Confirmation feedback: Claude's discretion

### Navigation & Keyboard

- Standard keyboard shortcuts: Escape=close, Enter=confirm, Delete=mark for removal
- Arrow keys for prev/next navigation in examination
- Desktop first (mobile basic/functional)

### Source Comparison UI

- **Hybrid display:** timeline visual for quick agreement assessment + detailed list
- Show top candidates only (most relevant/weighted sources)
- Expandable to all sources: Claude's discretion
- System pre-selects recommended timestamp with "Recommended" badge
- Click source row to select it
- Source weight info available in tooltip only

### Decision Workflow

- **Confirm & Next** button (single action, moves to next file)
- No explicit skip — just navigate away if not ready to decide
- Duplicate groups: auto-recommend best timestamp from across all files in group
- When all files reviewed: auto-prompt output generation
- Can generate output before all reviewed (with warning)
- Unreviewed files: user chooses what to do when generating output
- HIGH confidence files auto-confirm (no explicit review needed)

### Manual Timestamp Entry

- Calendar picker + text input with parsing (both available)
- Partial dates allowed with warning (e.g., just year)
- Date only required; time optional (defaults to noon)
- Pre-fill with system's recommended timestamp
- Timezone handling: Claude's discretion

### Claude's Discretion

- Selection toolbar position (top or bottom)
- Loading states (skeleton, spinner, etc.)
- Confirmation feedback animation
- Active vs inactive filter chip styling
- Expandable "show all sources" option
- Timezone handling for manual entry
- Tag panel position in examination view
- Session state persistence (scroll position, selection)

</decisions>

<specifics>
## Specific Ideas

- "Photo picked up from table" metaphor discussed for examination view — tactile feeling of lifting and examining. Implementation details deferred to prototyping phase.
- Faux 3D effects mentioned as aesthetic interest — CSS transforms for hover/selection effects are achievable.
- User wants consistent display patterns across all file types and contexts.

</specifics>

<deferred>
## Deferred Ideas

- **Tag hierarchy** (location nesting like Seattle → Washington → USA) — defer to after Phase 7. Flat tags first, hierarchy as enhancement.
- **Help/tooltips/onboarding** — worry about this later
- **Tag filtering** — minimal in MediaParser. Primary tag browsing/filtering happens in destination photo apps (Qumagie, Lightroom) that read the tags we write.
- **Mobile optimization** — desktop first, mobile can be basic/functional
- **Faux 3D aesthetic effects** — can be added as polish after core functionality works

</deferred>

---

*Phase: 04-review-queues-timestamps*
*Context gathered: 2026-02-03*
