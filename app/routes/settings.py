"""Settings API endpoints.

Provides GET and POST endpoints for application settings configuration,
including output directory path validation and timezone settings.
Also includes debug endpoints for development (database stats, clear).
"""
import os
from pathlib import Path
from flask import Blueprint, jsonify, request, current_app
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from app import db
from app.models import Setting, File, Job, Tag, UserDecision

settings_bp = Blueprint('settings', __name__, url_prefix='/api')


@settings_bp.route('/settings', methods=['GET'])
def get_settings():
    """Get current application settings.

    Returns:
        JSON with current settings and defaults:
        {
            "output_directory": "/path/to/output",
            "timezone": "America/New_York",
            "defaults": {
                "output_directory": "/default/path",
                "timezone": "America/New_York"
            }
        }
    """
    # Get current settings from database
    output_dir_setting = Setting.query.filter_by(key='output_directory').first()
    timezone_setting = Setting.query.filter_by(key='timezone').first()

    # Get defaults from config
    default_output_dir = str(current_app.config['OUTPUT_FOLDER'])
    default_timezone = current_app.config['TIMEZONE']

    # Build response
    settings = {
        'output_directory': output_dir_setting.value if output_dir_setting else default_output_dir,
        'timezone': timezone_setting.value if timezone_setting else default_timezone,
        'defaults': {
            'output_directory': default_output_dir,
            'timezone': default_timezone
        }
    }

    return jsonify(settings)


@settings_bp.route('/settings', methods=['POST'])
def save_settings():
    """Save application settings.

    Request JSON:
        {
            "output_directory": "/path/to/output",
            "timezone": "America/New_York"
        }

    Returns:
        JSON with success status or error message:
        {
            "success": true,
            "message": "Settings saved successfully"
        }
        or
        {
            "success": false,
            "error": "Invalid path: directory does not exist"
        }
    """
    data = request.get_json()

    if not data:
        return jsonify({'success': False, 'error': 'No data provided'}), 400

    # Validate and save output directory
    if 'output_directory' in data:
        output_dir = data['output_directory']

        if not output_dir:
            return jsonify({'success': False, 'error': 'Output directory cannot be empty'}), 400

        try:
            path = Path(output_dir)

            # Try to create directory if it doesn't exist
            if not path.exists():
                try:
                    path.mkdir(parents=True, exist_ok=True)
                except Exception as e:
                    return jsonify({
                        'success': False,
                        'error': f'Cannot create directory: {str(e)}'
                    }), 400

            # Verify it's a directory
            if not path.is_dir():
                return jsonify({
                    'success': False,
                    'error': 'Path exists but is not a directory'
                }), 400

            # Check if writable
            test_file = path / '.mediaparser_write_test'
            try:
                test_file.touch()
                test_file.unlink()
            except Exception as e:
                return jsonify({
                    'success': False,
                    'error': f'Directory is not writable: {str(e)}'
                }), 400

            # Save to database
            setting = Setting.query.filter_by(key='output_directory').first()
            if setting:
                setting.value = str(path.absolute())
                setting.touch_updated()
            else:
                setting = Setting(key='output_directory', value=str(path.absolute()))
                db.session.add(setting)

        except Exception as e:
            return jsonify({
                'success': False,
                'error': f'Invalid path: {str(e)}'
            }), 400

    # Validate and save timezone
    if 'timezone' in data:
        timezone = data['timezone']

        if not timezone:
            return jsonify({'success': False, 'error': 'Timezone cannot be empty'}), 400

        try:
            # Validate timezone using ZoneInfo
            ZoneInfo(timezone)

            # Save to database
            setting = Setting.query.filter_by(key='timezone').first()
            if setting:
                setting.value = timezone
                setting.touch_updated()
            else:
                setting = Setting(key='timezone', value=timezone)
                db.session.add(setting)

        except ZoneInfoNotFoundError:
            return jsonify({
                'success': False,
                'error': f'Invalid timezone: {timezone}'
            }), 400
        except Exception as e:
            return jsonify({
                'success': False,
                'error': f'Timezone validation error: {str(e)}'
            }), 400

    # Commit changes
    try:
        db.session.commit()
        return jsonify({
            'success': True,
            'message': 'Settings saved successfully'
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({
            'success': False,
            'error': f'Database error: {str(e)}'
        }), 500


# =============================================================================
# Debug Endpoints (only available when DEBUG_MODE is enabled)
# =============================================================================

@settings_bp.route('/debug/info', methods=['GET'])
def get_debug_info():
    """Get debug information including database stats.

    Only available when DEBUG_MODE is enabled in config.

    Returns:
        JSON with debug info:
        {
            "enabled": true,
            "database": {
                "path": "/path/to/db",
                "size_bytes": 12345678,
                "size_human": "11.8 MB",
                "tables": {
                    "files": 150,
                    "jobs": 5,
                    "tags": 10,
                    ...
                }
            },
            "storage": {
                "uploads_path": "/path/to/uploads",
                "uploads_size_human": "500 MB"
            }
        }
    """
    debug_mode = current_app.config.get('DEBUG_MODE', False)

    if not debug_mode:
        return jsonify({
            'enabled': False,
            'message': 'Debug mode is disabled'
        })

    # Get database path and size
    db_uri = current_app.config['SQLALCHEMY_DATABASE_URI']
    db_path = db_uri.replace('sqlite:///', '')

    db_size = 0
    if os.path.exists(db_path):
        db_size = os.path.getsize(db_path)

    # Get table counts
    table_counts = {
        'files': File.query.count(),
        'jobs': Job.query.count(),
        'tags': Tag.query.count(),
        'user_decisions': UserDecision.query.count(),
        'settings': Setting.query.count()
    }

    # Get storage folder sizes
    uploads_path = current_app.config['UPLOAD_FOLDER']
    uploads_size = _get_folder_size(uploads_path)

    thumbnails_path = current_app.config.get('THUMBNAILS_FOLDER')
    thumbnails_size = _get_folder_size(thumbnails_path) if thumbnails_path else 0

    return jsonify({
        'enabled': True,
        'database': {
            'path': db_path,
            'size_bytes': db_size,
            'size_human': _format_size(db_size),
            'tables': table_counts
        },
        'storage': {
            'uploads_path': str(uploads_path),
            'uploads_size_bytes': uploads_size,
            'uploads_size_human': _format_size(uploads_size),
            'thumbnails_size_bytes': thumbnails_size,
            'thumbnails_size_human': _format_size(thumbnails_size)
        }
    })


@settings_bp.route('/debug/clear-database', methods=['POST'])
def clear_database():
    """Clear all data from database tables.

    Only available when DEBUG_MODE is enabled in config.
    Does NOT delete the database file, just truncates tables.

    Returns:
        JSON with success status
    """
    debug_mode = current_app.config.get('DEBUG_MODE', False)

    if not debug_mode:
        return jsonify({
            'success': False,
            'error': 'Debug mode is disabled'
        }), 403

    try:
        # Delete in order to respect foreign keys
        UserDecision.query.delete()
        # Clear file_tags association table
        db.session.execute(db.text('DELETE FROM file_tags'))
        # Clear job_files association table
        db.session.execute(db.text('DELETE FROM job_files'))
        Tag.query.delete()
        File.query.delete()
        Job.query.delete()
        # Keep settings

        db.session.commit()

        return jsonify({
            'success': True,
            'message': 'Database cleared successfully'
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({
            'success': False,
            'error': f'Failed to clear database: {str(e)}'
        }), 500


@settings_bp.route('/debug/clear-storage', methods=['POST'])
def clear_storage():
    """Clear uploaded files and thumbnails.

    Only available when DEBUG_MODE is enabled in config.

    Returns:
        JSON with success status
    """
    import shutil

    debug_mode = current_app.config.get('DEBUG_MODE', False)

    if not debug_mode:
        return jsonify({
            'success': False,
            'error': 'Debug mode is disabled'
        }), 403

    try:
        cleared = []

        # Clear uploads folder
        uploads_path = current_app.config['UPLOAD_FOLDER']
        if uploads_path.exists():
            for item in uploads_path.iterdir():
                if item.is_dir():
                    shutil.rmtree(item)
                else:
                    item.unlink()
            cleared.append('uploads')

        # Clear thumbnails folder
        thumbnails_path = current_app.config.get('THUMBNAILS_FOLDER')
        if thumbnails_path and thumbnails_path.exists():
            for item in thumbnails_path.iterdir():
                item.unlink()
            cleared.append('thumbnails')

        return jsonify({
            'success': True,
            'message': f'Cleared: {", ".join(cleared)}'
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Failed to clear storage: {str(e)}'
        }), 500


def _get_folder_size(path) -> int:
    """Calculate total size of folder in bytes."""
    if not path or not Path(path).exists():
        return 0
    total = 0
    for dirpath, dirnames, filenames in os.walk(path):
        for f in filenames:
            fp = os.path.join(dirpath, f)
            try:
                total += os.path.getsize(fp)
            except OSError:
                pass
    return total


def _format_size(size_bytes: int) -> str:
    """Format bytes as human-readable string."""
    for unit in ['B', 'KB', 'MB', 'GB']:
        if size_bytes < 1024:
            return f"{size_bytes:.1f} {unit}"
        size_bytes /= 1024
    return f"{size_bytes:.1f} TB"
