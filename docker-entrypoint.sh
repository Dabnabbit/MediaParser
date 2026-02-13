#!/bin/bash
set -e

# Run database migrations if alembic is configured
if [ -f alembic.ini ]; then
    DB_PATH="instance/mediaparser.db"

    # Check if alembic has been initialized (version table exists and has rows)
    ALEMBIC_INITIALIZED=false
    if [ -f "$DB_PATH" ]; then
        ROWS=$(python -c "
import sqlite3, sys
try:
    conn = sqlite3.connect('$DB_PATH')
    count = conn.execute('SELECT COUNT(*) FROM alembic_version').fetchone()[0]
    print(count)
except:
    print(0)
" 2>/dev/null)
        if [ "$ROWS" -gt 0 ] 2>/dev/null; then
            ALEMBIC_INITIALIZED=true
        fi
    fi

    if [ "$ALEMBIC_INITIALIZED" = true ]; then
        echo "Running database migrations..."
        if ! alembic upgrade head; then
            echo "ERROR: Database migration failed. Check alembic logs." >&2
            exit 1
        fi
    else
        # Either no database or database created by create_all() without alembic.
        # Create tables via Flask (idempotent) then stamp alembic as current.
        echo "Initializing database and stamping alembic to head..."
        python -c "from app import create_app; create_app()"
        alembic stamp head
    fi
fi

exec "$@"
