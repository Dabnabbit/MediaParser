"""Flask routes package."""
from app.routes.upload import upload_bp
from app.routes.jobs import jobs_bp
from app.routes.api import api_bp

__all__ = ['upload_bp', 'jobs_bp', 'api_bp']
