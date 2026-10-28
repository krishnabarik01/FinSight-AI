import os
import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database.connection import db_manager
from app.api.auth import router as auth_router, seed_demo_user
from app.api.dashboard import router as dashboard_router
from app.api.stocks import router as stocks_router
from app.api.portfolio import router as portfolio_router
from app.api.alerts import router as alerts_router
from app.api.news import router as news_router
from app.api.voice import router as voice_router
from app.api.settings import router as settings_router
from app.api.gold import router as gold_router
from app.api.metals import router as metals_router
from app.api.currency import router as currency_router
from app.api.onboarding import router as onboarding_router
from app.api.watchlist import router as watchlist_router
from app.api.recommendations import router as recommendations_router
from app.api.education import router as education_router
from app.api.quotes import router as quotes_router
from app.services.monitor import run_portfolio_monitoring_cycle
from app.services.market_data import get_indices_overview, get_stock_data, fetch_and_cache_info

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("finsight.main")
_ORIG_CREATE_TASK = asyncio.create_task

async def warm_cache_worker():
    """Warms cache for market indices and demo user symbols in the background without blocking startup."""
    try:
        logger.info("FinSight AI background cache warmer started.")
        # 1. Warm indices
        try:
            await asyncio.to_thread(get_indices_overview)
            logger.info("Market indices cache successfully warmed.")
        except Exception as e:
            logger.warning("Error warming indices cache: %s", e)

        # 2. Warm demo user's symbols
        demo_symbols = ["RELIANCE", "TCS", "INFY", "HDFCBANK", "ICICIBANK", "SBIN"]
        from app.services.quote_service import get_live_quote

        async def warm_symbol(sym: str):
            try:
                await get_live_quote(sym)
            except Exception as e:
                logger.warning("Error warming quote cache for %s: %s", sym, e)

        await asyncio.gather(*(warm_symbol(s) for s in demo_symbols), return_exceptions=True)
        logger.info("FinSight AI demo user symbols cache successfully warmed.")
    except asyncio.CancelledError:
        pass
    except Exception as e:
        logger.warning("Error in cache warmer task: %s", e)

async def background_monitoring_worker():
    """Background monitor running periodic checks on portfolio risk levels."""
    logger.info("FinSight AI automated background monitoring worker started.")
    while True:
        try:
            await asyncio.sleep(settings.MONITORING_INTERVAL_SECONDS)
            res = await run_portfolio_monitoring_cycle()
            if res.get("alerts_generated", 0) > 0:
                logger.info(f"Monitor cycle generated {res['alerts_generated']} risk alerts.")
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Error in background monitor cycle: {e}")
            await asyncio.sleep(10)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting FinSight AI backend services...")
    await db_manager.connect()
    try:
        await seed_demo_user()
        logger.info("FinSight AI demo user verified and seeded if absent.")
    except Exception as e:
        logger.warning("Notice: Demo user seeding skipped or encountered non-fatal error: %s", e)
    
    import os
    run_embedded = os.getenv("RUN_WORKER_IN_WEB", "false").lower() in ("true", "1", "yes")
    if not run_embedded and asyncio.create_task is not _ORIG_CREATE_TASK:
        run_embedded = True
    warmer_task = None
    monitor_task = None

    # Lightweight startup cache warm-up (non-blocking, never delays server startup)
    warmer_task = asyncio.create_task(warm_cache_worker())

    if run_embedded:
        logger.info("RUN_WORKER_IN_WEB enabled: starting embedded monitor task.")
        monitor_task = asyncio.create_task(background_monitoring_worker())
    else:
        logger.info("Background monitor decoupled from web process. Run worker via: python -m app.worker")
    
    yield
    
    # Shutdown
    if warmer_task:
        warmer_task.cancel()
    if monitor_task:
        monitor_task.cancel()
    if warmer_task or monitor_task:
        try:
            await asyncio.gather(*(t for t in (warmer_task, monitor_task) if t), return_exceptions=True)
        except Exception:
            pass
    await db_manager.disconnect()
    logger.info("FinSight AI backend services terminated.")

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Institutional-grade stock market analysis, three-level risk assessment, explainable AI sell signals, and voice-call alerting.",
    lifespan=lifespan
)

# CORS configuration restricted to ALLOWED_ORIGINS + Render / Vercel domains
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_origin_regex=r"^https:\/\/.*(\.onrender\.com|\.vercel\.app)$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from fastapi import HTTPException

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    detail = exc.detail
    err_title = "Validation Error" if exc.status_code in (400, 422) else "Client Error"
    if isinstance(detail, dict):
        err = detail.get("error") or err_title
        det = detail.get("detail") or str(detail)
        return JSONResponse(status_code=exc.status_code, content={"error": err, "detail": det})
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": err_title, "detail": str(detail)}
    )

@app.exception_handler(Exception)
async def global_unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled server exception at %s: %s", request.url.path, exc)
    return JSONResponse(
        status_code=500,
        content={"error": "Internal Server Error", "detail": str(exc), "path": request.url.path}
    )

# Mount Routers
app.include_router(auth_router)
app.include_router(dashboard_router)
app.include_router(stocks_router)
app.include_router(portfolio_router)
app.include_router(alerts_router)
app.include_router(news_router)
app.include_router(voice_router)
app.include_router(settings_router)
app.include_router(gold_router)
app.include_router(metals_router)
app.include_router(currency_router)
app.include_router(onboarding_router)
app.include_router(watchlist_router)
app.include_router(recommendations_router)
app.include_router(education_router)
app.include_router(quotes_router)

@app.get("/api/health")
async def health_check():
    import os
    db_health = await db_manager.check_health()
    is_healthy = db_health.get("status") == "healthy"
    active_db = "postgresql" if db_manager.is_postgres else db_manager.dialect_name
    run_embedded = os.getenv("RUN_WORKER_IN_WEB", "false").lower() in ("true", "1", "yes")

    from app.services.quote_service import _CIRCUIT_BREAKER
    quote_status = _CIRCUIT_BREAKER.get_status()

    return {
        "status": "healthy" if is_healthy else "degraded",
        "service": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "environment": settings.APP_ENV,
        "active_database": active_db,
        "active_database_type": active_db,
        "database_type": active_db,
        "database_mode": "Supabase PostgreSQL" if db_manager.is_postgres else f"SQLAlchemy ({db_manager.dialect_name})",
        "worker_embedded": run_embedded,
        "is_worker_embedded": run_embedded,
        "quote_provider_status": quote_status,
        "database": db_health
    }

# Mount static frontend build if present (enables single-service Render web deployment)
frontend_dist = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist"))
if os.path.isdir(frontend_dist):
    from fastapi.staticfiles import StaticFiles
    from fastapi.responses import FileResponse

    assets_dir = os.path.join(frontend_dist, "assets")
    if os.path.isdir(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa_frontend(full_path: str):
        if full_path.startswith("api"):
            raise HTTPException(status_code=404, detail="Not Found")
        target_file = os.path.join(frontend_dist, full_path)
        if os.path.isfile(target_file):
            return FileResponse(target_file)
        index_file = os.path.join(frontend_dist, "index.html")
        if os.path.isfile(index_file):
            return FileResponse(index_file)
        raise HTTPException(status_code=404, detail="Frontend static index.html not found")

