"""
Huey task queue configuration.

Uses SQLite backend for simplicity in v1 (single-server deployment).
Can be migrated to Redis for multi-server if needed later.

Run consumer with:
    huey_consumer huey_config.huey -w 2 -k thread
"""
from pathlib import Path
from huey import SqliteHuey

# Database path for Huey queue (separate from app database)
HUEY_DB_PATH = Path(__file__).parent / 'instance' / 'huey_queue.db'

# Ensure instance directory exists
HUEY_DB_PATH.parent.mkdir(parents=True, exist_ok=True)

huey = SqliteHuey(
    name='mediaparser-tasks',
    filename=str(HUEY_DB_PATH),
    immediate=False,  # Don't run tasks synchronously (important for testing)
    utc=True,         # Store all times as UTC
)

# Consumer configuration
# These are used when running: huey_consumer huey_config.huey
CONSUMER_CONFIG = {
    'workers': 2,           # Number of worker threads
    'worker_type': 'thread',  # Use threads (simpler than processes for SQLite)
    'initial_delay': 0.1,   # Initial poll delay
    'backoff': 1.15,        # Backoff multiplier when queue is empty
    'max_delay': 10.0,      # Maximum poll delay
    'periodic': True,       # Enable periodic tasks
    'check_worker_health': True,
    'health_check_interval': 10,
}
