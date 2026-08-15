import redis.asyncio as aioredis

from app.config import settings

_FR_CONFIG_HASH = "fr_config"


class FRConfigService:
    def __init__(self, redis_client: aioredis.Redis) -> None:
        self._redis = redis_client

    async def get_similarity_threshold(self) -> float:
        value = await self._redis.hget(_FR_CONFIG_HASH, "similarity_threshold")
        return float(value) if value is not None else settings.FACE_SIMILARITY_THRESHOLD

    async def get_liveness_threshold(self) -> float:
        value = await self._redis.hget(_FR_CONFIG_HASH, "liveness_threshold")
        return float(value) if value is not None else settings.FR_LIVENESS_THRESHOLD

    async def get_liveness_enabled(self) -> bool:
        value = await self._redis.hget(_FR_CONFIG_HASH, "liveness_enabled")
        if value is not None:
            return value.lower() == "true"
        return settings.FR_LIVENESS_ENABLED

    async def get_all(self) -> dict[str, float | bool]:
        return {
            "similarity_threshold": await self.get_similarity_threshold(),
            "liveness_threshold": await self.get_liveness_threshold(),
            "liveness_enabled": await self.get_liveness_enabled(),
        }

    async def update(
        self,
        similarity_threshold: float | None = None,
        liveness_threshold: float | None = None,
        liveness_enabled: bool | None = None,
    ) -> None:
        mapping: dict[str, str] = {}
        if similarity_threshold is not None:
            mapping["similarity_threshold"] = str(similarity_threshold)
        if liveness_threshold is not None:
            mapping["liveness_threshold"] = str(liveness_threshold)
        if liveness_enabled is not None:
            mapping["liveness_enabled"] = str(liveness_enabled)
        if mapping:
            await self._redis.hset(_FR_CONFIG_HASH, mapping=mapping)
