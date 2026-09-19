# doc-service — Python (SPEC-doc-service.md). Build context is the repo
# root just like every other service's Dockerfile, though this one
# doesn't need core/Events/langs (see the spec's §0/§7 for why doc-service
# stays decoupled from the Node package tree entirely).

FROM python:3.12-slim-bookworm AS base
WORKDIR /usr/app
# curl: docker-compose's healthcheck for this service runs `curl` inside
# the container, same as every Node service here.
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/*
COPY doc-service/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

FROM base AS development
RUN pip install --no-cache-dir watchdog
COPY doc-service/. .
CMD ["watchmedo", "auto-restart", "--directory=./src", "--pattern=*.py", "--recursive", "--", "python", "-u", "src/main.py"]

FROM base AS production
COPY doc-service/. .
CMD ["python", "-u", "src/main.py"]
