FROM python:3.12-slim

# System dependencies for exiftool, ffmpeg, and python-magic
RUN apt-get update && apt-get install -y --no-install-recommends \
    exiftool \
    ffmpeg \
    libmagic1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Configurable UID/GID for NAS permission compatibility
ARG APP_UID=1000
ARG APP_GID=1000

RUN groupadd -g ${APP_GID} mediaparser \
    && useradd -u ${APP_UID} -g mediaparser -m -s /bin/bash mediaparser

WORKDIR /app

# Default to production mode (can be overridden in docker-compose or .env)
ENV FLASK_ENV=production

# Install Python dependencies (cached layer)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt gunicorn>=22.0.0

# Copy application code
COPY . .

# Create directories that may be mounted as volumes
RUN mkdir -p instance storage logs \
    && chown -R mediaparser:mediaparser /app

# Entrypoint handles migrations before starting the service
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

USER mediaparser

EXPOSE 5000

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["gunicorn", "-w", "2", "-b", "0.0.0.0:5000", "run:app"]
