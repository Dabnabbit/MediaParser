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

### Standalone mode (single command)
```bash
./quickstart.sh                  # Full setup + launch (for testers)
.venv/bin/python run.py --standalone          # If already set up
.venv/bin/python run.py --standalone --port 8080 --no-browser
```
Starts Flask + Huey consumer in one process. Huey worker threads run as daemon
threads inside the Flask process. Werkzeug reloader is disabled (would duplicate
consumer threads). Use two-process mode for hot-reload during development.

### Two-process mode (development)
```bash
.venv/bin/python run.py          # Flask dev server (debug + reloader on)
.venv/bin/python run_worker.py   # Huey worker (separate terminal)
```

### Docker (production)
```bash
cp .env.production .env   # Set SECRET_KEY and TIMEZONE
# Edit docker-compose.yml media mount path
docker compose pull
docker compose up -d
```

### `run.py` flags
| Flag | Description |
|------|-------------|
| `--standalone` | Embed Huey consumer as daemon threads (single process) |
| `--no-browser` | Don't auto-open browser (standalone only) |
| `--port PORT` | Listen port (default: 5000) |

Without `--standalone`, behavior is identical to before (debug on, reloader on,
no embedded consumer). `gunicorn run:app` still works — argparse only runs
inside `__main__`.

### `quickstart.sh`
One-command setup for testers. Detects package manager (apt/brew/dnf/pacman),
installs system deps (exiftool, ffmpeg, libmagic), creates venv, installs pip
packages, launches `--standalone`. Passes flags through (e.g. `./quickstart.sh --no-browser`).

### Worker health check (`/api/worker-health`)
- **Standalone mode:** checks embedded consumer thread liveness (`is_alive()`)
- **Two-process/Docker:** uses `pgrep` to find worker process
- Returns same `{"worker_alive": true/false}` shape in both modes

## Environment
- **Platform:** WSL2 (Ubuntu) - migrated from Windows
- **Python:** 3.12 with venv at `.venv/`
- **System deps:** exiftool, ffmpeg, libmagic (installed by `quickstart.sh` or Dockerfile)
- **Docker:** Production deployment via Docker (two-service compose: web + worker)
- **CI/CD:** GitHub Actions auto-builds and pushes to GHCR on every push to `main`
- **Image:** `ghcr.io/dabnabbit/mediaparser:latest`

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
- Standalone mode (`run.py --standalone`): embeds Huey consumer as daemon threads in Flask process
- `quickstart.sh`: one-command setup + launch for testers (system deps, venv, pip, standalone)
- Dual-mode worker health check: thread liveness in standalone, pgrep in two-process/Docker

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

### Implemented: Sound & Particle Enhancements
- **Lock icon shatter** — `particles.shatter()` metallic shard burst on segment unlock, triggered from `filters.js`
- **Job complete** — fart + fail sound on high error rate (>=10%), morph-to-modes transition
- **Export segment unlocks** — success sound on unlock in `filters.js`
- **Mode bars morph** — `morphToModes()` animates progress bar into mode segments

### Ideas (not yet implemented)
- Bulk action completion sounds
- Progress milestones
- Duplicate group resolution celebrations
