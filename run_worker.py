#!/usr/bin/env python
"""
Launch Huey worker with optimized settings.

Usage:
    python run_worker.py
"""
import logging
import sys

# Configure logging before importing huey_config
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] %(levelname)s:%(name)s: %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
    stream=sys.stdout,
)

from huey.consumer_options import ConsumerConfig
from huey.consumer import Consumer
from huey_config import huey

if __name__ == '__main__':
    print("Starting Huey worker with optimized settings...", flush=True)
    print(f"  Workers: 2 threads", flush=True)
    print(f"  Polling: 50ms initial, 300ms max", flush=True)

    config = ConsumerConfig(
        workers=2,
        worker_type='thread',
        initial_delay=0.05,    # 50ms initial delay
        backoff=1.2,           # Backoff multiplier when idle
        max_delay=0.3,         # Max 300ms delay (polls 3x/sec minimum)
        check_worker_health=True,
        health_check_interval=10,
        verbose=True,          # Enable verbose logging
    )

    consumer = Consumer(huey, **config.values)
    consumer.run()
