#!/bin/bash
set -e

# Run database migrations if alembic is configured
if [ -f alembic.ini ]; then
    echo "Running database migrations..."
    if ! alembic upgrade head; then
        echo "ERROR: Database migration failed. Check alembic logs." >&2
        exit 1
    fi
fi

exec "$@"
