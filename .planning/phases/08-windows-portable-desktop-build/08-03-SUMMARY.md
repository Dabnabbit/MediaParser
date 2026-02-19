---
phase: 08-windows-portable-desktop-build
plan: 03
subsystem: infra
tags: [windows, portable, build-script, python-embeddable, ffmpeg, exiftool, pip-download, cross-compile]

# Dependency graph
requires:
  - phase: 08-02-windows-portable-desktop-build
    provides: "launcher.py and MediaParser.bat referenced by copy_app() step"
  - phase: 08-01-windows-portable-desktop-build
    provides: "build/, dist/, .build-cache/ gitignore entries; run.py and api.py modifications"
provides:
  - "scripts/build-windows.py: WSL2 cross-build script producing dist/MediaParser-Windows-v{version}.zip"
  - "Portable ZIP: Python 3.12 embeddable + FFmpeg + ExifTool + Windows wheels + app code"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "pip download --platform win_amd64 --python-version 312 --implementation cp for cross-platform wheel fetching"
    - "python312.zip stdlib extraction to python312/ directory (pickle compatibility fix)"
    - "python312._pth file controls sys.path for embeddable distribution"
    - "mediaparser.pth in site-packages adds app root to sys.path (3 levels up)"
    - "rglob for nested ffmpeg.exe discovery inside essentials ZIP structure"
    - "windows_exiftool.txt copied as exiftool.pl (perl.exe entrypoint name)"
    - ".build-cache/ download caching pattern for iterative development"

key-files:
  created:
    - scripts/build-windows.py
  modified: []

key-decisions:
  - "python312.zip stdlib must be extracted to python312/ directory — leaving as ZIP causes ImportError for pickle and many stdlib modules"
  - "python-magic-bin replaces python-magic (Windows DLL-bundled variant, no libmagic.so dependency)"
  - "pytest excluded from Windows build — test-only dependency not needed in portable package"
  - "11 transitive deps hardcoded: blinker, click, itsdangerous, jinja2, markupsafe, greenlet, typing-extensions, mako, numpy, scipy, pywavelets"
  - "windows_exiftool.txt -> exiftool.pl rename is CRITICAL — perl.exe looks for exiftool.pl at runtime"
  - "Licenses_Strawberry_Perl.zip, readme_windows.txt excluded from exiftool copy — large file and docs not needed at runtime"
  - "ZIP structure has top-level MediaParser/ directory so extraction creates single self-contained folder"

patterns-established:
  - "Cross-build pattern: WSL2 Python uses pip download --platform win_amd64 to fetch Windows wheels without Wine"
  - "Embeddable Python setup: extract -> expand stdlib zip -> configure ._pth -> create site-packages -> add app .pth"

requirements-completed: [WIN-01, WIN-03]

# Metrics
duration: 2min
completed: 2026-02-19
---

# Phase 8 Plan 03: Windows Cross-Build Script Summary

**WSL2 cross-build script producing Windows portable ZIP: Python 3.12 embeddable with stdlib extracted, FFmpeg, ExifTool with perl.exe, and all 23 packages as Windows wheels via pip download --platform win_amd64**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-19T03:23:49Z
- **Completed:** 2026-02-19T03:25:54Z
- **Tasks:** 2
- **Files modified:** 1 (scripts/build-windows.py created)

## Accomplishments
- `scripts/build-windows.py` (422 lines) implements 8 build steps as separate functions callable from `main()`
- Embeddable Python configured correctly: `python312.zip` stdlib extracted, `python312._pth` modified to enable site imports, `mediaparser.pth` added so `from app import create_app` resolves
- `windows_exiftool.txt` copied as `exiftool.pl` (critical — perl.exe requires this exact name)
- `python-magic` substituted with `python-magic-bin`; `pytest` excluded; 11 transitive deps included (23 total packages)
- FFmpeg `ffmpeg.exe` found via `rglob` inside nested essentials ZIP structure
- `.build-cache/` download caching for iterative development; `--skip-download` flag for dev iteration
- All 7 plan verification checks pass; requirements.txt parsing validated inline

## Task Commits

Each task was committed atomically:

1. **Task 1: Create scripts/build-windows.py cross-build script** - `aad4714` (feat)
2. **Task 2: Verify build script with dry-run parse and package list validation** - validation only, no code changes (all checks passed, committed in SUMMARY)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `scripts/build-windows.py` - 422-line cross-build script; 8-step build pipeline; argparse interface (--version required, --clean, --skip-download)

## Decisions Made
- `python312.zip` must be extracted to a real `python312/` directory — embeddable Python ships stdlib as a nested ZIP, and leaving it compressed causes `ImportError` for `pickle` and many other stdlib modules at runtime on Windows
- `python-magic-bin` is the Windows variant of `python-magic` that bundles the `magic.dll` (no separate libmagic.so required), and must replace `python-magic` in the portable build
- `pytest` excluded from Windows wheel download/install — test-only dependency with no value in a portable distribution
- `windows_exiftool.txt -> exiftool.pl` rename is non-negotiable — perl.exe looks for `exiftool.pl` as its script entry point
- ZIP structure wraps everything in `MediaParser/` top-level directory so the user gets a single clean folder on extraction

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. The build script runs fully automated on WSL2. Actual Windows testing requires assembling the portable package via `python scripts/build-windows.py --version 0.1.0`.

## Next Phase Readiness
- All 3 Phase 8 plans complete: 08-01 (codebase prep), 08-02 (launcher + .bat), 08-03 (build script)
- Phase 8 / entire GSD roadmap is now complete
- End-to-end verification still needed on Windows: extract ZIP, double-click MediaParser.bat, confirm browser opens and app works
- Docker, quickstart.sh, and dev two-process mode unaffected by build script addition

## Self-Check

Files:
- `scripts/build-windows.py` exists: CONFIRMED (422 lines)
- Commit `aad4714` (Task 1): CONFIRMED in git log

Verification checks:
1. `--help` shows --version, --clean, --skip-download: PASS
2. AST syntax parse: PASS
3. `python-magic-bin` substitution present: PASS
4. `windows_exiftool.txt` rename to `exiftool.pl` present: PASS
5. `python312.zip` extraction present: PASS
6. `mediaparser.pth` present: PASS
7. `._pth` modification present: PASS
8. Requirements parsing assertions (python-magic-bin in, python-magic out, pytest out, flask in): PASS
9. Transitive deps count = 11, total packages = 23: PASS
10. ExifTool source files (perl.exe, perl532.dll, windows_exiftool.txt, lib/): PASS
11. Script > 200 lines (422 lines): PASS

## Self-Check: PASSED

---
*Phase: 08-windows-portable-desktop-build*
*Completed: 2026-02-19*
