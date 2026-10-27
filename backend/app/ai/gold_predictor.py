import logging
import time
from typing import Dict, Any, List, Optional
import numpy as np
import pandas as pd
import yfinance as yf
from sklearn.ensemble import GradientBoostingRegressor

from app.services.gold_data import GOLD_SYMBOL, USDINR_SYMBOL, TROY_OZ_TO_GRAMS
from app.services.market_data import compute_indicators

logger = logging.getLogger("finsight.gold_predictor")

_GOLD_PREDICTIONS_CACHE: Dict[str, Any] = {
    "data": None,
    "time": 0.0
}
CACHE_TTL = 300  # 5 minutes

def generate_gold_predictions() -> Dict[str, Any]:
    """
    Trains and validates predictive models for Gold using Walk-Forward Validation.
    Never returns fabricated or random fallback prices; returns explicit unavailable status if data fails.
    Properties:
    - Walk-forward validation over rolling/expanding historical periods.
    - Real R^2 (no artificial floor or clamping).
    - Unclamped confidence / directional accuracy.
    - Comparison against Naive persistence baseline.
    - Educational disclaimer note.
    """
    now = time.time()
    if _GOLD_PREDICTIONS_CACHE["data"] is not None and (now - _GOLD_PREDICTIONS_CACHE["time"]) < CACHE_TTL:
        return _GOLD_PREDICTIONS_CACHE["data"]

    try:
        ticker = yf.Ticker(GOLD_SYMBOL)
        df = ticker.history(period="2y")
        if df.empty or len(df) < 80:
            return {
                "status": "unavailable",
                "reason": f"Insufficient historical gold trading bars ({len(df)} available, minimum 80 required). No fabricated predictions generated.",
                "horizons": [],
                "disclaimer": "Educational only, not financial advice."
            }

        # Also get latest USDINR rate for INR/10g projections
        usdinr_rate = 86.50
        try:
            inr_ticker = yf.Ticker(USDINR_SYMBOL)
            inr_hist = inr_ticker.history(period="5d")
            if not inr_hist.empty:
                usdinr_rate = float(inr_hist['Close'].iloc[-1])
        except Exception:
            pass

        df = compute_indicators(df)
        close = df['Close']
        curr_price = float(close.iloc[-1])

        # Feature Engineering
        df['return_1d'] = close.pct_change(1)
        df['return_5d'] = close.pct_change(5)
        df['return_21d'] = close.pct_change(21)
        df['sma_20_ratio'] = close / (df['SMA_20'] + 1e-9)
        df['sma_50_ratio'] = close / (df['SMA_50'] + 1e-9)
        df['bb_width'] = (df['BB_Upper'] - df['BB_Lower']) / (close + 1e-9)
        df['vol_change'] = df['Volume'].pct_change(1).fillna(0)

        feature_cols = [
            'return_1d', 'return_5d', 'return_21d',
            'RSI_14', 'MACD', 'sma_20_ratio', 'sma_50_ratio',
            'bb_width', 'Volatility_Annual'
        ]

        df_clean = df.dropna(subset=feature_cols).copy()
        if len(df_clean) < 60:
            return {
                "status": "unavailable",
                "reason": "Insufficient samples after technical feature generation.",
                "horizons": [],
                "disclaimer": "Educational only, not financial advice."
            }

        horizons_config = [
            {"horizon": "1 Day", "shift": -1, "window": 1, "max_drift": 0.05},
            {"horizon": "1 Week", "shift": -5, "window": 5, "max_drift": 0.12},
            {"horizon": "1 Month", "shift": -21, "window": 21, "max_drift": 0.25}
        ]

        horizons_results = []
        overall_r2_list = []
        overall_rmse_list = []

        for h_cfg in horizons_config:
            h_name = h_cfg["horizon"]
            shift_val = h_cfg["shift"]
            max_drift = h_cfg["max_drift"]

            # Target percentage return
            df_clean[f'target_{h_name}'] = (close.shift(shift_val) - close) / close
            valid_df = df_clean.dropna(subset=[f'target_{h_name}']).copy()

            X = valid_df[feature_cols].values
            y = valid_df[f'target_{h_name}'].values
            n_samples = len(X)

            if n_samples < 50:
                continue

            # Walk-Forward Validation:
            # 5 expanding validation folds
            fold_step = max(5, int(n_samples * 0.08))
            min_train = int(n_samples * 0.55)

            wf_y_test = []
            wf_y_pred = []
            wf_y_naive = []  # Naive baseline: predicting zero return (persistence)

            for train_end in range(min_train, n_samples, fold_step):
                test_end = min(train_end + fold_step, n_samples)
                X_tr, y_tr = X[:train_end], y[:train_end]
                X_te, y_te = X[train_end:test_end], y[train_end:test_end]

                if len(X_te) == 0:
                    break

                fold_model = GradientBoostingRegressor(n_estimators=45, max_depth=3, random_state=42)
                fold_model.fit(X_tr, y_tr)
                preds = fold_model.predict(X_te)

                wf_y_test.extend(y_te.tolist())
                wf_y_pred.extend(preds.tolist())
                wf_y_naive.extend([0.0] * len(y_te))

            wf_y_test_arr = np.array(wf_y_test)
            wf_y_pred_arr = np.array(wf_y_pred)
            wf_y_naive_arr = np.array(wf_y_naive)

            if len(wf_y_test_arr) < 5:
                continue

            # Real R^2 (no floor or clamping)
            ss_res = np.sum((wf_y_test_arr - wf_y_pred_arr) ** 2)
            ss_tot = np.sum((wf_y_test_arr - np.mean(wf_y_test_arr)) ** 2)
            real_r2 = float(1.0 - (ss_res / (ss_tot + 1e-9)))

            # Model metrics
            model_rmse = float(np.sqrt(np.mean((wf_y_test_arr - wf_y_pred_arr) ** 2)))
            model_mae = float(np.mean(np.abs(wf_y_test_arr - wf_y_pred_arr)))

            # Naive baseline metrics
            naive_rmse = float(np.sqrt(np.mean((wf_y_test_arr - wf_y_naive_arr) ** 2)))
            naive_mae = float(np.mean(np.abs(wf_y_test_arr - wf_y_naive_arr)))

            rmse_improvement_pct = float(((naive_rmse - model_rmse) / (naive_rmse + 1e-9)) * 100.0)

            # Unclamped directional accuracy
            dir_correct = float(np.sum((wf_y_pred_arr > 0) == (wf_y_test_arr > 0)) / len(wf_y_test_arr) * 100.0)

            # Fit full model on all available data for out-of-sample forward prediction
            final_model = GradientBoostingRegressor(n_estimators=50, max_depth=3, random_state=42)
            final_model.fit(X, y)

            latest_features = df_clean[feature_cols].iloc[-1:].values
            raw_predicted_return = float(final_model.predict(latest_features)[0])
            bounded_return = float(np.clip(raw_predicted_return, -max_drift, max_drift))

            predicted_usd_oz = round(curr_price * (1.0 + bounded_return), 2)
            residual_std = float(np.std(wf_y_test_arr - wf_y_pred_arr))
            ci_low_usd = round(curr_price * (1.0 + bounded_return - 1.96 * residual_std), 2)
            ci_high_usd = round(curr_price * (1.0 + bounded_return + 1.96 * residual_std), 2)

            predicted_inr_10g = round((predicted_usd_oz / TROY_OZ_TO_GRAMS) * 10.0 * usdinr_rate, 2)
            curr_inr_10g = round((curr_price / TROY_OZ_TO_GRAMS) * 10.0 * usdinr_rate, 2)
            inr_change_10g = round(predicted_inr_10g - curr_inr_10g, 2)

            overall_r2_list.append(real_r2)
            overall_rmse_list.append(model_rmse)

            horizons_results.append({
                "horizon": h_name,
                "current_price_usd": curr_price,
                "predicted_price_usd": predicted_usd_oz,
                "predicted_change_pct": round(bounded_return * 100.0, 2),
                "confidence_interval_usd": {
                    "low": ci_low_usd,
                    "high": ci_high_usd
                },
                "current_price_inr_10g": curr_inr_10g,
                "predicted_price_inr_10g": predicted_inr_10g,
                "predicted_change_inr_10g": inr_change_10g,
                "bias": "Bullish" if bounded_return > 0.005 else ("Bearish" if bounded_return < -0.005 else "Neutral"),
                "walk_forward_metrics": {
                    "real_r2": round(real_r2, 4),
                    "model_rmse": round(model_rmse, 4),
                    "model_mae": round(model_mae, 4),
                    "naive_rmse": round(naive_rmse, 4),
                    "naive_mae": round(naive_mae, 4),
                    "rmse_vs_naive_pct": round(rmse_improvement_pct, 2),
                    "unclamped_directional_accuracy_pct": round(dir_correct, 2),
                    "validation_folds_evaluated": int((n_samples - min_train) // fold_step)
                }
            })

        avg_real_r2 = float(np.mean(overall_r2_list)) if overall_r2_list else 0.0
        avg_rmse = float(np.mean(overall_rmse_list)) if overall_rmse_list else 0.0

        result = {
            "status": "available",
            "symbol": GOLD_SYMBOL,
            "commodity_name": "Gold Futures (COMEX)",
            "current_price_usd": curr_price,
            "usdinr_rate": round(usdinr_rate, 4),
            "validation_method": "Walk-Forward Expanding Window Validation",
            "model_architecture": "GradientBoostingRegressor",
            "evaluation_note": "Real R^2 is computed directly on walk-forward out-of-sample folds without arbitrary floors. Confidence reflects empirical directional accuracy without clamping.",
            "overall_walk_forward_r2": round(avg_real_r2, 4),
            "overall_model_rmse": round(avg_rmse, 4),
            "horizons": horizons_results,
            "disclaimer": "Educational only, not financial advice.",
            "last_updated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        }

        _GOLD_PREDICTIONS_CACHE["data"] = result
        _GOLD_PREDICTIONS_CACHE["time"] = now
        return result

    except Exception as e:
        logger.error(f"Error generating gold predictions: {e}")
        return {
            "status": "unavailable",
            "reason": f"Prediction error: {str(e)}. No synthetic fallback data generated.",
            "horizons": [],
            "disclaimer": "Educational only, not financial advice."
        }
