"""Caching utilities for the poolDRV API."""

import json
from typing import Any

import redis.asyncio as redis

from api.core.config import settings
from api.core.logging import get_logger

logger = get_logger(__name__)


class CacheService:
    """Service for caching frequently accessed data."""

    def __init__(self):
        self.redis_client: redis.Redis | None = None
        self.default_ttl = 3600  # 1 hour default TTL

    async def _get_redis(self) -> redis.Redis:
        """Get or create Redis connection."""
        if not self.redis_client:
            # redis.asyncio.from_url returns a client synchronously in redis-py >= 5
            self.redis_client = redis.from_url(
                settings.redis_url,
                encoding="utf-8",
                decode_responses=True,
            )
        return self.redis_client

    async def get(self, key: str) -> Any | None:
        """Get a value from cache.

        Args:
            key: Cache key

        Returns:
            Cached value or None if not found
        """
        try:
            redis_client = await self._get_redis()
            value = await redis_client.get(f"cache:{key}")

            if value:
                logger.debug(f"Cache hit for key: {key}")
                return json.loads(value)

            logger.debug(f"Cache miss for key: {key}")
            return None

        except Exception as e:
            logger.error(f"Cache get error for key {key}: {str(e)}")
            return None

    async def set(
        self,
        key: str,
        value: Any,
        ttl: int | None = None,
    ) -> bool:
        """Set a value in cache.

        Args:
            key: Cache key
            value: Value to cache
            ttl: Time to live in seconds

        Returns:
            True if successful
        """
        try:
            redis_client = await self._get_redis()
            serialized = json.dumps(value)

            await redis_client.set(
                f"cache:{key}",
                serialized,
                ex=ttl or self.default_ttl,
            )

            logger.debug(f"Cached value for key: {key} (TTL: {ttl or self.default_ttl}s)")
            return True

        except Exception as e:
            logger.error(f"Cache set error for key {key}: {str(e)}")
            return False

    async def delete(self, key: str) -> bool:
        """Delete a value from cache.

        Args:
            key: Cache key

        Returns:
            True if deleted
        """
        try:
            redis_client = await self._get_redis()
            result = await redis_client.delete(f"cache:{key}")

            if result:
                logger.debug(f"Deleted cache key: {key}")

            return bool(result)

        except Exception as e:
            logger.error(f"Cache delete error for key {key}: {str(e)}")
            return False

    async def clear_pattern(self, pattern: str) -> int:
        """Clear all cache keys matching a pattern.

        Args:
            pattern: Pattern to match (e.g., "template:*")

        Returns:
            Number of keys deleted
        """
        try:
            redis_client = await self._get_redis()
            keys = []

            async for key in redis_client.scan_iter(f"cache:{pattern}"):
                keys.append(key)

            if keys:
                deleted = await redis_client.delete(*keys)
                logger.info(f"Cleared {deleted} cache keys matching pattern: {pattern}")
                return deleted

            return 0

        except Exception as e:
            logger.error(f"Cache clear pattern error for {pattern}: {str(e)}")
            return 0

    async def get_or_set(
        self,
        key: str,
        fetch_func,
        ttl: int | None = None,
    ) -> Any:
        """Get from cache or fetch and cache if not found.

        Args:
            key: Cache key
            fetch_func: Async function to fetch value if not cached
            ttl: Time to live in seconds

        Returns:
            Cached or fetched value
        """
        # Try to get from cache
        cached = await self.get(key)
        if cached is not None:
            return cached

        # Fetch and cache
        value = await fetch_func()
        if value is not None:
            await self.set(key, value, ttl)

        return value

    async def close(self):
        """Close Redis connection."""
        if self.redis_client:
            await self.redis_client.close()
            self.redis_client = None


# Global cache instance
cache = CacheService()


class TemplateCacheService:
    """Specialized cache service for folder templates."""

    def __init__(self):
        self.cache = CacheService()
        self.ttl = 7200  # 2 hours for templates

    async def get_template(self, template_id: int) -> dict | None:
        """Get template from cache.

        Args:
            template_id: Template ID

        Returns:
            Cached template or None
        """
        return await self.cache.get(f"template:{template_id}")

    async def set_template(self, template_id: int, template_data: dict) -> bool:
        """Cache a template.

        Args:
            template_id: Template ID
            template_data: Template data

        Returns:
            True if successful
        """
        return await self.cache.set(
            f"template:{template_id}",
            template_data,
            self.ttl,
        )

    async def invalidate_template(self, template_id: int) -> bool:
        """Invalidate a cached template.

        Args:
            template_id: Template ID

        Returns:
            True if deleted
        """
        return await self.cache.delete(f"template:{template_id}")

    async def invalidate_all_templates(self) -> int:
        """Invalidate all cached templates.

        Returns:
            Number of templates invalidated
        """
        return await self.cache.clear_pattern("template:*")
