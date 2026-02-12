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
.venv/bin/python run.py
```

### Huey (background worker)
```bash
cd /home/dab/Projects/MediaParser
.venv/bin/python run_worker.py
```

## Environment
- **Platform:** WSL2 (Ubuntu) - migrated from Windows
- **Python:** 3.12 with venv at `.venv/`
- **Docker:** Production deployment via Docker (two-service compose: web + worker)
- **CI/CD:** GitHub Actions auto-builds and pushes to GHCR on every push to `main`
- **Image:** `ghcr.io/dabnabbit/mediaparser:latest`

### Running in Docker (production)
```bash
cp .env.production .env   # Set SECRET_KEY and TIMEZONE
# Edit docker-compose.yml media mount path
docker compose pull
docker compose up -d
```

### Running locally (development)
```bash
.venv/bin/python run.py          # Flask dev server
.venv/bin/python run_worker.py   # Huey worker
```

## Current Development Focus
- All 7 GSD phases complete (v1 milestone)
- Docker deployment complete (Dockerfile, docker-compose.yml, GHCR via GitHub Actions)
- Carousel viewport refactor complete (replaces examination modal)
- FLIP animations for enter, navigation, and partial exit
- Anchored modal positioning for viewport action confirmations
- Ongoing UI polish and sound/particle enhancements
- Product naming in progress (currently "MediaParser", seeking a better name)

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
- Anchored modal positioning (confirmation dialogs appear near the triggering button)
- In-viewport group advancement (resolving a duplicate/similar group loads next group without exiting viewport)
- Docker deployment: Dockerfile, docker-compose.yml, docker-entrypoint.sh, .dockerignore, .env.production
- GitHub Actions CI/CD: auto-builds Docker image and pushes to GHCR on push to main
- `.gitattributes` fix: forces LF line endings for shell scripts (CRLF breaks Docker entrypoint)

### Sound Effects (Web Audio API) — `app/static/js/particles.js`
Synthesized sound effects added to particle system, no audio files needed:
- **Confetti** → white noise pop/snap (bandpass 1200Hz, 80ms)
- **Fireworks** → initial burst → 200ms gap → crackle pops + high-freq sizzle tail
- **Fart** → sawtooth sweep (90-120Hz) with LFO wobble + bandpassed noise texture
- **`successSound()`** → ascending two-tone square wave (520→780Hz), lowpass softened
- **`failSound()`** → "nah-uh" double buzzer (185Hz square wave, two 90ms pulses)

AudioContext lazy-inited on first user gesture via capture-phase document listener.
All sounds respect `opts.mute` (per-call) and `particles.muted` (global toggle).
Success/fail sounds share the same square-wave family for coherence.

### Next: Sound & Particle Enhancements
Planned additions (not yet implemented):
- **Lock icon shatter** (`filters.js:_updateLockIcons()`) — when a mode segment unlocks, burst particles from the lock icon position + success sound. The lock could become particles that fly apart.
- **Job complete** — moderate celebration (success sound + small confetti)
- **Export segment unlocks** — bigger celebration (fireworks + success sound) since this is the real finish line. Same sound family as job complete, just louder.
- **Mode bars "coming alive"** — when `morphToModes()` transitions from progress bar to mode segments, staggered ripple/sparkle left-to-right as each segment appears.
- Other candidates: bulk action completion sounds, progress milestones, duplicate group resolution
