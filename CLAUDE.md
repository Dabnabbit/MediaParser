# MediaParser Project Context

## CRITICAL: Correct Working Directory

**Always use `/home/dab/Projects/MediaParser` for all file operations.**

Do NOT use `/mnt/d/Work/Scripts/MediaParser` - this is a separate Windows mount that is NOT where Flask/Huey run from.

### Why This Matters
- Flask runs from `/home/dab/Projects/MediaParser`
- Huey workers run from `/home/dab/Projects/MediaParser`
- Edits to `/mnt/d/...` will NOT be picked up by the running services

### Verification
If unsure, check where services are running:
```bash
pgrep -af huey_consumer  # Shows Huey's working directory
pgrep -af flask          # Shows Flask's working directory
```

## Running Services

### Flask (development server)
```bash
cd /home/dab/Projects/MediaParser
.venv/bin/flask run --debug
```

### Huey (background worker)
```bash
cd /home/dab/Projects/MediaParser
.venv/bin/huey_consumer huey_config.huey -w 2 -k thread
```

## Environment
- **Platform:** WSL2 (Ubuntu) - migrated from Windows
- **Target:** Linux-native, will be Dockerized
- **Python:** 3.11+ with venv at `.venv/`

## Current Development Focus
- Phase 5 complete: Duplicate Detection (Exact)
- Carousel viewport refactor complete (replaces examination modal)
- FLIP animations for enter, navigation, and partial exit
- Ready for Phase 6 (Perceptual Duplicate Detection) or Phase 7 (Output Generation)

## Recent Session Work (outside GSD tracking)
The following was tested and fixed in sessions not tracked by GSD:
- Pause/resume job control - fully working
- Worker health check endpoint
- Progress polling and UI updates
- Session resume on page refresh
- Various UI improvements and bug fixes
- Carousel viewport system (major architectural refactor)
- FLIP animation for navigation enter/leave (tiles animate to/from grid positions)
- Fixed tile.css transition selector (was applying to grid tiles, causing shoot-off bug)
- Latest commit: `631a0fd fix(viewport): FLIP animation for nav enter/leave, fix grid tile transition`
