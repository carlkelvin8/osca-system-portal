import io
from typing import Any

import boto3
import structlog
from botocore.client import Config
from botocore.exceptions import ClientError

from app.config import settings

logger = structlog.get_logger(__name__)


class StorageService:
    def __init__(self) -> None:
        self._scheme = "https" if settings.MINIO_SECURE else "http"
        self._client = boto3.client(
            "s3",
            endpoint_url=f"{self._scheme}://{settings.MINIO_ENDPOINT}",
            aws_access_key_id=settings.MINIO_ACCESS_KEY,
            aws_secret_access_key=settings.MINIO_SECRET_KEY,
            config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
            region_name="us-east-1",
        )

    def _ensure_bucket(self, bucket: str) -> None:
        try:
            self._client.head_bucket(Bucket=bucket)
        except ClientError:
            self._client.create_bucket(Bucket=bucket)
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
                pass
            logger.info("bucket_created", bucket=bucket)

    async def upload_bytes(
        self,
        bucket: str,
        key: str,
        data: bytes,
        content_type: str = "application/octet-stream",
    ) -> str:
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
        key = f"barcodes/{barcode_value}.png"
        return await self.upload_bytes(
            bucket=settings.MINIO_BUCKET_REPORTS,
            key=key,
            data=png_bytes,
            content_type="image/png",
        )

    async def upload_qr_image(self, qr_value: str, png_bytes: bytes) -> str:
        key = f"qrcodes/{qr_value}.png"
        return await self.upload_bytes(
            bucket=settings.MINIO_BUCKET_REPORTS,
            key=key,
            data=png_bytes,
            content_type="image/png",
        )

    async def upload_report(self, filename: str, data: bytes, content_type: str) -> str:
        key = f"reports/{filename}"
        return await self.upload_bytes(
            bucket=settings.MINIO_BUCKET_REPORTS,
            key=key,
            data=data,
            content_type=content_type,
        )

    def get_presigned_url(self, bucket: str, key: str, expires_in: int = 3600) -> str:
        if self._scheme != "https" and settings.MINIO_PUBLIC_ENDPOINT == settings.MINIO_ENDPOINT:
            return self._client.generate_presigned_url(
                "get_object",
                Params={"Bucket": bucket, "Key": key},
                ExpiresIn=expires_in,
            )

        public_client = boto3.client(
            "s3",
            endpoint_url=f"{self._scheme}://{settings.MINIO_PUBLIC_ENDPOINT}",
            aws_access_key_id=settings.MINIO_ACCESS_KEY,
            aws_secret_access_key=settings.MINIO_SECRET_KEY,
            config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
            region_name="us-east-1",
        )
        return public_client.generate_presigned_url(
            "get_object",
            Params={"Bucket": bucket, "Key": key},
            ExpiresIn=expires_in,
        )

    async def delete_object(self, bucket: str, key: str) -> None:
        self._client.delete_object(Bucket=bucket, Key=key)
        logger.info("storage_deleted", bucket=bucket, key=key)

    async def delete_face_images(self, user_id: str, image_keys: list[str]) -> None:
        for key in image_keys:
            await self.delete_object(settings.MINIO_BUCKET_FACES, key)
        logger.info("face_images_purged", user_id=user_id, count=len(image_keys))

    async def upload_profile_picture(self, user_id: str, image_bytes: bytes, content_type: str = "image/jpeg") -> str:
        ext = "jpg" if "jpeg" in content_type or "jpg" in content_type else "png"
        key = f"profiles/{user_id}/avatar.{ext}"
        return await self.upload_bytes(
            bucket=settings.MINIO_BUCKET_PROFILES,
            key=key,
            data=image_bytes,
            content_type=content_type,
        )

    async def delete_profile_picture(self, user_id: str) -> None:
        for ext in ("jpg", "png"):
            key = f"profiles/{user_id}/avatar.{ext}"
            await self.delete_object(settings.MINIO_BUCKET_PROFILES, key)

    def get_profile_picture_url(self, user_id: str) -> str | None:
        for ext in ("jpg", "png", "webp"):
            key = f"profiles/{user_id}/avatar.{ext}"
            try:
                self._client.head_object(Bucket=settings.MINIO_BUCKET_PROFILES, Key=key)
                return self.get_presigned_url(settings.MINIO_BUCKET_PROFILES, key, expires_in=3600)
            except ClientError:
                continue
        return None

    def resolve_profile_picture_url(self, stored_value: str | None) -> str | None:
        if not stored_value:
            return None

        if stored_value.startswith("http"):
            try:
                from urllib.parse import urlparse
                parsed = urlparse(stored_value)
                path = parsed.path.lstrip("/")
                bucket_prefix = settings.MINIO_BUCKET_PROFILES + "/"
                if path.startswith(bucket_prefix):
                    key = path[len(bucket_prefix):]
                else:
                    return None
            except Exception:
                return None
        else:
            key = stored_value

        try:
            return self.get_presigned_url(settings.MINIO_BUCKET_PROFILES, key, expires_in=3600)
        except Exception:
            return None

    def resolve_venue_image_url(self, stored_value: str | None) -> str | None:
        if not stored_value:
            return None

        if stored_value.startswith("http"):
            try:
                from urllib.parse import urlparse
                parsed = urlparse(stored_value)
                path = parsed.path.lstrip("/")
                bucket_prefix = settings.MINIO_BUCKET_REPORTS + "/"
                if not path.startswith(bucket_prefix):
                    return None
                key = path[len(bucket_prefix):]
            except Exception:
                return None
        else:
            key = stored_value

        try:
            return self.get_presigned_url(settings.MINIO_BUCKET_REPORTS, key, expires_in=3600)
        except Exception:
            return None

    def resolve_face_image_url(self, minio_keys: str | None) -> str | None:
        if not minio_keys:
            return None

        first_key = minio_keys.split(",")[0].strip()
        if not first_key:
            return None

        try:
            return self.get_presigned_url(settings.MINIO_BUCKET_FACES, first_key, expires_in=3600)
        except Exception:
            return None
