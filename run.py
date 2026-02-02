#!/usr/bin/env python3
"""
MediaParser Application Entry Point.

Run the development server:
    python run.py

Or with Flask CLI:
    FLASK_APP=run flask run

For production, use a proper WSGI server like Gunicorn:
    gunicorn -w 4 -b 0.0.0.0:5000 'run:app'
"""
import os
from app import create_app

# Determine config from environment, default to development
config_name = os.environ.get('FLASK_ENV', 'development')

# Map environment names to config classes
config_map = {
    'development': 'DevelopmentConfig',
    'production': 'ProductionConfig',
    'testing': 'DevelopmentConfig',  # Use dev config for testing
}

app = create_app(config_map.get(config_name, 'DevelopmentConfig'))


if __name__ == '__main__':
    # Development server only - not for production!
    print(f"Starting MediaParser in {config_name} mode...")
    print(f"Database: {app.config['SQLALCHEMY_DATABASE_URI']}")
    print(f"Timezone: {app.config['TIMEZONE']}")
    print(f"Storage: {app.config['UPLOAD_FOLDER']}")

    app.run(
        host='127.0.0.1',
        port=5000,
        debug=app.config.get('DEBUG', False)
    )
