"""Env config, loaded once at import time — same fail-fast rule as every
other service in this repo (SPEC-fleet-service.md's "правило 8"): a
missing required var means the process refuses to start, not a runtime
surprise later. See SPEC-doc-service.md §2 for the full list and why
each one exists.
"""
import os
import sys


def _required(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        print(f"config: missing required env var {name}", file=sys.stderr)
        sys.exit(1)
    return value


def _optional(name: str, default: str) -> str:
    return os.environ.get(name) or default


KAFKA_BROKERS = [b.strip() for b in _required("KAFKA_BROKERS_HOSTS").split(",")]
KAFKA_GROUP_ID = _optional("DOC_KAFKA_GROUP_ID", "doc-1-client")

S3_TYPE = _optional("DOC_S3_TYPE", "minio")
S3_ACCESS_KEY = _required("DOC_S3_ACCESS_KEY")
S3_SECRET_KEY = _required("DOC_S3_SECRET_KEY")
S3_BUCKET = _required("S3_BUCKET")
S3_REGION = _optional("S3_REGION", "us-east-1")
S3_ENDPOINT = _required("S3_ENDPOINT_IN_DOCKER")

ANTHROPIC_API_KEY = _required("ANTHROPIC_API_KEY")
# Sonnet by default: on a labelled set Haiku got 77% of fields and 12/13 types,
# Sonnet 91% and 13/13 (tools/eval_ai.py). The stronger model is only called
# when an answer fails validation or disagrees with the local reading; set it
# to an empty value to disable escalation.
ANTHROPIC_MODEL = _optional("ANTHROPIC_MODEL", "claude-sonnet-5")
ANTHROPIC_MODEL_ESCALATION = os.environ.get("ANTHROPIC_MODEL_ESCALATION", "claude-opus-5")
AI_REQUEST_TIMEOUT_SECONDS = float(_optional("AI_REQUEST_TIMEOUT_SECONDS", "30"))
AI_MAX_RETRIES = int(_optional("AI_MAX_RETRIES", "2"))

APP_PORT = int(_optional("APP_PORT", "80"))

OCR_LANGUAGES = _optional("OCR_LANGUAGES", "bul+eng")

# Work queue (dispatcher.py). Workers are threads: OCR runs tesseract as a
# subprocess and the AI call is network I/O. Each worker can hold a decoded
# photo (~80 MB at most), so raise DOC_SERVICE_RAM_MAX with DOC_WORKERS.
WORKERS = int(_optional("DOC_WORKERS", "2"))
PER_COMPANY_MAX = int(_optional("DOC_PER_COMPANY_MAX", "2"))
MAX_BUFFER = int(_optional("DOC_MAX_BUFFER", "40"))
