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
- Phase 3 complete: Web UI with upload, progress, results, settings
- Pause/Resume functionality verified working
- Ready for Phase 4: Timestamp Review & Override

## Recent Session Work (outside GSD tracking)
The following was tested and fixed in sessions not tracked by GSD:
- Pause/resume job control - fully working
- Worker health check endpoint
- Progress polling and UI updates
- Session resume on page refresh
- Various UI improvements and bug fixes
- Commit: `80039e4 feat: pause/resume fixes, worker health check, UI improvements`
