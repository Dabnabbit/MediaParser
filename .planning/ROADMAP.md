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

### Phase 2: Background Workers + Core Processing

**Goal:** Background workers process imported files, extract metadata, calculate confidence scores, and compute perceptual hashes without blocking web UI.

**Dependencies:** Phase 1 (requires database schema, job queue, file storage)

**Requirements:** TIME-01, TIME-06, PROC-01

**Plans:** 4 plans

Plans:
- [ ] 02-01-PLAN.md — Hashing and confidence scoring library modules
- [ ] 02-02-PLAN.md — Single file processing pipeline (thread-safe)
- [ ] 02-03-PLAN.md — Multi-threaded import job with progress and error handling
- [ ] 02-04-PLAN.md — Unit and integration tests for processing

**Success Criteria:**
1. Worker dequeues import job and processes all files in batch
2. File records written to database with EXIF metadata, detected timestamps, and confidence scores
3. Confidence scores categorize timestamps as HIGH (source agreement), MEDIUM (single source), or LOW (conflicts)
4. Perceptual hashes calculated for images and stored in database
5. Job status updates with progress percentage (files processed / total files)
6. Processing uses multi-threading to handle tens of thousands of files efficiently

---

### Phase 3: Web UI - Upload + Status

**Goal:** Users upload files via browser, track processing progress in real-time, and view basic file metadata without waiting for processing to complete.

**Dependencies:** Phase 2 (requires workers to process uploads)

**Requirements:** WEB-02, WEB-03, WEB-04, WEB-05, WEB-06

**Success Criteria:**
1. User drags files onto browser window to upload
2. User can select files via file browser dialog
3. User can specify directory path for bulk import (not just individual files)
4. User sees progress bar showing processing completion percentage
5. User can configure output directory path via settings page
6. Upload and status UI work correctly in Firefox and Chrome desktop browsers
7. Upload creates job, enqueues to worker, and returns immediately (no blocking)

---

### Phase 4: Review Queues - Timestamps

**Goal:** Users review low-confidence timestamps, resolve conflicts between sources, manually provide missing dates, and understand why each timestamp was chosen.

**Dependencies:** Phase 3 (requires web UI and worker-processed files)

**Requirements:** TIME-02, TIME-03, TIME-04, TIME-05, WEB-01

**Success Criteria:**
1. Files flagged as low-confidence appear in dedicated review queue
2. User sees thumbnail grid of processed files (not just list)
3. User can view side-by-side comparison of all detected timestamp sources (EXIF, filename, file date)
4. User selects correct timestamp from conflict options and decision is recorded
5. User can manually enter timestamp for files with no determinable date
6. Confidence score displayed with color-coded badge (green/yellow/red) for each file

---

### Phase 5: Duplicate Detection - Exact

**Goal:** Users review exact duplicate groups, compare quality metrics, and select which files to keep before any deletions occur.

**Dependencies:** Phase 4 (requires review queue UI patterns)

**Requirements:** DUP-01, DUP-04, DUP-05, DUP-06

**Success Criteria:**
1. System calculates SHA256 hash for each file during import
2. Files with identical hashes grouped together as exact duplicates
3. Duplicate groups displayed as cards showing all files side-by-side
4. Quality information shown for each file (resolution, file size, format)
5. User selects which file(s) to keep from each group via radio buttons or checkboxes
6. Review queue prevents any files from being discarded until user explicitly confirms
7. Originals never deleted, only excluded from output generation

---

### Phase 6: Duplicate Detection - Perceptual

**Goal:** Users discover near-identical photos (burst shots, crops, format conversions, compressions) through perceptual hashing with conservative thresholds to minimize false positives.

**Dependencies:** Phase 5 (extends duplicate detection)

**Requirements:** DUP-02, DUP-03

**Success Criteria:**
1. System groups near-duplicates based on perceptual hash similarity (configurable threshold)
2. Same image in different formats (JPG/PNG/HEIC) grouped correctly
3. Burst photos and slight crops identified as near-duplicates
4. Format normalization applied before hashing to prevent false negatives
5. Multi-algorithm consensus (pHash + dHash + aHash) reduces false positives
6. Near-duplicate groups displayed with quality scores and recommended best version

---

### Phase 7: Output Generation + Tagging

**Goal:** Users apply review decisions to generate final organized output with corrected timestamps, year-based folders, standardized filenames, and auto-extracted tags.

**Dependencies:** Phase 6 (requires all review decisions)

**Requirements:** TAG-01, TAG-02, TAG-03, TAG-04, PROC-02, PROC-03, PROC-04, PROC-05

**Success Criteria:**
1. Output job writes corrected EXIF metadata based on user timestamp decisions
2. Files renamed to YYYYMMDD_HHMMSS.ext format in output directory
3. Files organized into subdirectories by year (e.g., output/2023/, output/2024/)
4. Tags auto-generated from folder structure and {tag1,tag2} filename syntax
5. User can bulk assign tags to multiple selected files via UI
6. User can remove tags from selected files
7. User can filter thumbnail grid by tag
8. User chooses to keep or delete source files after output generation
9. System handles tens of thousands of files without memory exhaustion (streaming/batching)

---

## Progress

| Phase | Status | Requirements | Completion |
|-------|--------|--------------|------------|
| 1 - Foundation Architecture | ✓ Complete | 4 | 100% |
| 2 - Background Workers + Core Processing | Planned | 3 | 0% |
| 3 - Web UI - Upload + Status | Pending | 5 | 0% |
| 4 - Review Queues - Timestamps | Pending | 5 | 0% |
| 5 - Duplicate Detection - Exact | Pending | 4 | 0% |
| 6 - Duplicate Detection - Perceptual | Pending | 2 | 0% |
| 7 - Output Generation + Tagging | Pending | 8 | 0% |

**Overall:** 1/7 phases complete (14%)

---

*Last updated: 2026-02-02*
