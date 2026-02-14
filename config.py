"""Application configuration module.

Provides configuration classes for different environments with pathlib-based
paths and timezone handling. Addresses INFRA-04 (hardcoded timezone) and
INFRA-05 (hardcoded paths) at the infrastructure level.
"""
import os
from pathlib import Path
from zoneinfo import ZoneInfo


# Base directories using pathlib
BASE_DIR = Path(__file__).parent.absolute()
INSTANCE_DIR = BASE_DIR / 'instance'
STORAGE_DIR = BASE_DIR / 'storage'


class Config:
    """Base configuration with common settings."""

    # Flask secret key
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'dev-secret-key-change-in-production'

    # Database configuration
    SQLALCHEMY_DATABASE_URI = f"sqlite:///{INSTANCE_DIR / 'mediaparser.db'}"
    SQLALCHEMY_ENGINE_OPTIONS = {
        'connect_args': {
            'check_same_thread': False,
            'timeout': 5.0
        }
    }
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # Storage directories (using pathlib.Path)
    UPLOAD_FOLDER = STORAGE_DIR / 'uploads'
    PROCESSING_FOLDER = STORAGE_DIR / 'processing'
    OUTPUT_FOLDER = Path(os.environ['OUTPUT_DIR']) if os.environ.get('OUTPUT_DIR') else STORAGE_DIR / 'output'

    # Timezone configuration (replaces hardcoded -4 offset)
    TIMEZONE = os.environ.get('TIMEZONE', 'America/New_York')

    # Phase 2: Processing Configuration
    WORKER_THREADS = None  # None = auto-detect CPU count
    MIN_VALID_YEAR = 2000  # Sanity floor for timestamps
    BATCH_COMMIT_SIZE = 10  # Files per database commit
    ERROR_THRESHOLD = 0.10  # Halt job if error rate exceeds this

    # Debug mode (enables debug UI features)
    DEBUG_MODE = False

    @classmethod
    def validate_timezone(cls):
        """Validate timezone configuration using zoneinfo."""
        try:
            ZoneInfo(cls.TIMEZONE)
            return True
        except Exception as e:
            raise ValueError(f"Invalid TIMEZONE '{cls.TIMEZONE}': {e}")


class DevelopmentConfig(Config):
    """Development environment configuration."""

    DEBUG = True
    DEBUG_MODE = True  # Enables debug features in UI (db clear, stats)
    SQLALCHEMY_ECHO = True


class ProductionConfig(Config):
    """Production environment configuration."""

    DEBUG = False
    DEBUG_MODE = False  # Disable debug features in production


# Configuration dictionary for easy lookup
config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'default': DevelopmentConfig
}
