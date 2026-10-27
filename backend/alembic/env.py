import asyncio
import os
import sys
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config, create_async_engine

from alembic import context

# Ensure backend root is on sys.path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from app.config import settings
from app.database.models import Base

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Model metadata object for autogenerate support
target_metadata = Base.metadata

def get_database_url() -> str:
    return settings.get_async_database_url()

def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    url = get_database_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()

def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True
    )

    with context.begin_transaction():
        context.run_migrations()

async def run_async_migrations() -> None:
    """Run migrations in 'online' mode with async engine."""
    async_url = get_database_url()
    connect_args = {}

    if "postgresql" in async_url:
        if settings.is_supabase_pooler():
            connect_args["statement_cache_size"] = 0
        if "supabase.co" in async_url or "pooler.supabase.com" in async_url:
            if "ssl" not in connect_args and "ssl=" not in async_url:
                connect_args["ssl"] = "require"
    elif "sqlite" in async_url:
        connect_args["check_same_thread"] = False

    connectable = create_async_engine(
        async_url,
        poolclass=pool.NullPool,
        connect_args=connect_args
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()

def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    asyncio.run(run_async_migrations())

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
