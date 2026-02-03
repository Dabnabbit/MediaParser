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

## Current Development Focus
- Pause/Resume functionality for job processing
- Debug logging to `/tmp/job_debug.log`
