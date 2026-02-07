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
