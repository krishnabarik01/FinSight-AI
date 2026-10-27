"""
FinSight AI — Dedicated Background Worker Process
Usage: python -m app.worker
Decoupled from web server processes to prevent alert duplication across multi-worker deployments.
Executes:
1. Cache warmer for market indices & core watchlist assets.
2. Continuous portfolio monitoring cycle with configurable intervals.
"""

import asyncio
import logging
import signal
import sys
from app.config import settings
from app.database.connection import db_manager
from app.services.market_data import get_indices_overview, get_stock_data, fetch_and_cache_info
from app.services.monitor import run_portfolio_monitoring_cycle

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [FinSightWorker] %(message)s"
)
logger = logging.getLogger("finsight.worker")

async def warm_cache_worker():
    """Warms cache for market indices and core Indian market benchmarks."""
    try:
        logger.info("FinSight AI background cache warmer started.")
        await asyncio.to_thread(get_indices_overview)
        logger.info("Market indices cache successfully warmed.")

        demo_symbols = ["RELIANCE.NS", "TCS.NS", "INFY.NS", "HDFCBANK.NS", "ICICIBANK.NS", "SBIN.NS"]
        sem = asyncio.Semaphore(5)

        async def warm_symbol(sym: str):
            async with sem:
                try:
                    await asyncio.to_thread(get_stock_data, sym)
                    await asyncio.to_thread(fetch_and_cache_info, sym)
                except Exception as e:
                    logger.warning("Error warming cache for %s: %s", sym, e)

        await asyncio.gather(*(warm_symbol(s) for s in demo_symbols))
        logger.info("Core symbols cache successfully warmed.")
    except asyncio.CancelledError:
        pass
    except Exception as e:
        logger.warning("Error in cache warmer task: %s", e)

async def background_monitoring_worker():
    """Background monitor running periodic checks on portfolio risk levels."""
    logger.info("FinSight AI automated background monitoring worker started.")
    interval = settings.MONITORING_INTERVAL_SECONDS
    logger.info("Monitoring loop configured with %ds interval.", interval)

    while True:
        try:
            res = await run_portfolio_monitoring_cycle()
            alerts_count = res.get("alerts_generated", 0) if isinstance(res, dict) else len(res or [])
            if alerts_count > 0:
                logger.info("Monitor cycle generated %d risk alerts.", alerts_count)
            else:
                logger.debug("Monitor cycle completed: 0 alerts generated.")
            await asyncio.sleep(interval)
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error("Error in background monitor cycle: %s", e)
            await asyncio.sleep(10)

async def main():
    logger.info("Starting FinSight AI standalone worker process...")
    await db_manager.connect()

    # Initial cache warming
    warmer_task = asyncio.create_task(warm_cache_worker())

    # Continuous monitoring loop
    monitor_task = asyncio.create_task(background_monitoring_worker())

    stop_event = asyncio.Event()

    def _signal_handler():
        logger.info("Received termination signal. Shutting down worker...")
        stop_event.set()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, _signal_handler)
        except NotImplementedError:
            # Signal handling on Windows
            pass

    try:
        await stop_event.wait()
    except (KeyboardInterrupt, SystemExit):
        pass
    finally:
        warmer_task.cancel()
        monitor_task.cancel()
        await asyncio.gather(warmer_task, monitor_task, return_exceptions=True)
        await db_manager.disconnect()
        logger.info("FinSight AI worker process stopped gracefully.")

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, SystemExit):
        sys.exit(0)
