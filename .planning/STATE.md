# Project State: MediaParser

**Last Updated:** 2026-02-02

## Project Reference

**Core Value:** Turn chaotic family media from dozens of sources into a clean, organized, timestamped archive — without losing anything important.

**Current Focus:** Phase 1 - Foundation Architecture (Pending)

## Current Position

**Phase:** 1 - Foundation Architecture
**Plan:** None (awaiting plan-phase)
**Status:** Pending
**Progress:** `[░░░░░░░░░░░░░░░░░░░░] 0%` (0/5 requirements)

**Active Requirements:**
- INFRA-01: Application runs in Docker container
- INFRA-02: Background job queue for long-running processing
- INFRA-03: Database stores file metadata, hashes, and user decisions
- INFRA-04: Fix hardcoded timezone issue in existing code
- INFRA-05: Remove hardcoded Windows paths, make configurable

## Performance Metrics

**Velocity:** N/A (no completed phases)
**Plan Success Rate:** N/A (no completed plans)
**Blocker Rate:** N/A (no blockers yet)

## Accumulated Context

### Key Decisions

| Decision | Date | Rationale | Impact |
|----------|------|-----------|--------|
| Flask + Celery over Django | 2026-02-02 | Lightweight brownfield-friendly, separates web UI from background processing | Foundation architecture design |
| SQLite for v1 | 2026-02-02 | Handles household scale (tens of thousands), zero operational overhead | Database layer simplicity |
| Job queue pattern (async processing) | 2026-02-02 | Prevents HTTP timeouts, enables progress tracking, allows browser close | Architecture split: web app vs workers |
| Conservative duplicate thresholds | 2026-02-02 | Minimize false positives with multi-algorithm consensus | Phase 6 design constraint |
| Copy-first, never modify originals | 2026-02-02 | Prevent data loss of irreplaceable family photos | File handling throughout |

### Active TODOs

None (awaiting Phase 1 plan)

### Known Blockers

None

### Technical Debt

**From Existing Codebase:**
1. Hardcoded timezone offset (-4) in PhotoTimeFixer.py line 244 - causes incorrect timestamps for non-local timezone files
2. Hardcoded Windows paths in PhotoTimeFixer.py lines 13-14 - breaks on Linux/Docker
3. Filename collision handling increments by 1 second - can fail with burst photos or high-volume imports
4. No streaming/batching for large file sets - potential memory exhaustion with 50k+ files
5. Monolithic script structure - cannot be imported as library functions

**Resolution Plan:** Phase 1 addresses items 1, 2, 5 directly. Phase 2 addresses item 4. Phase 5/6 addresses item 3 with better collision handling.

### Research Flags

**Phase 6 (Perceptual Duplicate Detection):** Needs deeper research during planning.
- Algorithm selection: pHash vs dHash vs aHash performance/accuracy tradeoffs
- Threshold tuning methodology for family photos (burst shots, crops, edits)
- False positive rate targets and mitigation strategies
- Format normalization approaches (JPEG vs PNG vs HEIC)
- Performance optimization for large datasets (50k+ files)

**Recommendation:** Use `/gsd:research-phase` before planning Phase 6.

## Session Continuity

**For Next Session:**
1. Run `/gsd:plan-phase 1` to create execution plan for Foundation Architecture
2. Focus on database schema design (files, jobs, duplicates, decisions tables)
3. Set up job queue (Huey or Celery) with Redis backend
4. Refactor PhotoTimeFixer.py timestamp detection into importable library functions
5. Implement configurable paths using pathlib.Path (fix Windows hardcoding)
6. Implement timezone-aware datetime handling (fix hardcoded -4 offset)

**Context to Preserve:**
- Research suggests 8 phases (validated, now in roadmap)
- Standard depth = 3-5 plans per phase
- All 28 requirements mapped to phases (100% coverage validated)
- Build order: Foundation → Workers → Web UI → Review Queues → Duplicates → Output → Docker
- Architecture: Flask web app + Celery workers + Redis queue + SQLite database

---

*State initialized: 2026-02-02*
