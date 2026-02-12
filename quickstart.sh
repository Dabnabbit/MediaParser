#!/usr/bin/env bash
#
# MediaParser Quickstart
#
# One-command setup and launch:
#   chmod +x quickstart.sh && ./quickstart.sh
#
# Installs system dependencies, creates a Python virtual environment,
# installs pip packages, and starts MediaParser in standalone mode
# (Flask + Huey worker in a single process). A browser window opens
# automatically when the server is ready.
#
# Flags (passed through to run.py):
#   --no-browser   Don't auto-open the browser
#   --port PORT    Use a different port (default: 5000)
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PYTHON=""
VENV_DIR=".venv"
MIN_PYTHON_MAJOR=3
MIN_PYTHON_MINOR=10

# ---------- helpers ----------

info()  { printf '\033[1;34m[info]\033[0m  %s\n' "$*"; }
ok()    { printf '\033[1;32m[ok]\033[0m    %s\n' "$*"; }
warn()  { printf '\033[1;33m[warn]\033[0m  %s\n' "$*"; }
die()   { printf '\033[1;31m[error]\033[0m %s\n' "$*" >&2; exit 1; }

# ---------- find Python >= 3.10 ----------

find_python() {
    for cmd in python3.12 python3.11 python3.10 python3 python; do
        if command -v "$cmd" &>/dev/null; then
            local ver
            ver="$("$cmd" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")' 2>/dev/null)" || continue
            local major minor
            major="${ver%%.*}"
            minor="${ver##*.}"
            if (( major == MIN_PYTHON_MAJOR && minor >= MIN_PYTHON_MINOR )); then
                PYTHON="$cmd"
                return 0
            fi
        fi
    done
    return 1
}

# ---------- install system deps ----------

install_system_deps() {
    local missing=()

    command -v exiftool &>/dev/null || missing+=(exiftool)
    command -v ffmpeg   &>/dev/null || missing+=(ffmpeg)

    # libmagic: check for the shared library
    if ! python3 -c "import ctypes.util; assert ctypes.util.find_library('magic')" &>/dev/null; then
        missing+=(libmagic)
    fi

    if (( ${#missing[@]} == 0 )); then
        ok "System dependencies already installed"
        return 0
    fi

    info "Missing system packages: ${missing[*]}"

    # Map generic names to package manager names
    if command -v apt-get &>/dev/null; then
        local pkgs=()
        for dep in "${missing[@]}"; do
            case "$dep" in
                exiftool) pkgs+=(libimage-exiftool-perl) ;;
                ffmpeg)   pkgs+=(ffmpeg) ;;
                libmagic) pkgs+=(libmagic1) ;;
            esac
        done
        info "Installing via apt: ${pkgs[*]}"
        sudo apt-get update -qq && sudo apt-get install -y -qq "${pkgs[@]}"

    elif command -v brew &>/dev/null; then
        local pkgs=()
        for dep in "${missing[@]}"; do
            case "$dep" in
                exiftool) pkgs+=(exiftool) ;;
                ffmpeg)   pkgs+=(ffmpeg) ;;
                libmagic) pkgs+=(libmagic) ;;
            esac
        done
        info "Installing via brew: ${pkgs[*]}"
        brew install "${pkgs[@]}"

    elif command -v dnf &>/dev/null; then
        local pkgs=()
        for dep in "${missing[@]}"; do
            case "$dep" in
                exiftool) pkgs+=(perl-Image-ExifTool) ;;
                ffmpeg)   pkgs+=(ffmpeg) ;;
                libmagic) pkgs+=(file-libs) ;;
            esac
        done
        info "Installing via dnf: ${pkgs[*]}"
        sudo dnf install -y "${pkgs[@]}"

    elif command -v pacman &>/dev/null; then
        local pkgs=()
        for dep in "${missing[@]}"; do
            case "$dep" in
                exiftool) pkgs+=(perl-image-exiftool) ;;
                ffmpeg)   pkgs+=(ffmpeg) ;;
                libmagic) pkgs+=(file) ;;
            esac
        done
        info "Installing via pacman: ${pkgs[*]}"
        sudo pacman -S --noconfirm "${pkgs[@]}"

    else
        die "Could not detect package manager. Please install manually: ${missing[*]}"
    fi

    ok "System dependencies installed"
}

# ---------- main ----------

info "MediaParser Quickstart"
echo

# 1. Python
if find_python; then
    ok "Found $PYTHON ($($PYTHON --version 2>&1))"
else
    die "Python >= ${MIN_PYTHON_MAJOR}.${MIN_PYTHON_MINOR} is required but not found.
     Install it from https://www.python.org/downloads/ and re-run this script."
fi

# 2. System dependencies
install_system_deps

# 3. Virtual environment
if [ -d "$VENV_DIR" ] && [ -f "$VENV_DIR/bin/activate" ]; then
    ok "Virtual environment already exists"
else
    info "Creating virtual environment..."
    $PYTHON -m venv "$VENV_DIR"
    ok "Virtual environment created"
fi

# 4. Install/update pip packages
info "Installing Python dependencies..."
"$VENV_DIR/bin/pip" install --quiet --upgrade pip
"$VENV_DIR/bin/pip" install --quiet -r requirements.txt
ok "Python dependencies installed"

# 5. Launch
echo
info "Starting MediaParser in standalone mode..."
info "Press Ctrl+C to stop"
echo
exec "$VENV_DIR/bin/python" run.py --standalone "$@"
