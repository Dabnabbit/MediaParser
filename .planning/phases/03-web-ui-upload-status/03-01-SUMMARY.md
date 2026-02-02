---
phase: 03-web-ui-upload-status
plan: 01
subsystem: ui
tags: [html, css, pillow, flask-templates, jinja2, responsive-design, thumbnail-generation]

# Dependency graph
requires:
  - phase: 01-foundation-architecture
    provides: Flask app factory pattern, static file serving
  - phase: 02-background-workers
    provides: File processing models, job status enums
provides:
  - HTML templates with single-pane vertical layout
  - CSS styles for upload, progress, results sections
  - Thumbnail generation library with EXIF orientation correction
affects: [03-02-upload-routes, 03-03-progress-api, 03-04-results-display, 03-05-realtime-updates]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Jinja2 template inheritance (base.html extended by index.html)"
    - "CSS variables for theming and consistent styling"
    - "Accordion UI pattern for confidence buckets"
    - "EXIF-aware thumbnail generation using PIL.ImageOps.exif_transpose"

key-files:
  created:
    - app/templates/base.html
    - app/templates/index.html
    - app/static/css/main.css
    - app/lib/thumbnail.py
  modified: []

key-decisions:
  - "Single-pane vertical layout: upload always visible at top, progress/results expand below"
  - "Accordion buckets: only one confidence bucket expanded at a time for focused viewing"
  - "Three thumbnail sizes: compact (100px), medium (150px), large (200px) for different use cases"
  - "EXIF orientation correction first: prevents rotated thumbnails from mobile photos"
  - "RGB conversion for JPEG: handles RGBA/P mode images for thumbnail compatibility"

patterns-established:
  - "data-* attributes for JavaScript targeting (data-section, data-bucket, data-grid)"
  - "CSS Grid for responsive thumbnail layout with auto-fill minmax pattern"
  - "Status badge color coding: RUNNING=blue, COMPLETED=green, FAILED=red, PAUSED=yellow"
  - "Confidence badge styling: HIGH=green, MEDIUM=yellow, LOW=red"

# Metrics
duration: 3min
completed: 2026-02-02
---

# Phase 03 Plan 01: Web UI Foundation Summary

**Single-pane HTML/CSS layout with upload box, progress tracking, confidence buckets, and EXIF-aware thumbnail generation using Pillow**

## Performance

- **Duration:** 2m 56s
- **Started:** 2026-02-02T19:23:36Z
- **Completed:** 2026-02-02T19:26:32Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- HTML templates with semantic structure and single-pane vertical flow
- Comprehensive CSS (705 lines) with responsive design and accordion behavior
- Thumbnail generation library with EXIF orientation correction for mobile photos

## Task Commits

Each task was committed atomically:

1. **Task 1: Create HTML templates with single-pane layout** - `50e1a6e` (feat)
2. **Task 2: Create CSS styles for all UI components** - `db8b657` (feat)
3. **Task 3: Create thumbnail generation library** - `332b1b8` (feat)

## Files Created/Modified

### Created
- `app/templates/base.html` - Base HTML5 template with header, CSS/JS links, content block (30 lines)
- `app/templates/index.html` - Single-pane layout with upload, progress, results sections (205 lines)
- `app/static/css/main.css` - Complete UI styling with CSS variables, responsive breakpoints (705 lines)
- `app/lib/thumbnail.py` - Thumbnail generation with EXIF orientation correction (90 lines)

### Key Features

**Templates (base.html + index.html):**
- Upload section: file/folder selection buttons, server path import field, drag-drop box
- Progress section: status badge, job controls (pause/cancel), progress bar, 4-metric grid
- Results section: summary card, confidence buckets (HIGH/MEDIUM/LOW), thumbnail size toggle
- Accordion pattern: bucket headers toggle expand/collapse, only one open at a time
- Data attributes: data-section, data-bucket, data-grid for JavaScript targeting

**CSS (main.css):**
- CSS variables for theming (confidence colors, status colors, UI palette)
- Single-pane vertical layout with max-width container (1200px centered)
- Upload box with hover/drag-over states (dashed border, background change)
- Button styles: primary/secondary/danger with hover states
- Progress bars with animated fill transitions
- Metrics grid: 2x2 on desktop, 1 column on mobile
- Status badges with color coding (RUNNING/COMPLETED/FAILED/PAUSED/PENDING)
- Accordion buckets with max-height transitions for smooth expand/collapse
- Thumbnail grid with three size classes and responsive auto-fill
- Duplicate group card layout for side-by-side comparison
- Mobile breakpoint (@media max-width 768px) with stacked layouts

**Thumbnail Library (thumbnail.py):**
- `generate_thumbnail()`: Creates thumbnails with EXIF orientation correction
- Uses `ImageOps.exif_transpose()` to auto-rotate based on EXIF metadata
- Supports size presets ('compact', 'medium', 'large') and custom dimensions
- Converts RGBA/P mode to RGB for JPEG compatibility
- LANCZOS resampling for high-quality downscaling
- Returns Path on success, None on error (worker-friendly pattern)
- `get_thumbnail_path()`: Helper to retrieve existing thumbnail by file_id
- `SIZES` constant: Default dimensions dictionary for three size tiers

## Decisions Made

1. **Single-pane vertical layout over multi-page navigation**
   - Rationale: User wants continuous workflow without page jumps
   - Impact: Upload always visible, progress/results expand below as job progresses

2. **Accordion bucket pattern (only one open at a time)**
   - Rationale: User specified "only one bucket can be opened at a time and becomes the large scrollable majority of the display"
   - Impact: Focused viewing experience, explicit user choice of which confidence level to review

3. **Three thumbnail size presets**
   - Rationale: Different use cases (compact for bulk tagging, large for duplicate comparison per CONTEXT.md)
   - Impact: Explicit user control via button toggle, grid dynamically adjusts

4. **EXIF orientation correction before all processing**
   - Rationale: Mobile photos often have rotation metadata; thumbnails must respect this
   - Impact: Prevents upside-down or sideways thumbnails, critical for usability

5. **RGB conversion for JPEG thumbnails**
   - Rationale: JPEG doesn't support transparency (RGBA) or palette (P) modes
   - Impact: Handles PNG/GIF source images without errors during thumbnail save

6. **CSS variables for theming**
   - Rationale: Single source of truth for colors, easy to adjust globally
   - Impact: Consistent color palette across all UI components, future theming support

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all tasks completed successfully on first attempt.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Ready for next phase (03-02: Upload Routes):**
- Templates provide upload form structure with file/folder inputs
- CSS provides visual feedback states (drag-over, progress, status badges)
- Thumbnail library ready to be called during processing (Phase 2 worker integration point)

**Integration points established:**
- Upload section has `#file-input`, `#folder-input`, `#server-path` for route handling
- Progress section has `#job-status-badge`, `#job-progress-fill`, metric fields for updates
- Results section has `#high-grid`, `#medium-grid`, `#low-grid` for thumbnail population
- Data attributes throughout for JavaScript event binding

**Technical notes:**
- Templates reference JS files (upload.js, progress.js, results.js) that don't exist yet - will be created in subsequent plans
- Thumbnail directory not specified - next phase should define storage location (likely `storage/thumbnails/`)
- Thumbnail generation timing not decided - can be during processing (Task 2 worker) or on-demand (results display)

**No blockers or concerns.**

---
*Phase: 03-web-ui-upload-status*
*Completed: 2026-02-02*
