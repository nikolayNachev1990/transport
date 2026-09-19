# doc-service — Python (SPEC-doc-service.md). Build context is the repo
# root just like every other service's Dockerfile, though this one
# doesn't need core/Events/langs (see the spec's §0/§7 for why doc-service
# stays decoupled from the Node package tree entirely).

FROM python:3.12-slim-bookworm AS base
WORKDIR /usr/app
# The source dir is bind-mounted in development; bytecode written by the
# (root) container would end up root-owned on the host.
ENV PYTHONDONTWRITEBYTECODE=1
# tesseract would otherwise spawn a thread per core inside every worker; with
# several workers that oversubscribes the CPU and makes each OCR pass slower.
ENV OMP_THREAD_LIMIT=1
# curl: docker-compose's healthcheck for this service runs `curl` inside
# the container, same as every Node service here.
# tesseract + language packs: Level-1 OCR (SPEC-doc-service.md §4.1).
# antiword/catdoc: legacy .doc files. Language list = the languages of the
# documents this business actually sees (BG/EU carriers, plus Turkey/UA/RU).
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl tesseract-ocr \
    tesseract-ocr-bul tesseract-ocr-eng tesseract-ocr-deu tesseract-ocr-fra \
    tesseract-ocr-pol tesseract-ocr-ron tesseract-ocr-rus tesseract-ocr-ces \
    tesseract-ocr-hun tesseract-ocr-ita tesseract-ocr-spa tesseract-ocr-tur \
    tesseract-ocr-ukr antiword catdoc \
  && rm -rf /var/lib/apt/lists/*
COPY doc-service/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

FROM base AS development
RUN pip install --no-cache-dir watchdog pytest
COPY doc-service/. .
CMD ["watchmedo", "auto-restart", "--directory=./src", "--pattern=*.py", "--recursive", "--", "python", "-u", "src/main.py"]

FROM base AS production
COPY doc-service/. .
CMD ["python", "-u", "src/main.py"]
