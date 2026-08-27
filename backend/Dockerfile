FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /app

# deps first so the layer caches across code changes
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY ledgerlens ./ledgerlens

EXPOSE 8000
# Render supplies $PORT; default keeps local `docker run` working unchanged
CMD ["sh", "-c", "uvicorn ledgerlens.api.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
