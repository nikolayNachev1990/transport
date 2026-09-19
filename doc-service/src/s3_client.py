"""Direct, read-only S3/MinIO access — SPEC-doc-service.md §7. No hop
through upload-service: object storage is shared infrastructure, and the
exact key always arrives pre-computed on the event (`file_key`), so this
client never has to know upload-service's key-naming convention.
"""
import boto3
from botocore.config import Config

import config


def _client():
    return boto3.client(
        "s3",
        endpoint_url=config.S3_ENDPOINT,
        aws_access_key_id=config.S3_ACCESS_KEY,
        aws_secret_access_key=config.S3_SECRET_KEY,
        region_name=config.S3_REGION,
        config=Config(s3={"addressing_style": "path"} if config.S3_TYPE == "minio" else {}),
    )


def get_object_bytes(key: str) -> bytes:
    response = _client().get_object(Bucket=config.S3_BUCKET, Key=key)
    return response["Body"].read()
