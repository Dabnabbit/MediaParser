# Testing Patterns

**Analysis Date:** 2026-02-11

## Test Framework

**Runner:**
- pytest 7+ with fixtures and temporary directory support
- Configuration: No `pytest.ini` or `pyproject.toml` test config (uses pytest defaults)

**Assertion Library:**
- Standard `assert` statements throughout (pytest native)
- `pytest.raises()` for expected exceptions

**Run Commands:**
```bash
python -m pytest tests/ -v          # Run all tests with verbose output
python -m pytest tests/ -v -x       # Stop on first failure
python -m pytest tests/test_export.py -v  # Run single test file
```

**Test Execution:**
- Tests run from project root with `.venv` activated
- `FLASK_ENV=testing` set in test files before app imports
- Flask app created with temporary SQLite database per test session

## Test File Organization

**Location:**
- All tests in `tests/` directory at project root
- Shared fixtures in `tests/conftest.py`
- One test file per feature area

**Naming:**
- Files: `test_<module>.py` (matches pytest auto-discovery)
- Classes: `Test<FeatureArea>` (e.g., `TestSHA256Hashing`, `TestCollisionHandling`)
- Methods: `test_<behavior_description>` (e.g., `test_sha256_returns_hex_string`)

**Structure:**
```
tests/
├── __init__.py              # Empty package marker
├── conftest.py              # Shared fixtures (app, client, temp_dir, sample files)
├── test_processing.py       # SHA256 hashing, perceptual hashing, confidence scoring,
│                            #   process_single_file pipeline, type detection, end-to-end
├── test_integration.py      # Configuration, database models, timestamp library,
│                            #   job queue lifecycle, storage directories
├── test_export.py           # Output filename generation, collision handling, file copy
├── test_tagging.py          # Filename tag extraction, folder tag extraction, auto-generation
├── test_duplicates.py       # Quality metrics, best duplicate recommendation, metadata accumulation
└── test_perceptual.py       # Hamming distance, sequence type detection, pairwise comparison,
                             #   perceptual duplicate grouping
```

## Test Structure

**Suite Organization:**
- Class-based grouping by feature (e.g., `TestSHA256Hashing`, `TestCollisionHandling`)
- Each class tests one function or closely related set of functions
- Tests follow Arrange-Act-Assert pattern

**Example:**
```python
class TestConfidenceScoring:
    def test_high_confidence_exif_agreement(self):
        now = datetime.now(timezone.utc)
        candidates = [
            (now, 'EXIF:DateTimeOriginal'),
            (now, 'EXIF:CreateDate'),
        ]
        dt, confidence, _ = calculate_confidence(candidates)
        assert confidence == ConfidenceLevel.HIGH
```

**Patterns:**
- Direct function calls to `app/lib/` modules (unit-style)
- Flask app context used for database model tests
- `SimpleNamespace` mock objects for file-like objects (no heavy mocking framework)
- `tmp_path` (pytest built-in) and custom `temp_dir` fixture for filesystem tests

## Mocking

**Framework:**
- No mock library (no unittest.mock, no pytest-mock)
- Lightweight approach using `types.SimpleNamespace` for mock objects

**Patterns:**
- `make_file()` factory functions in test files create `SimpleNamespace` objects mimicking File model attributes
- Used in: `test_export.py`, `test_tagging.py`, `test_duplicates.py`, `test_perceptual.py`

**Example:**
```python
def make_file(original_filename='photo.jpg', final_timestamp=None):
    return SimpleNamespace(
        original_filename=original_filename,
        final_timestamp=final_timestamp,
        detected_timestamp=None,
    )
```

**What's Mocked:**
- File model objects (using SimpleNamespace instead of ORM instances)

**What's NOT Mocked:**
- File system operations (use real temp directories)
- Hashing functions (called directly on real files)
- Flask application (real app with temp database)

## Fixtures and Factories

**Shared Fixtures (`conftest.py`):**

| Fixture | Scope | Description |
|---------|-------|-------------|
| `app` | function | Flask app with temporary SQLite database; creates and drops all tables |
| `client` | function | Flask test client for HTTP requests |
| `temp_dir` | function | `pathlib.Path` to temporary directory (auto-cleaned) |
| `sample_text_file` | function | Text file with "Hello, World!" content |
| `sample_image_file` | function | Minimal valid 1x1 JPEG (red pixel, binary bytes) |
| `timestamped_file` | function | File named `IMG_20240115_120000.txt` for timestamp parsing tests |

**Per-File Factories:**

| File | Factory | Creates |
|------|---------|---------|
| `test_export.py` | `make_file()` | SimpleNamespace with `original_filename`, `final_timestamp`, `detected_timestamp` |
| `test_duplicates.py` | `make_file()` | SimpleNamespace with `mime_type`, `file_size_bytes`, `image_width/height`, `timestamp_candidates` |
| `test_perceptual.py` | `make_file()` | SimpleNamespace with `original_filename`, `detected_timestamp`, `file_hash_perceptual`, group fields |
| `test_tagging.py` | Uses `SimpleNamespace` inline | `original_filename`, `original_path` |

## Coverage

**Requirements:**
- No coverage requirements enforced
- No coverage tool configured (no pytest-cov)

**Run Coverage:**
```bash
pip install pytest-cov
python -m pytest tests/ --cov=app --cov-report=term-missing
```

## Test Types

**Unit Tests (majority):**
- `test_processing.py`: SHA256 hashing, perceptual hashing, confidence scoring, type detection
- `test_export.py`: Filename generation, collision resolution, file copy
- `test_tagging.py`: Filename tag extraction, folder tag extraction, auto-generation
- `test_duplicates.py`: Quality metrics, recommendation algorithm, metadata accumulation
- `test_perceptual.py`: Hamming distance, sequence type, pairwise comparison, grouping

**Integration Tests:**
- `test_integration.py`: Flask app configuration, database model CRUD, timestamp library, job queue lifecycle, storage directories
- `test_processing.py` (TestEndToEndProcessing): Multi-file processing, timestamp extraction workflow, hashing workflow

**E2E Tests:**
- None — no browser-level or full API workflow tests

## Common Patterns

**Flask App Context:**
```python
def test_file_model_exists(self, app):
    from app.models import File, ConfidenceLevel
    with app.app_context():
        from app import db
        file = File(original_filename='test.jpg', ...)
        db.session.add(file)
        db.session.commit()
        assert file.id is not None
```

**Filesystem Tests:**
```python
def test_single_collision(self, tmp_path):
    target = tmp_path / '20240115_120000.jpg'
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text('existing')
    result = resolve_collision(target)
    assert result == tmp_path / '20240115_120000_001.jpg'
```

**Mock Object Tests:**
```python
def test_higher_resolution_wins(self):
    files = [
        {'id': 1, 'resolution_mp': 8.0, 'file_size_bytes': 2_000_000, 'format': 'jpeg'},
        {'id': 2, 'resolution_mp': 12.0, 'file_size_bytes': 1_000_000, 'format': 'jpeg'},
    ]
    assert recommend_best_duplicate(files) == 2
```

**Boundary Value Tests:**
```python
def test_similar_group_confidence_levels(self):
    # Distance 7 → high confidence (≤8)
    a = make_file('a.jpg', perceptual_hash='0000000000000000')
    b = make_file('b.jpg', perceptual_hash='000000000000007f')
    _compare_all_pairs([a, b])
    assert a.similar_group_confidence == 'high'
```

## Test Count Summary

| File | Classes | Tests | What's Tested |
|------|---------|-------|---------------|
| `test_processing.py` | 6 | 24 | SHA256, perceptual hash, confidence, pipeline, type detection, end-to-end |
| `test_integration.py` | 5 | 10 | Config, models (File/Job/Duplicate/UserDecision), timestamps, job queue, storage |
| `test_export.py` | 3 | 14 | Output filenames, collision handling, file copy |
| `test_tagging.py` | 3 | 14 | Filename tags, folder tags, auto-generation |
| `test_duplicates.py` | 3 | 12 | Quality metrics, recommendation, metadata accumulation |
| `test_perceptual.py` | 4 | 20 | Hamming distance, sequence type, pairwise grouping, full detection |
| **Total** | **24** | **~94** | |

## Test Gaps

**Not Tested:**
- Route handlers / API endpoints (all 5 blueprints, ~60 endpoints)
- Metadata extraction and writing (`app/lib/metadata.py`)
- Thumbnail generation (`app/lib/thumbnail.py`)
- Background task execution (`app/tasks.py` — only basic lifecycle tested)
- Pause/resume/cancel job control
- Frontend JavaScript (28 modules)

**Known Issues:**
- `test_integration.py` duplicates `app` and `client` fixtures from `conftest.py`
- No test isolation for ExifTool-dependent code (requires exiftool binary)
- No CI pipeline — tests run manually

---

*Testing analysis: 2026-02-11*
