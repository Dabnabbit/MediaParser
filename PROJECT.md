# MediaParser

## What This Is

A web-based home media normalizer that takes photos from mixed sources (phones, cameras, scanners, internet downloads), corrects timestamps, detects duplicates, and organizes them into a clean archive structure. Designed for household use — simple enough for family members to import their phone dumps and messy photo folders, with a review workflow for decisions that need human judgment.

## Core Value

Turn chaotic family media from dozens of sources into a clean, organized, timestamped archive — without losing anything important.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

- [x] Timestamp detection from multiple sources (EXIF, filename patterns, file dates, other metadata) — existing
- [x] Tag extraction from folder names and `{tag1,tag2}` filename syntax — existing
- [x] Output files named `YYYYMMDD_HHMMSS.ext` — existing
- [x] Output organized in folders by year — existing
- [x] Extension correction when metadata disagrees with file extension — existing
- [x] `[FORCE]` filename syntax to override timestamp detection — existing
- [x] Basic confidence handling (low-confidence files flagged for review) — existing

### Active

<!-- Current scope. Building toward these. -->

**Web Interface:**
- [ ] Web GUI accessible via browser (Flask or Django)
- [ ] Docker containerized deployment
- [ ] Input via file upload, directory selection, or path specification
- [ ] Configurable output directory path
- [ ] Simple, intuitive interface for non-technical household members

**Timestamp Processing:**
- [ ] Confidence scoring for timestamp detection (sources weighted and compared)
- [ ] Review queue for low-confidence timestamps
- [ ] User interface to resolve timestamp conflicts
- [ ] User interface to provide timestamps for files with no determinable date

**Duplicate Detection:**
- [ ] Exact duplicate detection (same file, different name/location)
- [ ] Same image, different quality (resized, compressed, screenshots)
- [ ] Same image, different format (JPG vs PNG vs HEIC)
- [ ] Near-identical shots (burst photos, slight crops, minor edits)
- [ ] Review queue showing duplicate groups with quality info (resolution, file size)
- [ ] User selection of which file(s) to keep from each group

**Tagging:**
- [ ] Seed tags from folder structure and filenames (preserve existing logic)
- [ ] Bulk tag management during review (select thumbnails, assign/remove tags)
- [ ] Tag assignment interface in web GUI

**Processing:**
- [ ] Multi-threaded processing for performance (handle tens of thousands of files)
- [ ] Progress indication during processing
- [ ] Option to keep or delete source files after processing

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Full video support — Some video works in existing script, but not all formats. Defer to v2 after photo workflow is solid.
- Multi-user support — Single user for v1. Multi-user with separate workspaces is v2.
- Authentication/login — No auth for v1, home network trusted. Add in v2 with multi-user.
- Direct NAS/QNAP output — Use local/configurable paths for v1. Direct NAS integration is v2.
- QuMagie integration — Current archive uses QuMagie but no direct integration needed. May evaluate alternatives later.
- Mobile app — Web-first, responsive design sufficient for phone browsers.

## Context

**Existing codebase:**
- `PhotoTimeFixer.py` — CLI script with working timestamp detection, tag extraction, and output organization
- Uses PyExifTool for metadata reading/writing
- Has rudimentary confidence handling (files go to CHECK folder)
- Handles some video formats (mp4, mpeg, mov) but not fully

**Technical environment:**
- Will run in Docker on home media server
- Output destination is currently QNAP NAS with QuMagie, accessed via network share
- Users are household family members with varying technical comfort

**Scale:**
- Needs to handle thousands to tens of thousands of backlogged files
- Ongoing use for periodic imports (phone backups, etc.)

**Key algorithms needed:**
- Perceptual hashing for near-duplicate detection (e.g., imagehash library)
- Weighted confidence scoring for timestamp sources

## Constraints

- **Framework**: Flask or Django (user preference, TBD during research)
- **Deployment**: Must run in Docker container
- **Performance**: Must handle tens of thousands of files without excessive processing time
- **Compatibility**: Preserve existing timestamp detection logic that works well

## Key Decisions

<!-- Decisions that constrain future work. Add throughout project lifecycle. -->

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Web framework (Flask vs Django) | TBD during research phase | — Pending |
| Perceptual hashing library | TBD during research | — Pending |
| Database for state/hashes | TBD during research | — Pending |
| Preserve existing timestamp logic | Works well, proven in use | — Pending |

---
*Last updated: 2026-02-02 after initialization*
