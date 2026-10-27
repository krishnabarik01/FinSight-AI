import React, { useState, useEffect, useCallback } from 'react';
import {
  Coins,
  Gem,
  RefreshCw,
  Info,
  ShieldCheck,
  Calendar,
  AlertTriangle,
  Clock,
  AlertCircle,
  MapPin,
  Receipt,
  Globe,
  Scale
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import { api } from '../../services/api';
import {
  TARGET_CITY,
  TARGET_CITY_LABEL,
  formatTime,
  formatDate,
  validateAndNormalizeObservations,
  type NormalizedMetalObservation,
  MIN_EXPECTED_POINTS_BY_RANGE
} from './metalUtils';
interface GoldViewProps {
  onSwitchToSilver: () => void;
}

const GoldView: React.FC<GoldViewProps> = ({ onSwitchToSilver }) => {
  const [snapshot, setSnapshot] = useState<any>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const [historyRange, setHistoryRange] = useState('1mo');
  const [historyData, setHistoryData] = useState<NormalizedMetalObservation[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyMeta, setHistoryMeta] = useState<{
    totalRecords?: number;
    coverageNote?: string;
    availablePeriods?: string[];
  }>({});

  // Fetch live market snapshot from backend Nebula Metals integration (Visakhapatnam only)
  const fetchSnapshot = useCallback((forceRefresh = false) => {
    if (forceRefresh) {
      setSyncing(true);
      setSyncError(null);
    } else {
      setSnapshotLoading(true);
    }

    return api.gold.getSnapshot(forceRefresh, TARGET_CITY)
      .then((res) => {
        if (res?.api_error) {
          setSyncError(res.api_error);
        } else {
          setSyncError(null);
        }
        if (res && res.status) {
          setSnapshot(res);
        }
        return res;
      })
      .catch((err) => {
        const msg = err?.message || 'Failed to synchronize live bullion rates for Visakhapatnam.';
        console.error('Gold snapshot error:', err);
        setSyncError(msg);
      })
      .finally(() => {
        setSnapshotLoading(false);
        setSyncing(false);
      });
  }, []);

  // Fetch genuine Indian domestic historical records from Nebula Metals database for Visakhapatnam
  const fetchHistory = useCallback((period: string, forceRefresh = false) => {
    setHistoryLoading(true);
    setHistoryError(null);
    return api.gold.getHistory(period, TARGET_CITY, forceRefresh)
      .then((res) => {
        if (res?.status === 'available' && Array.isArray(res.records)) {
          const validated = validateAndNormalizeObservations(res.records, 'gold');
          setHistoryData(validated);
          setHistoryMeta({
            totalRecords: res.total_records_for_city || validated.length,
            coverageNote: res.coverage_note,
            availablePeriods: res.available_periods || ['5d', '1mo', '3mo', '6mo', '1y', '2y']
          });
          setHistoryError(null);
        } else if (res?.status === 'unavailable') {
          setHistoryData([]);
          setHistoryError(res.message || 'No historical gold price data is available for the selected period.');
        } else {
          setHistoryData([]);
        }
      })
      .catch((err) => {
        console.error('Gold domestic history error:', err);
        setHistoryError('Failed to retrieve historical gold price data. Please verify network connectivity.');
        setHistoryData([]);
      })
      .finally(() => setHistoryLoading(false));
  }, []);

  // Manual Trigger: Sync Bullion Rates button executes live backend request for Visakhapatnam
  const handleManualSync = () => {
    fetchSnapshot(true);
    fetchHistory(historyRange, true);
  };

  // Initial snapshot fetch
  useEffect(() => {
    fetchSnapshot(false);
  }, [fetchSnapshot]);

  // History fetch on range change or initially
  useEffect(() => {
    fetchHistory(historyRange, false);
  }, [fetchHistory, historyRange]);

  // Range change triggers history fetch
  const handleRangeChange = (r: string) => {
    if (r !== historyRange) {
      setHistoryRange(r);
    }
  };

  // Automatic Background Refresh (300s / 5m to strictly respect API usage quota limits)
  useEffect(() => {
    const AUTO_REFRESH_INTERVAL_MS = 300000; // 5 minutes
    const intervalId = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        fetchSnapshot(false);
        fetchHistory(historyRange, false);
      }
    }, AUTO_REFRESH_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [fetchSnapshot, fetchHistory, historyRange]);

  const isDataAvailable = snapshot?.status === 'available';
  const isRefreshing = snapshotLoading || syncing;
  const purities = snapshot?.domestic_rates?.purities;
  const benchmarks = snapshot?.international_benchmarks;

  // Clean International Parity & Forex Benchmark Calculations
  const spotUsdOz = Number(benchmarks?.global_spot_usd_oz || snapshot?.price_usd_per_oz || 0);
  const hasSpotPrice = isDataAvailable && spotUsdOz > 0;
  const usdInrRate = Number(benchmarks?.usdinr_rate || snapshot?.usdinr_rate || snapshot?.exchange_rate_usd_inr || 0);
  const hasUsdInrRate = isDataAvailable && usdInrRate > 0;
  const p24k10g = Number(
    snapshot?.price_per_10g_24k ||
    snapshot?.inr_per_10g_estimate ||
    purities?.['24k']?.price_per_10g ||
    snapshot?.karats?.['24k_10g'] ||
    0
  );
  const dutyPct = Number(benchmarks?.import_duty_pct ?? 15.0);
  const spreadPct = Number(benchmarks?.retail_spread_pct ?? 0.93);
  const cleanParity10g = Number(
    benchmarks?.forex_parity_inr_10g ||
    snapshot?.inr_per_10g_forex_parity ||
    (spotUsdOz > 0 && usdInrRate > 0 ? Math.round((spotUsdOz / 31.1034768) * 10 * usdInrRate) :
    (p24k10g > 0 ? Math.round(p24k10g / (1 + dutyPct / 100) / (1 + spreadPct / 100) / 1.03) : 0)) || 0
  );
  const hasCleanParity = isDataAvailable && cleanParity10g > 0;

  // Custom Tooltip for Indian Domestic Gold Historical Graph
  const CustomHistoryTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-3.5 border border-slate-200 rounded-xl shadow-xl text-xs space-y-2 min-w-[220px]">
          <div className="font-bold text-slate-800 flex items-center justify-between border-b border-slate-100 pb-1.5">
            <span>Date: {label}</span>
            <span className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded font-mono font-bold">
              24K Gold
            </span>
          </div>
          <div className="space-y-1.5 text-slate-700">
            <div className="flex justify-between items-baseline">
              <span className="text-slate-500 font-medium">Price (10g, incl. GST):</span>
              <span className="text-slate-900 font-black text-sm font-mono">
                ₹{Number(data.price_24k_10g).toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-400">Base Price (excl. GST):</span>
              <span className="font-mono text-slate-600">
                ₹{Number(data.base_price_24k_1g).toLocaleString()} / g
              </span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-400">3% GST Amount:</span>
              <span className="font-mono text-amber-700 font-semibold">
                ₹{Number(data.gst_amount_24k_10g || (data.gst_amount_24k_1g * 10)).toLocaleString()} / 10g
              </span>
            </div>
            {data.change !== 0 && (
              <div className="flex justify-between text-[11px] pt-1 border-t border-slate-100">
                <span className="text-slate-400">Daily Change:</span>
                <span className={`font-mono font-bold ${data.change >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {data.change >= 0 ? '+' : ''}₹{data.change} ({data.change_pct >= 0 ? '+' : ''}{data.change_pct}%)
                </span>
              </div>
            )}
            <div className="text-[10px] text-slate-400 pt-0.5">
              Source: Nebula Metals ({TARGET_CITY})
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-400/30 flex items-center justify-center text-amber-600 shadow-xs">
              <Coins size={22} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                  Gold Bullion Analytics
                </h1>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold border border-amber-200">
                  {snapshot?.data_source ? snapshot.data_source.split('(')[0].trim() : 'Nebula Metals API'}
                </span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
                  Base: ₹ INR ({TARGET_CITY}, AP)
                </span>
                {/* Verified Freshness Badge */}
                {isDataAvailable && (
                  snapshot.is_realtime ? (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold border border-emerald-300 flex items-center gap-1">
                      <ShieldCheck size={12} className="text-emerald-700" />
                      Live Indian Domestic Feed
                    </span>
                  ) : (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 font-semibold border border-amber-300 flex items-center gap-1">
                      <Clock size={12} className="text-amber-700" />
                      Delayed / Closed Market ({Math.max(1, Math.round((snapshot.data_age_seconds || 0) / 60))}m)
                    </span>
                  )
                )}
              </div>

              {/* Data Timestamps & Freshness */}
              <div className="text-xs sm:text-sm text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
                <span className="font-medium text-slate-700">{snapshot?.unit || 'INR per 10g & USD per Troy Ounce'}</span>
                {snapshot && (
                  <>
                    <span>•</span>
                    <span className="text-slate-500 text-[11px] flex items-center gap-1">
                      <Clock size={12} className="text-slate-400" />
                      <strong>Verified Market Tick:</strong>{' '}
                      <span className="font-mono text-slate-800">
                        {formatTime(snapshot.market_timestamp || snapshot.last_updated)}
                      </span>
                      {formatDate(snapshot.market_timestamp) && (
                        <span className="text-slate-400">({formatDate(snapshot.market_timestamp)})</span>
                      )}
                    </span>
                    <span>•</span>
                    <span className="text-slate-500 text-[11px]">
                      <strong>Last Synced:</strong>{' '}
                      <span className="font-mono text-slate-800">
                        {formatTime(snapshot.fetched_at || snapshot.last_updated)}
                      </span>
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 3 Top-Right Controls: 1) Silver Analysis, 2) Visakhapatnam Badge, 3) Sync Button */}
        <div className="flex flex-col sm:items-end gap-2 shrink-0">
          {/* 1) Silver Analysis Button */}
          <button
            onClick={onSwitchToSilver}
            className="w-full sm:w-56 inline-flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg shadow-xs transition text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 cursor-pointer"
          >
            <Gem size={14} className="text-slate-500 shrink-0" />
            <span>Silver Analysis</span>
          </button>

          {/* 2) Fixed City Label: Visakhapatnam, Andhra Pradesh */}
          <div className="w-full sm:w-56 inline-flex items-center justify-center gap-1.5 bg-white border border-slate-200 rounded-lg px-3 py-1.5 shadow-xs">
            <MapPin size={14} className="text-amber-600 shrink-0" />
            <span className="text-xs font-bold text-slate-900">{TARGET_CITY_LABEL}</span>
          </div>

          {/* 3) Sync Bullion Rates Button */}
          <button
            onClick={handleManualSync}
            disabled={isRefreshing}
            className={`w-full sm:w-56 inline-flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg shadow-xs transition ${
              isRefreshing
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                : 'text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 cursor-pointer'
            }`}
          >
            <RefreshCw size={13} className={isRefreshing ? 'animate-spin text-amber-600' : 'text-slate-600'} />
            <span>{isRefreshing ? 'Syncing Live Feed...' : 'Sync Bullion Rates'}</span>
          </button>
        </div>
      </div>

      {/* Sync Error Notice */}
      {syncError && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3">
          <AlertCircle className="text-rose-600 shrink-0 mt-0.5" size={17} />
          <div className="text-xs text-rose-900 space-y-0.5">
            <span className="font-bold">API Synchronization Notice:</span>
            <p className="text-rose-700 leading-relaxed">{syncError}</p>
          </div>
        </div>
      )}

      {/* Stale Feed Warning Banner */}
      {isDataAvailable && snapshot?.is_stale && !syncError && (
        <div className="p-3 bg-amber-50/90 border border-amber-200 rounded-xl flex items-start gap-2.5">
          <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={16} />
          <div className="text-xs text-amber-900 leading-relaxed">
            <span className="font-bold">Market Session Notice: </span>
            {snapshot.freshness_warning ||
              `The latest quote tick was recorded ${Math.round((snapshot.data_age_seconds || 0) / 60)} minutes ago. Bullion quotes reflect the verified Indian domestic retail session.`}
          </div>
        </div>
      )}

      {/* Complete Outage Notice */}
      {snapshot?.status === 'unavailable' && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
          <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={18} />
          <div className="text-xs text-amber-900 space-y-0.5">
            <span className="font-bold">Live Market Feed Unavailable:</span>
            <p className="text-amber-700 leading-relaxed">
              {snapshot.message || 'Live commodity rates are temporarily unreachable. Per system integrity policy, fabricated or randomized fallback prices are strictly never generated.'}
            </p>
          </div>
        </div>
      )}

      {/* 4 Primary Cards: Domestic 24K Gold, International Spot (XAU/USD), USD/INR Benchmark, Import Duty & Clean Parity */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Domestic 24K Gold (INR / 10g) */}
        <div className="fin-card p-5 border-amber-200/80 bg-gradient-to-br from-white to-amber-50/30">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-1">
            <span className="truncate">24K Domestic Gold ({TARGET_CITY}, AP)</span>
            <span className="p-1 bg-amber-100 text-amber-700 rounded-md">
              <Coins size={14} />
            </span>
          </div>
          {snapshotLoading && !snapshot ? (
            <div className="space-y-2 py-1">
              <div className="h-8 w-36 bg-slate-200 animate-pulse rounded" />
              <div className="h-4 w-24 bg-slate-100 animate-pulse rounded" />
            </div>
          ) : isDataAvailable && snapshot.inr_per_10g_estimate ? (
            <>
              <div className="text-2xl font-black text-slate-900 tracking-tight">
                ₹{Number(snapshot.inr_per_10g_estimate).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                <span className="text-xs font-normal text-slate-500 ml-1">/ 10g</span>
              </div>
              <div className="mt-1 flex items-center text-xs font-semibold text-slate-600">
                <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">
                  ₹{Number(purities?.['24k']?.final_price_per_g || snapshot.karats?.['24k_1g'] || 0).toLocaleString()} / g
                </span>
                <span className="ml-2 text-[11px] text-slate-400">incl. 3% GST</span>
              </div>
              {snapshot.karats && (
                <div className="mt-2.5 pt-2 border-t border-amber-200/60 flex items-center justify-between text-[11px] text-slate-600">
                  <span>22K: <strong className="text-slate-800">₹{Number(snapshot.karats['22k_10g']).toLocaleString()}</strong></span>
                  <span className="text-slate-300">|</span>
                  <span>18K: <strong className="text-slate-800">₹{Number(snapshot.karats['18k_10g']).toLocaleString()}</strong></span>
                </div>
              )}
            </>
          ) : (
            <div className="text-sm font-bold text-slate-400 py-2">Data Unavailable</div>
          )}
        </div>

        {/* Card 2: International Spot (XAU/USD) Benchmark */}
        <div className="fin-card p-5">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-1">
            <span>Global Spot Gold (XAU)</span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
              International Benchmark
            </span>
          </div>
          {snapshotLoading && !snapshot ? (
            <div className="space-y-2 py-1">
              <div className="h-8 w-32 bg-slate-200 animate-pulse rounded" />
              <div className="h-4 w-20 bg-slate-100 animate-pulse rounded" />
            </div>
          ) : isDataAvailable ? (
            <>
              <div className="text-2xl font-black text-slate-900 tracking-tight">
                ${Number(benchmarks?.global_spot_usd_oz || snapshot.price_usd_per_oz).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                <span className="text-xs font-normal text-slate-500 ml-1">/ oz</span>
              </div>
              <div className="mt-2 text-xs font-medium text-slate-500 flex items-center gap-1.5">
                <Globe size={13} className="text-blue-500" />
                <span>COMEX Futures Benchmark: <strong>${Number(snapshot.price_usd_per_oz).toFixed(2)}</strong></span>
              </div>
              <div className="mt-2 text-[10px] text-slate-400 truncate">
                Feed: {benchmarks?.source || 'Nebula Engine NME-2 (XAU/USD Spot)'}
              </div>
            </>
          ) : (
            <div className="text-sm font-bold text-slate-400 py-2">Data Unavailable</div>
          )}
        </div>

        {/* Card 3: USD / INR Exchange Rate Benchmark */}
        <div className="fin-card p-5">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-1">
            <span>USD / INR Exchange Rate</span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
              Forex Benchmark
            </span>
          </div>
          {snapshotLoading && !snapshot ? (
            <div className="space-y-2 py-1">
              <div className="h-8 w-24 bg-slate-200 animate-pulse rounded" />
              <div className="h-4 w-20 bg-slate-100 animate-pulse rounded" />
            </div>
          ) : hasUsdInrRate ? (
            <>
              <div className="text-2xl font-black text-slate-900 tracking-tight">
                ₹{Number(usdInrRate).toFixed(2)}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                1 USD = ₹{Number(usdInrRate).toFixed(4)}
              </div>
              <div className="mt-2 pt-1.5 border-t border-slate-100 flex flex-col text-[10px] text-slate-400 space-y-0.5">
                <span className="truncate">Source: {snapshot.usdinr_source || 'ECB Forex Reference (Derived)'}</span>
                <span>Type: Official RBI / Domestic Calibration Reference</span>
              </div>
            </>
          ) : (
            <div className="text-sm font-bold text-slate-400 py-2">Data Unavailable</div>
          )}
        </div>

        {/* Card 4: Import Duty & Clean International Parity */}
        <div className="fin-card p-5">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-1">
            <span>Clean International Parity</span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
              Excl. Taxes
            </span>
          </div>
          {snapshotLoading && !snapshot ? (
            <div className="space-y-2 py-1">
              <div className="h-8 w-28 bg-slate-200 animate-pulse rounded" />
              <div className="h-4 w-20 bg-slate-100 animate-pulse rounded" />
            </div>
          ) : hasCleanParity ? (
            <>
              <div className="text-2xl font-black text-slate-900 tracking-tight">
                ₹{Number(cleanParity10g).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                <span className="text-xs font-normal text-slate-500 ml-1">/ 10g</span>
              </div>
              <div className="mt-2 text-xs font-semibold text-slate-600 flex items-center justify-between">
                <span>Duty: {dutyPct.toFixed(1)}%</span>
                <span className="text-slate-300">•</span>
                <span>GST: 3.0%</span>
                <span className="text-slate-300">•</span>
                <span>Spread: +{spreadPct.toFixed(1)}%</span>
              </div>
              <div className="mt-2 text-[10px] text-slate-400">
                Domestic rate includes customs duty & 3% GST on top of clean international parity.
              </div>
            </>
          ) : (
            <div className="text-sm font-bold text-slate-400 py-2">Data Unavailable</div>
          )}
        </div>
      </div>

      {/* Indian Domestic Rates Table (24K, 22K, 18K, 14K with 3% GST Breakdown) */}
      <div className="fin-card p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <Receipt className="text-amber-600" size={18} />
              <h2 className="text-base font-bold text-slate-900">
                Indian Domestic Gold Rates — {TARGET_CITY_LABEL}
              </h2>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                Nebula Metals Real-Time API
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Verified retail and wholesale prices in Indian Rupees (INR) with mandatory 3% GST breakout per gram and per 10 grams.
            </p>
          </div>
          {snapshot?.domestic_rates?.date && (
            <div className="text-xs text-slate-500 flex items-center gap-1.5">
              <Calendar size={13} className="text-slate-400" />
              <span>Session Date: <strong>{snapshot.domestic_rates.date}</strong></span>
            </div>
          )}
        </div>

        {/* Purity Breakdown Cards / Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[11px]">
                <th className="py-2.5 px-3">Purity / Karat</th>
                <th className="py-2.5 px-3">Base Price / g</th>
                <th className="py-2.5 px-3">GST (3%) / g</th>
                <th className="py-2.5 px-3 font-bold text-slate-700">Final Price / gram</th>
                <th className="py-2.5 px-3 font-bold text-amber-800 bg-amber-50/50 rounded-t">Price per 10g</th>
                <th className="py-2.5 px-3">Price per 100g</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
              {purities ? (
                Object.entries(purities).map(([karatKey, p]: [string, any]) => (
                  <tr key={karatKey} className="hover:bg-slate-50/80 transition">
                    <td className="py-3 px-3">
                      <div className="font-bold text-slate-900 text-sm">{p.name || `${karatKey.toUpperCase()}`}</div>
                      <span className="text-[10px] text-slate-400">
                        {karatKey === '24k' ? '99.9% Pure Gold' : karatKey === '22k' ? 'Standard Jewelry Gold' : karatKey === '18k' ? '75.0% Fine Gold' : '58.5% Gold'}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-600 font-mono">
                      ₹{Number(p.base_price_per_g).toLocaleString()}
                    </td>
                    <td className="py-3 px-3 text-amber-700 font-mono font-semibold">
                      ₹{Number(p.gst_amount_per_g).toLocaleString()}
                    </td>
                    <td className="py-3 px-3 font-bold text-slate-900 font-mono text-sm">
                      ₹{Number(p.final_price_per_g).toLocaleString()}
                    </td>
                    <td className="py-3 px-3 font-black text-amber-900 bg-amber-50/50 font-mono text-sm">
                      ₹{Number(p.price_per_10g).toLocaleString()}
                    </td>
                    <td className="py-3 px-3 text-slate-600 font-mono">
                      ₹{Number(p.price_per_100g).toLocaleString()}
                    </td>
                  </tr>
                ))
              ) : snapshot?.karats ? (
                ['24k', '22k', '18k', '14k'].map((k) => (
                  <tr key={k} className="hover:bg-slate-50/80 transition">
                    <td className="py-3 px-3 font-bold text-slate-900">{k.toUpperCase()} Gold</td>
                    <td className="py-3 px-3 text-slate-500 font-mono">—</td>
                    <td className="py-3 px-3 text-slate-500 font-mono">—</td>
                    <td className="py-3 px-3 font-bold text-slate-900 font-mono">
                      ₹{Number(snapshot.karats[`${k}_1g`] || (snapshot.karats[`${k}_10g`] / 10)).toLocaleString()}
                    </td>
                    <td className="py-3 px-3 font-black text-amber-900 bg-amber-50/50 font-mono">
                      ₹{Number(snapshot.karats[`${k}_10g`]).toLocaleString()}
                    </td>
                    <td className="py-3 px-3 text-slate-500 font-mono">—</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-400">
                    Domestic price breakdown currently unavailable for {TARGET_CITY_LABEL}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Indian Domestic Gold Price History Line Graph */}
      <div className="fin-card p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">
                Indian Domestic Gold Price History
              </h2>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
                24K Gold • 3% GST Included
              </span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                {TARGET_CITY}, AP
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              24K gold prices including 3% GST, sourced from Nebula Metals for {TARGET_CITY_LABEL}. Domestic Indian retail series with 15% customs duty and 3% GST.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Range filters */}
            <div className="flex items-center space-x-1 bg-slate-100 p-0.5 rounded-lg text-xs font-semibold">
              {[
                { label: '5D', val: '5d' },
                { label: '1M', val: '1mo' },
                { label: '3M', val: '3mo' },
                { label: '6M', val: '6mo' },
                { label: '1Y', val: '1y' },
                { label: '2Y', val: '2y' }
              ].map((r) => {
                const isActive = historyRange === r.val;
                return (
                  <button
                    key={r.val}
                    onClick={() => handleRangeChange(r.val)}
                    className={`px-2 py-1 rounded-md transition cursor-pointer ${
                      isActive ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {r.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Coverage Note Notice Banner */}
        {historyMeta?.coverageNote && (
          <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl flex items-start gap-2.5 text-xs text-amber-900">
            <Info size={16} className="text-amber-700 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <span className="font-bold">Historical Data Integrity: </span>
              {historyMeta.coverageNote}
            </div>
          </div>
        )}

        {/* Insufficient History Warning if observations are fewer than expected for range */}
        {!historyLoading && !historyError && historyData.length > 0 && historyData.length < (MIN_EXPECTED_POINTS_BY_RANGE[historyRange] || 4) && (
          <div className="p-2.5 bg-amber-50/80 border border-amber-300 rounded-lg flex items-center gap-2 text-xs text-amber-800">
            <AlertTriangle size={15} className="text-amber-600 shrink-0" />
            <span>
              The selected period ({historyRange.toUpperCase()}) has limited historical coverage ({historyData.length} observation{historyData.length === 1 ? '' : 's'} recorded).
            </span>
          </div>
        )}

        <div className="h-80 w-full relative">
          {historyLoading ? (
            <div className="h-full flex flex-col items-center justify-center space-y-2 text-xs text-slate-400">
              <RefreshCw className="animate-spin text-amber-500" size={22} />
              <span className="font-medium text-slate-700">Loading genuine domestic gold price history for {TARGET_CITY_LABEL}...</span>
              <span className="text-[11px] text-slate-400">Fetching verified daily observations ({historyRange.toUpperCase()})</span>
            </div>
          ) : historyError ? (
            <div className="h-full flex flex-col items-center justify-center space-y-2.5 text-xs text-rose-600 p-4 text-center">
              <AlertCircle size={24} className="text-rose-500" />
              <div className="font-semibold text-rose-800">{historyError}</div>
              <p className="text-[11px] text-slate-500 max-w-md">
                Historical market observations could not be loaded for the selected period ({historyRange.toUpperCase()}).
              </p>
              <button
                onClick={() => fetchHistory(historyRange, true)}
                className="mt-1 px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer"
              >
                <RefreshCw size={12} />
                <span>Retry Historical Fetch</span>
              </button>
            </div>
          ) : historyData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={historyData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorGoldDomestic" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#D97706" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#D97706" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: '#94A3B8' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(d) => {
                    if (!d) return '';
                    const parts = String(d).split('-');
                    return parts.length === 3 ? `${parts[1]}/${parts[2]}` : d;
                  }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#94A3B8' }}
                  tickLine={false}
                  axisLine={false}
                  domain={['dataMin - 800', 'dataMax + 800']}
                  tickFormatter={(val) => `₹${Number(val).toLocaleString('en-IN')}`}
                />
                <Tooltip content={<CustomHistoryTooltip />} />
                <Area
                  type="monotone"
                  dataKey="price_24k_10g"
                  stroke="#D97706"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#colorGoldDomestic)"
                  dot={historyData.length <= 1 ? { r: 5, fill: '#D97706', stroke: '#FFFFFF', strokeWidth: 2 } : false}
                  activeDot={{ r: 6, fill: '#D97706', stroke: '#FFFFFF', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-xs text-slate-400 space-y-1.5 p-4 text-center">
              <Info size={20} className="text-slate-300" />
              <span className="font-semibold text-slate-600">No historical price data is available for the selected period.</span>
              <p className="text-[11px] text-slate-400">
                Verified observations for {historyRange.toUpperCase()} are currently not recorded for {TARGET_CITY_LABEL}.
              </p>
              <button
                onClick={handleManualSync}
                className="mt-2 text-xs text-amber-700 font-semibold underline cursor-pointer hover:text-amber-800"
              >
                Sync rates now to capture today's snapshot
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export { GoldView };
export default GoldView;
