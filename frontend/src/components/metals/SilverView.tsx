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
interface SilverViewProps {
  onSwitchToGold: () => void;
}

const SilverView: React.FC<SilverViewProps> = ({ onSwitchToGold }) => {
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

    return api.metals.getSilverSnapshot(forceRefresh, TARGET_CITY)
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
        const msg = err?.message || 'Failed to synchronize live silver bullion rates for Visakhapatnam.';
        console.error('Silver snapshot error:', err);
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
    return api.metals.getSilverHistory(period, TARGET_CITY, forceRefresh)
      .then((res) => {
        if (res?.status === 'available' && Array.isArray(res.records)) {
          const validated = validateAndNormalizeObservations(res.records, 'silver');
          setHistoryData(validated);
          setHistoryMeta({
            totalRecords: res.total_records_for_city || validated.length,
            coverageNote: res.coverage_note,
            availablePeriods: res.available_periods || ['5d', '1mo', '3mo', '6mo', '1y', '2y']
          });
          setHistoryError(null);
        } else if (res?.status === 'unavailable') {
          setHistoryData([]);
          setHistoryError(res.message || 'No historical silver price data is available for the selected period.');
        } else {
          setHistoryData([]);
        }
      })
      .catch((err) => {
        console.error('Silver domestic history error:', err);
        setHistoryError('Failed to retrieve historical silver price data. Please verify network connectivity.');
        setHistoryData([]);
      })
      .finally(() => setHistoryLoading(false));
  }, []);

  // Manual Trigger: Sync Silver Rates button executes live backend request for Visakhapatnam
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
  const pb = snapshot?.domestic_rates?.price_breakdown;
  const topKg = Number(snapshot?.price_per_kg || snapshot?.inr_per_kg || 0);

  const purities = snapshot?.domestic_rates?.purities || (pb && (pb.price_per_kg || pb.final_price_per_g) ? {
    silver999: {
      name: 'Silver 999 (Pure Silver)',
      purity_pct: 99.9,
      base_price_per_g: pb.base_price_per_g,
      gst_amount_per_g: pb.gst_amount_per_g,
      final_price_per_g: pb.final_price_per_g,
      price_per_10g: pb.price_per_10g,
      price_per_kg: pb.price_per_kg,
    },
    silver925: {
      name: 'Silver 925 (Sterling Silver)',
      purity_pct: 92.5,
      base_price_per_g: Number((pb.base_price_per_g * 0.925).toFixed(2)),
      gst_amount_per_g: Number((pb.gst_amount_per_g * 0.925).toFixed(2)),
      final_price_per_g: Number((pb.final_price_per_g * 0.925).toFixed(2)),
      price_per_10g: Number((pb.price_per_10g * 0.925).toFixed(2)),
      price_per_kg: Math.round(pb.price_per_kg * 0.925),
    }
  } : topKg > 0 ? {
    silver999: {
      name: 'Silver 999 (Pure Silver)',
      purity_pct: 99.9,
      base_price_per_g: Number((topKg / 1030).toFixed(2)),
      gst_amount_per_g: Number(((topKg / 1000) * 0.03).toFixed(2)),
      final_price_per_g: Number((topKg / 1000).toFixed(2)),
      price_per_10g: Number((topKg / 100).toFixed(1)),
      price_per_kg: topKg,
    },
    silver925: {
      name: 'Silver 925 (Sterling Silver)',
      purity_pct: 92.5,
      base_price_per_g: Number(((topKg * 0.925) / 1030).toFixed(2)),
      gst_amount_per_g: Number((((topKg * 0.925) / 1000) * 0.03).toFixed(2)),
      final_price_per_g: Number(((topKg * 0.925) / 1000).toFixed(2)),
      price_per_10g: Number(((topKg * 0.925) / 100).toFixed(1)),
      price_per_kg: Math.round(topKg * 0.925),
    }
  } : null);

  const benchmarks = snapshot?.international_benchmarks;

  // Extract main silver purity rate (from purities.silver999, purities.silver, or top-level fallback)
  const silverMain = purities?.silver999 || purities?.silver || (purities && Object.keys(purities).length > 0 ? (Object.values(purities)[0] as any) : null);
  const silverFinalPerGram = Number(silverMain?.final_price_per_g || snapshot?.price_per_gram || snapshot?.inr_per_1g || (snapshot?.price_per_kg ? snapshot.price_per_kg / 1000 : (snapshot?.inr_per_kg ? snapshot.inr_per_kg / 1000 : 0)) || 0);
  const silverPricePerKg = Number(silverMain?.price_per_kg || snapshot?.price_per_kg || snapshot?.inr_per_kg || (silverFinalPerGram > 0 ? Math.round(silverFinalPerGram * 1000) : 0) || 0);
  const silverPricePer10g = Number(silverMain?.price_per_10g || snapshot?.price_per_10g || snapshot?.inr_per_10g || (silverFinalPerGram > 0 ? +(silverFinalPerGram * 10).toFixed(1) : 0) || 0);
  const silver925PricePerKg = Number(purities?.silver925?.price_per_kg || (silverPricePerKg > 0 ? Math.round(silverPricePerKg * 0.925) : 0) || 0);

  // Check data availability for each card
  const hasDomesticSilverPrice = isDataAvailable && (silverPricePerKg > 0 || silverFinalPerGram > 0);
  const spotUsdOz = Number(benchmarks?.global_spot_usd_oz || snapshot?.price_usd_per_oz || 0);
  const hasSpotPrice = isDataAvailable && spotUsdOz > 0;
  const usdInrRate = Number(benchmarks?.usdinr_rate || snapshot?.usdinr_rate || 0);
  const hasUsdInrRate = isDataAvailable && usdInrRate > 0;

  const dutyPct = Number(benchmarks?.import_duty_pct ?? 15.0);
  const spreadPct = Number(benchmarks?.retail_spread_pct ?? benchmarks?.retail_premium_pct ?? 13.6);
  const cleanParityKg = Number(
    benchmarks?.forex_parity_inr_1kg ||
    benchmarks?.forex_parity_inr_kg ||
    snapshot?.inr_per_kg_forex_parity ||
    (spotUsdOz > 0 && usdInrRate > 0 ? Math.round((spotUsdOz / 31.1034768) * 1000 * usdInrRate) :
    (silverPricePerKg > 0 ? Math.round(silverPricePerKg / (1 + dutyPct / 100) / (1 + spreadPct / 100) / 1.03) : 0)) || 0
  );
  const hasCleanParity = isDataAvailable && cleanParityKg > 0;

  // Custom Tooltip for Indian Domestic Silver Historical Graph
  const CustomSilverHistoryTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-3.5 border border-slate-200 rounded-xl shadow-xl text-xs space-y-2 min-w-[220px]">
          <div className="font-bold text-slate-800 flex items-center justify-between border-b border-slate-100 pb-1.5">
            <span>Date: {label}</span>
            <span className="text-[10px] text-slate-700 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded font-mono font-bold">
              Silver 999
            </span>
          </div>
          <div className="space-y-1.5 text-slate-700">
            <div className="flex justify-between items-baseline">
              <span className="text-slate-500 font-medium">Price (1 kg, incl. GST):</span>
              <span className="text-slate-900 font-black text-sm font-mono">
                ₹{Number(data.price_silver_1kg || data.price_per_kg || data.price).toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-400">Price per gram:</span>
              <span className="font-mono text-slate-700 font-semibold">
                ₹{Number(data.price_silver_1g || data.final_price_1g || ((data.price_silver_1kg || data.price_per_kg) / 1000)).toFixed(2)} / g
              </span>
            </div>
            {(data.base_price_1g || data.base_price_silver_1g) && (
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-400">Base Price (excl. GST):</span>
                <span className="font-mono text-slate-600">
                  ₹{Number(data.base_price_1g || data.base_price_silver_1g).toFixed(2)} / g
                </span>
              </div>
            )}
            {(data.gst_amount_1g || data.gst_amount_silver_1g) && (
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-400">3% GST Amount:</span>
                <span className="font-mono text-slate-700 font-semibold">
                  ₹{Number(data.gst_amount_1kg || ((data.gst_amount_1g || data.gst_amount_silver_1g) * 1000)).toLocaleString(undefined, { maximumFractionDigits: 0 })} / kg
                </span>
              </div>
            )}
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
            <div className="w-10 h-10 rounded-xl bg-slate-500/10 border border-slate-400/30 flex items-center justify-center text-slate-700 shadow-xs">
              <Gem size={22} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                  Silver Bullion Analytics
                </h1>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-800 font-bold border border-slate-200">
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
                <span className="font-medium text-slate-700">{snapshot?.unit || 'INR per kg & USD per Troy Ounce'}</span>
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

        {/* 3 Top-Right Controls: 1) Gold Analysis, 2) Visakhapatnam Badge, 3) Sync Button */}
        <div className="flex flex-col sm:items-end gap-2 shrink-0">
          {/* 1) Gold Analysis Button (Switches back to Gold) */}
          <button
            onClick={onSwitchToGold}
            className="w-full sm:w-56 inline-flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg shadow-xs transition text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 cursor-pointer"
          >
            <Coins size={14} className="text-amber-600 shrink-0" />
            <span>Gold Analysis</span>
          </button>

          {/* 2) Fixed City Label: Visakhapatnam, Andhra Pradesh */}
          <div className="w-full sm:w-56 inline-flex items-center justify-center gap-1.5 bg-white border border-slate-200 rounded-lg px-3 py-1.5 shadow-xs">
            <MapPin size={14} className="text-slate-600 shrink-0" />
            <span className="text-xs font-bold text-slate-900">{TARGET_CITY_LABEL}</span>
          </div>

          {/* 3) Sync Silver Rates Button */}
          <button
            onClick={handleManualSync}
            disabled={isRefreshing}
            className={`w-full sm:w-56 inline-flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg shadow-xs transition ${
              isRefreshing
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                : 'text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 cursor-pointer'
            }`}
          >
            <RefreshCw size={13} className={isRefreshing ? 'animate-spin text-slate-600' : 'text-slate-600'} />
            <span>{isRefreshing ? 'Syncing Live Feed...' : 'Sync Silver Rates'}</span>
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
              `The latest silver quote tick was recorded ${Math.round((snapshot.data_age_seconds || 0) / 60)} minutes ago. Silver quotes reflect the verified Indian domestic retail session.`}
          </div>
        </div>
      )}

      {/* Complete Outage Notice */}
      {snapshot?.status === 'unavailable' && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
          <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={18} />
          <div className="text-xs text-amber-900 space-y-0.5">
            <span className="font-bold">Live Silver Market Feed Unavailable:</span>
            <p className="text-amber-700 leading-relaxed">
              {snapshot.message || 'Live silver commodity rates are temporarily unreachable. Per system integrity policy, fabricated or randomized fallback prices are strictly never generated.'}
            </p>
          </div>
        </div>
      )}

      {/* 4 Primary Cards: Domestic Silver, International Spot (XAG/USD), USD/INR Benchmark, Clean Parity */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Domestic Silver (INR / kg & / g) */}
        <div className="fin-card p-5 border-slate-300/80 bg-gradient-to-br from-white to-slate-50/60">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-1">
            <span className="truncate">Domestic Silver ({TARGET_CITY}, AP)</span>
            <span className="p-1 bg-slate-100 text-slate-700 rounded-md">
              <Gem size={14} />
            </span>
          </div>
          {snapshotLoading && !snapshot ? (
            <div className="space-y-2 py-1">
              <div className="h-8 w-36 bg-slate-200 animate-pulse rounded" />
              <div className="h-4 w-24 bg-slate-100 animate-pulse rounded" />
            </div>
          ) : hasDomesticSilverPrice ? (
            <>
              <div className="text-2xl font-black text-slate-900 tracking-tight">
                ₹{Number(silverPricePerKg).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                <span className="text-xs font-normal text-slate-500 ml-1">/ kg</span>
              </div>
              <div className="mt-1 flex items-center text-xs font-semibold text-slate-600">
                <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">
                  ₹{Number(silverFinalPerGram).toFixed(2)} / g
                </span>
                <span className="ml-2 text-[11px] text-slate-400">incl. 3% GST</span>
              </div>
              <div className="mt-2.5 pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px] text-slate-600">
                <span>10g: <strong className="text-slate-800">₹{Number(silverPricePer10g).toLocaleString()}</strong></span>
                <span className="text-slate-300">|</span>
                <span>Silver 925: <strong className="text-slate-800">₹{Number(silver925PricePerKg).toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong></span>
              </div>
            </>
          ) : (
            <div className="text-sm font-bold text-slate-400 py-2">Data Unavailable</div>
          )}
        </div>

        {/* Card 2: International Spot Silver (XAG/USD) */}
        <div className="fin-card p-5">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-1">
            <span>Global Spot Silver (XAG)</span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
              International Benchmark
            </span>
          </div>
          {snapshotLoading && !snapshot ? (
            <div className="space-y-2 py-1">
              <div className="h-8 w-32 bg-slate-200 animate-pulse rounded" />
              <div className="h-4 w-20 bg-slate-100 animate-pulse rounded" />
            </div>
          ) : hasSpotPrice ? (
            <>
              <div className="text-2xl font-black text-slate-900 tracking-tight">
                ${Number(spotUsdOz).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                <span className="text-xs font-normal text-slate-500 ml-1">/ oz</span>
              </div>
              <div className="mt-2 text-xs font-medium text-slate-500 flex items-center gap-1.5">
                <Globe size={13} className="text-blue-500" />
                <span>Spot XAG Benchmark: <strong>${Number(spotUsdOz).toFixed(2)}</strong></span>
              </div>
              <div className="mt-2 text-[10px] text-slate-400 truncate">
                Feed: {benchmarks?.source || 'Nebula Engine NME-2 (Silver Spot)'}
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

        {/* Card 4: Clean International Parity */}
        <div className="fin-card p-5">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-1">
            <span>Clean International Parity</span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
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
                ₹{Number(cleanParityKg).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                <span className="text-xs font-normal text-slate-500 ml-1">/ kg</span>
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

      {/* Gold-to-Silver Ratio (GSR) Analytical Box */}
      {isDataAvailable && snapshot?.gold_to_silver_ratio && (
        <div className="p-4 bg-gradient-to-r from-slate-50 via-white to-amber-50/40 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-slate-900 text-white flex items-center justify-center shrink-0">
              <Scale size={18} />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
                <span>Gold-to-Silver Ratio (GSR):</span>
                <span className="px-2 py-0.5 rounded-md bg-slate-900 text-white font-mono font-black text-sm">
                  {Number(snapshot.gold_to_silver_ratio).toFixed(1)}x
                </span>
                <span className="text-[11px] font-normal text-slate-500">
                  (Live Domestic Calibration)
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Measures the grams/ounces of Silver needed to purchase 1 unit of 24K Gold in the Indian domestic retail market. Historical mean is ~60–80x.
              </p>
            </div>
          </div>
          <button
            onClick={onSwitchToGold}
            className="text-xs font-semibold text-amber-700 hover:text-amber-800 bg-amber-50/80 hover:bg-amber-100/80 border border-amber-200 rounded-lg px-3 py-1.5 shrink-0 transition flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
          >
            <Coins size={13} />
            <span>Compare with Gold Rates</span>
          </button>
        </div>
      )}

      {/* Indian Domestic Silver Rates Table (Silver 999 & Silver 925 with 3% GST Breakdown) */}
      <div className="fin-card p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <Receipt className="text-slate-700" size={18} />
              <h2 className="text-base font-bold text-slate-900">
                Indian Domestic Silver Rates — {TARGET_CITY_LABEL}
              </h2>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-800 border border-slate-200">
                Nebula Metals Real-Time API
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Verified retail and wholesale silver prices in Indian Rupees (INR) with mandatory 3% GST breakout per gram and per kg.
            </p>
          </div>
          {snapshot?.domestic_rates?.date && (
            <div className="text-xs text-slate-500 flex items-center gap-1.5">
              <Calendar size={13} className="text-slate-400" />
              <span>Session Date: <strong>{snapshot.domestic_rates.date}</strong></span>
            </div>
          )}
        </div>

        {/* Purity Breakdown Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[11px]">
                <th className="py-2.5 px-3">Purity / Grade</th>
                <th className="py-2.5 px-3">Base Price / g</th>
                <th className="py-2.5 px-3">GST (3%) / g</th>
                <th className="py-2.5 px-3 font-bold text-slate-700">Final Price / gram</th>
                <th className="py-2.5 px-3">Price per 10g</th>
                <th className="py-2.5 px-3 font-bold text-slate-900 bg-slate-100/70 rounded-t">Price per kg</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
              {purities ? (
                Object.entries(purities).map(([key, p]: [string, any]) => (
                  <tr key={key} className="hover:bg-slate-50/80 transition">
                    <td className="py-3 px-3">
                      <div className="font-bold text-slate-900 text-sm">{p.name || key.toUpperCase()}</div>
                      <span className="text-[10px] text-slate-400">
                        {p.purity_pct ? `${p.purity_pct}% Fine Silver` : key === 'silver999' ? '99.9% Pure Silver' : '92.5% Sterling Silver'}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-600 font-mono">
                      ₹{Number(p.base_price_per_g).toFixed(2)}
                    </td>
                    <td className="py-3 px-3 text-slate-700 font-mono font-semibold">
                      ₹{Number(p.gst_amount_per_g).toFixed(2)}
                    </td>
                    <td className="py-3 px-3 font-bold text-slate-900 font-mono text-sm">
                      ₹{Number(p.final_price_per_g).toFixed(2)}
                    </td>
                    <td className="py-3 px-3 text-slate-600 font-mono">
                      ₹{Number(p.price_per_10g).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                    </td>
                    <td className="py-3 px-3 font-black text-slate-900 bg-slate-100/70 font-mono text-sm">
                      ₹{Number(p.price_per_kg).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>
                  </tr>
                ))
              ) : (snapshot?.price_per_kg || snapshot?.inr_per_kg) ? (
                <tr className="hover:bg-slate-50/80 transition">
                  <td className="py-3 px-3">
                    <div className="font-bold text-slate-900 text-sm">Silver 999 (Pure Silver)</div>
                    <span className="text-[10px] text-slate-400">99.9% Fine Silver</span>
                  </td>
                  <td className="py-3 px-3 text-slate-600 font-mono">
                    ₹{Number(snapshot.base_price_1g || snapshot.base_price_per_1g || ((snapshot.price_per_kg || snapshot.inr_per_kg) / 1030)).toFixed(2)}
                  </td>
                  <td className="py-3 px-3 text-slate-700 font-mono font-semibold">
                    ₹{Number(snapshot.gst_amount_1g || snapshot.gst_amount_per_1g || (((snapshot.price_per_kg || snapshot.inr_per_kg) / 1000) * 0.03)).toFixed(2)}
                  </td>
                  <td className="py-3 px-3 font-bold text-slate-900 font-mono text-sm">
                    ₹{Number(snapshot.price_per_gram || snapshot.inr_per_1g || ((snapshot.price_per_kg || snapshot.inr_per_kg) / 1000)).toFixed(2)}
                  </td>
                  <td className="py-3 px-3 text-slate-600 font-mono">
                    ₹{Number(snapshot.price_per_10g || snapshot.inr_per_10g || ((snapshot.price_per_kg || snapshot.inr_per_kg) / 100)).toLocaleString()}
                  </td>
                  <td className="py-3 px-3 font-black text-slate-900 bg-slate-100/70 font-mono text-sm">
                    ₹{Number(snapshot.price_per_kg || snapshot.inr_per_kg).toLocaleString()}
                  </td>
                </tr>
              ) : (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-400">
                    Domestic silver price breakdown currently unavailable for {TARGET_CITY_LABEL}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Indian Domestic Silver Price History Line Graph */}
      <div className="fin-card p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">
                Indian Domestic Silver Price History
              </h2>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200">
                Silver 999 • 3% GST Included
              </span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                {TARGET_CITY}, AP
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Silver 999 prices (INR per kg, including 3% GST), sourced from Nebula Metals for {TARGET_CITY_LABEL}. Domestic Indian retail series with 15% customs duty and 3% GST.
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
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-start gap-2.5 text-xs text-slate-800">
            <Info size={16} className="text-slate-600 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <span className="font-bold">Historical Data Integrity: </span>
              {historyMeta.coverageNote}
            </div>
          </div>
        )}

        {/* Insufficient History Warning if observations are fewer than expected for range */}
        {!historyLoading && !historyError && historyData.length > 0 && historyData.length < (MIN_EXPECTED_POINTS_BY_RANGE[historyRange] || 4) && (
          <div className="p-2.5 bg-slate-100 border border-slate-300 rounded-lg flex items-center gap-2 text-xs text-slate-800">
            <AlertTriangle size={15} className="text-slate-600 shrink-0" />
            <span>
              The selected period ({historyRange.toUpperCase()}) has limited historical coverage ({historyData.length} observation{historyData.length === 1 ? '' : 's'} recorded).
            </span>
          </div>
        )}

        <div className="h-80 w-full relative">
          {historyLoading ? (
            <div className="h-full flex flex-col items-center justify-center space-y-2 text-xs text-slate-400">
              <RefreshCw className="animate-spin text-slate-500" size={22} />
              <span className="font-medium text-slate-700">Loading genuine domestic silver price history for {TARGET_CITY_LABEL}...</span>
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
                className="mt-1 px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer"
              >
                <RefreshCw size={12} />
                <span>Retry Historical Fetch</span>
              </button>
            </div>
          ) : historyData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={historyData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorSilverDomestic" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#475569" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#475569" stopOpacity={0.02} />
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
                  domain={['dataMin - 1500', 'dataMax + 1500']}
                  tickFormatter={(val) => `₹${Number(val).toLocaleString('en-IN')}`}
                />
                <Tooltip content={<CustomSilverHistoryTooltip />} />
                <Area
                  type="monotone"
                  dataKey="price_silver_1kg"
                  stroke="#475569"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#colorSilverDomestic)"
                  dot={historyData.length <= 1 ? { r: 5, fill: '#475569', stroke: '#FFFFFF', strokeWidth: 2 } : false}
                  activeDot={{ r: 6, fill: '#475569', stroke: '#FFFFFF', strokeWidth: 2 }}
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
                className="mt-2 text-xs text-slate-700 font-semibold underline cursor-pointer hover:text-slate-900"
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

export { SilverView };
export default SilverView;
