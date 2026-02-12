#!/bin/bash
set -e

# Run database migrations if alembic is configured
if [ -f alembic.ini ]; then
    echo "Running database migrations..."
    alembic upgrade head || echo "Warning: migrations skipped (may not be initialized yet)"
fi

exec "$@"
