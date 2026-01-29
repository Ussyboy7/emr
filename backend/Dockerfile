FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# System deps for psycopg2, Pillow, etc.
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential libpq-dev curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /tmp/requirements.txt
RUN pip install --upgrade pip \
    && pip install --no-cache-dir -r /tmp/requirements.txt

# App source (docker-compose also bind-mounts ./backend:/app for local dev)
COPY . .

EXPOSE 8001

# Command is overridden by docker-compose.local.yml
CMD ["python", "manage.py", "runserver", "0.0.0.0:8001"]
