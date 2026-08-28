FROM python:3.12-slim

# PYTHONHASHSEED=0 disables per-process string-hash randomisation. This
# system claims a reproducible audit root; any set iteration that reaches
# output would otherwise order differently on every host.
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 PYTHONHASHSEED=0
WORKDIR /app

# deps first so the layer caches across code changes
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY ledgerlens ./ledgerlens

EXPOSE 8000
# Render supplies $PORT; default keeps local `docker run` working unchanged
CMD ["sh", "-c", "uvicorn ledgerlens.api.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
