# Phase 3: Web UI - Upload + Status - Context

**Gathered:** 2026-02-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Users upload files via browser, track processing progress in real-time, and view basic file metadata organized by confidence buckets and duplicate groups. This phase builds the UI shell and display structure; actual review actions (tagging, timestamp override, duplicate decisions) come in later phases.

</domain>

<decisions>
## Implementation Decisions

### Single-Pane Layout
- One continuous view, no page navigation for core workflow
- Vertical flow: upload area → progress/metrics → results (when complete)
- Results section expands below progress when job completes

### Upload Experience
- Dedicated upload box (not full-page drop zone)
- Clicking the upload box opens file/folder browser
- **Two import methods:**
  - Browser folder picker (webkitdirectory) for local folders
  - Text field for server-side paths (e.g., /nas/photos/2024)
- Overall progress bar during upload (not per-file)

### Progress Display
- Detailed metrics: files processed, total files, current filename, elapsed time, estimated time remaining
- Error count badge visible during progress; error details shown after completion
- Pause and Cancel buttons available during processing
- **Update mechanism:** Claude's discretion (polling vs WebSocket/SSE based on complexity tradeoff)

### Job Completion Display
- Summary card visible: total files, success/error counts, time taken
- Click to expand into full results view
- Results show three groupings:
  1. **Confidence buckets** (HIGH/MEDIUM/LOW) — files grouped by timestamp confidence
  2. **Duplicate groups** — files with matching hashes grouped together
  3. **Failed files** — files that couldn't be processed, for manual review outside app

### Thumbnail Grid (Results)
- Files displayed as thumbnail tiles within each bucket
- Only one bucket expandable at a time; others collapse
- Buckets are scrollable when expanded
- **Thumbnail size toggle:** explicit user control (compact/medium/large)
- Multi-select capability built into the grid (Phase 4+ will add actions)

### Duplicate Group Display
- Side-by-side row layout for each duplicate set (easy visual comparison)
- Per-group summary: file count, resolution differences, metadata richness
- **Recommended pick badge:** system suggests best version based on resolution/metadata quality

### Session Continuity
- Resume where you left off when returning to browser
- No job history page needed (one-shot workflow)
- **Abandon/reset:** Claude's discretion on clear button behavior

### Output Structure (v1)
- Local output directory only (manual move to NAS)
- Default year-based structure: `output/2024/`, `output/2023/`, etc.
- Failed files to separate location: `output/failed/`
- v2: Configurable output directory structure (deferred)

### Settings
- **Location:** Claude's discretion (gear icon/modal, collapsible section, or separate page)
- **Essential settings for v1:** Claude picks minimum (likely output directory, timezone)
- **Output directory:** Claude's discretion on text field vs environment variable
- **Persistence:** Claude's discretion (database vs session-only with env var defaults)

### Claude's Discretion
- Progress update mechanism (polling vs real-time)
- Thumbnail generation timing (during processing vs on-demand)
- Settings UI location and which settings to expose
- Session resume implementation details
- Abandon/reset button behavior

</decisions>

<specifics>
## Specific Ideas

- "Like a single pane where upload is small at top, progress shows processing, and results expand below when done"
- "Buckets should display image widgets/thumbnails that can be interacted with"
- "Only one bucket can be opened at a time and becomes the large scrollable majority of the display"
- "Duplicate groupings should show files side-by-side with a recommended pick based on resolution/metadata"
- "Thumbnail size should be variable — larger for duplicate comparison, smaller for bulk tagging"

</specifics>

<deferred>
## Deferred Ideas

- **Direct NAS output** — v1 uses local output, manual move to NAS
- **Configurable output directory structure** — v1 uses fixed year-based structure
- **Revisiting processed files** — v1 is one-shot workflow; file management happens in Qmagie after output
- **Advanced tagging/adjustment features** — v2/v3 feature for post-import modifications

</deferred>

---

*Phase: 03-web-ui-upload-status*
*Context gathered: 2026-02-02*
