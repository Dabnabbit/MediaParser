#!/usr/bin/env python3
"""
MediaParser Application Entry Point.

Run the development server:
    python run.py

Run in standalone mode (Flask + Huey worker in one process):
    python run.py --standalone

Or with Flask CLI:
    FLASK_APP=run flask run

For production, use a proper WSGI server like Gunicorn:
    gunicorn -w 4 -b 0.0.0.0:5000 'run:app'
"""
import os
from app import create_app

# Determine config from environment, default to development
config_name = os.environ.get('FLASK_ENV', 'development')

# Normalize config name (testing uses development config)
if config_name == 'testing':
    config_name = 'development'

app = create_app(config_name)


def start_embedded_consumer():
    """Start Huey consumer threads inside the Flask process.

    Creates a Consumer with the same config as run_worker.py, then
    manually starts scheduler + worker threads (skipping signal handler
    registration which only works from the main thread).

    All threads are set to daemon so they auto-terminate when Flask exits.

    Returns the Consumer instance for health-check monitoring.
    """
    import threading
    import time
    from huey.consumer import Consumer, ConsumerStopped
    from huey_config import huey

    consumer = Consumer(huey,
        workers=2,
        worker_type='thread',
        initial_delay=0.05,
        backoff=1.2,
        max_delay=0.3,
        check_worker_health=True,
        health_check_interval=10,
    )

    # Start scheduler and worker threads directly — skip consumer.start()
    # which calls _set_signal_handlers() (fails from non-main thread and
    # isn't needed since Flask handles shutdown via Ctrl+C).
    # Mark all as daemon so they die automatically when Flask exits.
    consumer.scheduler.daemon = True
    consumer.scheduler.start()
    for _, worker_thread in consumer.worker_threads:
        worker_thread.daemon = True
        worker_thread.start()

    # Run the consumer's health-check loop in a daemon thread.
    # This monitors worker threads and restarts any that die unexpectedly.
    def _health_loop():
        health_check_ts = time.time()
        while not consumer.stop_flag.is_set():
            try:
                health_check_ts = consumer.loop(health_check_ts)
            except ConsumerStopped:
                break
            except Exception:
                pass
            time.sleep(1)

    threading.Thread(target=_health_loop, daemon=True, name='huey-health').start()

    return consumer


if __name__ == '__main__':
    import argparse
    import threading
    import webbrowser

    parser = argparse.ArgumentParser(description='MediaParser development server')
    parser.add_argument('--standalone', action='store_true',
                        help='Run Flask + Huey worker in a single process')
    parser.add_argument('--no-browser', action='store_true',
                        help='Do not auto-open browser (standalone mode only)')
    parser.add_argument('--port', type=int, default=5000,
                        help='Port to listen on (default: 5000)')
    parser.add_argument('--host', default='0.0.0.0',
                        help='Host to bind to (default: 0.0.0.0)')
    args = parser.parse_args()

    print(f"Starting MediaParser in {config_name} mode...")
    print(f"Database: {app.config['SQLALCHEMY_DATABASE_URI']}")
    print(f"Timezone: {app.config['TIMEZONE']}")
    print(f"Storage: {app.config['UPLOAD_FOLDER']}")

    if args.standalone:
        print("\n[Standalone] Starting embedded Huey consumer...")
        consumer = start_embedded_consumer()
        app.config['STANDALONE_CONSUMER'] = consumer
        print("[Standalone] Huey consumer threads started")

        if not args.no_browser:
            def _open_browser():
                import time
                time.sleep(1.5)
                webbrowser.open(f'http://localhost:{args.port}')
            threading.Thread(target=_open_browser, daemon=True).start()

        # Disable reloader — Werkzeug's reloader forks a child process which
        # would duplicate the consumer threads. Hot-reload is still available
        # via the normal two-process flow (run.py + run_worker.py).
        app.run(
            host=args.host,
            port=args.port,
            debug=False,
            use_reloader=False,
        )
    else:
        app.run(
            host=args.host,
            port=args.port,
            debug=app.config.get('DEBUG', False),
            threaded=True,
        )
