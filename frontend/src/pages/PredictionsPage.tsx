import React, { useState, useEffect, useRef } from 'react';
import {
  BrainCircuit,
  TrendingUp,
  TrendingDown,
  Sparkles,
  BarChart2,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  Info,
  RefreshCw,
  Search,
  Sliders,
  Layers,
  Coins,
  Gem
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell
} from 'recharts';
import { api } from '../services/api';
import { formatINR } from '../utils/currency';
import { StockSelector, type StockOption } from '../components/common/StockSelector';

type AssetMode = 'stocks' | 'metals';
type Metal = 'gold' | 'silver';

interface PredictionsPageProps {
  initialSymbol?: string;
  onSelectStock: (symbol: string) => void;
}

export const PredictionsPage: React.FC<PredictionsPageProps> = ({
  initialSymbol = 'RELIANCE.NS',
  onSelectStock,
}) => {
  const [assetMode, setAssetMode] = useState<AssetMode>('stocks');
  const [metal, setMetal] = useState<Metal>('gold');
  const [symbol, setSymbol] = useState(initialSymbol);
  const [predictions, setPredictions] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reqIdRef = useRef(0);

  const fetchStockPredictions = (sym: string) => {
    const reqId = ++reqIdRef.current;
    setLoading(true);
    setError(null);
    setPredictions(null);
    setSymbol(sym);
    api.stocks.getPredictions(sym)
      .then((res) => {
        if (reqId === reqIdRef.current) {
          setPredictions(res);
        }
      })
      .catch((err) => {
        if (reqId === reqIdRef.current) {
          setError(`Failed to run ML prediction pipeline for ${sym}: ${err.message}`);
        }
      })
      .finally(() => {
        if (reqId === reqIdRef.current) {
          setLoading(false);
        }
      });
  };

  const fetchMetalPredictions = (selectedMetal: Metal) => {
    const reqId = ++reqIdRef.current;
    setLoading(true);
    setError(null);
    api.metals.getPredictions(selectedMetal)
      .then((res) => {
        if (reqId === reqIdRef.current) {
          setPredictions(res);
          setMetal(selectedMetal);
        }
      })
      .catch((err) => {
        if (reqId === reqIdRef.current) {
          setError(`Failed to run metals forecasting pipeline for ${selectedMetal}: ${err.message}`);
        }
      })
      .finally(() => {
        if (reqId === reqIdRef.current) {
          setLoading(false);
        }
      });
  };

  useEffect(() => {
    if (assetMode === 'stocks') {
      fetchStockPredictions(initialSymbol);
    }
  }, [initialSymbol]);

  const handleSwitchMode = (mode: AssetMode) => {
    if (mode === assetMode) return;
    setAssetMode(mode);
    setError(null);
    setPredictions(null);
    if (mode === 'stocks') {
      fetchStockPredictions(symbol || initialSymbol);
    } else {
      setMetal('gold');
      fetchMetalPredictions('gold');
    }
  };

  const handleSwitchMetal = (selectedMetal: Metal) => {
    if (selectedMetal === metal && assetMode === 'metals' && predictions) return;
    setMetal(selectedMetal);
    setError(null);
    setPredictions(null);
    fetchMetalPredictions(selectedMetal);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold mb-1 border border-emerald-200">
            <BrainCircuit size={13} />
            {assetMode === 'stocks' ? 'Gradient Boosting ML Engine' : 'Time-Series Walk-Forward ML Engine'}
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            {assetMode === 'stocks' ? 'AI Stock Predictions & Signal Conviction' : 'Precious Metals AI Predictions'}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            {assetMode === 'stocks'
              ? 'Out-of-sample backtested models forecasting 1-Day, 1-Week, and 1-Month price horizons.'
              : 'Institutional forecasting engine with live domestic spot calibration for 1-Day, 1-Week, and 1-Month horizons.'}
          </p>
        </div>

        {/* Top-Right Toggle & Sub-Selector */}
        <div className="flex flex-col sm:items-end gap-2">
          {/* Stocks / Metals Segmented Toggle */}
          <div className="flex items-center p-1 bg-slate-100 border border-slate-200 rounded-xl space-x-1">
            <button
              type="button"
              onClick={() => handleSwitchMode('stocks')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
                assetMode === 'stocks'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              <BarChart2 size={14} className={assetMode === 'stocks' ? 'text-white' : 'text-slate-500'} />
              Stocks
            </button>
            <button
              type="button"
              onClick={() => handleSwitchMode('metals')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
                assetMode === 'metals'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Coins size={14} className={assetMode === 'metals' ? 'text-white' : 'text-slate-500'} />
              Metals
            </button>
          </div>

          {/* Sub-selector: Searchable Stock Dropdown OR Gold/Silver Selector */}
          {assetMode === 'stocks' ? (
            <StockSelector
              mode="single"
              value={symbol}
              onSelect={(stock: StockOption) => fetchStockPredictions(stock.symbol)}
              label="Select Stock"
              placeholder="Search stocks by name or ticker..."
              className="w-full sm:w-auto"
            />
          ) : (
            <div className="flex items-center p-0.5 bg-slate-100 border border-slate-200 rounded-lg space-x-1">
              <button
                type="button"
                onClick={() => handleSwitchMetal('gold')}
                className={`flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-md transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
                  metal === 'gold'
                    ? 'bg-amber-500 text-white shadow-xs'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                <Coins size={12} className={metal === 'gold' ? 'text-white' : 'text-amber-500'} />
                Gold
              </button>
              <button
                type="button"
                onClick={() => handleSwitchMetal('silver')}
                className={`flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-md transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
                  metal === 'silver'
                    ? 'bg-slate-800 text-white shadow-xs'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                <Gem size={12} className={metal === 'silver' ? 'text-white' : 'text-slate-400'} />
                Silver
              </button>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={() => assetMode === 'stocks' ? fetchStockPredictions(symbol) : fetchMetalPredictions(metal)}
            className="ml-3 px-2 py-1 bg-white border border-rose-300 text-rose-800 text-[11px] font-semibold rounded hover:bg-rose-100/50"
          >
            Retry
          </button>
        </div>
      )}

      {loading && !predictions ? (
        <div className="p-12 flex items-center justify-center">
          <RefreshCw className="animate-spin text-blue-600 mr-2" size={24} />
          <span className="text-sm font-semibold text-slate-500">
            {assetMode === 'stocks'
              ? 'Training ML model, computing feature matrix & confidence intervals...'
              : `Training time-series forecasting engine for ${metal === 'gold' ? 'Gold (24K)' : 'Silver 999'}...`}
          </span>
        </div>
      ) : predictions?.status === 'unavailable' ? (
        <div className="fin-card p-6 bg-amber-50 border border-amber-200 rounded-xl space-y-3">
          <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
            <AlertTriangle size={18} className="text-amber-600" />
            <span>Forecasting Data Temporarily Unavailable</span>
          </div>
          <p className="text-xs sm:text-sm text-amber-800 leading-relaxed">
            {predictions.message || 'Authentic domestic or historical market data is temporarily unreachable. Per our integrity policy, fabricated numbers are never generated.'}
          </p>
          <button
            onClick={() => assetMode === 'stocks' ? fetchStockPredictions(symbol) : fetchMetalPredictions(metal)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white border border-amber-300 text-amber-900 rounded-md hover:bg-amber-100/60 shadow-xs"
          >
            <RefreshCw size={13} />
            Retry Analysis
          </button>
        </div>
      ) : predictions ? (
        <>
          {/* Signal Header Banner */}
          <div className="fin-card p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-2xl font-black text-slate-900">
                    {predictions.company_name} ({predictions.symbol})
                  </h2>
                  <span className={`px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider ${
                    predictions.overall_signal === 'Bullish' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                    predictions.overall_signal === 'Bearish' ? 'bg-rose-100 text-rose-800 border border-rose-200' :
                    'bg-slate-100 text-slate-800 border border-slate-200'
                  }`}>
                    {predictions.overall_signal} Bias
                  </span>
                  {predictions.is_demo && (
                    <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-bold rounded">
                      Demo Baseline State
                    </span>
                  )}
                </div>

                {/* Domestic / Market reference price if available */}
                {predictions.current_price != null && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs sm:text-sm text-slate-600">
                    <span className="font-semibold text-slate-500">
                      {assetMode === 'metals' ? 'Domestic Spot Reference:' : 'Current Price:'}
                    </span>
                    <span className="text-base sm:text-lg font-black text-slate-900">
                      {formatINR(predictions.current_price)}
                    </span>
                    {assetMode === 'metals' && (
                      <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded">
                        {predictions.unit || (metal === 'gold' ? 'INR per 10g (Visakhapatnam)' : 'INR per kg (Visakhapatnam)')}
                      </span>
                    )}
                  </div>
                )}

                <div className="mt-3 text-xs text-slate-600 space-y-1">
                  <div><strong>Technical Thesis:</strong> {predictions.technical_summary}</div>
                  <div>
                    <strong>{assetMode === 'metals' ? 'Macro & Currency Thesis:' : 'Fundamental Valuation:'}</strong>{' '}
                    {predictions.macro_summary || predictions.fundamental_summary}
                  </div>
                </div>
              </div>

              {/* Conviction Dial */}
              <div className="text-left md:text-right shrink-0">
                <div className="text-xs text-slate-400 font-semibold uppercase">Prediction Conviction</div>
                <div className="text-3xl font-black text-slate-900 flex items-baseline md:justify-end gap-1">
                  {predictions.signal_conviction}%
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Based on directional backtest score
                </div>
              </div>
            </div>
          </div>

          {/* Multi-Horizon Target Price Cards */}
          <div className="grid md:grid-cols-3 gap-6">
            {(predictions.horizons || []).map((h: any) => {
              const isUp = h.change_pct >= 0;
              return (
                <div key={h.horizon} className="fin-card p-5 relative overflow-hidden">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-2">
                    <span className="flex items-center gap-1.5 font-bold text-slate-800">
                      <Calendar size={14} className="text-blue-600" />
                      {h.horizon} Horizon Target
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      h.bias === 'Bullish' ? 'bg-emerald-100 text-emerald-800' :
                      h.bias === 'Bearish' ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-700'
                    }`}>
                      {h.bias}
                    </span>
                  </div>

                  <div className="text-2xl font-black text-slate-900 tracking-tight">
                    {formatINR(h.predicted_price)}
                    {assetMode === 'metals' && (
                      <span className="text-xs font-medium text-slate-400 ml-1.5">
                        {metal === 'gold' ? '/ 10g' : '/ kg'}
                      </span>
                    )}
                  </div>

                  <div className="mt-1 flex items-center text-xs font-bold">
                    <span className={`inline-flex items-center ${isUp ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {isUp ? <TrendingUp size={14} className="mr-0.5" /> : <TrendingDown size={14} className="mr-0.5" />}
                      {isUp ? '+' : ''}{h.change_pct}%
                    </span>
                    <span className="ml-2 text-slate-400 font-normal text-[11px]">vs current price</span>
                  </div>

                  {/* 95% Confidence Interval */}
                  <div className="mt-4 pt-3 border-t border-slate-100 text-xs">
                    <div className="flex justify-between text-[11px] text-slate-500 mb-1">
                      <span>95% Confidence Range:</span>
                      <span className="font-mono font-bold text-slate-800">
                        {formatINR(h.confidence_interval_low)} - {formatINR(h.confidence_interval_high)}
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-blue-600 h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, Math.max(0, h.confidence_score))}%` }}
                      ></div>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1 flex justify-between">
                      <span>Model Confidence: {h.confidence_score}%</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Model Architecture & Feature Importance Grid */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* Feature Importance */}
            <div className="fin-card p-5">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <BarChart2 size={16} className="text-blue-600" />
                  {assetMode === 'metals' ? 'Precious Metals Feature Weight Importance' : 'ML Feature Weight Importance'}
                </h3>
                <span className="text-xs text-slate-400">
                  {assetMode === 'metals' ? 'Gradient Boosting Regressor' : 'Random Forest / Gradient Boost'}
                </span>
              </div>

              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={predictions.feature_importance || []} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F1F5F9" />
                    <XAxis type="number" unit="%" tick={{ fontSize: 10, fill: '#94A3B8' }} />
                    <YAxis dataKey="feature" type="category" tick={{ fontSize: 11, fill: '#475569' }} width={120} />
                    <Tooltip formatter={(v) => `${v}%`} />
                    <Bar
                      dataKey="importance_pct"
                      fill={assetMode === 'metals' ? (metal === 'gold' ? '#D97706' : '#475569') : '#2563EB'}
                      radius={[0, 4, 4, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Backtest Validation Metrics */}
            <div className="fin-card p-5">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-600" />
                  Model Backtest & Validation Metrics
                </h3>
                <span className="text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-semibold">
                  Walk-Forward Tested
                </span>
              </div>

              <div className="space-y-3.5 text-xs">
                <div className="p-3 bg-slate-50 rounded-lg flex items-center justify-between">
                  <div>
                    <div className="font-bold text-slate-900 text-sm">
                      {predictions.model_metrics?.directional_accuracy_pct}%
                    </div>
                    <div className="text-[11px] text-slate-500">Directional Hit Rate Accuracy</div>
                  </div>
                  <span className="text-emerald-600 font-bold text-[11px] bg-emerald-50 px-2 py-1 rounded">
                    Above 50% Random Threshold
                  </span>
                </div>

                <div className="p-3 bg-slate-50 rounded-lg flex items-center justify-between">
                  <div>
                    <div className="font-bold text-slate-900 text-sm">{predictions.model_metrics?.rmse}</div>
                    <div className="text-[11px] text-slate-500">Root Mean Squared Error (RMSE)</div>
                  </div>
                  <span className="text-slate-500 text-[11px]">Normalized residual</span>
                </div>

                <div className="p-3 bg-slate-50 rounded-lg flex items-center justify-between">
                  <div>
                    <div className="font-bold text-slate-900 text-sm">{predictions.model_metrics?.mae}</div>
                    <div className="text-[11px] text-slate-500">Mean Absolute Error (MAE)</div>
                  </div>
                  <span className="text-slate-500 text-[11px]">Average return variance</span>
                </div>

                <div className="p-3 bg-slate-50 rounded-lg flex items-center justify-between">
                  <div>
                    <div className="font-bold text-slate-900 text-sm">{predictions.model_metrics?.r2_score}</div>
                    <div className="text-[11px] text-slate-500">R² Coefficient of Determination</div>
                  </div>
                  <span className="text-slate-500 text-[11px]">Explanatory variance</span>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
};
