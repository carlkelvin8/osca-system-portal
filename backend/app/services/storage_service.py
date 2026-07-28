"""
MinIO (S3-compatible) storage service.
Stores: face enrollment images, barcode images, QR code images, generated reports.
R.A. 10173 compliance: face images in private bucket, no public access.
"""
import io
from typing import Any

import boto3
import structlog
from botocore.client import Config
from botocore.exceptions import ClientError

from app.config import settings

logger = structlog.get_logger(__name__)


class StorageService:
    """Thin async-friendly wrapper around boto3 S3 client for MinIO."""

    def __init__(self) -> None:
        self._client = boto3.client(
            "s3",
            endpoint_url=f"{'https' if settings.MINIO_SECURE else 'http'}://{settings.MINIO_ENDPOINT}",
            aws_access_key_id=settings.MINIO_ACCESS_KEY,
            aws_secret_access_key=settings.MINIO_SECRET_KEY,
            config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
            region_name="us-east-1",  # Required but ignored by MinIO
        )

    def _ensure_bucket(self, bucket: str) -> None:
        """Create bucket if it doesn't exist (idempotent)."""
        try:
            self._client.head_bucket(Bucket=bucket)
        except ClientError:
            self._client.create_bucket(Bucket=bucket)
            # Block all public access (biometric data — R.A. 10173).
            # PutPublicAccessBlock is AWS S3-specific; MinIO ignores/rejects it
            # but MinIO buckets are private by default, so this is safe to skip.
            try:
                self._client.put_public_access_block(
                    Bucket=bucket,
                    PublicAccessBlockConfiguration={
                        "BlockPublicAcls": True,
                        "IgnorePublicAcls": True,
                        "BlockPublicPolicy": True,
                        "RestrictPublicBuckets": True,
                    },
                )
            except ClientError:
                pass  # MinIO does not support this API; bucket is private by default
            logger.info("bucket_created", bucket=bucket)

    async def upload_bytes(
        self,
        bucket: str,
        key: str,
        data: bytes,
        content_type: str = "application/octet-stream",
    ) -> str:
        """Upload bytes to MinIO. Returns the object key."""
        self._ensure_bucket(bucket)
        self._client.put_object(
            Bucket=bucket,
            Key=key,
            Body=data,
            ContentType=content_type,
        )
        logger.debug("storage_upload", bucket=bucket, key=key, size_bytes=len(data))
        return key

    async def upload_barcode_image(self, barcode_value: str, png_bytes: bytes) -> str:
        """Upload a Code-128 barcode PNG to MinIO."""
        key = f"barcodes/{barcode_value}.png"
        return await self.upload_bytes(
            bucket=settings.MINIO_BUCKET_REPORTS,
            key=key,
            data=png_bytes,
            content_type="image/png",
        )

    async def upload_qr_image(self, qr_value: str, png_bytes: bytes) -> str:
        """Upload a QR Code PNG to MinIO."""
        key = f"qrcodes/{qr_value}.png"
        return await self.upload_bytes(
            bucket=settings.MINIO_BUCKET_REPORTS,
            key=key,
            data=png_bytes,
            content_type="image/png",
        )

    async def upload_report(self, filename: str, data: bytes, content_type: str) -> str:
        """Upload a generated report (PDF/XLSX) to MinIO."""
        key = f"reports/{filename}"
        return await self.upload_bytes(
            bucket=settings.MINIO_BUCKET_REPORTS,
            key=key,
            data=data,
            content_type=content_type,
        )

    def get_presigned_url(self, bucket: str, key: str, expires_in: int = 3600) -> str:
        """Generate a pre-signed URL for temporary object access."""
        scheme = "https" if settings.MINIO_SECURE else "http"
        url = self._client.generate_presigned_url(
            "get_object",
            Params={"Bucket": bucket, "Key": key},
            ExpiresIn=expires_in,
        )
        # Replace internal Docker hostname with public-facing endpoint
        internal = f"{scheme}://{settings.MINIO_ENDPOINT}"
        public = f"{scheme}://{settings.MINIO_PUBLIC_ENDPOINT}"
        return url.replace(internal, public)

    async def delete_object(self, bucket: str, key: str) -> None:
        """Delete an object (e.g., purge face images after retention period)."""
        self._client.delete_object(Bucket=bucket, Key=key)
        logger.info("storage_deleted", bucket=bucket, key=key)

    async def delete_face_images(self, user_id: str, image_keys: list[str]) -> None:
        """
        Delete face enrollment images.
        Called by Celery task after FACE_IMAGE_RETENTION_DAYS (R.A. 10173).
        """
        for key in image_keys:
            await self.delete_object(settings.MINIO_BUCKET_FACES, key)
        logger.info("face_images_purged", user_id=user_id, count=len(image_keys))

    async def upload_profile_picture(self, user_id: str, image_bytes: bytes, content_type: str = "image/jpeg") -> str:
        """Upload a profile picture. Returns the object key."""
        ext = "jpg" if "jpeg" in content_type or "jpg" in content_type else "png"
        key = f"profiles/{user_id}/avatar.{ext}"
        return await self.upload_bytes(
            bucket=settings.MINIO_BUCKET_PROFILES,
            key=key,
            data=image_bytes,
            content_type=content_type,
        )

    async def delete_profile_picture(self, user_id: str) -> None:
        """Delete a user's profile picture (both jpg and png variants)."""
        for ext in ("jpg", "png"):
            key = f"profiles/{user_id}/avatar.{ext}"
            await self.delete_object(settings.MINIO_BUCKET_PROFILES, key)

    def get_profile_picture_url(self, user_id: str) -> str | None:
        """Generate a presigned URL for the user's profile picture."""
        for ext in ("jpg", "png", "webp"):
            key = f"profiles/{user_id}/avatar.{ext}"
            try:
                self._client.head_object(Bucket=settings.MINIO_BUCKET_PROFILES, Key=key)
                return self.get_presigned_url(settings.MINIO_BUCKET_PROFILES, key, expires_in=3600)
            except ClientError:
                continue
        return None

    def resolve_profile_picture_url(self, stored_value: str | None) -> str | None:
        """Resolve a stored profile picture value to a fresh presigned URL.

        Accepts either:
        - A MinIO object key (e.g. 'profiles/{id}/avatar.jpg')
        - An old presigned URL (legacy, extracts key from URL)
        - None
        """
        if not stored_value:
            return None

        # If it looks like a URL (legacy presigned URL), extract the key
        if stored_value.startswith("http"):
            try:
                # URLs look like: http://minio:9000/bucket/key?params...
                # Extract everything after the bucket prefix
                from urllib.parse import urlparse
                parsed = urlparse(stored_value)
                path = parsed.path.lstrip("/")
                # path = "osca-profile-pictures/profiles/{id}/avatar.jpg"
                # Strip the bucket prefix
                bucket_prefix = settings.MINIO_BUCKET_PROFILES + "/"
                if path.startswith(bucket_prefix):
                    key = path[len(bucket_prefix):]
                else:
                    return None
            except Exception:
                return None
        else:
            key = stored_value

        # Generate a fresh presigned URL
        try:
            return self.get_presigned_url(settings.MINIO_BUCKET_PROFILES, key, expires_in=3600)
        except Exception:
            return None

    def resolve_face_image_url(self, minio_keys: str | None) -> str | None:
        """Resolve stored face image keys to a presigned URL for the first image.

        Accepts the comma-separated minio_image_keys string from FaceEmbedding.
        Returns a presigned URL for the first (primary) face image.
        """
        if not minio_keys:
            return None

        first_key = minio_keys.split(",")[0].strip()
        if not first_key:
            return None

        try:
            return self.get_presigned_url(settings.MINIO_BUCKET_FACES, first_key, expires_in=3600)
        except Exception:
            return None
