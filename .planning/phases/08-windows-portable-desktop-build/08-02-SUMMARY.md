---
phase: 08-windows-portable-desktop-build
plan: 02
subsystem: infra
tags: [launcher, windows, portable, subprocess, alembic, argparse, batch]

# Dependency graph
requires:
  - phase: 08-01-windows-portable-desktop-build
    provides: "--host flag in run.py so launcher can bind to 127.0.0.1; MEDIAPARSER_WORKER_PID health check in api.py"
provides:
  - "launcher.py: two-process desktop orchestrator (portable + system Python)"
  - "MediaParser.bat: Windows double-click entry point"
affects: [08-03-windows-portable-desktop-build]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Portable-vs-system Python detection via PORTABLE_PYTHON.exists()"
    - "DB init decision tree: upgrade (tracked), stamp (untracked), create+stamp (fresh)"
    - "Alembic logging reset: reconfigure logging after command.upgrade() call"
    - "Process lifecycle: spawn worker -> set PID env var -> spawn Flask -> poll readiness -> open browser -> wait/cleanup"

key-files:
  created:
    - launcher.py
    - MediaParser.bat
  modified:
    - .gitattributes

key-decisions:
  - "Launcher defaults host to 127.0.0.1 (localhost-only), not 0.0.0.0 -- portable build is single-user desktop"
  - "No PYTHONPATH set in launcher -- ._pth and mediaparser.pth handle sys.path for portable Python"
  - "Logging reconfigured after alembic command.upgrade() because alembic env.py resets root logger to WARNING"
  - "No CREATE_NEW_PROCESS_GROUP flag -- allows Ctrl+C to propagate to subprocesses (confirmed in research)"
  - "*.bat text eol=crlf added to .gitattributes for correct Windows line endings"

patterns-established:
  - "Portable detection: PORTABLE_PYTHON = BASE_DIR / 'tools' / 'python' / 'python.exe'; is_portable() = PORTABLE_PYTHON.exists()"
  - "DB init: sqlite3 check for alembic_version rows -> upgrade|stamp|create+stamp branch"

requirements-completed: [WIN-01, WIN-02]

# Metrics
duration: 2min
completed: 2026-02-19
---

# Phase 8 Plan 02: Desktop Launcher System Summary

**Two-process desktop launcher with portable Python detection, in-process DB migration, and clean subprocess lifecycle management**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-19T03:19:28Z
- **Completed:** 2026-02-19T03:21:23Z
- **Tasks:** 2
- **Files modified:** 3 (launcher.py created, MediaParser.bat created, .gitattributes updated)

## Accomplishments
- `launcher.py` orchestrates Flask + Huey worker as two separate processes with portable/system Python detection
- DB initialization handles all three cases: fresh install (create + stamp), untracked schema (stamp), managed schema (upgrade to head)
- `MediaParser.bat` is the user-facing double-click entry point using `%~dp0` for drive-letter-safe cd
- `.gitattributes` updated with `*.bat text eol=crlf` rule

## Task Commits

Each task was committed atomically:

1. **Task 1: Create launcher.py desktop process orchestrator** - `0f5a7a9` (feat)
2. **Task 2: Create MediaParser.bat Windows entry point** - `e315d02` (feat)

**Plan metadata:** (created below)

## Files Created/Modified
- `launcher.py` - Desktop process orchestrator: portable detection, env setup, DB init, subprocess lifecycle, browser open
- `MediaParser.bat` - Windows double-click entry: sets title, cd to script dir, invokes portable Python, pauses only on error
- `.gitattributes` - Added `*.bat text eol=crlf` for correct Windows line endings

## Decisions Made
- Launcher defaults `--host` to `127.0.0.1` (not `0.0.0.0`) — portable desktop build is single-user, localhost-only is safer
- No `PYTHONPATH` set for portable mode — `._pth` file and `mediaparser.pth` (created by build script) control sys.path; setting PYTHONPATH would be overridden by `._pth` anyway (research pitfall #2)
- After `alembic command.upgrade()`, logging is reconfigured with `force=True` to restore INFO level — alembic's `env.py` calls `fileConfig()` which resets root logger to WARNING
- No `CREATE_NEW_PROCESS_GROUP` subprocess flag — console-visible app should let Ctrl+C propagate to subprocesses; launcher cleanup handles terminate/kill

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `launcher.py` and `MediaParser.bat` are complete and dev-testable (`python launcher.py --help` works on WSL2)
- 08-03 (build script) can now reference `MediaParser.bat` and `launcher.py` as files to include in the portable ZIP
- Full end-to-end test requires Windows environment with the portable build assembled by 08-03

## Self-Check: PASSED
- `launcher.py` exists: confirmed (240 lines)
- `MediaParser.bat` exists: confirmed (7 lines)
- Commit `0f5a7a9` (Task 1): confirmed in git log
- Commit `e315d02` (Task 2): confirmed in git log
- All 7 plan verification checks: PASSED

---
*Phase: 08-windows-portable-desktop-build*
*Completed: 2026-02-19*
