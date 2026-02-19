#!/usr/bin/env python3
"""
MediaParser Desktop Launcher.

Two-process orchestrator for the Windows portable desktop build.
Works with portable Python (tools/python/python.exe) OR system Python
for development testing on WSL2/macOS/Linux.

Usage:
    python launcher.py                    # default port 5000, host 127.0.0.1
    python launcher.py --port 8080        # custom port
    python launcher.py --host 0.0.0.0    # bind to all interfaces
"""
import argparse
import logging
import os
import subprocess
import sys
import time
import urllib.request
import webbrowser
from pathlib import Path

# Base directory is always the directory containing this launcher script.
BASE_DIR = Path(__file__).parent.resolve()

# Ensure app root is on sys.path so `from app import create_app` works.
# Portable Python's ._pth restricts sys.path to its own directories;
# the app root (where launcher.py lives) isn't included by default.
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

# Portable Python executable: present only in the Windows portable build.
PORTABLE_PYTHON = BASE_DIR / 'tools' / 'python' / 'python.exe'


def is_portable() -> bool:
    """Return True when running inside the portable build (portable Python present)."""
    return PORTABLE_PYTHON.exists()


def get_python_exe() -> str:
    """Return the Python executable to use for subprocesses."""
    return str(PORTABLE_PYTHON) if is_portable() else sys.executable


def configure_portable_env(env: dict) -> None:
    """Set environment variables required by the portable build.

    Only called when tools/python/python.exe is present.
    Does NOT set PYTHONPATH -- the ._pth file and mediaparser.pth handle
    sys.path for portable Python. For system Python, app root is cwd.

    Args:
        env: os.environ copy to mutate in-place.
    """
    tools_dir = BASE_DIR / 'tools'
    env['EXIFTOOL_PATH'] = str(tools_dir / 'exiftool' / 'exiftool.bat')
    # Prepend ffmpeg directory so ffmpeg.exe is found without full path.
    env['PATH'] = str(tools_dir / 'ffmpeg') + os.pathsep + env.get('PATH', '')
    env['FLASK_ENV'] = 'production'


def wait_for_server(url: str, timeout: int = 30) -> bool:
    """Poll url until Flask responds or timeout expires.

    Args:
        url: HTTP URL to poll (e.g. 'http://127.0.0.1:5000').
        timeout: Maximum seconds to wait before giving up.

    Returns:
        True if server responded, False if timeout expired.
    """
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            urllib.request.urlopen(url, timeout=1)
            return True
        except Exception:
            time.sleep(0.5)
    return False


def run_db_init() -> None:
    """Initialize or migrate the database before starting services.

    Decision tree:
    - DB doesn't exist: create all tables via create_app(), stamp alembic head.
    - DB exists, no alembic_version rows: stamp alembic head (pre-alembic schema).
    - DB exists, has alembic_version rows: run upgrade to head.

    After alembic command.upgrade(), reconfigure logging back to INFO because
    alembic's env.py runs fileConfig() which resets root logger to WARNING.
    """
    from alembic.config import Config
    from alembic import command
    import sqlite3

    db_path = BASE_DIR / 'instance' / 'mediaparser.db'
    alembic_cfg = Config(str(BASE_DIR / 'alembic.ini'))

    if db_path.exists():
        # Check whether alembic_version table exists and has rows.
        conn = sqlite3.connect(str(db_path))
        try:
            rows = conn.execute('SELECT COUNT(*) FROM alembic_version').fetchone()[0]
        except Exception:
            rows = 0
        finally:
            conn.close()

        if rows > 0:
            logging.info('Running alembic upgrade to head...')
            command.upgrade(alembic_cfg, 'head')
            # Restore logging level after alembic's fileConfig() resets it.
            logging.basicConfig(
                level=logging.INFO,
                format='[%(asctime)s] %(levelname)s: %(message)s',
                datefmt='%Y-%m-%d %H:%M:%S',
                force=True,
            )
        else:
            # DB exists but no alembic tracking — stamp current state as head.
            logging.info('Stamping existing database at alembic head...')
            from app import create_app
            with create_app().app_context():
                pass  # create_all() is called inside create_app()
            command.stamp(alembic_cfg, 'head')
    else:
        # Fresh install — create instance directory, tables, then stamp.
        logging.info('Initializing database for first-time setup...')
        (BASE_DIR / 'instance').mkdir(parents=True, exist_ok=True)
        from app import create_app
        with create_app().app_context():
            pass  # create_all() is called inside create_app()
        command.stamp(alembic_cfg, 'head')

    logging.info('Database ready.')


def main() -> None:
    """Parse args, initialize environment, spawn processes, open browser."""
    parser = argparse.ArgumentParser(
        description='MediaParser Desktop Launcher — spawns Flask + Huey as two processes.',
    )
    parser.add_argument(
        '--port', type=int, default=5000,
        help='Port to listen on (default: 5000)',
    )
    parser.add_argument(
        '--host', default='127.0.0.1',
        help='Host to bind to (default: 127.0.0.1)',
    )
    args = parser.parse_args()

    host: str = args.host
    port: int = args.port
    url = f'http://{host}:{port}'

    # Configure logging early so startup messages are visible.
    logging.basicConfig(
        level=logging.INFO,
        format='[%(asctime)s] %(levelname)s: %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S',
    )

    # Print startup banner.
    mode = 'portable' if is_portable() else 'system'
    python_exe = get_python_exe()

    print()
    print('MediaParser Desktop Launcher')
    print('=============================')
    print(f'Mode:   {mode}')
    print(f'Python: {python_exe}')
    print(f'URL:    {url}')
    print()

    # Build subprocess environment.
    env = os.environ.copy()
    env['PYTHONUNBUFFERED'] = '1'  # Ensure crash output is visible immediately
    if is_portable():
        configure_portable_env(env)

    # Ensure we run from BASE_DIR so imports resolve correctly.
    os.chdir(BASE_DIR)

    # Initialize database in-process before spawning services.
    run_db_init()

    # On Windows, use CREATE_NEW_PROCESS_GROUP so that console Ctrl+C events
    # don't propagate to child processes. The launcher handles shutdown explicitly.
    popen_flags = 0
    if sys.platform == 'win32':
        popen_flags = subprocess.CREATE_NEW_PROCESS_GROUP

    # --- Spawn worker process ---
    print('Starting worker...')
    worker_proc = subprocess.Popen(
        [python_exe, str(BASE_DIR / 'run_worker.py')],
        env=env,
        cwd=str(BASE_DIR),
        creationflags=popen_flags,
    )
    logging.info('Worker process started (PID %d)', worker_proc.pid)

    # Pass worker PID to Flask so the health check endpoint can use it.
    env['MEDIAPARSER_WORKER_PID'] = str(worker_proc.pid)

    # --- Spawn Flask server ---
    print('Starting server...')
    flask_proc = subprocess.Popen(
        [python_exe, str(BASE_DIR / 'run.py'), '--host', host, '--port', str(port)],
        env=env,
        cwd=str(BASE_DIR),
        creationflags=popen_flags,
    )
    logging.info('Flask process started (PID %d)', flask_proc.pid)

    # --- Wait for server to be ready ---
    print('Waiting for server...')
    server_ready = wait_for_server(url, timeout=30)

    if server_ready:
        print('Opening browser...')
        webbrowser.open(url)
    else:
        logging.warning('Server did not respond within 30 seconds. Check logs above.')

    print()
    print('Press Ctrl+C to stop.')
    print()

    # --- Wait for Flask to exit, handle Ctrl+C ---
    try:
        flask_proc.wait()
    except KeyboardInterrupt:
        logging.info('Ctrl+C received, shutting down...')
    finally:
        # Log exit codes for debugging
        flask_rc = flask_proc.poll()
        worker_rc = worker_proc.poll()
        if flask_rc is not None and flask_rc != 0:
            logging.warning('Flask exited with code %s', flask_rc)
        if worker_rc is not None and worker_rc != 0:
            logging.warning('Worker exited with code %s', worker_rc)

        # Terminate both processes gracefully, then force-kill if needed.
        for proc in [flask_proc, worker_proc]:
            if proc.poll() is None:
                proc.terminate()

        for proc in [flask_proc, worker_proc]:
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()

    logging.info('MediaParser stopped.')


if __name__ == '__main__':
    main()
