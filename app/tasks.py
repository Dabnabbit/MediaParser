"""
Huey background tasks for media processing.

Tasks run in worker processes/threads, separate from the Flask web server.
Each task that needs database access must create its own Flask application context.
"""
from datetime import datetime, timezone
from typing import Optional
import logging

from huey_config import huey

logger = logging.getLogger(__name__)


def get_app():
    """
    Create Flask application for use in worker context.

    Must be called inside task to avoid import-time side effects.
    """
    from app import create_app
    return create_app()


@huey.task(retries=2, retry_delay=30)
def process_import_job(job_id: int) -> dict:
    """
    Process an import job.

    This is a skeleton that demonstrates the job lifecycle:
    1. Fetch job from database
    2. Update status to RUNNING
    3. Process files (placeholder for now)
    4. Update status to COMPLETED or FAILED

    Args:
        job_id: ID of the Job record to process

    Returns:
        Dictionary with result info
    """
    app = get_app()

    with app.app_context():
        from app import db
        from app.models import Job, JobStatus

        # Fetch job
        job = db.session.get(Job, job_id)
        if job is None:
            logger.error(f"Job {job_id} not found")
            return {'error': f'Job {job_id} not found'}

        # Update to RUNNING
        job.status = JobStatus.RUNNING
        job.started_at = datetime.now(timezone.utc)
        db.session.commit()
        logger.info(f"Job {job_id} started")

        try:
            # TODO: Actual file processing will be implemented in Phase 2
            # For now, just simulate success

            # Update progress (placeholder)
            job.progress_current = job.progress_total
            db.session.commit()

            # Mark completed
            job.status = JobStatus.COMPLETED
            job.completed_at = datetime.now(timezone.utc)
            db.session.commit()
            logger.info(f"Job {job_id} completed")

            return {
                'job_id': job_id,
                'status': 'completed',
                'processed': job.progress_current
            }

        except Exception as e:
            # Mark failed
            job.status = JobStatus.FAILED
            job.error_message = str(e)[:500]  # Truncate long errors
            job.completed_at = datetime.now(timezone.utc)
            db.session.commit()
            logger.error(f"Job {job_id} failed: {e}")

            # Re-raise so Huey handles retry
            raise


@huey.task()
def health_check() -> dict:
    """
    Simple health check task to verify worker is running.

    Can be called from web app to confirm queue is operational.
    """
    return {
        'status': 'ok',
        'timestamp': datetime.now(timezone.utc).isoformat()
    }


def enqueue_import_job(job_id: int) -> str:
    """
    Helper function to enqueue a job from web app.

    Args:
        job_id: ID of the Job record to process

    Returns:
        Huey task ID (can be used to check status)
    """
    result = process_import_job(job_id)
    return result.id  # Huey task ID
