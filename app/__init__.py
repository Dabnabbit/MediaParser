"""Flask application factory module.

Provides create_app() factory function following Flask best practices.
Creates and configures the application with database and storage setup.
"""
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import text


class Base(DeclarativeBase):
    """Base class for SQLAlchemy models."""
    pass


# Initialize SQLAlchemy with custom base
db = SQLAlchemy(model_class=Base)


def ensure_directories(app):
    """Create storage directories if they don't exist.

    Args:
        app: Flask application instance with config loaded
    """
    for folder_key in ['UPLOAD_FOLDER', 'PROCESSING_FOLDER', 'OUTPUT_FOLDER']:
        path = app.config[folder_key]
        path.mkdir(parents=True, exist_ok=True)

    # Also ensure instance directory exists
    instance_path = app.config.get('INSTANCE_DIR')
    if instance_path:
        instance_path.mkdir(parents=True, exist_ok=True)


def create_app(config_name='development'):
    """Application factory function.

    Args:
        config_name: Configuration environment ('development' or 'production')

    Returns:
        Configured Flask application instance
    """
    # Create Flask application
    app = Flask(__name__, instance_relative_config=True)

    # Load configuration
    from config import config as config_dict, INSTANCE_DIR
    app.config.from_object(config_dict[config_name])
    app.config['INSTANCE_DIR'] = INSTANCE_DIR

    # Validate timezone configuration
    config_dict[config_name].validate_timezone()

    # Initialize database
    db.init_app(app)

    # Ensure storage directories exist and setup database
    with app.app_context():
        ensure_directories(app)

        # Import models to register them with SQLAlchemy
        from app import models  # noqa: F401 - registers models

        # Enable SQLite WAL mode for better concurrency
        if 'sqlite' in app.config.get('SQLALCHEMY_DATABASE_URI', ''):
            with db.engine.connect() as conn:
                conn.execute(text('PRAGMA journal_mode=WAL'))
                conn.execute(text('PRAGMA busy_timeout=5000'))
                conn.commit()

        # Create all tables
        db.create_all()

    return app
