---
phase: 07-output-generation-tagging
plan: 04
subsystem: export-ui
tags: [export, ui, metadata-write, auto-tags, source-cleanup, tag-filter]
requires:
  - phase: 07-01
    rationale: Export task engine (process_export_job, copy_file_to_output)
  - phase: 07-02
    rationale: write_metadata for EXIF timestamp + tag write-back
  - phase: 07-03
    rationale: apply_auto_tags for pre-export tag generation
provides:
  - Export button in UI (deferred until all review work complete)
  - Export progress polling with file count, current file, ETA
  - Export summary display with output path, files written, errors
  - Source file cleanup UI (keep/delete options)
  - Tag filter parameter on files endpoint
  - Integrated pipeline: auto-tag → copy → write metadata
affects:
  - 07-05: Integration tests validate this end-to-end pipeline
tech-stack:
  added: []
  patterns:
    - ProgressHandler reuse for export polling
    - Duplicate resolution validation before export trigger
    - Source cleanup endpoint with safety checks (only delete exported files)
decisions:
  - decision: Defer export section until all review work done
    rationale: Prevents exporting with unresolved duplicates or unreviewed files
    alternatives: [Allow export anytime with warning, Hard-block on duplicates only]
  - decision: Fix summary endpoint to join through job_files table
    rationale: File.job_id doesn't exist (many-to-many), was causing 500 errors
    alternatives: [Add job_id column to File model]
  - decision: Add similar file count to summary response
    rationale: Was missing, only had group count; needed for review completion check
    alternatives: [Client-side calculation from group data]
commits:
  - hash: a34caa4
    message: "feat(07-04): integrate auto-tags and metadata write-back into export pipeline"
  - hash: 07eb49e
    message: "feat(07-04): add export UI controls and tag filter to frontend"
  - hash: 07f6c1f
    message: "fix(07-04): fix summary endpoint crash and defer export until review complete"
files_modified:
  - app/tasks.py
  - app/routes/jobs.py
  - app/static/js/progress.js
  - app/static/js/results.js
  - app/static/js/filters.js
  - app/static/css/main.css
  - app/templates/index.html
---

## What Was Built

Wired together the export task (07-01), metadata write-back (07-02), and auto-tagging (07-03) into a complete user-facing export workflow with UI controls.

### Export Pipeline Integration
- `process_export_job()` now calls `apply_auto_tags()` before the copy loop
- After each file copy, `write_metadata()` writes corrected timestamps and tags to the output file
- Duplicate resolution validation warns (with `force` override) if unresolved groups exist

### Export UI
- Export button appears only after all review work is complete (duplicates, similar, unreviewed resolved)
- Progress handler polls export job with progress bar, current file, and ETA
- Export summary displays output path, files written, and error count
- Source cleanup section offers "Keep Source Files" / "Delete Source Files" after export completes

### Tag Filter
- Files endpoint accepts `tag` query parameter for filtering by tag name
- GET `/api/tags` endpoint returns available tags for the job

### Bug Fixes During Verification
- Summary endpoint was using `File.job_id` which doesn't exist (many-to-many via `job_files` table) — fixed to join through association table
- Added `similar` file count to summary response (was missing)
- Added `similar_group_id` exclusion to unreviewed count

## Verification

All must_have truths confirmed:
- ✓ User can trigger export from the UI after review is complete
- ✓ Export progress displayed with file count, current file, and ETA
- ✓ Export summary shows output path, files written, and errors
- ✓ User can choose to delete source files after successful export
- ✓ User can filter the thumbnail grid by tag
- ✓ Auto-tags generated before file copy during export
