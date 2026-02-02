# Technology Stack

**Analysis Date:** 2026-02-02

## Languages

**Primary:**
- Python 3.12.3 - Main application language for media metadata processing

## Runtime

**Environment:**
- Python 3.12.3 (CPython)

**Package Manager:**
- pip (implicit via imports)
- Lockfile: Not detected

## Frameworks

**Core:**
- PyExifTool - EXIF metadata reading and writing for images and videos
- Pillow - Image processing library for media format validation

**Testing:**
- Not detected

**Build/Dev:**
- Not detected

## Key Dependencies

**Critical:**
- `exiftool` (PyExifTool) - Python wrapper for ExifTool command-line utility. Used for reading and writing EXIF metadata across image and video formats. Located in application import statement: `import exiftool`
- `PIL` (Pillow) - Python Imaging Library for image handling. Used for image format validation and metadata inspection. Import: `from PIL import Image`
- Standard library modules: `os`, `re`, `datetime`, `time`, `shutil`, `typing`

**Optional (Commented Out):**
- `piexif` - Alternative EXIF library (currently disabled)
- `exifread` - Alternative EXIF reading library (currently disabled)

## External Binaries

**ExifTool:**
- Binary: `/mnt/d/Work/Scripts/MediaParser/exiftool.exe`
- Type: PE32+ executable (Windows x86-64)
- Purpose: Command-line utility for reading and writing file metadata
- License: See `exiftool_files/readme_windows.txt`
- Source: https://exiftool.org/
- Wrapper: Strawberry Perl with launcher by Oliver Betz

## Configuration

**Environment:**
- No environment variables detected
- Hardcoded path configuration in `PhotoTimeFixer.py` lines 13-14:
  - Input directory: `D:/Work/Scripts/PhotoTimeFixer/Test/`
  - Output directory: `Output/`
  - Options: `output_dir_years` and `output_dir_clear` flags

**Build:**
- No build configuration files detected
- Direct script execution: `python PhotoTimeFixer.py`

## Platform Requirements

**Development:**
- Windows (exiftool.exe is Windows binary)
- Python 3.12.3 or compatible 3.x version
- pip for dependency installation

**Production:**
- Windows x86-64 system (exiftool.exe binary requirement)
- Python 3.12.3+ runtime
- Pillow and PyExifTool packages installed
- Read/write access to media files and output directories

## Media Format Support

**Supported File Types:**
- Images: jpg, jpeg, png, gif
- Videos: mp4, mpeg, mov
- Configuration in `PhotoTimeFixer.py` line 18

---

*Stack analysis: 2026-02-02*
