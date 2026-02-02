# Requirements: MediaParser

**Defined:** 2026-02-02
**Core Value:** Turn chaotic family media from dozens of sources into a clean, organized, timestamped archive — without losing anything important.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Web Interface

- [ ] **WEB-01**: User can view processed files in a thumbnail grid
- [ ] **WEB-02**: User can upload files via drag-drop or file browser
- [ ] **WEB-03**: User can specify a directory path for bulk import
- [ ] **WEB-04**: User sees progress indicators during processing
- [ ] **WEB-05**: User can configure output directory path
- [ ] **WEB-06**: Interface works in Firefox and Chrome desktop browsers

### Timestamp Processing

- [ ] **TIME-01**: System calculates confidence score for timestamp detection based on source agreement
- [ ] **TIME-02**: Low-confidence timestamps are queued for user review
- [ ] **TIME-03**: User can resolve timestamp conflicts via review UI
- [ ] **TIME-04**: User can manually enter timestamp for files with no determinable date
- [ ] **TIME-05**: User can see breakdown of timestamp sources (EXIF, filename, file date, etc.)
- [ ] **TIME-06**: System preserves existing timestamp detection logic from CLI

### Duplicate Detection

- [ ] **DUP-01**: System detects exact duplicates via file hash
- [ ] **DUP-02**: System detects near-duplicates via perceptual hashing
- [ ] **DUP-03**: System groups same image in different formats (JPG/PNG/HEIC)
- [ ] **DUP-04**: System displays quality info (resolution, file size) for comparison
- [ ] **DUP-05**: User can select which file(s) to keep from duplicate groups
- [ ] **DUP-06**: User reviews duplicate groups before any files are discarded

### Tagging

- [ ] **TAG-01**: System auto-generates tags from folder structure and filename syntax
- [ ] **TAG-02**: User can bulk assign tags to multiple selected files
- [ ] **TAG-03**: User can remove tags from selected files
- [ ] **TAG-04**: User can filter view by tag

### Processing & Output

- [ ] **PROC-01**: System processes files using multi-threading for performance
- [ ] **PROC-02**: Output files are organized in folders by year
- [ ] **PROC-03**: Output filenames follow YYYYMMDD_HHMMSS.ext format
- [ ] **PROC-04**: User can choose to keep or delete source files after processing
- [ ] **PROC-05**: System handles tens of thousands of files without memory exhaustion

### Infrastructure

- [ ] **INFRA-01**: Application runs in Docker container
- [ ] **INFRA-02**: Background job queue for long-running processing (not blocking web UI)
- [ ] **INFRA-03**: Database stores file metadata, hashes, and user decisions
- [ ] **INFRA-04**: Fix hardcoded timezone issue in existing code
- [ ] **INFRA-05**: Remove hardcoded Windows paths, make configurable

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Mobile & Responsive

- **MOBILE-01**: Responsive design for phone/tablet browsers
- **MOBILE-02**: Touch-friendly thumbnail selection and tagging

### Video Support

- **VIDEO-01**: Full video format support (all common formats)
- **VIDEO-02**: Video thumbnail generation
- **VIDEO-03**: Video metadata extraction and correction

### Multi-User & Security

- **AUTH-01**: User authentication/login
- **AUTH-02**: Separate workspaces per household member
- **AUTH-03**: Session management

### Integration

- **INT-01**: Direct output to NAS/network share
- **INT-02**: QuMagie or alternative archive integration
- **INT-03**: Phone backup integration (auto-import)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Image editing (crop, rotate, filters) | Not core to organization mission, adds complexity |
| Face recognition / AI tagging | Privacy concerns, complexity, can add later |
| Cloud sync (Google Photos, iCloud) | Security risk, adds external dependencies |
| Social sharing | Not needed for private family archive |
| Print ordering | Not core to organization mission |
| Slideshow / presentation mode | Can use QuMagie or other viewer for this |
| RAW file processing | Complexity, most family photos are JPG/HEIC |
| GPS/location tagging | Nice-to-have but not core, defer |
| Album/collection organization | Beyond scope of "normalize and organize" |
| Automatic backup | Out of scope, user handles backup separately |
| Real-time sync | Batch processing sufficient for use case |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-01 | TBD | Pending |
| INFRA-02 | TBD | Pending |
| INFRA-03 | TBD | Pending |
| INFRA-04 | TBD | Pending |
| INFRA-05 | TBD | Pending |
| WEB-01 | TBD | Pending |
| WEB-02 | TBD | Pending |
| WEB-03 | TBD | Pending |
| WEB-04 | TBD | Pending |
| WEB-05 | TBD | Pending |
| WEB-06 | TBD | Pending |
| TIME-01 | TBD | Pending |
| TIME-02 | TBD | Pending |
| TIME-03 | TBD | Pending |
| TIME-04 | TBD | Pending |
| TIME-05 | TBD | Pending |
| TIME-06 | TBD | Pending |
| DUP-01 | TBD | Pending |
| DUP-02 | TBD | Pending |
| DUP-03 | TBD | Pending |
| DUP-04 | TBD | Pending |
| DUP-05 | TBD | Pending |
| DUP-06 | TBD | Pending |
| TAG-01 | TBD | Pending |
| TAG-02 | TBD | Pending |
| TAG-03 | TBD | Pending |
| TAG-04 | TBD | Pending |
| PROC-01 | TBD | Pending |
| PROC-02 | TBD | Pending |
| PROC-03 | TBD | Pending |
| PROC-04 | TBD | Pending |
| PROC-05 | TBD | Pending |

**Coverage:**
- v1 requirements: 28 total
- Mapped to phases: 0
- Unmapped: 28 ⚠️

---
*Requirements defined: 2026-02-02*
*Last updated: 2026-02-02 after initial definition*
