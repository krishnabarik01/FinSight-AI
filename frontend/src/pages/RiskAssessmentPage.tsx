import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Activity,
  Layers,
  TrendingDown,
  TrendingUp,
  BarChart2,
  Info,
  CheckCircle2,
  RefreshCw,
  Sliders,
  Coins,
  Gem,
  Scale,
  Globe
} from 'lucide-react';
import { api } from '../services/api';
import { formatINR } from '../utils/currency';
import { AIMarketInsightBox } from '../components/AIMarketInsightBox';
import { StockSelector, type StockOption } from '../components/common/StockSelector';
import { useLiveQuote } from '../hooks/useLiveQuote';

interface RiskAssessmentPageProps {
  initialSymbol?: string;
  onSelectStock: (symbol: string) => void;
}

type AssetMode = 'stocks' | 'metals';
type Metal = 'gold' | 'silver';

export const RiskAssessmentPage: React.FC<RiskAssessmentPageProps> = ({
  initialSymbol = 'RELIANCE',
}) => {
  const [assetMode, setAssetMode] = useState<AssetMode>('stocks');
  const [metal, setMetal] = useState<Metal>('gold');
  const [activeTier, setActiveTier] = useState<'high' | 'moderate' | 'low'>('high');
  const [selectedStock, setSelectedStock] = useState<string>(() => {
    return initialSymbol ? initialSymbol.replace('.NS', '').toUpperCase() : 'RELIANCE';
  });
  const [riskData, setRiskData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Unified live quote subscription for stock mode
  const { quote: liveQuote, refetch: refetchLiveQuote } = useLiveQuote(
    assetMode === 'stocks' ? selectedStock : undefined,
    { enabled: assetMode === 'stocks', refreshIntervalMs: 20000 }
  );

  // Request tracker ref to prevent race conditions during rapid switching
  const reqIdRef = useRef<number>(0);

  // Sync if initialSymbol changes externally
  useEffect(() => {
    if (initialSymbol) {
      setSelectedStock(initialSymbol.replace('.NS', '').toUpperCase());
    }
  }, [initialSymbol]);

  useEffect(() => {
    const currentReqId = ++reqIdRef.current;
    setLoading(true);
    setError(null);
    setRiskData(null);

    if (assetMode === 'stocks') {
      api.stocks.getRiskAnalysis(selectedStock)
        .then((res) => {
          if (currentReqId === reqIdRef.current) {
            setRiskData(res);
          }
        })
        .catch((err) => {
          if (currentReqId === reqIdRef.current) {
            setError(`Risk assessment calculation error for ${selectedStock}: ${err.message}`);
          }
        })
        .finally(() => {
          if (currentReqId === reqIdRef.current) {
            setLoading(false);
          }
        });
    } else {
      api.metals.getRiskAnalysis(metal)
        .then((res) => {
          if (currentReqId === reqIdRef.current) {
            setRiskData(res);
          }
        })
        .catch((err) => {
          if (currentReqId === reqIdRef.current) {
            setError(`Metals risk assessment calculation error for ${metal}: ${err.message}`);
          }
        })
        .finally(() => {
          if (currentReqId === reqIdRef.current) {
            setLoading(false);
          }
        });
    }
  }, [assetMode, metal, selectedStock]);

  const handleSelectStock = (stock: string) => {
    if (stock === selectedStock && assetMode === 'stocks' && riskData) return;
    setActiveTier('high');
    setError(null);
    setRiskData(null);
    setSelectedStock(stock);
  };

  const handleSwitchMode = (mode: AssetMode) => {
    if (mode === assetMode) return;
    setActiveTier('high');
    setError(null);
    setAssetMode(mode);
    if (mode === 'metals') {
      setMetal('gold');
    }
  };

  const handleSwitchMetal = (selectedMetal: Metal) => {
    if (selectedMetal === metal) return;
    setActiveTier('high');
    setError(null);
    setMetal(selectedMetal);
  };

  const handleRefresh = () => {
    setActiveTier('high');
    setError(null);
    setLoading(true);
    refetchLiveQuote(true);
    const currentReqId = ++reqIdRef.current;
    if (assetMode === 'stocks') {
      api.stocks.getRiskAnalysis(selectedStock)
        .then((res) => {
          if (currentReqId === reqIdRef.current) setRiskData(res);
        })
        .catch((err) => {
          if (currentReqId === reqIdRef.current) setError(`Risk assessment calculation error for ${selectedStock}: ${err.message}`);
        })
        .finally(() => {
          if (currentReqId === reqIdRef.current) setLoading(false);
        });
    } else {
      api.metals.getRiskAnalysis(metal)
        .then((res) => {
          if (currentReqId === reqIdRef.current) setRiskData(res);
        })
        .catch((err) => {
          if (currentReqId === reqIdRef.current) setError(`Metals risk assessment calculation error for ${metal}: ${err.message}`);
        })
        .finally(() => {
          if (currentReqId === reqIdRef.current) setLoading(false);
        });
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Header & Asset Category Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-bold mb-1 border border-blue-200">
            <ShieldAlert size={13} />
            Institutional 3-Tier Risk Engine
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Three-Level Risk Assessment
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Explicit, quantitative evaluation across High, Moderate, and Low analytical tiers.
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

          {/* Secondary Selector: Gold/Silver or Searchable Stock Dropdown */}
          {assetMode === 'metals' ? (
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
              <button
                type="button"
                onClick={handleRefresh}
                disabled={loading}
                className="p-1 border border-slate-200 hover:border-slate-300 rounded-md bg-white text-slate-600 transition"
                title="Refresh metals risk"
              >
                <RefreshCw size={12} className={loading ? 'animate-spin text-blue-600' : ''} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <StockSelector
                mode="single"
                value={selectedStock}
                onSelect={(stock: StockOption) => {
                  const sym = stock.clean_symbol || stock.symbol.replace('.NS', '').replace('.BO', '');
                  handleSelectStock(sym);
                }}
                label="Select Stock"
                placeholder="Search stocks by name or ticker..."
                className="w-full sm:w-auto"
              />
              <button
                type="button"
                onClick={handleRefresh}
                disabled={loading}
                className="p-2 border border-slate-200 hover:border-slate-300 rounded-xl bg-white text-slate-600 transition"
                title="Force refresh live quote and risk assessment"
              >
                <RefreshCw size={15} className={loading ? 'animate-spin text-blue-600' : ''} />
              </button>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg">
          {error}
        </div>
      )}

      {loading && !riskData ? (
        <div className="p-12 flex items-center justify-center">
          <RefreshCw className="animate-spin text-blue-600 mr-2" size={24} />
          <span className="text-sm font-semibold text-slate-500">
            {assetMode === 'stocks'
              ? `Evaluating multi-tier risk metrics for ${selectedStock}...`
              : `Evaluating multi-tier risk metrics for ${metal === 'gold' ? 'Gold (24K)' : 'Silver 999'}...`}
          </span>
        </div>
      ) : riskData?.status === 'unavailable' ? (
        <div className="fin-card p-6 bg-amber-50 border border-amber-200 rounded-xl space-y-3">
          <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
            <AlertTriangle size={18} className="text-amber-600" />
            <span>Market Data Unavailable</span>
          </div>
          <p className="text-xs sm:text-sm text-amber-800 leading-relaxed">
            {riskData.message || 'Authentic domestic or historical market data is temporarily unreachable. Per our integrity policy, fabricated numbers are never generated.'}
          </p>
        </div>
      ) : riskData ? (
        <>
          {/* Executive Risk Classification Banner */}
          <div className="fin-card p-6 bg-white border border-slate-200">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-xl sm:text-2xl font-black text-slate-900">
                    {riskData.company_name} ({riskData.symbol})
                  </h2>
                  <span className={`px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider ${
                    riskData.overall_classification === 'High Risk' ? 'bg-rose-100 text-rose-800 border border-rose-200' :
                    riskData.overall_classification === 'Moderate Risk' ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                    'bg-emerald-100 text-emerald-800 border border-emerald-200'
                  }`}>
                    {riskData.overall_classification}
                  </span>
                </div>

                {/* Live Domestic / Market Price & Metrics */}
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs sm:text-sm text-slate-600">
                  <span className="font-semibold text-slate-500">Current Price:</span>
                  <span className="text-base sm:text-lg font-black text-slate-900">
                    {formatINR((liveQuote?.price && liveQuote.price > 0) ? liveQuote.price : riskData.current_price)}
                  </span>
                  {assetMode === 'stocks' && typeof (liveQuote?.change ?? riskData.change) === 'number' && (
                    (() => {
                      const chg = liveQuote?.change ?? riskData.change ?? 0;
                      const chgPct = liveQuote?.change_percent ?? riskData.change_percent ?? riskData.change_pct ?? 0;
                      const isPos = chg >= 0;
                      return (
                        <div className={`font-bold text-xs flex items-center gap-0.5 ${isPos ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {isPos ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                          {isPos ? '+' : ''}{Number(chg).toFixed(2)} ({isPos ? '+' : ''}{Number(chgPct).toFixed(2)}%)
                        </div>
                      );
                    })()
                  )}
                  {assetMode === 'metals' && (
                    <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded">
                      {metal === 'gold' ? 'INR per 10g (24K, Visakhapatnam)' : 'INR per kg (Silver 999, Visakhapatnam)'}
                    </span>
                  )}
                </div>

                {/* Source & Timestamp */}
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                  <span>Source: <strong className="text-slate-600">{liveQuote?.data_source || riskData.data_source || riskData.source || 'yfinance (fallback)'}</strong></span>
                  <span>•</span>
                  <span>Timestamp: <span className="font-mono text-slate-600">{liveQuote?.timestamp || riskData.timestamp || riskData.last_updated || 'Live'}</span></span>
                  {(liveQuote?.is_stale || riskData.is_stale) && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
                      Stale
                    </span>
                  )}
                </div>

                <p className="mt-2 text-xs sm:text-sm text-slate-700 max-w-3xl leading-relaxed">
                  <strong>Assessment Summary:</strong> {riskData.rationale}
                </p>
              </div>

              {/* Score Dial Badge */}
              <div className="text-left md:text-right shrink-0">
                <div className="text-xs text-slate-400 font-semibold uppercase">Composite Risk Score</div>
                <div className="text-3xl sm:text-4xl font-black text-slate-900 flex items-baseline md:justify-end gap-1">
                  {riskData.risk_score}
                  <span className="text-sm font-normal text-slate-400">/ 100</span>
                </div>
              </div>
            </div>

            {/* Methodology Distinction Alert */}
            <div className="mt-5 p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs flex items-start gap-2.5 text-slate-600">
              <Info size={16} className="text-blue-600 shrink-0 mt-0.5" />
              <span>
                {assetMode === 'metals' ? (
                  <>
                    <strong>Methodology Distinction:</strong> Precious metals are quantitatively evaluated across short-term volatility, technical moving-average momentum, and multi-year store-of-value durability. Domestic prices reflect authentic Visakhapatnam retail board rates with 3% GST included, distinct from un-tariffed international COMEX futures.
                  </>
                ) : (
                  <>
                    <strong>Methodology Distinction:</strong> A stock is not automatically labeled low-risk solely because fundamentals are strong. Risk ratings are computed via multi-factor models incorporating short-term price momentum, historical volatility, and sector leverage. This measured asset risk is distinct from an individual investor's personal risk tolerance profile.
                  </>
                )}
              </span>
            </div>
          </div>

          {/* Three Tier Tabs */}
          <div className="flex border-b border-slate-200 overflow-x-auto">
            <button
              onClick={() => setActiveTier('high')}
              className={`flex-1 py-3 text-xs sm:text-sm font-bold flex items-center justify-center gap-2 border-b-2 transition shrink-0 ${
                activeTier === 'high'
                  ? 'border-rose-600 text-rose-700 bg-rose-50/50'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <ShieldAlert size={16} className={activeTier === 'high' ? 'text-rose-600' : 'text-slate-400'} />
              Tier A: High-Risk Analysis (Short-Term Volatility & Momentum)
            </button>

            <button
              onClick={() => setActiveTier('moderate')}
              className={`flex-1 py-3 text-xs sm:text-sm font-bold flex items-center justify-center gap-2 border-b-2 transition shrink-0 ${
                activeTier === 'moderate'
                  ? 'border-blue-600 text-blue-700 bg-blue-50/50'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Activity size={16} className={activeTier === 'moderate' ? 'text-blue-600' : 'text-slate-400'} />
              {assetMode === 'metals'
                ? 'Tier B: Moderate-Risk Analysis (Technical & Macro Analysis)'
                : 'Tier B: Moderate-Risk Analysis (Technical & Valuation Hybrid)'}
            </button>

            <button
              onClick={() => setActiveTier('low')}
              className={`flex-1 py-3 text-xs sm:text-sm font-bold flex items-center justify-center gap-2 border-b-2 transition shrink-0 ${
                activeTier === 'low'
                  ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <ShieldCheck size={16} className={activeTier === 'low' ? 'text-emerald-600' : 'text-slate-400'} />
              {assetMode === 'metals'
                ? 'Tier C: Low-Risk Analysis (Store of Value & Macro Durability)'
                : 'Tier C: Low-Risk Analysis (Solvency & Long-Term Moat)'}
            </button>
          </div>

          {/* Tier A: High Risk */}
          {activeTier === 'high' && riskData.high_risk_tier && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {riskData.high_risk_tier?.market_insight && (
                <AIMarketInsightBox
                  insight={riskData.high_risk_tier.market_insight}
                  currentPrice={riskData.current_price}
                  currency={riskData.currency || 'INR'}
                  symbol={riskData.symbol}
                  tierName="High Risk — Short-Term Volatility & Momentum"
                />
              )}

              {/* High Risk Metrics Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="fin-card p-4">
                  <div className="text-xs font-semibold text-slate-500 mb-1">Volatility Score</div>
                  <div className="text-2xl font-black text-slate-900">{riskData.high_risk_tier.volatility_score}</div>
                  <div className="text-[11px] text-slate-500 mt-1">Scale: 0 to 100</div>
                </div>

                <div className="fin-card p-4">
                  <div className="text-xs font-semibold text-slate-500 mb-1">14-Day ATR</div>
                  <div className="text-2xl font-black text-slate-900">{formatINR(riskData.high_risk_tier.atr_14)}</div>
                  <div className="text-[11px] text-slate-500 mt-1">Average True Range</div>
                </div>

                <div className="fin-card p-4">
                  <div className="text-xs font-semibold text-slate-500 mb-1">14-Day RSI</div>
                  <div className="text-2xl font-black text-slate-900">{riskData.high_risk_tier.rsi_14}</div>
                  <div className="text-[11px] text-slate-500 mt-1">{riskData.high_risk_tier.short_term_momentum}</div>
                </div>

                <div className="fin-card p-4">
                  <div className="text-xs font-semibold text-slate-500 mb-1">Breakdown Vulnerability</div>
                  <div className={`text-2xl font-black ${
                    riskData.high_risk_tier.breakdown_risk === 'Elevated' ? 'text-rose-600' : 'text-emerald-600'
                  }`}>
                    {riskData.high_risk_tier.breakdown_risk}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">Floor: {formatINR(riskData.high_risk_tier.support_level)}</div>
                </div>
              </div>

              {/* Triggers & Exit Conditions */}
              <div className="grid md:grid-cols-2 gap-6">
                <div className="fin-card p-5 border-l-4 border-l-rose-500">
                  <h3 className="font-bold text-slate-900 text-sm mb-3 flex items-center gap-2">
                    <AlertTriangle size={16} className="text-rose-600" />
                    Potential High-Risk Triggers
                  </h3>
                  <ul className="space-y-2 text-xs text-slate-700">
                    {riskData.high_risk_tier.potential_triggers?.map((trig: string, idx: number) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1.5 shrink-0"></span>
                        <span>{trig}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="fin-card p-5 border-l-4 border-l-blue-500">
                  <h3 className="font-bold text-slate-900 text-sm mb-3 flex items-center gap-2">
                    <Sliders size={16} className="text-blue-600" />
                    Suggested Position Review & Exit Conditions
                  </h3>
                  <ul className="space-y-2 text-xs text-slate-700">
                    {riskData.high_risk_tier.exit_conditions?.map((cond: string, idx: number) => (
                      <li key={idx} className="flex items-start gap-2">
                        <CheckCircle2 size={14} className="text-blue-600 mt-0.5 shrink-0" />
                        <span>{cond}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Tier B: Moderate Risk */}
          {activeTier === 'moderate' && riskData.moderate_risk_tier && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {riskData.moderate_risk_tier?.market_insight && (
                <AIMarketInsightBox
                  insight={riskData.moderate_risk_tier.market_insight}
                  currentPrice={riskData.current_price}
                  currency={riskData.currency || 'INR'}
                  symbol={riskData.symbol}
                  tierName={assetMode === 'metals' ? "Moderate Risk — Technical & Macro Analysis" : "Moderate Risk — Technical & Fundamental Hybrid"}
                />
              )}

              {/* Moderate Risk Metrics Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="fin-card p-4">
                  <div className="text-xs font-semibold text-slate-500 mb-1">Technical Score</div>
                  <div className="text-2xl font-black text-blue-700">{riskData.moderate_risk_tier.technical_score}</div>
                  <div className="text-[11px] text-slate-500 mt-1">Moving average alignment</div>
                </div>

                {assetMode === 'stocks' ? (
                  <>
                    <div className="fin-card p-4">
                      <div className="text-xs font-semibold text-slate-500 mb-1">Fundamental Score</div>
                      <div className="text-2xl font-black text-emerald-700">{riskData.moderate_risk_tier.fundamental_score}</div>
                      <div className="text-[11px] text-slate-500 mt-1">Earnings & valuation</div>
                    </div>

                    <div className="fin-card p-4">
                      <div className="text-xs font-semibold text-slate-500 mb-1">P/E vs Industry Benchmark</div>
                      <div className="text-2xl font-black text-slate-900">
                        {riskData.moderate_risk_tier.pe_ratio || 'N/A'}{' '}
                        <span className="text-xs font-normal text-slate-400">/ {riskData.moderate_risk_tier.industry_pe}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1">Sector median comparison</div>
                    </div>

                    <div className="fin-card p-4">
                      <div className="text-xs font-semibold text-slate-500 mb-1">Profitability Trend</div>
                      <div className="text-2xl font-black text-slate-900">{riskData.moderate_risk_tier.profitability_trend}</div>
                      <div className="text-[11px] text-emerald-600 mt-1">Operating resilience</div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="fin-card p-4">
                      <div className="text-xs font-semibold text-slate-500 mb-1">Macro Score & USD/INR</div>
                      <div className="text-2xl font-black text-emerald-700">{riskData.moderate_risk_tier.macro_score ?? 75}</div>
                      <div className="text-[11px] text-slate-500 mt-1 truncate" title={riskData.moderate_risk_tier.usdinr_trend}>
                        {riskData.moderate_risk_tier.usdinr_trend}
                      </div>
                    </div>

                    <div className="fin-card p-4">
                      <div className="text-xs font-semibold text-slate-500 mb-1">Spot vs Domestic Parity</div>
                      <div className="text-sm font-black text-slate-900 mt-1 line-clamp-2">
                        {riskData.moderate_risk_tier.spot_vs_domestic_parity}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1">Tariff & retail premium</div>
                    </div>

                    <div className="fin-card p-4">
                      <div className="text-xs font-semibold text-slate-500 mb-1">Gold-to-Silver Ratio</div>
                      <div className="text-2xl font-black text-slate-900">
                        {riskData.moderate_risk_tier.gold_to_silver_ratio ?? '74.0'}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1 truncate" title={riskData.moderate_risk_tier.gold_to_silver_ratio_commentary}>
                        {riskData.moderate_risk_tier.gold_to_silver_ratio_commentary || '10Y Mean ~74.0'}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Opportunities & Risks */}
              <div className="grid md:grid-cols-2 gap-6">
                <div className="fin-card p-5">
                  <h3 className="font-bold text-slate-900 text-sm mb-3 flex items-center gap-2 text-emerald-700">
                    <TrendingUp size={16} />
                    Primary Opportunities
                  </h3>
                  <ul className="space-y-2 text-xs text-slate-700">
                    {riskData.moderate_risk_tier.opportunities?.map((item: string, idx: number) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0"></span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="fin-card p-5">
                  <h3 className="font-bold text-slate-900 text-sm mb-3 flex items-center gap-2 text-rose-700">
                    <TrendingDown size={16} />
                    Key Moderate Risks
                  </h3>
                  <ul className="space-y-2 text-xs text-slate-700">
                    {riskData.moderate_risk_tier.risks?.map((item: string, idx: number) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1.5 shrink-0"></span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Tier C: Low Risk */}
          {activeTier === 'low' && riskData.low_risk_tier && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {riskData.low_risk_tier?.market_insight && (
                <AIMarketInsightBox
                  insight={riskData.low_risk_tier.market_insight}
                  currentPrice={riskData.current_price}
                  currency={riskData.currency || 'INR'}
                  symbol={riskData.symbol}
                  tierName={assetMode === 'metals' ? "Low Risk — Store of Value & Macro Durability" : "Low Risk — Solvency & Long-Term Fundamentals"}
                />
              )}

              {/* Low Risk Metrics Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {assetMode === 'stocks' ? (
                  <>
                    <div className="fin-card p-4">
                      <div className="text-xs font-semibold text-slate-500 mb-1">Fundamental Solvency Score</div>
                      <div className="text-2xl font-black text-emerald-700">{riskData.low_risk_tier.fundamental_strength_score}</div>
                      <div className="text-[11px] text-slate-500 mt-1">Moat durability</div>
                    </div>

                    <div className="fin-card p-4">
                      <div className="text-xs font-semibold text-slate-500 mb-1">Operating Profit Margin</div>
                      <div className="text-2xl font-black text-slate-900">
                        {riskData.low_risk_tier.operating_margin ? `${riskData.low_risk_tier.operating_margin}%` : 'N/A'}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1">{riskData.low_risk_tier.ebit_stability}</div>
                    </div>

                    <div className="fin-card p-4">
                      <div className="text-xs font-semibold text-slate-500 mb-1">Debt-to-Equity Ratio</div>
                      <div className="text-2xl font-black text-slate-900">{riskData.low_risk_tier.debt_to_equity ?? 'N/A'}</div>
                      <div className="text-[11px] text-slate-500 mt-1">Solvency cushion</div>
                    </div>

                    <div className="fin-card p-4">
                      <div className="text-xs font-semibold text-slate-500 mb-1">52W Max Drawdown</div>
                      <div className="text-2xl font-black text-slate-900">{riskData.low_risk_tier.drawdown_history_pct}%</div>
                      <div className="text-[11px] text-slate-500 mt-1">Historical downside</div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="fin-card p-4">
                      <div className="text-xs font-semibold text-slate-500 mb-1">Store of Value Score</div>
                      <div className="text-2xl font-black text-emerald-700">{riskData.low_risk_tier.store_of_value_score ?? 85}</div>
                      <div className="text-[11px] text-slate-500 mt-1">Capital preservation</div>
                    </div>

                    <div className="fin-card p-4">
                      <div className="text-xs font-semibold text-slate-500 mb-1">Max Drawdown (1Y / 2Y)</div>
                      <div className="text-2xl font-black text-slate-900">
                        -{riskData.low_risk_tier.one_year_max_drawdown}%
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1">2-Year: -{riskData.low_risk_tier.two_year_max_drawdown}%</div>
                    </div>

                    <div className="fin-card p-4">
                      <div className="text-xs font-semibold text-slate-500 mb-1">Long-Term Volatility</div>
                      <div className="text-2xl font-black text-slate-900">{riskData.low_risk_tier.long_term_annualized_volatility}%</div>
                      <div className="text-[11px] text-slate-500 mt-1">Multi-year annualized</div>
                    </div>

                    <div className="fin-card p-4">
                      <div className="text-xs font-semibold text-slate-500 mb-1">USD/INR Correlation</div>
                      <div className="text-2xl font-black text-slate-900">
                        {riskData.low_risk_tier.usdinr_correlation >= 0 ? '+' : ''}{riskData.low_risk_tier.usdinr_correlation}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1">{riskData.low_risk_tier.currency_hedge_effectiveness}</div>
                    </div>
                  </>
                )}
              </div>

              {/* Long-Term Risk Factors & Solvency Moat */}
              <div className="fin-card p-5">
                <h3 className="font-bold text-slate-900 text-sm mb-3 flex items-center gap-2">
                  <Layers size={16} className="text-blue-600" />
                  {assetMode === 'metals' ? 'Long-Term Asset Risk Factors & Policy Exposure' : 'Long-Term Risk Factors & Solvency Moat'}
                </h3>
                {assetMode === 'metals' && riskData.low_risk_tier.import_duty_and_gst_risk && (
                  <div className="mb-3 p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 flex items-center gap-2">
                    <Scale size={14} className="text-slate-500 shrink-0" />
                    <span><strong>Policy & Tariff Risk:</strong> {riskData.low_risk_tier.import_duty_and_gst_risk}</span>
                  </div>
                )}
                <ul className="space-y-2 text-xs text-slate-700">
                  {riskData.low_risk_tier.long_term_risk_factors?.map((item: string, idx: number) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 mt-1.5 shrink-0"></span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
};
