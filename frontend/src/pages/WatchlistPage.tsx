import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Eye,
  Plus,
  Trash2,
  TrendingUp,
  TrendingDown,
  Shield,
  ArrowRight,
  RefreshCw,
  Search,
  Sliders,
  Target,
  ShieldAlert,
  CheckCircle2,
  AlertCircle,
  Clock,
  Radio,
  AlertTriangle,
  X
} from 'lucide-react';
import { api } from '../services/api';
import { formatINR } from '../utils/currency';
import { normalizeLiveQuote, type LiveQuote } from '../hooks/useLiveQuote';
import { StockSelector, type StockOption } from '../components/common/StockSelector';

interface WatchlistRow {
  symbol: string;
  cleanSymbol: string;
  companyName: string;
  targetPrice?: number;
  stopLoss?: number;
}

interface WatchlistPageProps {
  onSelectStock: (symbol: string) => void;
  onNavigateTab: (tab: string) => void;
}

export const WatchlistPage: React.FC<WatchlistPageProps> = ({ onSelectStock, onNavigateTab }) => {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [watchlistRows, setWatchlistRows] = useState<WatchlistRow[]>([]);
  const [selectedForRemoval, setSelectedForRemoval] = useState<Set<string>>(new Set());
  const [showAddModal, setShowAddModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string>('');

  const reqIdRef = useRef<number>(0);
  const inFlightRef = useRef<boolean>(false);

  // Hydrates watchlist items with fresh batch quotes from single source of truth
  const hydrateWithLiveQuotes = useCallback(async (baseItems: any[], forceRefresh = false) => {
    if (!baseItems || baseItems.length === 0) {
      setRefreshing(false);
      return;
    }
    if (inFlightRef.current) return;

    inFlightRef.current = true;
    const currentReqId = ++reqIdRef.current;
    const symbols = Array.from(new Set(baseItems.map(i => i.symbol).filter(Boolean)));
    if (symbols.length === 0) {
      inFlightRef.current = false;
      return;
    }

    const ALIAS_MAP: Record<string, string> = { SBI: 'SBIN' };

    try {
      const liveList = await api.quotes.getBatchQuotes(symbols, forceRefresh);
      if (currentReqId !== reqIdRef.current) return;

      const liveMap: Record<string, LiveQuote> = {};
      if (Array.isArray(liveList)) {
        for (const q of liveList) {
          const norm = normalizeLiveQuote(q);
          if (norm.clean_symbol) liveMap[norm.clean_symbol.toUpperCase()] = norm;
          if (norm.symbol) liveMap[norm.symbol.toUpperCase()] = norm;
        }
      }

      setItems(prevItems =>
        prevItems.map(item => {
          const symKey = (item.symbol || '').toUpperCase();
          const cleanKey = symKey.replace('.NS', '').replace('.BO', '');
          const aliasKey = ALIAS_MAP[cleanKey] || cleanKey;
          const live = liveMap[cleanKey] || liveMap[symKey] || liveMap[aliasKey] || liveMap[`${aliasKey}.NS`];
          if (!live) return item;

          return {
            ...item,
            price: live.price > 0 ? live.price : item.price,
            change: live.change,
            change_pct: live.change_percent,
            source: live.source,
            data_source: live.data_source,
            timestamp: live.timestamp,
            last_updated: live.last_updated,
            data_status: live.data_status,
            is_stale: live.is_stale,
            volume: live.volume || item.volume,
            company_name: live.company_name || item.company_name,
          };
        })
      );
      setLastRefreshedAt(new Date().toLocaleTimeString());
    } catch (err: any) {
      console.warn('Batch quote hydration notice:', err.message);
    } finally {
      inFlightRef.current = false;
      setRefreshing(false);
    }
  }, []);

  const itemsRef = useRef<any[]>([]);
  itemsRef.current = items;

  const fetchWatchlist = useCallback(async (forceRefresh = false) => {
    if (forceRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const res = await api.watchlist.get();
      if (Array.isArray(res)) {
        setItems(res);
        setLastRefreshedAt(new Date().toLocaleTimeString());
        // Immediately hydrate using batch quotes for 100% guarantee of live pipeline consistency
        await hydrateWithLiveQuotes(res, forceRefresh);
      }
    } catch (err: any) {
      console.error('Watchlist fetch error:', err);
      setNotification({ message: `Watchlist error: ${err.message}`, type: 'error' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [hydrateWithLiveQuotes]);

  useEffect(() => {
    fetchWatchlist(false);

    // Auto-refresh quotes every 20 seconds, pausing when hidden or in-flight
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible' && !inFlightRef.current && itemsRef.current && itemsRef.current.length > 0) {
        hydrateWithLiveQuotes(itemsRef.current, false);
      }
    }, 20000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && !inFlightRef.current && itemsRef.current && itemsRef.current.length > 0) {
        hydrateWithLiveQuotes(itemsRef.current, false);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [fetchWatchlist, hydrateWithLiveQuotes]);

  const handleManualRefresh = () => {
    fetchWatchlist(true);
  };

  const handleStockSelectorChange = (selectedOptions: StockOption[]) => {
    setWatchlistRows(prevRows => {
      const prevMap = new Map(prevRows.map(r => [r.cleanSymbol, r]));
      return selectedOptions.map(opt => {
        const clean = (opt.clean_symbol || opt.symbol).replace('.NS', '').replace('.BO', '').toUpperCase();
        const normSym = `${clean}.NS`;
        if (prevMap.has(clean)) {
          return prevMap.get(clean)!;
        }
        return {
          symbol: normSym,
          cleanSymbol: clean,
          companyName: opt.name || clean,
          targetPrice: undefined,
          stopLoss: undefined,
        };
      });
    });
  };

  const handleUpdateRow = (cleanSym: string, field: 'targetPrice' | 'stopLoss', val: number | undefined) => {
    setWatchlistRows(prev => prev.map(r => r.cleanSymbol === cleanSym ? { ...r, [field]: val } : r));
  };

  const handleRemoveRow = (cleanSym: string) => {
    setWatchlistRows(prev => prev.filter(r => r.cleanSymbol !== cleanSym));
  };

  const handleBatchAdd = async () => {
    if (watchlistRows.length === 0) return;

    setSubmitting(true);
    try {
      const payload = watchlistRows.map(r => ({
        symbol: r.cleanSymbol,
        target_price: r.targetPrice,
        stop_loss: r.stopLoss,
      }));
      await api.watchlist.addBatch(payload);
      setWatchlistRows([]);
      setShowAddModal(false);
      setNotification({ message: `Successfully added ${watchlistRows.length} instrument(s) to watchlist!`, type: 'success' });
      setTimeout(() => setNotification(null), 3000);
      fetchWatchlist(true);
    } catch (err: any) {
      setNotification({ message: err.message || 'Failed to add instruments', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemove = async (id: string, symbol: string) => {
    try {
      await api.watchlist.remove(id);
      setItems(items.filter(i => i.id !== id));
      setSelectedForRemoval(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setNotification({ message: `Removed ${symbol} from watchlist.`, type: 'success' });
      setTimeout(() => setNotification(null), 3000);
    } catch (err: any) {
      setNotification({ message: err.message || 'Failed to remove', type: 'error' });
    }
  };

  const toggleSelectForRemoval = (id: string) => {
    setSelectedForRemoval(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleToggleSelectAll = () => {
    if (selectedForRemoval.size === items.length) {
      setSelectedForRemoval(new Set());
    } else {
      setSelectedForRemoval(new Set(items.map(i => i.id)));
    }
  };

  const handleBatchRemove = async () => {
    if (selectedForRemoval.size === 0) return;
    const ids = Array.from(selectedForRemoval);
    setSubmitting(true);
    try {
      await api.watchlist.removeBatch(ids);
      setItems(prev => prev.filter(i => !selectedForRemoval.has(i.id)));
      setSelectedForRemoval(new Set());
      setNotification({ message: `Removed ${ids.length} instrument(s) from watchlist.`, type: 'success' });
      setTimeout(() => setNotification(null), 3000);
    } catch (err: any) {
      setNotification({ message: err.message || 'Failed to remove instruments', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-bold mb-1 border border-blue-200">
            <Radio size={13} className="text-blue-600 animate-pulse" />
            Live Market Feed • Unified Pipeline
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Active Watchlist</h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Real-time multi-stock quotes, target-price alerts, and stop-loss monitoring auto-refreshed every 20s.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          {lastRefreshedAt && (
            <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1">
              <Clock size={12} />
              Refreshed: {lastRefreshedAt}
            </span>
          )}
          <button
            onClick={() => {
              setWatchlistRows([]);
              setShowAddModal(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition active:scale-95"
          >
            <Plus size={15} />
            Track Instrument
          </button>
          <button
            onClick={handleManualRefresh}
            disabled={loading || refreshing}
            className="p-2 border border-slate-200 hover:border-slate-300 rounded-xl bg-white text-slate-600 transition"
            title="Force refresh live quotes"
          >
            <RefreshCw size={15} className={loading || refreshing ? 'animate-spin text-blue-600' : ''} />
          </button>
        </div>
      </div>

      {notification && (
        <div className={`p-3.5 rounded-xl border text-xs font-semibold flex items-center justify-between animate-in fade-in ${
          notification.type === 'success'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span>{notification.message}</span>
          </div>
          <button onClick={() => setNotification(null)} className="p-0.5 hover:opacity-75">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Track Instrument Modal (Multi-Select) */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col p-6 shadow-xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
              <div>
                <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
                  Track Instruments in Watchlist
                </h3>
                <p className="text-xs text-slate-500">
                  Search and pick one or multiple Indian stocks or ETFs to track simultaneously.
                </p>
              </div>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-700 p-1 rounded-lg">
                <X size={18} />
              </button>
            </div>

            <div className="py-4 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
                  Select Instruments
                </label>
                <StockSelector
                  mode="multi"
                  value={watchlistRows.map(r => r.cleanSymbol)}
                  onChange={handleStockSelectorChange}
                  excludeSymbols={items.map(i => i.symbol)}
                  placeholder="Search Indian stocks or ETFs (e.g. SBIN, TCS, RELIANCE, MID150BEES)..."
                />
              </div>

              {watchlistRows.length === 0 ? (
                <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50 text-slate-400 text-xs">
                  <Eye size={28} className="mx-auto text-slate-300 mb-2" />
                  <p className="font-semibold text-slate-600">No instruments selected yet</p>
                  <p className="text-[11px] text-slate-400">Search and pick stocks from the dropdown above to configure target & stop-loss thresholds.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="text-xs font-semibold text-slate-500">
                    Configure {watchlistRows.length} {watchlistRows.length === 1 ? 'Instrument' : 'Instruments'} (Target and Stop-Loss are optional)
                  </div>

                  <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                    {watchlistRows.map((row) => (
                      <div key={row.cleanSymbol} className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-slate-300 transition">
                        <div className="min-w-[140px]">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-xs text-slate-900">{row.symbol}</span>
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                              NSE
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 truncate max-w-[160px]">{row.companyName}</div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 flex-1">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Target Price (₹)</label>
                            <input
                              type="number"
                              step="0.05"
                              placeholder="Optional"
                              value={row.targetPrice ?? ''}
                              onChange={(e) => handleUpdateRow(row.cleanSymbol, 'targetPrice', e.target.value ? parseFloat(e.target.value) : undefined)}
                              className="w-full px-2.5 py-1 text-xs bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-600"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Stop-Loss (₹)</label>
                            <input
                              type="number"
                              step="0.05"
                              placeholder="Optional"
                              value={row.stopLoss ?? ''}
                              onChange={(e) => handleUpdateRow(row.cleanSymbol, 'stopLoss', e.target.value ? parseFloat(e.target.value) : undefined)}
                              className="w-full px-2.5 py-1 text-xs bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-600"
                            />
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveRow(row.cleanSymbol)}
                          className="text-slate-400 hover:text-rose-600 p-1.5 rounded-md self-center transition"
                          title="Remove"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between shrink-0">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBatchAdd}
                disabled={submitting || watchlistRows.length === 0}
                className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs disabled:opacity-50 transition active:scale-95"
              >
                {submitting ? 'Adding...' : `Track Instruments (${watchlistRows.length})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Multi-Select Action Bar */}
      {items.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl text-xs">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-700 select-none">
              <input
                type="checkbox"
                checked={selectedForRemoval.size === items.length && items.length > 0}
                onChange={handleToggleSelectAll}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
              />
              Select All ({items.length})
            </label>
            {selectedForRemoval.size > 0 && (
              <span className="text-slate-500 font-medium">
                • {selectedForRemoval.size} selected for removal
              </span>
            )}
          </div>
          {selectedForRemoval.size > 0 && (
            <button
              onClick={handleBatchRemove}
              disabled={submitting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-xs transition active:scale-95 disabled:opacity-50"
            >
              <Trash2 size={13} />
              Remove Selected ({selectedForRemoval.size})
            </button>
          )}
        </div>
      )}

      {/* Watchlist Cards Grid */}
      {loading && items.length === 0 ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4].map((idx) => (
            <div key={idx} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs animate-pulse space-y-3">
              <div className="h-5 bg-slate-200 rounded w-1/3"></div>
              <div className="h-3 bg-slate-100 rounded w-1/2"></div>
              <div className="h-8 bg-slate-200 rounded w-2/5 mt-4"></div>
              <div className="h-12 bg-slate-50 rounded mt-3"></div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-xs">
          <Eye size={40} className="mx-auto text-slate-300 mb-3" />
          <h3 className="text-base font-bold text-slate-800">Your Watchlist is Empty</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-4">
            Track Indian equities, ETFs, or market indices with target prices and stop-loss boundaries.
          </p>
          <button
            onClick={() => {
              setWatchlistRows([]);
              setShowAddModal(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition"
          >
            <Plus size={14} />
            Track First Instrument
          </button>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => {
            const isPos = (item.change_pct ?? item.change ?? 0) >= 0;
            const livePrice = Number(item.price || 0);
            const targetP = item.target_price ? Number(item.target_price) : null;
            const stopLossP = item.stop_loss ? Number(item.stop_loss) : null;

            // Target and Stop-Loss evaluation
            const isTargetHit = targetP !== null && livePrice >= targetP;
            const isStopLossHit = stopLossP !== null && livePrice > 0 && livePrice <= stopLossP;
            const isSelected = selectedForRemoval.has(item.id);

            return (
              <div
                key={item.id}
                className={`bg-white rounded-2xl border p-5 shadow-xs hover:shadow-md transition flex flex-col justify-between ${
                  isSelected ? 'border-rose-300 ring-2 ring-rose-100 bg-rose-50/10' : 'border-slate-200 hover:border-blue-300'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectForRemoval(item.id)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                        title="Select for removal"
                      />
                      <span className="font-extrabold text-slate-900 text-base">{item.symbol}</span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200">
                        {item.category || 'NSE'}
                      </span>
                      {item.is_stale && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1">
                          <AlertTriangle size={10} />
                          Stale
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => handleRemove(item.id, item.symbol)}
                      className="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                      title="Remove from Watchlist"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                  <div className="text-xs text-slate-500 truncate mb-3">{item.company_name}</div>

                  <div className="flex items-baseline justify-between mb-3">
                    <div>
                      <div className="text-2xl font-black text-slate-900">
                        {livePrice > 0 ? formatINR(livePrice) : 'Unavailable'}
                      </div>
                    </div>
                    <div className={`font-bold text-xs flex items-center ${isPos ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {isPos ? <TrendingUp size={14} className="mr-0.5" /> : <TrendingDown size={14} className="mr-0.5" />}
                      {isPos ? '+' : ''}{Number(item.change || 0).toFixed(2)} ({isPos ? '+' : ''}{Number(item.change_pct || 0).toFixed(2)}%)
                    </div>
                  </div>

                  {/* Target & Stop-loss indicator chips with live evaluation */}
                  <div className="grid grid-cols-2 gap-2 p-2.5 bg-slate-50 rounded-xl text-[11px] mb-3">
                    <div className={`flex items-center gap-1.5 p-1 rounded-lg ${isTargetHit ? 'bg-emerald-100/70 border border-emerald-300' : ''}`}>
                      <Target size={13} className={isTargetHit ? 'text-emerald-700 shrink-0' : 'text-emerald-600 shrink-0'} />
                      <div>
                        <div className="text-[10px] text-slate-400 font-semibold uppercase flex items-center gap-1">
                          Target
                          {isTargetHit && <span className="text-[9px] font-black text-emerald-800">HIT!</span>}
                        </div>
                        <div className={`font-bold ${isTargetHit ? 'text-emerald-900' : 'text-slate-800'}`}>
                          {targetP ? formatINR(targetP) : 'Not Set'}
                        </div>
                      </div>
                    </div>

                    <div className={`flex items-center gap-1.5 p-1 rounded-lg ${isStopLossHit ? 'bg-rose-100/70 border border-rose-300' : ''}`}>
                      <ShieldAlert size={13} className={isStopLossHit ? 'text-rose-700 shrink-0' : 'text-rose-600 shrink-0'} />
                      <div>
                        <div className="text-[10px] text-slate-400 font-semibold uppercase flex items-center gap-1">
                          Stop Loss
                          {isStopLossHit && <span className="text-[9px] font-black text-rose-800">BREACHED!</span>}
                        </div>
                        <div className={`font-bold ${isStopLossHit ? 'text-rose-900' : 'text-slate-800'}`}>
                          {stopLossP ? formatINR(stopLossP) : 'Not Set'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Provider & Timestamp */}
                  <div className="flex items-center justify-between text-[10px] text-slate-400 mb-2 px-0.5">
                    <span className="truncate max-w-[140px]">Source: <strong className="text-slate-600">{item.data_source || item.source || 'yfinance (fallback)'}</strong></span>
                    {item.last_updated && (
                      <span className="font-mono text-slate-500">
                        {item.last_updated.length > 10 ? item.last_updated.substring(11, 19) + ' UTC' : item.last_updated}
                      </span>
                    )}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                  <button
                    onClick={() => onSelectStock(item.symbol)}
                    className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1"
                  >
                    Deep Analysis <ArrowRight size={13} />
                  </button>
                  <button
                    onClick={() => {
                      onSelectStock(item.symbol);
                      onNavigateTab('risk');
                    }}
                    className="text-xs text-slate-500 hover:text-slate-900 flex items-center gap-1"
                  >
                    <Shield size={12} />
                    Risk Audit
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

