import time
import asyncio
import logging
import json
from typing import Any, Optional, Callable, Awaitable, Dict
from app.config import settings

logger = logging.getLogger("finsight.cache")

class InMemoryCache:
    def __init__(self):
        self._store: Dict[str, tuple[Any, float]] = {}
        self._locks: Dict[str, asyncio.Lock] = {}
        self._global_lock = asyncio.Lock()

    def _get_lock(self, key: str) -> asyncio.Lock:
        if key not in self._locks:
            self._locks[key] = asyncio.Lock()
        return self._locks[key]

    async def get(self, key: str) -> Optional[Any]:
        if key in self._store:
            val, expiry = self._store[key]
            if time.time() < expiry:
                return val
            else:
                del self._store[key]
        return None

    def get_sync(self, key: str) -> Optional[Any]:
        if key in self._store:
            val, expiry = self._store[key]
            if time.time() < expiry:
                return val
            else:
                del self._store[key]
        return None

    async def set(self, key: str, value: Any, ttl_seconds: int = 300) -> None:
        expiry = time.time() + ttl_seconds
        self._store[key] = (value, expiry)

    def set_sync(self, key: str, value: Any, ttl_seconds: int = 300) -> None:
        expiry = time.time() + ttl_seconds
        self._store[key] = (value, expiry)

    async def delete(self, key: str) -> None:
        self._store.pop(key, None)

    async def get_or_set(self, key: str, fetch_coro: Callable[[], Awaitable[Any]], ttl_seconds: int = 300) -> Any:
        cached = await self.get(key)
        if cached is not None:
            return cached

        lock = self._get_lock(key)
        async with lock:
            # Double-check inside lock
            cached = await self.get(key)
            if cached is not None:
                return cached
            val = await fetch_coro()
            if val is not None:
                await self.set(key, val, ttl_seconds=ttl_seconds)
            return val


class CacheService:
    def __init__(self):
        self._in_memory = InMemoryCache()
        self._redis_client = None
        self._redis_available = False
        self._init_redis()

    def _init_redis(self):
        if settings.REDIS_URL:
            try:
                import redis
                self._redis_client = redis.Redis.from_url(settings.REDIS_URL, decode_responses=True)
                self._redis_client.ping()
                self._redis_available = True
                logger.info("Connected to Redis cache at %s", settings.REDIS_URL)
            except Exception as e:
                logger.warning("Redis configured at %s but not reachable: %s. Using in-memory cache.", settings.REDIS_URL, e)
                self._redis_available = False

    async def get(self, key: str) -> Optional[Any]:
        if self._redis_available and self._redis_client:
            try:
                raw = await asyncio.to_thread(self._redis_client.get, key)
                if raw is not None:
                    return json.loads(raw)
            except Exception as e:
                logger.warning("Redis get error for %s: %e. Falling back to in-memory.", key, e)
        return await self._in_memory.get(key)

    def get_sync(self, key: str) -> Optional[Any]:
        if self._redis_available and self._redis_client:
            try:
                raw = self._redis_client.get(key)
                if raw is not None:
                    return json.loads(raw)
            except Exception:
                pass
        return self._in_memory.get_sync(key)

    async def set(self, key: str, value: Any, ttl_seconds: int = 300) -> None:
        if self._redis_available and self._redis_client:
            try:
                raw = json.dumps(value)
                await asyncio.to_thread(self._redis_client.setex, key, ttl_seconds, raw)
            except Exception as e:
                logger.warning("Redis set error for %s: %s", key, e)
        await self._in_memory.set(key, value, ttl_seconds=ttl_seconds)

    def set_sync(self, key: str, value: Any, ttl_seconds: int = 300) -> None:
        if self._redis_available and self._redis_client:
            try:
                raw = json.dumps(value)
                self._redis_client.setex(key, ttl_seconds, raw)
            except Exception:
                pass
        self._in_memory.set_sync(key, value, ttl_seconds=ttl_seconds)

    async def delete(self, key: str) -> None:
        if self._redis_available and self._redis_client:
            try:
                await asyncio.to_thread(self._redis_client.delete, key)
            except Exception:
                pass
        await self._in_memory.delete(key)

    async def get_or_set(self, key: str, fetch_coro: Callable[[], Awaitable[Any]], ttl_seconds: int = 300) -> Any:
        return await self._in_memory.get_or_set(key, fetch_coro, ttl_seconds=ttl_seconds)

cache_service = CacheService()
