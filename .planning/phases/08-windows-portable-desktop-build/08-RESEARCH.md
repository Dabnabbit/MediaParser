# Phase 08: Windows Portable Desktop Build - Research

**Researched:** 2026-02-18
**Domain:** Windows portable Python app distribution, cross-platform build tooling
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from STATE.md — treated as locked decisions)

### Locked Decisions

**Architecture:** Two separate processes (Flask + Huey worker) — NOT standalone mode.
Matches Docker's web+worker architecture for true CPU parallelism.

**Bundle contents (~120-160MB):**
- Python 3.12 embeddable package (official Microsoft distributable, ~20MB)
- FFmpeg static build (gyan.dev essentials, ~90MB) — just `ffmpeg.exe`
- ExifTool (already in repo at `exiftool_files/` — Oliver Betz's Windows package with
  tiny launcher `perl.exe` + `exiftool.pl` + Strawberry Perl libs)
- `python-magic-bin` replaces `python-magic` (bundles libmagic DLL on Windows)
- All pip packages installed into embeddable Python's site-packages
- App code, configs, alembic migrations, `.env` with generated SECRET_KEY

**Six implementation steps:**
1. `run.py` — Add `--host` argparse flag (default `0.0.0.0`). Launcher passes
   `--host 127.0.0.1` for localhost-only binding.
2. `app/routes/api.py` — Add PID-based worker health check using
   `MEDIAPARSER_WORKER_PID` env var + `os.kill(pid, 0)`. Works on Windows
   without `pgrep`.
3. `launcher.py` (new) — Desktop process orchestrator. Detects portable vs system
   Python. Sets env (FLASK_ENV, EXIFTOOL_PATH, ffmpeg PATH, PYTHONPATH). Handles
   DB init/migration. Spawns worker + Flask as separate processes. Opens browser.
   Clean shutdown on Ctrl+C.
4. `MediaParser.bat` (new) — User double-click entry point. Sets console title,
   cd to script dir, calls `tools\python\python.exe launcher.py %*`, pauses on error.
5. `scripts/build-windows.py` (new) — Cross-build script (runs on WSL2). Downloads
   Python embeddable + ffmpeg. Bootstraps pip (Wine preferred, host pip fallback).
   Installs packages. Copies app + tools. Generates .env. Creates zip at
   `dist/MediaParser-Windows-vX.Y.Z.zip`.
6. `.gitignore` — Add `build/`, `dist/`, `.build-cache/`.

**Key design decisions:**
- `launcher.py` works with or without portable Python (dev-testable on any OS)
- Console window stays visible (shows logs, close to stop) — tray icon deferred to v2
- `EXIFTOOL_PATH` → `tools/exiftool/perl.exe` (Oliver Betz's 39KB tiny launcher
  auto-invokes `exiftool.pl`)
- `MEDIAPARSER_WORKER_PID` env var for instant health check (vs 3s Huey task fallback)
- Build uses `.build-cache/` for download caching (Python zip, ffmpeg zip)

**Portable package structure:**
```
MediaParser/
├── MediaParser.bat              # Double-click entry point
├── launcher.py                  # Two-process orchestrator
├── run.py, run_worker.py        # Server entry points
├── config.py, huey_config.py    # Config
├── .env                         # Pre-configured
├── alembic.ini, alembic/        # DB migrations
├── app/                         # Application code
├── tools/
│   ├── python/                  # Python 3.12 embeddable + packages
│   ├── ffmpeg/ffmpeg.exe        # Static build
│   └── exiftool/                # Perl + exiftool (from exiftool_files/)
├── instance/                    # Created at runtime (SQLite DBs)
└── storage/                     # Created at runtime
```

### Claude's Discretion
All structural decisions are locked. Claude may determine:
- Exact pip `--platform`/`--python-version` flags for cross-build
- Exact ._pth file modification procedure
- Exact subprocess launch flags for Windows (creationflags)
- Exact server-readiness polling loop in launcher
- Exact .gitignore entries
- `.exe` exception: current .gitignore excludes `*.exe` (to avoid committing
  Windows binaries), but `exiftool_files/perl.exe` is intentionally committed.
  The .gitignore already handles this correctly — verify no change needed.

### Deferred Ideas (OUT OF SCOPE)
- System tray icon (v2)
- Auto-update mechanism
- macOS/Linux portable builds
- GUI installer (NSIS, Inno Setup)
- Code signing / SmartScreen bypass
</user_constraints>

---

## Summary

This phase builds a zero-install Windows portable build of MediaParser: a ZIP file users
extract and run by double-clicking `MediaParser.bat`. The core challenge is cross-building
from WSL2 (Linux) — downloading Windows-specific Python wheels and binaries without running
Windows natively.

The approach relies on three well-established mechanisms: (1) Python's official embeddable
package for Windows, which bundles a complete Python 3.12 interpreter as a ZIP, (2) `pip
download` with `--platform win_amd64 --python-version 312 --only-binary=:all:` flags to
fetch Windows wheels from a Linux host, and (3) `pip install --target` to unpack those
wheels directly into the embeddable Python's site-packages. All 23 required packages have
confirmed Windows binary availability on PyPI — verified by actual download test in WSL2.

The existing codebase already supports the key hooks: `EXIFTOOL_PATH` env var in
`app/lib/metadata.py` is already read from the environment (line 20: `EXIFTOOL_PATH =
os.environ.get('EXIFTOOL_PATH', 'exiftool')`), and `ExifToolHelper(executable=EXIFTOOL_PATH)`
is already used in all metadata calls. The `worker-health` endpoint already exists in
`app/routes/api.py` and needs only a PID-check branch added. The `run.py` already accepts
`--port`; it needs a `--host` flag added.

**Primary recommendation:** Use `pip download --only-binary=:all: --platform win_amd64 --python-version 312 --implementation cp` from WSL2 to fetch all Windows wheels, then `pip install --no-deps --target <site-packages-dir>` to unpack them. This avoids Wine entirely.

---

## Standard Stack

### Core — Confirmed Available for Windows (all tested in WSL2, 2026-02-18)

| Package | Version Downloaded | Wheel Type | Notes |
|---------|-------------------|------------|-------|
| flask | 3.1.2 | py3-none-any | Pure Python |
| flask-sqlalchemy | 3.1.1 | py3-none-any | Pure Python |
| sqlalchemy | 2.0.46 | cp312-cp312-win_amd64 | Binary wheel, 2.0MB |
| werkzeug | 3.1.5 | py3-none-any | Pure Python |
| huey | 2.6.0 | py3-none-any | Pure Python |
| python-dotenv | 1.2.1 | py3-none-any | Pure Python |
| tzdata | 2025.3 | py2.py3-none-any | Pure Python |
| pyexiftool | 0.5.6 | py3-none-any | Pure Python |
| pillow | 12.1.1 | cp312-cp312-win_amd64 | Binary wheel, 7.0MB |
| imagehash | 4.3.2 | py2.py3-none-any | Pure Python |
| alembic | 1.18.4 | py3-none-any | Pure Python |
| python-magic-bin | 0.4.14 | py2.py3-none-win_amd64 | Bundles libmagic.dll |
| blinker | 1.9.0 | py3-none-any | Flask dep |
| click | 8.3.1 | py3-none-any | Flask dep |
| itsdangerous | 2.2.0 | py3-none-any | Flask dep |
| jinja2 | 3.1.6 | py3-none-any | Flask dep |
| markupsafe | 3.0.3 | cp312-cp312-win_amd64 | Binary wheel (15KB) |
| greenlet | 3.3.1 | cp312-cp312-win_amd64 | SQLAlchemy dep |
| typing-extensions | 4.15.0 | py3-none-any | SQLAlchemy dep |
| mako | 1.3.10 | py3-none-any | Alembic dep |
| numpy | 2.4.2 | cp312-cp312-win_amd64 | ImageHash dep, 12.3MB |
| scipy | 1.17.0 | cp312-cp312-win_amd64 | ImageHash dep, 36.3MB |
| pywavelets | 1.9.0 | cp312-cp312-win_amd64 | ImageHash dep, 4.0MB |

**Total packages installed size (wheels): ~62MB** (numpy+scipy dominate at 47MB)

### Bundled Binaries

| Component | Source | Size | Notes |
|-----------|--------|------|-------|
| Python 3.12.10 embeddable | python.org/ftp/python/3.12.10/python-3.12.10-embed-amd64.zip | ~20MB | Latest 3.12 as of 2025-04-08 |
| FFmpeg essentials | gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip | ~101MB | v8.0.1 as of 2025-11-20, just need ffmpeg.exe |
| ExifTool (Betz package) | Already in repo at exiftool_files/ | ~33MB | perl.exe (39KB), perl532.dll (3.4MB), lib/ |

### python-magic vs python-magic-bin

The existing Linux/Docker `requirements.txt` uses `python-magic`. For the Windows build,
`python-magic-bin` is installed instead (NOT in addition to). Both expose the same API via
`import magic`. The build script installs `python-magic-bin` while downloading ALL other
packages from `requirements.txt`.

**CRITICAL:** Do NOT install both `python-magic` AND `python-magic-bin` — they conflict.
The build script must skip `python-magic` and install `python-magic-bin` in its place.

### pip Install Command (Cross-Build from WSL2)

```bash
# Step 1: Download all Windows wheels (no-deps, must specify each package)
python -m pip download \
  flask flask-sqlalchemy sqlalchemy werkzeug huey python-dotenv tzdata \
  pyexiftool pillow imagehash alembic python-magic-bin \
  blinker click itsdangerous jinja2 markupsafe greenlet typing-extensions \
  mako numpy scipy pywavelets \
  --only-binary=:all: \
  --platform win_amd64 \
  --python-version 312 \
  --implementation cp \
  --no-deps \
  --dest /tmp/win-wheels

# Step 2: Install into embeddable Python site-packages
python -m pip install \
  --no-index \
  --find-links /tmp/win-wheels \
  --target build/MediaParser/tools/python/Lib/site-packages \
  --no-deps \
  flask flask-sqlalchemy sqlalchemy werkzeug huey python-dotenv tzdata \
  pyexiftool pillow imagehash alembic python-magic-bin \
  blinker click itsdangerous jinja2 markupsafe greenlet typing-extensions \
  mako numpy scipy pywavelets
```

---

## Architecture Patterns

### Embeddable Python Setup (CRITICAL — Multiple Steps Required)

The Python embeddable package requires specific configuration before it can run pip packages.
This is done at build time by the `scripts/build-windows.py` script, NOT at runtime.

**Step 1: Unzip the internal python312.zip**

The embeddable ZIP contains a `python312.zip` file with stdlib. Python's import system
can read it as a ZIP, but `pickle` operations FAIL on modules inside a zip. Must unzip it:

```python
# In build script:
import zipfile
inner_zip = python_dir / 'python312.zip'
with zipfile.ZipFile(inner_zip) as zf:
    zf.extractall(python_dir / 'python312')
inner_zip.unlink()  # Remove the .zip (replaced by extracted directory)
```

**Step 2: Modify python312._pth to enable site-packages**

The `._pth` file controls sys.path. The default has `#import site` commented out.
Uncomment it and add site-packages path:

```
# Default contents of python312._pth:
python312.zip
.
# Uncomment to run site.main() automatically
#import site

# Modified contents (build script writes this):
python312
.
Lib\site-packages
import site
```

Note: `python312.zip` entry changes to `python312` (the extracted directory).

**Step 3: Create Lib/site-packages directory**

```python
(python_dir / 'Lib' / 'site-packages').mkdir(parents=True, exist_ok=True)
```

### Launcher Architecture (launcher.py)

```python
import subprocess
import sys
import os
import time
import webbrowser
import urllib.request
from pathlib import Path

BASE_DIR = Path(__file__).parent
PORTABLE_PYTHON = BASE_DIR / 'tools' / 'python' / 'python.exe'

def is_portable():
    return PORTABLE_PYTHON.exists()

def get_python():
    return str(PORTABLE_PYTHON) if is_portable() else sys.executable

def wait_for_server(url, timeout=30):
    """Poll until Flask server is accepting connections."""
    start = time.time()
    while time.time() - start < timeout:
        try:
            urllib.request.urlopen(url, timeout=1)
            return True
        except Exception:
            time.sleep(0.5)
    return False

def run_db_init():
    """Run alembic migrations programmatically."""
    from alembic.config import Config
    from alembic import command
    import sqlite3

    db_path = BASE_DIR / 'instance' / 'mediaparser.db'
    alembic_cfg = Config(str(BASE_DIR / 'alembic.ini'))

    if db_path.exists():
        # Check if alembic_version table exists and has rows
        conn = sqlite3.connect(str(db_path))
        try:
            rows = conn.execute('SELECT COUNT(*) FROM alembic_version').fetchone()[0]
        except Exception:
            rows = 0
        conn.close()

        if rows > 0:
            command.upgrade(alembic_cfg, 'head')
        else:
            # DB exists but no alembic — stamp it
            from app import create_app
            create_app()
            command.stamp(alembic_cfg, 'head')
    else:
        # Fresh install — create tables then stamp
        from app import create_app
        create_app()
        command.stamp(alembic_cfg, 'head')

def main():
    python = get_python()
    port = 5000
    host = '127.0.0.1'
    env = os.environ.copy()

    if is_portable():
        # Set up environment for portable mode
        tools = BASE_DIR / 'tools'
        env['EXIFTOOL_PATH'] = str(tools / 'exiftool' / 'perl.exe')
        env['PATH'] = str(tools / 'ffmpeg') + os.pathsep + env.get('PATH', '')
        env['FLASK_ENV'] = 'production'
        env['PYTHONPATH'] = str(BASE_DIR)
        # Run DB init using portable Python subprocess
        subprocess.run([python, '-c', 'exec(open("launcher_db.py").read())'], ...)
    else:
        run_db_init()  # Dev mode: run in-process

    # Spawn worker process
    worker_proc = subprocess.Popen(
        [python, str(BASE_DIR / 'run_worker.py')],
        env=env, cwd=str(BASE_DIR),
        creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == 'nt' else 0,
    )

    # Pass PID to Flask so health check can use it
    env['MEDIAPARSER_WORKER_PID'] = str(worker_proc.pid)

    # Spawn Flask
    flask_proc = subprocess.Popen(
        [python, str(BASE_DIR / 'run.py'), '--host', host, '--port', str(port)],
        env=env, cwd=str(BASE_DIR),
    )

    # Wait for server and open browser
    url = f'http://{host}:{port}'
    if wait_for_server(url):
        webbrowser.open(url)

    try:
        flask_proc.wait()
    except KeyboardInterrupt:
        pass
    finally:
        flask_proc.terminate()
        worker_proc.terminate()
        flask_proc.wait()
        worker_proc.wait()
```

### Worker Health Check — PID Branch (app/routes/api.py)

The existing `check_worker_health()` function has: standalone mode → pgrep → Huey task.
Add a PID branch between standalone and pgrep:

```python
# Add BEFORE the pgrep block:
worker_pid_str = os.environ.get('MEDIAPARSER_WORKER_PID')
if worker_pid_str:
    try:
        pid = int(worker_pid_str)
        os.kill(pid, 0)  # Signal 0 = existence check only
        return jsonify({'worker_alive': True, 'mode': 'pid', 'pid': pid})
    except (OSError, ProcessLookupError):
        return jsonify({
            'worker_alive': False,
            'error': f'Worker PID {pid} not found'
        }), 503
    except (ValueError, TypeError):
        pass  # Invalid PID string, fall through to pgrep
```

**Windows note:** `os.kill(pid, 0)` DOES work on Windows in Python 3. It raises
`OSError` (errno `ESRCH`) if the process doesn't exist. Despite the name, it doesn't
send a signal on Windows — just checks process existence. This is confirmed behavior.

### MediaParser.bat

```batch
@echo off
title MediaParser
cd /d "%~dp0"
tools\python\python.exe launcher.py %*
if %errorlevel% neq 0 (
    echo.
    echo MediaParser exited with error %errorlevel%. Check the output above.
    pause
)
```

**Key details:**
- `%~dp0` = directory of the .bat file (works regardless of where user runs it from)
- `/d` in `cd /d` switches drive letter if needed (e.g., running from D:\ to C:\)
- `pause` only on error — on normal exit, console closes with the Python process
- `%*` passes through any extra arguments user might add

### Build Script Structure (scripts/build-windows.py)

```python
#!/usr/bin/env python3
"""Cross-build Windows portable package from WSL2/Linux."""

import argparse
import hashlib
import shutil
import subprocess
import urllib.request
import zipfile
from pathlib import Path

# URLs
PYTHON_VERSION = '3.12.10'
PYTHON_URL = f'https://www.python.org/ftp/python/{PYTHON_VERSION}/python-{PYTHON_VERSION}-embed-amd64.zip'
FFMPEG_URL = 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip'
FFMPEG_VER_URL = 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip.ver'

BASE_DIR = Path(__file__).parent.parent
CACHE_DIR = BASE_DIR / '.build-cache'
BUILD_DIR = BASE_DIR / 'build'
DIST_DIR = BASE_DIR / 'dist'

def download_with_cache(url, cache_path):
    """Download file, using cache if exists."""
    if cache_path.exists():
        print(f'  [cache] {cache_path.name}')
        return
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    print(f'  [download] {url}')
    urllib.request.urlretrieve(url, cache_path)

def setup_python(app_dir):
    """Extract and configure Python embeddable package."""
    python_dir = app_dir / 'tools' / 'python'
    python_zip = CACHE_DIR / f'python-{PYTHON_VERSION}-embed-amd64.zip'
    download_with_cache(PYTHON_URL, python_zip)

    python_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(python_zip) as zf:
        zf.extractall(python_dir)

    # Unzip internal python312.zip (required for pickle to work)
    inner_zip = python_dir / 'python312.zip'
    with zipfile.ZipFile(inner_zip) as zf:
        zf.extractall(python_dir / 'python312')
    inner_zip.unlink()

    # Modify ._pth to enable site-packages
    pth_file = python_dir / 'python312._pth'
    pth_content = 'python312\n.\nLib\\site-packages\nimport site\n'
    pth_file.write_text(pth_content)

    # Create site-packages directory
    (python_dir / 'Lib' / 'site-packages').mkdir(parents=True, exist_ok=True)

def download_ffmpeg(app_dir):
    """Download FFmpeg and extract only ffmpeg.exe."""
    ffmpeg_zip = CACHE_DIR / 'ffmpeg-release-essentials.zip'
    download_with_cache(FFMPEG_URL, ffmpeg_zip)

    ffmpeg_dir = app_dir / 'tools' / 'ffmpeg'
    ffmpeg_dir.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(ffmpeg_zip) as zf:
        # ffmpeg.exe is at ffmpeg-X.Y.Z-essentials_build/bin/ffmpeg.exe
        for name in zf.namelist():
            if name.endswith('/bin/ffmpeg.exe'):
                zf.extract(name, CACHE_DIR / 'ffmpeg-extracted')
                extracted = next((CACHE_DIR / 'ffmpeg-extracted').rglob('ffmpeg.exe'))
                shutil.copy2(extracted, ffmpeg_dir / 'ffmpeg.exe')
                break

def install_packages(app_dir):
    """Download and install all Python packages for Windows."""
    python_dir = app_dir / 'tools' / 'python'
    site_packages = python_dir / 'Lib' / 'site-packages'
    wheels_dir = CACHE_DIR / 'wheels-win-cp312'
    wheels_dir.mkdir(parents=True, exist_ok=True)

    # Read requirements.txt, substitute python-magic with python-magic-bin
    reqs = []
    with open(BASE_DIR / 'requirements.txt') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            pkg = line.split('>=')[0].split('==')[0].strip()
            if pkg == 'python-magic':
                reqs.append('python-magic-bin')
            elif pkg == 'pytest':
                pass  # skip test deps
            else:
                reqs.append(line)

    # Download Windows wheels (using host pip)
    subprocess.run([
        sys.executable, '-m', 'pip', 'download',
        '--only-binary=:all:',
        '--platform', 'win_amd64',
        '--python-version', '312',
        '--implementation', 'cp',
        '--no-deps',
        '--dest', str(wheels_dir),
    ] + reqs, check=True)

    # Also download transitive dependencies
    transitive = [
        'blinker', 'click', 'itsdangerous', 'jinja2', 'markupsafe',
        'greenlet', 'typing-extensions', 'mako', 'numpy', 'scipy', 'pywavelets',
    ]
    subprocess.run([
        sys.executable, '-m', 'pip', 'download',
        '--only-binary=:all:',
        '--platform', 'win_amd64',
        '--python-version', '312',
        '--implementation', 'cp',
        '--no-deps',
        '--dest', str(wheels_dir),
    ] + transitive, check=True)

    # Install into site-packages
    subprocess.run([
        sys.executable, '-m', 'pip', 'install',
        '--no-index',
        '--find-links', str(wheels_dir),
        '--target', str(site_packages),
        '--no-deps',
    ] + reqs + transitive, check=True)
```

### Recommended Project Structure (build output)

```
build/
└── MediaParser/              # Assembled portable package
    ├── MediaParser.bat
    ├── launcher.py
    ├── run.py, run_worker.py
    ├── config.py, huey_config.py
    ├── .env
    ├── alembic.ini
    ├── alembic/
    ├── app/
    └── tools/
        ├── python/           # Python 3.12 embeddable
        │   ├── python.exe
        │   ├── python312/    # Extracted stdlib (was python312.zip)
        │   ├── python312._pth  # Modified to enable site-packages
        │   ├── Lib/
        │   │   └── site-packages/  # All pip packages installed here
        │   └── ...
        ├── ffmpeg/
        │   └── ffmpeg.exe
        └── exiftool/         # Copied from repo's exiftool_files/
            ├── perl.exe
            ├── perl532.dll
            ├── exiftool.pl   # Renamed from windows_exiftool.txt
            ├── lib/
            └── ...

dist/
└── MediaParser-Windows-v0.1.0.zip  # Final artifact
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Windows wheel downloads | Custom HTTP download per package | `pip download --platform win_amd64 --only-binary=:all:` | pip handles checksums, retries, deps |
| File type detection (Windows) | Manual DLL loading | `python-magic-bin` | Already bundles magic1.dll, tested |
| Database migrations | SQL script runner | `alembic command.upgrade()` programmatic API | Already integrated in project |
| Process existence check | Custom WMI/ctypes query | `os.kill(pid, 0)` | Works on Windows Python 3, raises OSError if dead |
| Python stdlib packaging | Custom module collector | python312.zip → extract → `python312/` dir | Official embeddable handles this correctly |

---

## Common Pitfalls

### Pitfall 1: python312.zip Must Be Extracted

**What goes wrong:** Build script extracts the outer embeddable ZIP but leaves
`python312.zip` in place. App launches, import works for simple modules, but `pickle`
fails for complex packages (SQLAlchemy, alembic). Error is cryptic.

**Why it happens:** Python can import from ZIP files, but `pickle` requires physical
files. The internal `python312.zip` must be extracted to a `python312/` directory.

**How to avoid:** Build script explicitly unzips `python312.zip` to `python312/`
and deletes the zip. Update `._pth` to reference `python312` (directory), not `python312.zip`.

**Warning signs:** `pickle.load()` failures, `_codecs` import errors, alembic migration
failures on first run.

### Pitfall 2: ._pth File Overrides PYTHONPATH

**What goes wrong:** Setting `PYTHONPATH` env var in launcher.py to add app code
to sys.path, but the `._pth` file in the embeddable Python OVERRIDES it. The `._pth`
file takes exclusive control of sys.path when present.

**Why it happens:** Embeddable Python's `._pth` file is processed before PYTHONPATH.
Documentation: "If a ._pth file exists in the Python directory, the initial sys.path is
constructed from the ._pth file, ignoring PYTHONPATH."

**How to avoid:** Add the app root path directly to `._pth` file OR add it to
`Lib/site-packages/app.pth` (a `.pth` file inside site-packages). Best approach:
add a `sitecustomize.py` that appends the app root dynamically.

**Correct approach for launcher.py:** Set `PYTHONPATH` as fallback for non-portable
mode. For portable mode, the `._pth` includes app root, OR the build creates
a `.pth` file in site-packages:
```
# Lib/site-packages/mediaparser.pth (created by build script)
../../..   # Points to MediaParser/ root (3 levels up from site-packages)
```

### Pitfall 3: python-magic vs python-magic-bin Conflict

**What goes wrong:** Build script installs both `python-magic` (from requirements.txt)
AND `python-magic-bin`. They conflict — both provide `magic.py` and one overwrites
the other unpredictably.

**Why it happens:** Build script naively runs `pip install -r requirements.txt` then
also installs `python-magic-bin`.

**How to avoid:** Build script MUST exclude `python-magic` when reading requirements.txt
and install `python-magic-bin` instead. Both expose `import magic` with identical API.

### Pitfall 4: CREATE_NEW_PROCESS_GROUP and Ctrl+C on Windows

**What goes wrong:** Launcher spawns worker and Flask as subprocesses with
`CREATE_NEW_PROCESS_GROUP`. User presses Ctrl+C in console. Only launcher gets
`KeyboardInterrupt` — subprocesses survive, app keeps running, console appears frozen.

**Why it happens:** `CREATE_NEW_PROCESS_GROUP` isolates the subprocess from the
parent's console Ctrl+C. This is intentional for daemons but unexpected for a
console-visible app.

**How to avoid:** Do NOT use `CREATE_NEW_PROCESS_GROUP` if the console window needs
to close all processes on Ctrl+C. Use default process group (inherit). The launcher's
`KeyboardInterrupt` handler calls `proc.terminate()` on both subprocesses, then `proc.wait()`.

**Correct pattern:**
```python
# No creationflags needed for console-visible app
worker_proc = subprocess.Popen([python, 'run_worker.py'], env=env, cwd=str(BASE_DIR))
flask_proc = subprocess.Popen([python, 'run.py', '--host', '127.0.0.1'], env=env, ...)
try:
    flask_proc.wait()
except KeyboardInterrupt:
    flask_proc.terminate()
    worker_proc.terminate()
    flask_proc.wait()
    worker_proc.wait()
```

### Pitfall 5: FFmpeg ZIP Contains Subdirectory Structure

**What goes wrong:** Build script extracts ffmpeg-release-essentials.zip and expects
`ffmpeg.exe` at the root. Instead, it's at
`ffmpeg-8.0.1-essentials_build/bin/ffmpeg.exe`.

**How to avoid:** Use glob/rglob to find `ffmpeg.exe` anywhere in the extracted tree,
copy it to `tools/ffmpeg/ffmpeg.exe`. Or extract only the specific path:
```python
with zipfile.ZipFile(ffmpeg_zip) as zf:
    for name in zf.namelist():
        if name.endswith('/bin/ffmpeg.exe'):
            # extract just this file
```

### Pitfall 6: .gitignore Blocks perl.exe

**What goes wrong:** `.gitignore` currently has `*.exe` entry. This was added to
exclude Windows binaries. BUT `exiftool_files/perl.exe` is intentionally committed.

**Current state:** The current `.gitignore` has `*.exe` globally. But `exiftool_files/`
content IS tracked (verified by git status showing these files exist in git).

**Resolution:** The current .gitignore uses `*.exe` at project root level. Git
may already have `exiftool_files/perl.exe` tracked (committed before `.gitignore`
was added). Verify with `git ls-files exiftool_files/perl.exe`. The build script
copies from `exiftool_files/` to `build/MediaParser/tools/exiftool/` — build output
goes in `build/` which WILL be gitignored.

### Pitfall 7: ExifTool Needs exiftool.pl (Not windows_exiftool.txt)

**What goes wrong:** The Oliver Betz package in `exiftool_files/` contains
`windows_exiftool.txt` (the ExifTool Perl script, named .txt per Windows packaging
convention). The `perl.exe` launcher looks for `exiftool.pl` in the same directory.

**How to avoid:** Build script copies `exiftool_files/windows_exiftool.txt` to
`tools/exiftool/exiftool.pl` in the build output.

**Verify:** `exiftool_files/readme_windows.txt` describes this: "Users copy or rename
windows_exiftool to exiftool.pl in the exiftool_files folder."

### Pitfall 8: Alembic programmatic `command.upgrade()` Reconfigures Logging

**What goes wrong:** Calling `alembic command.upgrade(alembic_cfg, 'head')` from
`launcher.py` causes `fileConfig(config.config_file_name)` in `alembic/env.py` to
run, which reconfigures Python's root logger to WARNING level. All subsequent Flask
and worker log output is suppressed.

**How to avoid:** Either: (a) suppress alembic's logging reconfiguration by checking
`if config.config_file_name is not None` is already in `env.py` — set
`alembic_cfg.config_file_name = None` before calling upgrade, OR (b) configure
logging AFTER running migrations in launcher.py.

---

## Code Examples

Verified patterns from official sources and actual testing:

### Embeddable Python ._pth File (Modified)

```
# Source: https://gist.github.com/Postrediori/ee8fc61acf1c6a1d8acfe7bff8123343
# (verified against actual embeddable package behavior)
python312
.
Lib\site-packages
import site
```

### pip Download — Cross-Platform Windows Wheels from Linux

```bash
# Source: https://pip.pypa.io/en/stable/cli/pip_download/ (verified HIGH confidence)
# --only-binary=:all: is REQUIRED when using --platform
python -m pip download \
  --only-binary=:all: \
  --platform win_amd64 \
  --python-version 312 \
  --implementation cp \
  --no-deps \
  --dest /tmp/win-wheels \
  flask sqlalchemy pillow python-magic-bin  # etc.
```

### pip Install --target (into embeddable site-packages)

```bash
# Source: pip official docs (verified working pattern)
python -m pip install \
  --no-index \
  --find-links /tmp/win-wheels \
  --target build/MediaParser/tools/python/Lib/site-packages \
  --no-deps \
  flask sqlalchemy pillow python-magic-bin  # etc.
```

### Alembic Programmatic API

```python
# Source: https://alembic.sqlalchemy.org/en/latest/api/commands.html (HIGH confidence)
from alembic.config import Config
from alembic import command
import sqlite3

def run_db_setup(base_dir):
    db_path = base_dir / 'instance' / 'mediaparser.db'
    alembic_cfg = Config(str(base_dir / 'alembic.ini'))

    if db_path.exists():
        try:
            conn = sqlite3.connect(str(db_path))
            rows = conn.execute('SELECT COUNT(*) FROM alembic_version').fetchone()[0]
            conn.close()
        except Exception:
            rows = 0

        if rows > 0:
            command.upgrade(alembic_cfg, 'head')
        else:
            from app import create_app
            with create_app().app_context():
                pass  # create_all() called in app factory
            command.stamp(alembic_cfg, 'head')
    else:
        from app import create_app
        with create_app().app_context():
            pass
        command.stamp(alembic_cfg, 'head')
```

### subprocess.Popen for Two-Process Launch (Windows-safe)

```python
# Source: Python stdlib docs (HIGH confidence) + tested pattern
import subprocess
import os

# No CREATE_NEW_PROCESS_GROUP — allows Ctrl+C in console to propagate normally
worker_proc = subprocess.Popen(
    [python_exe, str(base_dir / 'run_worker.py')],
    env=env,
    cwd=str(base_dir),
)

env['MEDIAPARSER_WORKER_PID'] = str(worker_proc.pid)

flask_proc = subprocess.Popen(
    [python_exe, str(base_dir / 'run.py'), '--host', '127.0.0.1', '--port', '5000'],
    env=env,
    cwd=str(base_dir),
)

try:
    flask_proc.wait()
except KeyboardInterrupt:
    flask_proc.terminate()
    worker_proc.terminate()
    flask_proc.wait(timeout=5)
    worker_proc.wait(timeout=5)
```

### PID-based Health Check (os.kill signal 0)

```python
# Source: Python docs — os.kill(pid, 0) works on Windows in Python 3
import os

worker_pid_str = os.environ.get('MEDIAPARSER_WORKER_PID')
if worker_pid_str:
    try:
        pid = int(worker_pid_str)
        os.kill(pid, 0)  # Raises OSError if process doesn't exist
        return jsonify({'worker_alive': True, 'mode': 'pid', 'pid': pid})
    except (OSError, ProcessLookupError):
        return jsonify({'worker_alive': False, 'error': f'Worker PID {pid} not found'}), 503
```

### Server Readiness Polling

```python
# Source: stdlib pattern — no external deps needed
import urllib.request
import time

def wait_for_server(url: str, timeout: int = 30) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            urllib.request.urlopen(url, timeout=1)
            return True
        except Exception:
            time.sleep(0.5)
    return False
```

---

## State of the Art

| Old Approach | Current Approach | Notes |
|--------------|------------------|-------|
| PyInstaller / cx_Freeze | Python embeddable package | Simpler, no obfuscation, no antivirus triggers |
| pgrep for worker health | `os.kill(pid, 0)` | Works cross-platform including Windows |
| Wine for pip install on Linux | `pip download --platform win_amd64` | Official pip feature, no Wine needed |
| DETACHED_PROCESS flag | Default process group | Console-visible apps don't need detachment |

**Deprecated/outdated:**
- Wine-based pip cross-build: `pip download --platform` renders this unnecessary.
  The original plan mentioned "Wine preferred, host pip fallback" — research confirms
  host pip with `--platform` flags is the correct approach. Wine is not needed.

---

## Open Questions

1. **Python path for app code (PYTHONPATH vs ._pth)**
   - What we know: The embeddable `._pth` controls sys.path exclusively, overriding PYTHONPATH
   - What's unclear: Whether adding `../..` (relative) to ._pth works, or if a `.pth` file
     in site-packages is safer
   - Recommendation: Add a `mediaparser.pth` file to `Lib/site-packages/` at build time,
     containing the absolute or relative path to the MediaParser root. This is the most
     robust approach and avoids ._pth modification complexity.

2. **Alembic logging suppression**
   - What we know: `env.py` calls `fileConfig()` which resets root logger
   - What's unclear: Whether setting `alembic_cfg.attributes['configure_logger'] = False`
     prevents it, or if the `config_file_name = None` approach is needed
   - Recommendation: In `launcher.py`, after calling `command.upgrade()`, reconfigure
     logging back to INFO level.

3. **FFmpeg essentials zip structure**
   - What we know: Current URL `ffmpeg-release-essentials.zip`, v8.0.1 (~101MB)
   - What we know: ffmpeg.exe is nested inside `ffmpeg-X.Y.Z-essentials_build/bin/`
   - Recommendation: Use `rglob('ffmpeg.exe')` in build script to find it regardless
     of version directory name.

4. **exiftool_files/*.exe in .gitignore**
   - What we know: `.gitignore` has `*.exe` but `exiftool_files/perl.exe` is already committed
   - What's unclear: Whether this causes issues with fresh clones
   - Recommendation: Verify with `git ls-files exiftool_files/perl.exe`. If tracked,
     no change needed. If not tracked, add `!exiftool_files/perl.exe` to .gitignore.

---

## Sources

### Primary (HIGH confidence)
- Python.org official docs: "Using Python on Windows" (embeddable package section)
- pip.pypa.io: `pip download` docs — `--platform`, `--python-version`, `--only-binary`
- alembic.sqlalchemy.org: "API: commands" — `command.upgrade()`, `command.stamp()`
- Direct wheel download test in WSL2 (2026-02-18): verified all 23 packages available for `win_amd64 cp312`

### Secondary (MEDIUM confidence)
- gist.github.com/jtmoon79 — Python embeddable Windows 10 full configuration guide
- gist.github.com/Postrediori — ._pth file modification procedure
- fpim.github.io — "Setting up Python embeddable distribution properly"
- gyan.dev/ffmpeg/builds/ — FFmpeg Windows essentials build (v8.0.1, Nov 2025)

### Tertiary (LOW confidence — single source, not officially documented)
- Community reports that `python312.zip` must be extracted for pickle compatibility
  (multiple independent sources agree, but not in official Python docs)

---

## Metadata

**Confidence breakdown:**
- Pip cross-build approach: HIGH — tested in WSL2, all 23 packages downloaded successfully
- Embeddable Python ._pth setup: MEDIUM — multiple community sources agree on procedure
- python312.zip extraction requirement: MEDIUM — multiple independent sources, no official doc
- subprocess/signal handling: HIGH — Python stdlib docs
- ExifTool perl.exe launcher: HIGH — actual repo inspection confirms structure
- Alembic programmatic API: HIGH — official docs
- FFmpeg URL and structure: HIGH — verified from gyan.dev

**Research date:** 2026-02-18
**Valid until:** 2026-05-18 (90 days — Python.org/PyPI URLs are stable, FFmpeg URL is rolling)
