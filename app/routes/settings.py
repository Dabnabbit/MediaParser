"""Settings API endpoints.

Provides GET and POST endpoints for application settings configuration,
including output directory path validation and timezone settings.
"""
from pathlib import Path
from flask import Blueprint, jsonify, request, current_app
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from app import db
from app.models import Setting

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
