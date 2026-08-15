import asyncio

from app.config import settings
from app.services.storage_service import StorageService

async def init_storage():
    print("Initializing MinIO storage subsets...")
    service = StorageService()
    service._ensure_bucket(settings.MINIO_BUCKET_REPORTS)
    service._ensure_bucket(settings.MINIO_BUCKET_FACES)
    print(f"Buckets ensured: {settings.MINIO_BUCKET_REPORTS}, {settings.MINIO_BUCKET_FACES}")
    print("Storage initialized successfully.")

if __name__ == "__main__":
    asyncio.run(init_storage())
