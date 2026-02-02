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

- [x] **TIME-01**: System calculates confidence score for timestamp detection based on source agreement
- [ ] **TIME-02**: Low-confidence timestamps are queued for user review
- [ ] **TIME-03**: User can resolve timestamp conflicts via review UI
- [ ] **TIME-04**: User can manually enter timestamp for files with no determinable date
- [ ] **TIME-05**: User can see breakdown of timestamp sources (EXIF, filename, file date, etc.)
- [x] **TIME-06**: System preserves existing timestamp detection logic from CLI

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

- [x] **PROC-01**: System processes files using multi-threading for performance
- [ ] **PROC-02**: Output files are organized in folders by year
- [ ] **PROC-03**: Output filenames follow YYYYMMDD_HHMMSS.ext format
- [ ] **PROC-04**: User can choose to keep or delete source files after processing
- [ ] **PROC-05**: System handles tens of thousands of files without memory exhaustion

### Infrastructure

- [x] **INFRA-02**: Background job queue for long-running processing (not blocking web UI)
- [x] **INFRA-03**: Database stores file metadata, hashes, and user decisions
- [x] **INFRA-04**: Fix hardcoded timezone issue in existing code
- [x] **INFRA-05**: Remove hardcoded Windows paths, make configurable

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

### Deployment

- **INFRA-01**: Application runs in Docker container
- **DEPLOY-01**: docker-compose.yml for easy setup
- **DEPLOY-02**: Volume mounts for uploads, output, database

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
| INFRA-02 | Phase 1 | Complete |
| INFRA-03 | Phase 1 | Complete |
| INFRA-04 | Phase 1 | Complete |
| INFRA-05 | Phase 1 | Complete |
| TIME-01 | Phase 2 | Complete |
| TIME-06 | Phase 2 | Complete |
| PROC-01 | Phase 2 | Complete |
| WEB-02 | Phase 3 | Pending |
| WEB-03 | Phase 3 | Pending |
| WEB-04 | Phase 3 | Pending |
| WEB-05 | Phase 3 | Pending |
| WEB-06 | Phase 3 | Pending |
| TIME-02 | Phase 4 | Pending |
| TIME-03 | Phase 4 | Pending |
| TIME-04 | Phase 4 | Pending |
| TIME-05 | Phase 4 | Pending |
| WEB-01 | Phase 4 | Pending |
| DUP-01 | Phase 5 | Pending |
| DUP-04 | Phase 5 | Pending |
| DUP-05 | Phase 5 | Pending |
| DUP-06 | Phase 5 | Pending |
| DUP-02 | Phase 6 | Pending |
| DUP-03 | Phase 6 | Pending |
| TAG-01 | Phase 7 | Pending |
| TAG-02 | Phase 7 | Pending |
| TAG-03 | Phase 7 | Pending |
| TAG-04 | Phase 7 | Pending |
| PROC-02 | Phase 7 | Pending |
| PROC-03 | Phase 7 | Pending |
| PROC-04 | Phase 7 | Pending |
| PROC-05 | Phase 7 | Pending |

**Coverage:**
- v1 requirements: 27 total
- Mapped to phases: 27
- Unmapped: 0 ✓

---
*Requirements defined: 2026-02-02*
*Last updated: 2026-02-02 after roadmap creation*
