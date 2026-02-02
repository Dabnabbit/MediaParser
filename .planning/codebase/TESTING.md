# Testing Patterns

**Analysis Date:** 2026-02-02

## Test Framework

**Runner:**
- Not formally configured
- Manual test script using Python's built-in execution
- Primary test file: `/old/minimal_test.py`

**Assertion Library:**
- Not used; tests rely on conditional checks and exception handling
- No assert statements found in existing test files

**Run Commands:**
```bash
python PhotoTimeFixer.py              # Run main application
python old/minimal_test.py            # Run manual integration test
```

**Test Execution:**
- Test file prompts for user input (interactive mode)
- No automated test runner configuration (no pytest.ini, tox.ini, setup.cfg)

## Test File Organization

**Location:**
- Tests in separate directory from source: `/old/` for test files
- Main application: `/PhotoTimeFixer.py`
- Test file: `/old/minimal_test.py`

**Naming:**
- Descriptive: `minimal_test.py`, `complete_processing_test()`
- Convention: lowercase with underscores, clear intent

**Structure:**
```
MediaParser/
├── PhotoTimeFixer.py          # Main application
└── old/
    ├── PhotoTimeFixer.py      # Previous version
    └── minimal_test.py        # Integration test
```

## Test Structure

**Suite Organization:**
```python
def complete_processing_test():
    """Run a complete test that actually organizes photos"""
    # Test setup and configuration
    test_images_dir = input("📁 Enter path to directory with test images: ").strip()

    # Validation checks
    if not test_images_dir or not os.path.exists(test_images_dir):
        print("❌ Directory not found!")
        return

    # Test execution
    try:
        processor = BulkPhotoProcessor(config)
        session_id = processor.start_bulk_processing()
    except Exception as e:
        print(f"❌ Processing failed: {e}")
        return

    # Results verification
    print("✅ Processing phase completed!")
```

**Patterns:**
- Setup phase: Directory validation, configuration creation, processor initialization (lines 19-138)
- Execution phase: Processing invocation with timeout handling (lines 141-165)
- Verification phase: Output directory checking, results reporting (lines 167-243)
- Teardown phase: Cleanup options presented to user (lines 246-267)

## Mocking

**Framework:**
- Not used; tests use actual file system operations
- No mock library imports in test file

**Patterns:**
- Integration testing approach: Real files copied to temporary directories
- Temporary test data created at runtime: `TEMP_TEST_SUBSET` directory (line 123)
- File operations tested directly: `shutil.copy2()`, `os.walk()`

**What to Test:**
- File discovery and metadata extraction
- Date parsing from filenames
- File organization by year
- Error handling for metadata operations
- Duplicate detection (referenced in config)

**What NOT to Mock:**
- File system operations (use real temporary directories)
- External tool integration (exiftool)
- File metadata reading

## Fixtures and Factories

**Test Data:**
```python
# From minimal_test.py lines 62-77
config = ProcessingConfig(
    documents_dir=test_images_dir,
    output_dir='ORGANIZED_PHOTOS/',
    output_dir_clear=True,
    output_dir_years=True,
    batch_size=5,
    max_workers=2,
    max_concurrent_exif=1,
    enable_duplicate_detection=True,
    enable_database=True,
    database_file='complete_test.db'
)
```

**Location:**
- Test data fixtures created at runtime from user input
- Temporary directories created within test: `Path(test_images_dir) / "TEMP_TEST_SUBSET"` (line 123)
- Sample files copied from user-provided directory
- No pre-built fixture files in repository

## Coverage

**Requirements:**
- No coverage requirements enforced
- No coverage configuration files detected

**View Coverage:**
```bash
# No coverage tools configured
# Manual verification through output directory inspection
```

## Test Types

**Unit Tests:**
- Not present in codebase
- Utility functions (`get_datetime_from_name()`, `convert_str_to_datetime()`) not tested in isolation

**Integration Tests:**
- Primary test approach: `complete_processing_test()` in `minimal_test.py`
- Tests full photo processing pipeline with actual file operations
- Scope: File discovery → metadata extraction → date parsing → file organization → output verification
- Interactive user input for configuration (lines 20, 40, 251)

**E2E Tests:**
- Not formally defined
- Closest equivalent is `complete_processing_test()` which processes actual photos
- Tests database creation (line 236), organized output structure (lines 194-223), and file integrity

## Common Patterns

**Async Testing:**
- Not used; processing includes timeout handling (lines 149-157):
```python
timeout = 120  # 2 minutes
start_time = time.time()

while processor.processing_active and (time.time() - start_time) < timeout:
    time.sleep(1)

if processor.processing_active:
    print("⏰ Timeout reached, stopping...")
    processor.stop_processing()
```

**Error Testing:**
```python
# Lines 48-56: Import error handling
try:
    from enhanced_photo_fixer import BulkPhotoProcessor, ProcessingConfig
    print("✅ Import successful!")
except ImportError as e:
    print(f"❌ Import failed: {e}")
    return
except Exception as e:
    print(f"❌ Error importing: {e}")
    return

# Lines 61-82: Configuration error handling
try:
    config = ProcessingConfig(...)
    print("✅ Configuration created!")
except Exception as e:
    print(f"❌ Config creation failed: {e}")
    return
```

**Dependency Checking:**
```python
def check_dependencies():
    """Check if required dependencies are installed"""
    required_packages = [
        ('PIL', 'pillow'),
        ('exiftool', 'pyexiftool'),
        ('imagehash', 'imagehash')
    ]

    missing = []
    for import_name, package_name in required_packages:
        try:
            __import__(import_name)
            print(f"✅ {package_name}")
        except ImportError:
            print(f"❌ {package_name} - MISSING")
            missing.append(package_name)

    if missing:
        print(f"pip install {' '.join(missing)}")
        return False
    return True
```

**Progress Tracking in Tests:**
```python
# Lines 94-117: Callback-based progress reporting
def detailed_progress(update):
    nonlocal files_processed

    if update['type'] == 'file_completed':
        files_processed += 1
        metadata = update['metadata']
        print(f"  ✅ [{files_processed:2d}] {metadata['file_name']}")

    elif update['type'] == 'stats_update':
        stats = update['stats']
        print(f"📊 Progress: {stats.get('completed', 0)}/{stats.get('total_files', 0)}")
```

**Output Verification:**
```python
# Lines 194-223: Check that output files were created correctly
output_path = temp_dir / 'ORGANIZED_PHOTOS'
if output_path.exists():
    output_files = []
    for root, dirs, files in os.walk(output_path):
        for file in files:
            if not file.endswith('.db'):
                rel_path = os.path.relpath(os.path.join(root, file), output_path)
                output_files.append(rel_path)

    print(f"✅ Created {len(output_files)} organized files:")
```

## Test Limitations

**Coverage Gaps:**
- No tests for core utility functions: `get_datetime_from_name()`, `convert_str_to_datetime()`
- No unit tests for regex patterns and date validation logic
- No tests for error cases in metadata extraction
- No tests for filename extension correction logic
- No tests for timezone handling in date conversion

**Missing Test Infrastructure:**
- No test database isolated from production
- No pytest/unittest framework integration
- No continuous integration setup
- No automated test execution
- No assertions or formal pass/fail criteria
- All test results based on manual inspection

---

*Testing analysis: 2026-02-02*
