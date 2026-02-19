#!/usr/bin/env python3
"""
Cross-build script for MediaParser Windows portable package.

Runs on WSL2/Linux and produces a Windows portable ZIP that contains:
- Python 3.12 embeddable runtime (stdlib extracted, ._pth configured)
- FFmpeg (gyan.dev essentials build)
- ExifTool (from exiftool_files/)
- All pip packages as Windows wheels (python-magic-bin instead of python-magic)
- Application code, alembic migrations, config files

Usage:
    python scripts/build-windows.py --version 0.1.0
    python scripts/build-windows.py --version 0.1.0 --clean
    python scripts/build-windows.py --version 0.1.0 --skip-download
"""

import argparse
import secrets
import shutil
import subprocess
import sys
import urllib.request
import zipfile
from pathlib import Path

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

PYTHON_VERSION = '3.12.10'
PYTHON_URL = f'https://www.python.org/ftp/python/{PYTHON_VERSION}/python-{PYTHON_VERSION}-embed-amd64.zip'
FFMPEG_URL = 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip'

BASE_DIR = Path(__file__).resolve().parent.parent  # Project root
CACHE_DIR = BASE_DIR / '.build-cache'
BUILD_DIR = BASE_DIR / 'build'
DIST_DIR = BASE_DIR / 'dist'


# ---------------------------------------------------------------------------
# Utility
# ---------------------------------------------------------------------------

def download_with_cache(url: str, cache_path: Path) -> None:
    """Download a URL to cache_path, or use cached copy if it already exists."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    name = cache_path.name
    if cache_path.exists():
        print(f'  [cache] {name}')
        return
    print(f'  Downloading {name} ...')
    urllib.request.urlretrieve(url, cache_path)
    print(f'  Downloaded {name} ({cache_path.stat().st_size / 1024 / 1024:.1f} MB)')


# ---------------------------------------------------------------------------
# Build steps
# ---------------------------------------------------------------------------

def clean_build(app_dir: Path) -> None:
    """Remove and recreate build/MediaParser/ directory."""
    if app_dir.exists():
        shutil.rmtree(app_dir)
    app_dir.mkdir(parents=True)


def setup_python(app_dir: Path) -> None:
    """
    Download Python embeddable ZIP, extract it, configure ._pth, extract
    python312.zip stdlib (required for pickle), and wire site-packages.
    """
    python_dir = app_dir / 'tools' / 'python'
    python_dir.mkdir(parents=True, exist_ok=True)

    cache_path = CACHE_DIR / f'python-{PYTHON_VERSION}-embed-amd64.zip'
    download_with_cache(PYTHON_URL, cache_path)

    print('  Extracting Python embeddable ...')
    with zipfile.ZipFile(cache_path) as zf:
        zf.extractall(python_dir)

    # Extract python312.zip stdlib to python312/ directory.
    # CRITICAL: Embeddable Python ships stdlib as a ZIP inside the ZIP.
    # Leaving it as python312.zip causes ImportError for pickle and many stdlib
    # modules. Must extract to a real directory.
    stdlib_zip = python_dir / 'python312.zip'
    if stdlib_zip.exists():
        print('  Extracting python312.zip stdlib ...')
        stdlib_dir = python_dir / 'python312'
        stdlib_dir.mkdir(exist_ok=True)
        with zipfile.ZipFile(stdlib_zip) as zf:
            zf.extractall(stdlib_dir)
        stdlib_zip.unlink()

    # Write modified python312._pth
    # This file controls sys.path for the embeddable distribution.
    # Must list: extracted stdlib dir, the embeddable root (.), site-packages,
    # and enable site import.
    pth_file = python_dir / 'python312._pth'
    pth_file.write_text(
        'python312\n'
        '.\n'
        r'Lib\site-packages'
        '\n'
        'import site\n',
        encoding='utf-8',
    )

    # Create Lib/site-packages/ directory
    site_packages = python_dir / 'Lib' / 'site-packages'
    site_packages.mkdir(parents=True, exist_ok=True)

    # Create mediaparser.pth — adds app root to sys.path.
    # From Lib/site-packages/ going up 3 levels lands at MediaParser/ root,
    # so `from app import create_app` resolves correctly.
    mediaparser_pth = site_packages / 'mediaparser.pth'
    mediaparser_pth.write_text('../../..\n', encoding='utf-8')

    print(f'  Python {PYTHON_VERSION} configured at tools/python/')


def download_ffmpeg(app_dir: Path) -> None:
    """Download FFmpeg essentials build and copy ffmpeg.exe."""
    ffmpeg_dir = app_dir / 'tools' / 'ffmpeg'
    ffmpeg_dir.mkdir(parents=True, exist_ok=True)

    cache_path = CACHE_DIR / 'ffmpeg-release-essentials.zip'
    download_with_cache(FFMPEG_URL, cache_path)

    print('  Extracting FFmpeg ...')
    temp_dir = BUILD_DIR / '_ffmpeg_tmp'
    if temp_dir.exists():
        shutil.rmtree(temp_dir)
    temp_dir.mkdir(parents=True)

    try:
        with zipfile.ZipFile(cache_path) as zf:
            zf.extractall(temp_dir)

        # Find ffmpeg.exe inside the nested directory structure:
        # ffmpeg-X.Y.Z-essentials_build/bin/ffmpeg.exe
        matches = list(temp_dir.rglob('ffmpeg.exe'))
        if not matches:
            raise FileNotFoundError('ffmpeg.exe not found inside FFmpeg ZIP')
        ffmpeg_exe = matches[0]
        shutil.copy2(ffmpeg_exe, ffmpeg_dir / 'ffmpeg.exe')
        print(f'  Copied ffmpeg.exe ({ffmpeg_exe.stat().st_size / 1024 / 1024:.1f} MB)')
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


def setup_exiftool(app_dir: Path) -> None:
    """
    Copy ExifTool files from exiftool_files/ to tools/exiftool/.

    Skips: windows_exiftool.txt (renamed to exiftool.pl), readme_windows.txt,
    Licenses_Strawberry_Perl.zip (large file, not needed at runtime).
    Copies windows_exiftool.txt as exiftool.pl (perl.exe looks for this name).
    """
    src_dir = BASE_DIR / 'exiftool_files'
    if not src_dir.exists():
        raise FileNotFoundError(
            f'exiftool_files/ not found at {src_dir}\n'
            'Ensure the exiftool_files/ directory exists with perl.exe, perl532.dll, '
            'windows_exiftool.txt, lib/, and DLLs.'
        )

    dst_dir = app_dir / 'tools' / 'exiftool'
    dst_dir.mkdir(parents=True, exist_ok=True)

    # Files/dirs to skip (handled separately or not needed at runtime)
    skip_names = {'windows_exiftool.txt', 'readme_windows.txt', 'Licenses_Strawberry_Perl.zip'}

    for item in src_dir.iterdir():
        if item.name in skip_names:
            continue
        dst = dst_dir / item.name
        if item.is_dir():
            shutil.copytree(item, dst, dirs_exist_ok=True)
        else:
            shutil.copy2(item, dst)

    # Copy windows_exiftool.txt as exiftool.pl (CRITICAL)
    windows_exiftool = src_dir / 'windows_exiftool.txt'
    if not windows_exiftool.exists():
        raise FileNotFoundError(
            f'windows_exiftool.txt not found in {src_dir}\n'
            'This file is required — perl.exe looks for exiftool.pl at runtime.'
        )
    shutil.copy2(windows_exiftool, dst_dir / 'exiftool.pl')

    print(f'  ExifTool copied to tools/exiftool/ ({len(list(dst_dir.rglob("*")))} files/dirs)')


def install_packages(app_dir: Path) -> None:
    """
    Read requirements.txt, substitute python-magic-bin, skip pytest.
    Download Windows wheels via pip download, then pip install to site-packages.
    Also downloads transitive dependencies not in requirements.txt.
    """
    site_packages = app_dir / 'tools' / 'python' / 'Lib' / 'site-packages'
    wheels_dir = BUILD_DIR / '_wheels'
    wheels_dir.mkdir(parents=True, exist_ok=True)

    # Parse requirements.txt
    req_file = BASE_DIR / 'requirements.txt'
    packages = []
    with open(req_file) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            # Strip version specifiers
            pkg = line.split('>=')[0].split('==')[0].split('<')[0].split('>')[0].strip()
            if pkg == 'python-magic':
                packages.append('python-magic-bin')
            elif pkg == 'pytest':
                continue  # Test-only dependency, skip
            else:
                packages.append(pkg)

    # Transitive dependencies not declared in requirements.txt
    transitive = [
        'blinker',
        'click',
        'itsdangerous',
        'jinja2',
        'markupsafe',
        'greenlet',
        'typing-extensions',
        'mako',
        'numpy',
        'scipy',
        'pywavelets',
    ]

    # Deduplicate (keep order)
    all_packages = list(dict.fromkeys(packages + transitive))

    print(f'  Packages to download: {len(all_packages)} ({len(packages)} direct + {len(transitive)} transitive)')

    # Download Windows wheels from PyPI (no Wine needed -- pip handles cross-platform download)
    download_cmd = [
        sys.executable, '-m', 'pip', 'download',
        '--only-binary=:all:',
        '--platform', 'win_amd64',
        '--python-version', '312',
        '--implementation', 'cp',
        '--no-deps',
        '--dest', str(wheels_dir),
    ] + all_packages

    print('  Downloading Windows wheels from PyPI ...')
    subprocess.run(download_cmd, check=True)

    # Extract wheels directly into site-packages.
    # We can't use `pip install --target` because pip on Linux refuses to install
    # win_amd64 wheels. Wheels are just ZIP files — extract them directly.
    print('  Extracting wheels into site-packages ...')
    installed = 0
    for whl in wheels_dir.glob('*.whl'):
        with zipfile.ZipFile(whl) as zf:
            zf.extractall(site_packages)
        installed += 1
    print(f'  {installed} packages installed to {site_packages.relative_to(BASE_DIR)}')


def copy_app(app_dir: Path) -> None:
    """Copy application code and config files to the build directory."""
    # Directories to copy recursively (exclude __pycache__ and .pyc)
    dirs_to_copy = ['app', 'alembic']
    for dir_name in dirs_to_copy:
        src = BASE_DIR / dir_name
        dst = app_dir / dir_name
        if src.exists():
            shutil.copytree(
                src, dst,
                ignore=shutil.ignore_patterns('__pycache__', '*.pyc'),
                dirs_exist_ok=True,
            )

    # Individual files to copy
    files_to_copy = [
        'alembic.ini',
        'run.py',
        'run_worker.py',
        'config.py',
        'huey_config.py',
        'launcher.py',
        'MediaParser.bat',
    ]
    for file_name in files_to_copy:
        src = BASE_DIR / file_name
        if src.exists():
            shutil.copy2(src, app_dir / file_name)
        else:
            print(f'  WARNING: {file_name} not found at {src} -- skipping')

    print(f'  Application code copied to {app_dir.relative_to(BASE_DIR)}')


def generate_env(app_dir: Path) -> None:
    """Generate a .env file with a random SECRET_KEY and production settings."""
    secret_key = secrets.token_hex(32)
    env_content = (
        f'SECRET_KEY={secret_key}\n'
        'FLASK_ENV=production\n'
        'TIMEZONE=America/New_York\n'
    )
    env_file = app_dir / '.env'
    env_file.write_text(env_content, encoding='utf-8')
    print(f'  Generated .env with random SECRET_KEY ({env_file.relative_to(BASE_DIR)})')


def create_zip(app_dir: Path, version: str) -> Path:
    """
    Create dist/MediaParser-Windows-v{version}.zip.

    The ZIP contains a top-level MediaParser/ directory so extraction creates
    a single self-contained folder.
    """
    DIST_DIR.mkdir(parents=True, exist_ok=True)
    zip_path = DIST_DIR / f'MediaParser-Windows-v{version}.zip'

    print(f'  Creating {zip_path.relative_to(BASE_DIR)} ...')
    file_count = 0
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        for file_path in app_dir.rglob('*'):
            if file_path.is_file():
                arcname = file_path.relative_to(BUILD_DIR)
                zf.write(file_path, arcname)
                file_count += 1

    size_mb = zip_path.stat().st_size / 1024 / 1024
    print(f'  Archived {file_count} files ({size_mb:.1f} MB)')
    return zip_path


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description='Build MediaParser Windows portable package from WSL2/Linux.',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        '--version',
        required=True,
        metavar='VERSION',
        help='Version string for the ZIP filename (e.g. 0.1.0)',
    )
    parser.add_argument(
        '--clean',
        action='store_true',
        help='Remove build/ directory before building',
    )
    parser.add_argument(
        '--skip-download',
        action='store_true',
        help='Skip download step if .build-cache/ already has required files',
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    version = args.version
    app_dir = BUILD_DIR / 'MediaParser'

    print('MediaParser Windows Build')
    print('=========================')
    print(f'Version: {version}')
    print()

    # Optionally wipe prior build
    if args.clean:
        print('[0/8] Cleaning prior build ...')
        if BUILD_DIR.exists():
            shutil.rmtree(BUILD_DIR)
        print()

    steps = [
        ('[1/8] Cleaning build directory ...', lambda: clean_build(app_dir)),
        (f'[2/8] Setting up Python {PYTHON_VERSION} embeddable ...', lambda: setup_python(app_dir)),
        ('[3/8] Downloading FFmpeg ...', lambda: download_ffmpeg(app_dir)),
        ('[4/8] Setting up ExifTool ...', lambda: setup_exiftool(app_dir)),
        ('[5/8] Installing Python packages ...', lambda: install_packages(app_dir)),
        ('[6/8] Copying application code ...', lambda: copy_app(app_dir)),
        ('[7/8] Generating .env ...', lambda: generate_env(app_dir)),
        ('[8/8] Creating ZIP archive ...', lambda: create_zip(app_dir, version)),
    ]

    zip_path = None
    for step_label, step_fn in steps:
        print(step_label)
        try:
            result = step_fn()
            if step_label.startswith('[8/8]'):
                zip_path = result
        except Exception as exc:
            print(f'\nERROR during step "{step_label}":')
            print(f'  {type(exc).__name__}: {exc}')
            sys.exit(1)
        print()

    if zip_path and zip_path.exists():
        size_mb = zip_path.stat().st_size / 1024 / 1024
        print('Build complete!')
        print(f'  Output: {zip_path.relative_to(BASE_DIR)}')
        print(f'  Size:   {size_mb:.1f} MB')
    else:
        print('Build complete! (ZIP path unavailable)')


if __name__ == '__main__':
    main()
