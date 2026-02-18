# Roadmap: MediaParser

**Project:** MediaParser - Home Media Normalizer
**Created:** 2026-02-02
**Depth:** Standard (7 phases, 3-5 plans each)

## Overview

Transform chaotic family media from mixed sources into a clean, organized, timestamped archive through web-based workflows. Build on existing CLI timestamp detection logic with web UI, background processing, duplicate detection, and review queues. Architecture separates interactive UI from long-running background work to prevent HTTP timeouts and enable progress tracking.

## Phases

### Phase 1: Foundation Architecture ✓

**Goal:** Database schema, job queue, file storage structure, and refactored CLI logic enable web app and workers to operate independently.

**Dependencies:** None (starting phase)

**Requirements:** INFRA-02, INFRA-03, INFRA-04, INFRA-05

**Status:** Complete (2026-02-02)

Plans:
- [x] 01-01-PLAN.md — Project structure, configuration, pathlib paths, timezone config
- [x] 01-02-PLAN.md — Database schema with File, Job, Duplicate, UserDecision models
- [x] 01-03-PLAN.md — CLI refactoring: timestamp/metadata libraries with configurable timezone
- [x] 01-04-PLAN.md — Huey task queue with job lifecycle management
- [x] 01-05-PLAN.md — Integration tests and application entry point

**Success Criteria:** All 7 verified ✓
1. ✓ Database contains tables for files, jobs, duplicates, and user decisions
2. ✓ Job can be created in database and enqueued successfully
3. ✓ Worker process can dequeue job and update status
4. ✓ File storage directories exist and handle uploads/processing/output separation
5. ✓ Existing CLI timestamp detection logic callable as library functions (not monolithic script)
6. ✓ Hardcoded Windows paths replaced with configurable paths (pathlib.Path)
7. ✓ Hardcoded timezone offset removed, timezone handling is configurable

---

### Phase 2: Background Workers + Core Processing ✓

**Goal:** Background workers process imported files, extract metadata, calculate confidence scores, and compute perceptual hashes without blocking web UI.

**Dependencies:** Phase 1 (requires database schema, job queue, file storage)

**Requirements:** TIME-01, TIME-06, PROC-01

**Status:** Complete (2026-02-02)

Plans:
- [x] 02-01-PLAN.md — Hashing and confidence scoring library modules
- [x] 02-02-PLAN.md — Single file processing pipeline (thread-safe)
- [x] 02-03-PLAN.md — Multi-threaded import job with progress and error handling
- [x] 02-04-PLAN.md — Unit and integration tests for processing

**Success Criteria:** All 6 verified ✓
1. ✓ Worker dequeues import job and processes all files in batch
2. ✓ File records written to database with EXIF metadata, detected timestamps, and confidence scores
3. ✓ Confidence scores categorize timestamps as HIGH (source agreement), MEDIUM (single source), or LOW (conflicts)
4. ✓ Perceptual hashes calculated for images and stored in database
5. ✓ Job status updates with progress percentage (files processed / total files)
6. ✓ Processing uses multi-threading to handle tens of thousands of files efficiently

---

### Phase 3: Web UI - Upload + Status ✓

**Goal:** Users upload files via browser, track processing progress in real-time, and view basic file metadata organized by confidence buckets and duplicate groups.

**Dependencies:** Phase 2 (requires workers to process uploads)

**Requirements:** WEB-02, WEB-03, WEB-04, WEB-05, WEB-06

**Status:** Complete (2026-02-02)

Plans:
- [x] 03-01-PLAN.md — HTML templates, CSS styles, and thumbnail library
- [x] 03-02-PLAN.md — Upload routes and job management routes
- [x] 03-03-PLAN.md — Progress API and thumbnail integration in processing
- [x] 03-04-PLAN.md — Upload and progress JavaScript modules
- [x] 03-05-PLAN.md — Results display with buckets and multi-select
- [x] 03-07-PLAN.md — Settings UI and API for output directory configuration
- [x] 03-06-PLAN.md — Human verification of complete UI

**Success Criteria:** All 7 verified ✓
1. ✓ User drags files onto browser window to upload
2. ✓ User can select files via file browser dialog
3. ✓ User can specify directory path for bulk import (not just individual files)
4. ✓ User sees progress bar showing processing completion percentage
5. ✓ User can configure output directory path via settings page
6. ✓ Upload and status UI work correctly in Firefox and Chrome desktop browsers
7. ✓ Upload creates job, enqueues to worker, and returns immediately (no blocking)

---

### Phase 4: Review Queues - Timestamps ✓

**Goal:** Users review low-confidence timestamps, resolve conflicts between sources, manually provide missing dates, and understand why each timestamp was chosen.

**Dependencies:** Phase 3 (requires web UI and worker-processed files)

**Requirements:** TIME-02, TIME-03, TIME-04, TIME-05, WEB-01

**Status:** Complete (2026-02-03)

Plans:
- [x] 04-01-PLAN.md — Database models (Tag, File extensions) and review API endpoints
- [x] 04-02-PLAN.md — Unified grid HTML structure and filter chips CSS/JS
- [x] 04-03-PLAN.md — Results handler refactor for unified grid with lazy loading
- [x] 04-04-PLAN.md — Multi-select with shift/ctrl-click and selection toolbar
- [x] 04-05-PLAN.md — Examination view modal with native dialog element
- [x] 04-06-PLAN.md — Timestamp source comparison and manual entry with Chrono
- [x] 04-07-PLAN.md — Review workflow (confirm, auto-confirm HIGH, unreview)
- [x] 04-08-PLAN.md — Tagging UI with autocomplete in toolbar and examination
- [x] 04-09-PLAN.md — Human verification of complete review workflow

**Success Criteria:** All 6 verified ✓
1. ✓ Files flagged as low-confidence appear in dedicated review queue (mode-based filtering)
2. ✓ User sees thumbnail grid of processed files (not just list)
3. ✓ User can view side-by-side comparison of all detected timestamp sources (EXIF, filename, file date)
4. ✓ User selects correct timestamp from conflict options and decision is recorded
5. ✓ User can manually enter timestamp for files with no determinable date
6. ✓ Confidence score displayed with color-coded badge (green/yellow/red) for each file

---

### Phase 5: Duplicate Detection - Exact ✓

**Goal:** Users review exact duplicate groups, compare quality metrics, and select which files to keep before any deletions occur.

**Dependencies:** Phase 4 (requires review queue UI patterns)

**Requirements:** DUP-01, DUP-04, DUP-05, DUP-06

**Status:** Complete (2026-02-04)

Plans:
- [x] 05-01-PLAN.md — API enhancement with quality metrics and recommendation logic
- [x] 05-02-PLAN.md — Duplicate cards HTML structure and CSS styling (later refactored to viewport)
- [x] 05-03-PLAN.md — DuplicatesHandler JavaScript for group navigation and selection (later refactored to viewport)
- [x] 05-04-PLAN.md — Integration with mode filter and bulk confirmation flow

**Success Criteria:** All 7 verified ✓
1. ✓ System calculates SHA256 hash for each file during import
2. ✓ Files with identical hashes grouped together as exact duplicates
3. ✓ Duplicate groups navigated via carousel viewport (refactored from side-by-side cards)
4. ✓ Quality information shown for each file (resolution, file size, format)
5. ✓ User selects which file(s) to keep via "Keep This, Discard Others" in viewport
6. ✓ Review queue prevents any files from being discarded until user explicitly confirms
7. ✓ Originals never deleted, only excluded from output generation

---

### Phase 6: Duplicate Detection - Perceptual ✓

**Goal:** Users discover near-identical photos (burst shots, crops, format conversions, compressions) through perceptual hashing with conservative thresholds to minimize false positives.

**Dependencies:** Phase 5 (extends duplicate detection)

**Requirements:** DUP-02, DUP-03

**Status:** Complete (2026-02-05)

Plans:
- [x] 06-01-PLAN.md — Perceptual hashing algorithms (pHash, dHash, aHash) with format normalization
- [x] 06-02-PLAN.md — Multi-algorithm consensus detection and similarity grouping
- [x] 06-03-PLAN.md — Similar groups API and resolution endpoints
- [x] 06-04-PLAN.md — Similar mode UI with viewport and workflow enforcement
- [x] 06-05-PLAN.md — Perceptual detection and duplicate quality tests (48 new, 128 total pass)

**Success Criteria:** All 6 verified ✓
1. ✓ System groups near-duplicates based on perceptual hash similarity (configurable threshold)
2. ✓ Same image in different formats (JPG/PNG/HEIC) grouped correctly
3. ✓ Burst photos and slight crops identified as near-duplicates
4. ✓ Format normalization applied before hashing to prevent false negatives
5. ✓ Multi-algorithm consensus (pHash + dHash + aHash) reduces false positives
6. ✓ Near-duplicate groups displayed with quality scores and recommended best version

---

### Phase 7: Output Generation + Tagging ✓

**Goal:** Users apply review decisions to generate final organized output with corrected timestamps, year-based folders, standardized filenames, and auto-extracted tags.

**Dependencies:** Phase 6 (requires all review decisions)

**Requirements:** TAG-01, TAG-02, TAG-03, TAG-04, PROC-02, PROC-03, PROC-04, PROC-05

**Status:** Complete (2026-02-06)

Plans:
- [x] 07-01-PLAN.md — Export task + file copy engine (year folders, YYYYMMDD_HHMMSS filenames)
- [x] 07-02-PLAN.md — EXIF metadata write-back (timestamps + tags via PyExifTool)
- [x] 07-03-PLAN.md — Tag auto-generation (filename syntax + folder structure)
- [x] 07-04-PLAN.md — Export UI + source cleanup + tag filter integration
- [x] 07-05-PLAN.md — Integration testing and regression verification (39 new, 80 total pass)

**Success Criteria:** All 9 verified ✓
1. ✓ Output job writes corrected EXIF metadata based on user timestamp decisions
2. ✓ Files renamed to YYYYMMDD_HHMMSS.ext format in output directory
3. ✓ Files organized into subdirectories by year (e.g., output/2023/, output/2024/)
4. ✓ Tags auto-generated from folder structure and {tag1,tag2} filename syntax
5. ✓ User can bulk assign tags to multiple selected files via UI
6. ✓ User can remove tags from selected files
7. ✓ User can filter thumbnail grid by tag
8. ✓ User chooses to keep or delete source files after output generation
9. ✓ System handles tens of thousands of files without memory exhaustion (streaming/batching)

---

## Progress

| Phase | Status | Requirements | Completion |
|-------|--------|--------------|------------|
| 1 - Foundation Architecture | ✓ Complete | 4 | 100% |
| 2 - Background Workers + Core Processing | ✓ Complete | 3 | 100% |
| 3 - Web UI - Upload + Status | ✓ Complete | 5 | 100% |
| 4 - Review Queues - Timestamps | ✓ Complete | 5 | 100% |
| 5 - Duplicate Detection - Exact | ✓ Complete | 4 | 100% |
| 6 - Duplicate Detection - Perceptual | ✓ Complete | 2 | 100% |
| 7 - Output Generation + Tagging | ✓ Complete | 8 | 100% |
| 8 - Windows Portable Desktop Build | In Progress | 3 | 0% |

**Overall:** 7/8 phases complete (87%)

---

## Future Milestones

### FOSS Photo Management Integrations (post-v1.0)

**Goal:** Import from and export to popular self-hosted photo management platforms, allowing MediaParser to serve as a dedup/organization layer in existing workflows.

**Candidates:**
- **Immich** — REST API, most popular self-hosted option, likely running on the same Docker host
- **PhotoPrism** — mature API, large user base
- **LibrePhotos** — Django-based, has API
- **Nextcloud Photos** — WebDAV + OCS API

**Possible scope:**
- **Import:** Pull assets/albums from a connected instance for dedup analysis
- **Export:** Push reviewed/deduplicated files directly into the target platform
- **Metadata sync:** Map tags and timestamps bidirectionally

**Priority:** Immich first (largest community overlap with self-hosted Docker users)

### Phase 8: Windows Portable Desktop Build

**Goal:** Download a ZIP, extract, double-click MediaParser.bat, app launches in browser. No Python install, no terminal, no dependencies. Full Docker feature parity.
**Depends on:** Phase 7
**Requirements:** WIN-01, WIN-02, WIN-03
**Plans:** 3 plans

Plans:
- [ ] 08-01-PLAN.md — Add --host flag to run.py, PID health check to api.py, build gitignore entries
- [ ] 08-02-PLAN.md — Create launcher.py desktop orchestrator and MediaParser.bat entry point
- [ ] 08-03-PLAN.md — Create scripts/build-windows.py cross-build script for Windows portable ZIP

**Success Criteria:**
1. `python launcher.py` from WSL2 spawns two processes, browser opens, Ctrl+C stops both
2. `python scripts/build-windows.py --version 0.1.0` produces ZIP in dist/
3. Extract ZIP on Windows, double-click MediaParser.bat, full app works
4. Docker, quickstart.sh, dev two-process mode still work unchanged

---

*Last updated: 2026-02-18*
