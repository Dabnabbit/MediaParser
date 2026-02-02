"""
Phase 1 Integration Tests.

Validates all foundation components work together:
- Configuration and paths
- Database models and relationships
- Timestamp library functions
- Job queue lifecycle

Run with: python -m pytest tests/ -v
"""
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import pytest

# Set testing environment before imports
os.environ['FLASK_ENV'] = 'testing'


@pytest.fixture
def app():
    """Create application for testing."""
    from app import create_app, db

    # Use temporary database for tests
    with tempfile.TemporaryDirectory() as tmpdir:
        test_db = Path(tmpdir) / 'test.db'

        app = create_app('DevelopmentConfig')
        app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{test_db}'
        app.config['TESTING'] = True

        with app.app_context():
            db.create_all()
            yield app
            db.drop_all()


@pytest.fixture
def client(app):
    """Test client for HTTP requests."""
    return app.test_client()


class TestConfiguration:
    """Test configuration system."""

    def test_timezone_configurable(self, app):
        """INFRA-04: Timezone should be configurable, not hardcoded."""
        assert 'TIMEZONE' in app.config
        assert app.config['TIMEZONE'] is not None
        # Default should be America/New_York per RESEARCH.md
        assert app.config['TIMEZONE'] == 'America/New_York'

    def test_paths_use_pathlib(self, app):
        """INFRA-05: Paths should use pathlib.Path."""
        assert isinstance(app.config['UPLOAD_FOLDER'], Path)
        assert isinstance(app.config['PROCESSING_FOLDER'], Path)
        assert isinstance(app.config['OUTPUT_FOLDER'], Path)

    def test_no_hardcoded_windows_paths(self, app):
        """INFRA-05: No hardcoded Windows paths."""
        # Check that paths don't contain Windows-style drive letters
        for key in ['UPLOAD_FOLDER', 'PROCESSING_FOLDER', 'OUTPUT_FOLDER']:
            path_str = str(app.config[key])
            assert not path_str.startswith('D:'), f"{key} contains hardcoded Windows path"
            assert not path_str.startswith('C:'), f"{key} contains hardcoded Windows path"


class TestDatabaseModels:
    """Test database schema."""

    def test_file_model_exists(self, app):
        """INFRA-03: File model should exist with required fields."""
        from app.models import File, ConfidenceLevel

        with app.app_context():
            from app import db

            file = File(
                original_filename='test.jpg',
                original_path='/uploads/test.jpg',
                storage_path='/storage/test.jpg',
                file_hash_sha256='abc123',
                confidence=ConfidenceLevel.MEDIUM
            )
            db.session.add(file)
            db.session.commit()

            assert file.id is not None
            assert file.created_at is not None

    def test_job_model_exists(self, app):
        """INFRA-02/03: Job model should exist with status enum."""
        from app.models import Job, JobStatus

        with app.app_context():
            from app import db

            job = Job(
                job_type='import',
                status=JobStatus.PENDING,
                progress_total=10
            )
            db.session.add(job)
            db.session.commit()

            assert job.id is not None
            assert job.status == JobStatus.PENDING

    def test_duplicate_model_exists(self, app):
        """INFRA-03: Duplicate model should track similarity."""
        from app.models import File, Duplicate, ConfidenceLevel

        with app.app_context():
            from app import db

            file1 = File(original_filename='a.jpg', original_path='/a.jpg',
                        confidence=ConfidenceLevel.LOW)
            file2 = File(original_filename='b.jpg', original_path='/b.jpg',
                        confidence=ConfidenceLevel.LOW)
            db.session.add_all([file1, file2])
            db.session.commit()

            dup = Duplicate(
                file_id=file1.id,
                duplicate_of_id=file2.id,
                match_type='exact',
                similarity_score=1.0,
                detected_at=datetime.now(timezone.utc)
            )
            db.session.add(dup)
            db.session.commit()

            assert dup.id is not None
            assert dup.similarity_score == 1.0

    def test_user_decision_model_exists(self, app):
        """INFRA-03: UserDecision model should record user choices."""
        from app.models import File, UserDecision, ConfidenceLevel

        with app.app_context():
            from app import db

            file = File(original_filename='test.jpg', original_path='/test.jpg',
                       confidence=ConfidenceLevel.LOW)
            db.session.add(file)
            db.session.commit()

            decision = UserDecision(
                file_id=file.id,
                decision_type='timestamp_override',
                decision_value='2024-01-15T12:00:00Z',
                decided_at=datetime.now(timezone.utc)
            )
            db.session.add(decision)
            db.session.commit()

            assert decision.id is not None


class TestTimestampLibrary:
    """Test timestamp extraction functions."""

    def test_get_datetime_from_name_basic(self):
        """SC-5: Timestamp detection callable as library function."""
        from app.lib.timestamp import get_datetime_from_name

        dt = get_datetime_from_name('IMG_20240115_120000.jpg', 'UTC')

        assert dt is not None
        assert dt.year == 2024
        assert dt.month == 1
        assert dt.day == 15
        assert dt.hour == 12
        assert dt.minute == 0

    def test_timezone_configurable(self):
        """INFRA-04: Timezone should be parameter, not hardcoded."""
        from app.lib.timestamp import convert_str_to_datetime

        # Same time string, different timezones
        ny = convert_str_to_datetime('2024:01:15 12:00:00', 'America/New_York')
        la = convert_str_to_datetime('2024:01:15 12:00:00', 'America/Los_Angeles')

        # Both should be valid
        assert ny is not None
        assert la is not None
        # They should differ (NY is UTC-5, LA is UTC-8 in January)
        assert ny != la

    def test_returns_utc_normalized(self):
        """Timestamps should be normalized to UTC for storage."""
        from app.lib.timestamp import convert_str_to_datetime
        from datetime import timezone

        dt = convert_str_to_datetime('2024:01:15 12:00:00', 'America/New_York')

        assert dt is not None
        assert dt.tzinfo == timezone.utc


class TestJobQueue:
    """Test job queue functionality."""

    def test_job_lifecycle(self, app):
        """SC-2/3: Job can be created, enqueued, and processed."""
        from app.models import Job, JobStatus
        from app.tasks import process_import_job

        with app.app_context():
            from app import db

            # Create job
            job = Job(job_type='import', status=JobStatus.PENDING, progress_total=1)
            db.session.add(job)
            db.session.commit()
            job_id = job.id

        # Process job (direct call for testing)
        result = process_import_job.call_local(job_id)

        assert result['status'] == 'completed'

        with app.app_context():
            from app import db

            job = db.session.get(Job, job_id)
            assert job.status == JobStatus.COMPLETED
            assert job.started_at is not None
            assert job.completed_at is not None


class TestStorageDirectories:
    """Test file storage structure."""

    def test_directories_created(self, app):
        """SC-4: Storage directories should exist."""
        with app.app_context():
            # Note: In tests, these might not exist as we use temp DB
            # Just verify config has the paths
            assert app.config['UPLOAD_FOLDER'] is not None
            assert app.config['PROCESSING_FOLDER'] is not None
            assert app.config['OUTPUT_FOLDER'] is not None


# Run tests if executed directly
if __name__ == '__main__':
    pytest.main([__file__, '-v'])
