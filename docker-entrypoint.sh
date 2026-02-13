#!/bin/bash
set -e

# Run database migrations if alembic is configured
if [ -f alembic.ini ]; then
    DB_PATH="instance/mediaparser.db"
    if [ ! -f "$DB_PATH" ]; then
        # Fresh database: create_all() in Flask builds the latest schema,
        # so just stamp alembic to mark all migrations as applied.
        echo "Fresh database detected. Stamping alembic to head..."
        python -c "from app import create_app; create_app()"
        alembic stamp head
    else
        echo "Running database migrations..."
        if ! alembic upgrade head; then
            echo "ERROR: Database migration failed. Check alembic logs." >&2
            exit 1
        fi
    fi
fi

exec "$@"
