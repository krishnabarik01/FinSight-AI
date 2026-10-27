import React, { useState, useEffect } from 'react';
import {
  PieChart as PieIcon,
  Plus,
  Trash2,
  Edit2,
  RefreshCw,
  X,
  Coins,
  Gem,
  AlertCircle,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';
import { api } from '../services/api';
import { formatINR, formatUSD } from '../utils/currency';
import { StockSelector, type StockOption } from '../components/common/StockSelector';

export interface StockHoldingRow {
  symbol: string;
  cleanSymbol: string;
  companyName: string;
  quantity: number;
  purchasePrice: number;
  purchaseDate: string;
  stopLoss?: number;
  targetPrice?: number;
  sector: string;
  isFetchingLive?: boolean;
  error?: string;
}

interface PortfolioPageProps {
  onSelectStock: (symbol: string) => void;
}

const COLORS = ['#2563EB', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#EAB308', '#64748B'];

export const PortfolioPage: React.FC<PortfolioPageProps> = ({ onSelectStock }) => {
  const [portfolio, setPortfolio] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAddMetalModalOpen, setIsAddMetalModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingHolding, setEditingHolding] = useState<any>(null);

  // Multi-Stock Form states
  const [stockRows, setStockRows] = useState<StockHoldingRow[]>([]);
  const [portfolioError, setPortfolioError] = useState<string | null>(null);
  const [portfolioToast, setPortfolioToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Single Holding Edit states
  const [symbol, setSymbol] = useState('');
  const [quantity, setQuantity] = useState<number>(10);
  const [purchasePrice, setPurchasePrice] = useState<number>(150);
  const [purchaseDate, setPurchaseDate] = useState('2026-04-01');
  const [stopLoss, setStopLoss] = useState<number | undefined>(undefined);
  const [targetPrice, setTargetPrice] = useState<number | undefined>(undefined);
  const [sector, setSector] = useState('Technology');
  const [formLoading, setFormLoading] = useState(false);

  // Metal Form states
  const [metalType, setMetalType] = useState<'GOLD' | 'SILVER'>('GOLD');
  const [metalPurity, setMetalPurity] = useState('24K');
  const [metalQuantity, setMetalQuantity] = useState<number>(10);
  const [metalPurchasePrice, setMetalPurchasePrice] = useState<number>(0);
  const [metalPurchaseDate, setMetalPurchaseDate] = useState(new Date().toISOString().split('T')[0]);
  const [metalStopLoss, setMetalStopLoss] = useState<number | undefined>(undefined);
  const [metalTargetPrice, setMetalTargetPrice] = useState<number | undefined>(undefined);
  const [metalNotes, setMetalNotes] = useState('');
  const [metalLivePrice, setMetalLivePrice] = useState<number | null>(null);
  const [metalPriceLoading, setMetalPriceLoading] = useState(false);
  const [metalFormLoading, setMetalFormLoading] = useState(false);

  // Edit Holding Form states
  const [editPurity, setEditPurity] = useState('');

  const fetchPortfolio = () => {
    setLoading(true);
    api.portfolio.getSummary()
      .then(res => {
        setPortfolio(res);
        setPortfolioError(null);
      })
      .catch(err => {
        console.error('Portfolio fetch error:', err);
        setPortfolioError(err.message || 'Failed to fetch portfolio data');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchPortfolio();
  }, []);

  // Fetch live metal price from existing Metals Bullion service when metal type or purity changes
  const fetchLiveMetalPrice = async (mType: 'GOLD' | 'SILVER', pPurity: string) => {
    setMetalPriceLoading(true);
    try {
      const quote = await api.portfolio.getMetalQuote(mType, pPurity);
      if (quote && quote.current_price) {
        setMetalLivePrice(quote.current_price);
        setMetalPurchasePrice((prev) => (prev <= 0 ? quote.current_price : prev));
      }
    } catch (err) {
      console.error('Error fetching live metal rate:', err);
    } finally {
      setMetalPriceLoading(false);
    }
  };

  useEffect(() => {
    if (isAddMetalModalOpen) {
      fetchLiveMetalPrice(metalType, metalPurity);
    }
  }, [isAddMetalModalOpen, metalType, metalPurity]);

  const handleMetalTypeChange = (newType: 'GOLD' | 'SILVER') => {
    setMetalType(newType);
    const defaultPurity = newType === 'GOLD' ? '24K' : '999';
    setMetalPurity(defaultPurity);
    setMetalPurchasePrice(0);
  };

  const handleStockSelectorChange = (selectedOptions: StockOption[]) => {
    const today = new Date().toISOString().split('T')[0];
    setStockRows(prevRows => {
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
          quantity: 10,
          purchasePrice: 0,
          purchaseDate: today,
          stopLoss: undefined,
          targetPrice: undefined,
          sector: opt.sector || 'Technology',
          isFetchingLive: false,
          error: undefined,
        };
      });
    });
  };

  const handleUseLivePrice = async (cleanSym: string) => {
    setStockRows(prev => prev.map(r => r.cleanSymbol === cleanSym ? { ...r, isFetchingLive: true } : r));
    try {
      const q = await api.quotes.getQuote(cleanSym);
      const liveP = q?.price || q?.current_price || 0;
      if (liveP > 0) {
        setStockRows(prev => prev.map(r => r.cleanSymbol === cleanSym ? {
          ...r,
          purchasePrice: liveP,
          isFetchingLive: false,
          error: undefined
        } : r));
      } else {
        setStockRows(prev => prev.map(r => r.cleanSymbol === cleanSym ? { ...r, isFetchingLive: false } : r));
      }
    } catch {
      setStockRows(prev => prev.map(r => r.cleanSymbol === cleanSym ? { ...r, isFetchingLive: false } : r));
    }
  };

  const handleRemoveStockRow = (cleanSym: string) => {
    setStockRows(prev => prev.filter(r => r.cleanSymbol !== cleanSym));
  };

  const handleUpdateStockRow = (cleanSym: string, field: keyof StockHoldingRow, val: any) => {
    setStockRows(prev => prev.map(r => r.cleanSymbol === cleanSym ? { ...r, [field]: val, error: undefined } : r));
  };

  const handleAddBatchHoldings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (stockRows.length === 0) {
      setPortfolioToast({ message: 'Please select at least one stock to track.', type: 'error' });
      return;
    }

    let hasError = false;
    const validated = stockRows.map(r => {
      let err: string | undefined;
      if (!r.quantity || Number(r.quantity) <= 0) {
        err = 'Quantity must be > 0';
        hasError = true;
      } else if (!r.purchasePrice || Number(r.purchasePrice) <= 0) {
        err = 'Purchase price must be > 0';
        hasError = true;
      }
      return { ...r, error: err };
    });

    if (hasError) {
      setStockRows(validated);
      return;
    }

    setFormLoading(true);
    try {
      const payload = stockRows.map(r => ({
        symbol: r.symbol,
        company_name: r.companyName,
        quantity: Number(r.quantity),
        purchase_price: Number(r.purchasePrice),
        purchase_date: r.purchaseDate,
        stop_loss: r.stopLoss ? Number(r.stopLoss) : undefined,
        target_price: r.targetPrice ? Number(r.targetPrice) : undefined,
        sector: r.sector || 'Technology',
      }));

      await api.portfolio.addHoldingsBatch(payload);
      setIsAddModalOpen(false);
      setStockRows([]);
      setPortfolioToast({ message: `Successfully added ${stockRows.length} stock holdings to your portfolio!`, type: 'success' });
      setTimeout(() => setPortfolioToast(null), 3000);
      fetchPortfolio();
    } catch (err: any) {
      setPortfolioToast({ message: err.message || 'Failed to add holdings batch', type: 'error' });
    } finally {
      setFormLoading(false);
    }
  };

  const handleAddMetalHolding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (Number(metalQuantity) <= 0) {
      setPortfolioToast({ message: 'Please enter a valid positive quantity in grams.', type: 'error' });
      return;
    }
    if (Number(metalPurchasePrice) <= 0) {
      setPortfolioToast({ message: 'Please enter a valid positive purchase price per gram.', type: 'error' });
      return;
    }
    if (!metalPurchaseDate) {
      setPortfolioToast({ message: 'Please enter a valid purchase date.', type: 'error' });
      return;
    }

    setMetalFormLoading(true);
    try {
      await api.portfolio.addMetalHolding({
        metal_type: metalType,
        purity: metalPurity,
        quantity: Number(metalQuantity),
        purchase_price: Number(metalPurchasePrice),
        purchase_date: metalPurchaseDate,
        stop_loss: metalStopLoss ? Number(metalStopLoss) : undefined,
        target_price: metalTargetPrice ? Number(metalTargetPrice) : undefined,
        notes: metalNotes.trim() || undefined,
      });
      setIsAddMetalModalOpen(false);
      resetMetalForm();
      setPortfolioToast({ message: `Successfully added ${metalType === 'GOLD' ? 'Gold' : 'Silver'} holding to portfolio!`, type: 'success' });
      setTimeout(() => setPortfolioToast(null), 3000);
      fetchPortfolio();
    } catch (err: any) {
      setPortfolioToast({ message: err.message || 'Error adding metal holding', type: 'error' });
    } finally {
      setMetalFormLoading(false);
    }
  };

  const handleEditHolding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingHolding) return;
    if (Number(quantity) <= 0) {
      alert('Quantity must be greater than zero.');
      return;
    }
    if (Number(purchasePrice) <= 0) {
      alert('Purchase price must be greater than zero.');
      return;
    }

    setFormLoading(true);
    try {
      await api.portfolio.updateHolding(editingHolding.id, {
        quantity: Number(quantity),
        purchase_price: Number(purchasePrice),
        purity: editPurity || undefined,
        stop_loss: stopLoss ? Number(stopLoss) : undefined,
        target_price: targetPrice ? Number(targetPrice) : undefined,
      });
      setIsEditModalOpen(false);
      setEditingHolding(null);
      resetForm();
      fetchPortfolio();
    } catch (err: any) {
      alert(`Error updating holding: ${err.message}`);
    } finally {
      setFormLoading(false);
    }
  };

  const handleDeleteHolding = async (id: string, sym: string) => {
    if (window.confirm(`Are you sure you want to remove ${sym} from your portfolio?`)) {
      try {
        await api.portfolio.deleteHolding(id);
        fetchPortfolio();
      } catch (err: any) {
        alert(err.message);
      }
    }
  };

  const openEditModal = (h: any) => {
    setEditingHolding(h);
    setSymbol(h.symbol);
    setQuantity(h.quantity);
    setPurchasePrice(h.purchase_price);
    setEditPurity(h.purity || '');
    setStopLoss(h.stop_loss);
    setTargetPrice(h.target_price);
    setIsEditModalOpen(true);
  };

  const resetForm = () => {
    setSymbol('');
    setQuantity(10);
    setPurchasePrice(150);
    setStopLoss(undefined);
    setTargetPrice(undefined);
  };

  const resetMetalForm = () => {
    setMetalType('GOLD');
    setMetalPurity('24K');
    setMetalQuantity(10);
    setMetalPurchasePrice(0);
    setMetalPurchaseDate(new Date().toISOString().split('T')[0]);
    setMetalStopLoss(undefined);
    setMetalTargetPrice(undefined);
    setMetalNotes('');
    setMetalLivePrice(null);
  };

  // Group holdings by sector for Donut Chart (includes Stocks, Gold, and Silver)
  const sectorData = React.useMemo(() => {
    if (!portfolio?.holdings) return [];
    const map: Record<string, number> = {};
    for (const h of portfolio.holdings) {
      const s = h.sector || (h.asset_type === 'GOLD' ? 'Precious Metals (Gold)' : h.asset_type === 'SILVER' ? 'Precious Metals (Silver)' : 'General');
      map[s] = (map[s] || 0) + (h.current_value || 0);
    }
    return Object.entries(map).map(([name, value]) => ({ name, value: Math.round(value) }));
  }, [portfolio]);

  if (loading && !portfolio) {
    return (
      <div className="p-12 flex items-center justify-center">
        <RefreshCw className="animate-spin text-blue-600 mr-2" size={24} />
        <span className="text-sm font-semibold text-slate-500">Loading portfolio holdings & live values...</span>
      </div>
    );
  }

  const isPnlPositive = (portfolio?.total_pnl || 0) >= 0;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-bold mb-1 border border-blue-200">
            <PieIcon size={13} />
            Multi-Asset Portfolio Manager
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            {portfolio?.name || 'Primary Growth Portfolio'}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Track allocations, live unrealized returns, stop-losses, and precious metal bullion holdings.
          </p>
        </div>

        {/* Action Buttons: Add New Stock and Add Metal side-by-side */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            id="add-new-stock-btn"
            onClick={() => { setStockRows([]); setIsAddModalOpen(true); }}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition active:scale-95"
          >
            <Plus size={16} />
            + Add New Stock
          </button>

          <button
            id="add-metal-btn"
            onClick={() => { resetMetalForm(); setIsAddMetalModalOpen(true); }}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 hover:border-slate-400 rounded-lg shadow-sm transition active:scale-95 hover:text-amber-700"
          >
            <Coins size={16} className="text-amber-500" />
            + Add Metal
          </button>

          <button
            onClick={() => fetchPortfolio()}
            disabled={loading}
            className="p-2 border border-slate-200 hover:border-slate-300 rounded-lg bg-white text-slate-600 transition"
            title="Refresh portfolio values"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin text-blue-600' : ''} />
          </button>
        </div>
      </div>

      {/* Real Toast Notification */}
      {portfolioToast && (
        <div className={`p-3.5 rounded-xl border text-xs font-semibold flex items-center justify-between animate-in fade-in ${
          portfolioToast.type === 'success'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          <div className="flex items-center gap-2">
            {portfolioToast.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span>{portfolioToast.message}</span>
          </div>
          <button onClick={() => setPortfolioToast(null)} className="p-0.5 hover:opacity-75">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Portfolio Error Banner */}
      {portfolioError && (
        <div className="p-3.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 text-xs font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="text-rose-600 shrink-0" />
            <span>{portfolioError}</span>
          </div>
          <button onClick={() => fetchPortfolio()} className="px-2.5 py-1 bg-white border border-rose-200 rounded-lg text-rose-700 hover:bg-rose-100 text-xs font-bold transition">
            Retry
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="fin-card p-4">
          <div className="text-xs font-semibold text-slate-500 mb-1">Current Portfolio Value</div>
          <div className="text-2xl font-black text-slate-900">
            {formatINR(portfolio?.total_value)}
          </div>
          <div className="mt-1 text-xs font-semibold text-slate-500">
            Invested: {formatINR(portfolio?.total_invested)}
          </div>
        </div>

        <div className="fin-card p-4">
          <div className="text-xs font-semibold text-slate-500 mb-1">Total Return (Unrealized)</div>
          <div className={`text-2xl font-black ${isPnlPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
            {isPnlPositive ? '+' : '-'}{formatINR(Math.abs(portfolio?.total_pnl || 0))}
          </div>
          <div className="mt-1 text-xs font-bold">
            <span className={`px-1.5 py-0.2 rounded ${isPnlPositive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
              {isPnlPositive ? '+' : ''}{Number(portfolio?.total_pnl_pct || 0).toFixed(2)}%
            </span>
          </div>
        </div>

        <div className="fin-card p-4">
          <div className="text-xs font-semibold text-slate-500 mb-1">Today's Market Movement</div>
          <div className={`text-2xl font-black ${(portfolio?.today_pnl ?? 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {(portfolio?.today_pnl ?? 0) >= 0 ? '+' : '-'}{formatINR(Math.abs(portfolio?.today_pnl || 0))}
          </div>
          <div className="mt-1 text-xs text-slate-500 font-semibold">
            {(portfolio?.today_pnl ?? 0) >= 0 ? '+' : ''}{Number(portfolio?.today_pnl_pct || 0).toFixed(2)}% vs Open
          </div>
        </div>

        <div className="fin-card p-4">
          <div className="text-xs font-semibold text-slate-500 mb-1">Diversification Score</div>
          <div className="text-2xl font-black text-blue-700">
            {portfolio?.diversification_score || 75.0} <span className="text-xs text-slate-400 font-normal">/ 100</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            Multi-asset balanced risk
          </div>
        </div>
      </div>

      {/* Holdings Table & Sector Allocation */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Holdings Table */}
        <div className="fin-card p-5 lg:col-span-2 overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h2 className="text-base font-bold text-slate-900">Current Holdings ({portfolio?.holdings?.length || 0})</h2>
              <span className="text-xs text-slate-400">Live verified rates (₹ INR)</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs min-w-[850px]">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-400 font-semibold">
                    <th className="pb-3 pr-3 whitespace-nowrap">Asset / Instrument</th>
                    <th className="pb-3 px-3 whitespace-nowrap">Qty</th>
                    <th className="pb-3 px-3 whitespace-nowrap">Buy Price</th>
                    <th className="pb-3 px-3 whitespace-nowrap">Current Price</th>
                    <th className="pb-3 px-3 whitespace-nowrap">Current Value</th>
                    <th className="pb-3 px-3 whitespace-nowrap">Unrealized P&L</th>
                    <th className="pb-3 px-3 whitespace-nowrap">AI Sell Signal</th>
                    <th className="pb-3 pl-3 text-right whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(portfolio?.holdings || []).map((h: any) => {
                    const isMetal = h.asset_type === 'GOLD' || h.asset_type === 'SILVER';
                    const isGold = h.asset_type === 'GOLD';
                    const isSilver = h.asset_type === 'SILVER';

                    return (
                      <tr key={h.id} className="hover:bg-slate-50 transition">
                        <td className="py-3 pr-3">
                          <div className="flex items-center gap-2.5">
                            {isGold ? (
                              <div className="w-7 h-7 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shrink-0">
                                <Coins size={14} />
                              </div>
                            ) : isSilver ? (
                              <div className="w-7 h-7 rounded-lg bg-slate-100 border border-slate-300 flex items-center justify-center text-slate-600 shrink-0">
                                <Gem size={14} />
                              </div>
                            ) : null}

                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 whitespace-nowrap">
                                <span
                                  className={`font-bold text-slate-900 ${!isMetal ? 'cursor-pointer hover:text-blue-600 transition' : ''}`}
                                  onClick={() => !isMetal && onSelectStock(h.symbol)}
                                >
                                  {isMetal ? (isGold ? 'Gold Bullion' : 'Silver Bullion') : h.symbol}
                                </span>
                                {isMetal && h.purity && (
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                                    isGold ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-800'
                                  }`}>
                                    {h.purity}
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-400 truncate max-w-[160px]">
                                {h.company_name}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Quantity */}
                        <td className="py-3 px-3 font-semibold text-slate-700 whitespace-nowrap">
                          {isMetal ? `${h.quantity} g` : h.quantity}
                        </td>

                        {/* Purchase Price */}
                        <td className="py-3 px-3 font-semibold text-slate-700 whitespace-nowrap">
                          <div>
                            <span>{formatINR(h.purchase_price)}</span>
                            {isMetal && <span className="text-[10px] text-slate-400 font-normal"> /g</span>}
                          </div>
                          {h.is_converted && h.original_purchase_price && (
                            <div className="text-[10px] text-slate-400 font-normal">
                              ({formatUSD(h.original_purchase_price)})
                            </div>
                          )}
                        </td>

                        {/* Current Price */}
                        <td className="py-3 px-3 font-bold text-slate-900 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span>
                              {formatINR(h.current_price)}
                              {isMetal && <span className="text-[10px] text-slate-400 font-normal"> /g</span>}
                            </span>
                            {h.is_stale && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200 inline-flex items-center gap-0.5 shrink-0" title="Live quote currently unavailable. Displaying last known price.">
                                <AlertTriangle size={9} />
                                Stale
                              </span>
                            )}
                          </div>
                          {h.is_converted && h.original_current_price && (
                            <div className="text-[10px] text-blue-500 font-medium">
                              ({formatUSD(h.original_current_price)})
                            </div>
                          )}
                        </td>

                        {/* Current Market Value */}
                        <td className="py-3 px-3 font-bold text-slate-900 whitespace-nowrap">{formatINR(h.current_value)}</td>

                        {/* Unrealized P&L */}
                        <td className="py-3 px-3 font-bold whitespace-nowrap">
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] ${
                            h.unrealized_pnl >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                          }`}>
                            {h.unrealized_pnl >= 0 ? '+' : ''}{h.pnl_percentage}%
                          </span>
                        </td>

                        {/* AI Sell Signal */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap inline-flex items-center ${
                            h.ai_sell_signal === 'Review Sell' ? 'bg-rose-100 text-rose-800' :
                            h.ai_sell_signal === 'Take Profit' ? 'bg-amber-100 text-amber-800' :
                            'bg-blue-100 text-blue-800'
                          }`}>
                            {h.ai_sell_signal}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="py-3 pl-3 text-right space-x-1.5 whitespace-nowrap">
                          <button
                            onClick={() => openEditModal(h)}
                            className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                            title="Edit Holding"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteHolding(h.id, h.symbol)}
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded"
                            title="Delete Holding"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Sector & Metal Allocation Donut Chart */}
        <div className="fin-card p-5 flex flex-col justify-between">
          <div>
            <div className="pb-3 border-b border-slate-100 mb-4">
              <h2 className="text-base font-bold text-slate-900">Asset & Sector Allocation</h2>
              <p className="text-xs text-slate-500">Distribution across Stocks, Gold, and Silver</p>
            </div>

            <div className="h-64 w-full">
              {sectorData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={sectorData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={80}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {sectorData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: any) => formatINR(Number(value))} />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-slate-400">
                  No allocation data available
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------- */}
      {/* 1. Add Stock Modal (Multi-Select Stock Holdings)     */}
      {/* ---------------------------------------------------- */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Add Stocks to Portfolio</h3>
                <p className="text-xs text-slate-500">Select one or more NSE stocks to configure and track in a single batch.</p>
              </div>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-slate-700 p-1 rounded-lg">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-5">
              {/* Stock Selector Multi-Select */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
                  Select Stocks (NSE / ETFs)
                </label>
                <StockSelector
                  mode="multi"
                  value={stockRows.map(r => r.cleanSymbol)}
                  onChange={handleStockSelectorChange}
                  placeholder="Search and select stocks by symbol or company name (e.g. RELIANCE, TCS, SBIN)..."
                />
              </div>

              {/* Rows List */}
              {stockRows.length === 0 ? (
                <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                  <div className="text-slate-400 mb-2">
                    <PieIcon size={32} className="mx-auto text-slate-300 mb-2" />
                    <p className="text-sm font-semibold text-slate-600">No stocks selected yet</p>
                    <p className="text-xs text-slate-400">Search and pick one or more stocks from the dropdown above</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-500 border-b border-slate-100 pb-2">
                    <span>Configuring {stockRows.length} {stockRows.length === 1 ? 'Holding' : 'Holdings'}</span>
                    <span className="text-slate-400">All fields validate before saving</span>
                  </div>

                  <div className="space-y-3">
                    {stockRows.map((row) => (
                      <div
                        key={row.cleanSymbol}
                        className={`p-4 rounded-xl border transition-all ${
                          row.error ? 'border-rose-300 bg-rose-50/30' : 'border-slate-200 bg-white hover:border-slate-300 shadow-xs'
                        }`}
                      >
                        {/* Row Header */}
                        <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-sm text-slate-900">{row.symbol}</span>
                            <span className="text-xs text-slate-500 font-medium truncate max-w-[220px]">{row.companyName}</span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                              NSE
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleUseLivePrice(row.cleanSymbol)}
                              disabled={row.isFetchingLive}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition disabled:opacity-50"
                              title="Fetch real-time market price"
                            >
                              <RefreshCw size={12} className={row.isFetchingLive ? 'animate-spin' : ''} />
                              {row.isFetchingLive ? 'Fetching...' : 'Use live price'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveStockRow(row.cleanSymbol)}
                              className="text-slate-400 hover:text-rose-600 p-1 rounded-md transition"
                              title="Remove stock"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>

                        {/* Row Inputs */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Quantity *</label>
                            <input
                              type="number"
                              step="0.01"
                              min="0.01"
                              required
                              value={row.quantity || ''}
                              onChange={(e) => handleUpdateStockRow(row.cleanSymbol, 'quantity', parseFloat(e.target.value) || 0)}
                              className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Buy Price (₹) *</label>
                            <input
                              type="number"
                              step="0.01"
                              min="0.01"
                              required
                              value={row.purchasePrice || ''}
                              onChange={(e) => handleUpdateStockRow(row.cleanSymbol, 'purchasePrice', parseFloat(e.target.value) || 0)}
                              placeholder="e.g. 2450.00"
                              className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Purchase Date</label>
                            <input
                              type="date"
                              value={row.purchaseDate}
                              onChange={(e) => handleUpdateStockRow(row.cleanSymbol, 'purchaseDate', e.target.value)}
                              className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Sector</label>
                            <input
                              type="text"
                              value={row.sector}
                              onChange={(e) => handleUpdateStockRow(row.cleanSymbol, 'sector', e.target.value)}
                              placeholder="e.g. Technology"
                              className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Stop-Loss (₹)</label>
                            <input
                              type="number"
                              step="0.01"
                              placeholder="Optional"
                              value={row.stopLoss ?? ''}
                              onChange={(e) => handleUpdateStockRow(row.cleanSymbol, 'stopLoss', e.target.value ? parseFloat(e.target.value) : undefined)}
                              className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Target Price (₹)</label>
                            <input
                              type="number"
                              step="0.01"
                              placeholder="Optional"
                              value={row.targetPrice ?? ''}
                              onChange={(e) => handleUpdateStockRow(row.cleanSymbol, 'targetPrice', e.target.value ? parseFloat(e.target.value) : undefined)}
                              className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                            />
                          </div>
                        </div>

                        {/* Row Total & Row Error */}
                        <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                          {row.error ? (
                            <span className="text-rose-600 font-semibold flex items-center gap-1">
                              <AlertCircle size={12} /> {row.error}
                            </span>
                          ) : (
                            <span className="text-slate-400">
                              Estimated Value: <strong className="text-slate-700">{formatINR((row.quantity || 0) * (row.purchasePrice || 0))}</strong>
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
              <div className="text-xs text-slate-500">
                {stockRows.length > 0 && (
                  <span>
                    Total Batch Investment: <strong className="text-slate-900 font-bold text-sm">{formatINR(stockRows.reduce((sum, r) => sum + ((r.quantity || 0) * (r.purchasePrice || 0)), 0))}</strong>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAddBatchHoldings}
                  disabled={formLoading || stockRows.length === 0}
                  className="inline-flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm disabled:opacity-50 transition active:scale-95"
                >
                  {formLoading ? 'Adding Holdings...' : `Confirm Holdings (${stockRows.length})`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* 2. Add Metal Modal (New Separate Modal)              */}
      {/* ---------------------------------------------------- */}
      {isAddMetalModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  metalType === 'GOLD' ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-700'
                }`}>
                  {metalType === 'GOLD' ? <Coins size={18} /> : <Gem size={18} />}
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Add Metal to Portfolio</h3>
                  <p className="text-[11px] text-slate-500">Physical bullion holding tracking</p>
                </div>
              </div>
              <button
                onClick={() => setIsAddMetalModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddMetalHolding} className="p-6 space-y-4">
              {/* Metal Type Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Metal Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleMetalTypeChange('GOLD')}
                    className={`py-2 px-3 rounded-lg border text-sm font-bold flex items-center justify-center gap-2 transition ${
                      metalType === 'GOLD'
                        ? 'border-amber-500 bg-amber-50 text-amber-900 ring-2 ring-amber-500/20'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Coins size={16} className={metalType === 'GOLD' ? 'text-amber-600' : 'text-slate-400'} />
                    Gold
                  </button>

                  <button
                    type="button"
                    onClick={() => handleMetalTypeChange('SILVER')}
                    className={`py-2 px-3 rounded-lg border text-sm font-bold flex items-center justify-center gap-2 transition ${
                      metalType === 'SILVER'
                        ? 'border-slate-500 bg-slate-100 text-slate-900 ring-2 ring-slate-500/20'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Gem size={16} className={metalType === 'SILVER' ? 'text-slate-700' : 'text-slate-400'} />
                    Silver
                  </button>
                </div>
              </div>

              {/* Purity & Quantity Grid */}
              <div className="grid grid-cols-2 gap-3">
                {/* Purity Selector */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {metalType === 'GOLD' ? 'Gold Purity' : 'Silver Purity'}
                  </label>
                  <select
                    value={metalPurity}
                    onChange={(e) => setMetalPurity(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600 font-semibold"
                  >
                    {metalType === 'GOLD' ? (
                      <>
                        <option value="24K">24K (99.9% Pure)</option>
                        <option value="22K">22K (Jewelry Standard)</option>
                        <option value="18K">18K (75% Pure)</option>
                      </>
                    ) : (
                      <>
                        <option value="999">999 (99.9% Fine Silver)</option>
                        <option value="925">925 (Sterling Silver)</option>
                      </>
                    )}
                  </select>
                </div>

                {/* Quantity in Grams */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Quantity (in grams)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="e.g. 10.00"
                    value={metalQuantity}
                    onChange={(e) => setMetalQuantity(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600"
                  />
                </div>
              </div>

              {/* Live Market Price Banner */}
              <div className="bg-amber-50/70 border border-amber-200/80 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-semibold text-amber-800 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    Live Market Rate ({metalType === 'GOLD' ? 'Gold' : 'Silver'} {metalPurity}):
                  </div>
                  {metalLivePrice && (
                    <button
                      type="button"
                      onClick={() => setMetalPurchasePrice(metalLivePrice)}
                      className="text-[10px] font-bold text-amber-700 hover:text-amber-900 underline"
                    >
                      Apply Live Price
                    </button>
                  )}
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-lg font-black text-slate-900">
                    {metalPriceLoading ? (
                      <span className="text-xs text-slate-400 font-normal">Fetching live rate...</span>
                    ) : metalLivePrice ? (
                      `${formatINR(metalLivePrice)} / g`
                    ) : (
                      'Rate unavailable'
                    )}
                  </span>
                  <span className="text-[10px] text-slate-500 font-medium">
                    (Visakhapatnam Domestic Market, incl. 3% GST)
                  </span>
                </div>
              </div>

              {/* Purchase Price per Gram & Date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Purchase Price per Gram (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="e.g. 12280"
                    value={metalPurchasePrice || ''}
                    onChange={(e) => setMetalPurchasePrice(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600 font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Purchase Date</label>
                  <input
                    type="date"
                    required
                    value={metalPurchaseDate}
                    onChange={(e) => setMetalPurchaseDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600"
                  />
                </div>
              </div>

              {/* Optional Stop-Loss & Target Price */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Stop-Loss (₹/g, Optional)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Threshold per gram"
                    value={metalStopLoss || ''}
                    onChange={(e) => setMetalStopLoss(e.target.value ? parseFloat(e.target.value) : undefined)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Target Price (₹/g, Optional)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Profit target per gram"
                    value={metalTargetPrice || ''}
                    onChange={(e) => setMetalTargetPrice(e.target.value ? parseFloat(e.target.value) : undefined)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600"
                  />
                </div>
              </div>

              {/* Total Invested preview */}
              {metalQuantity > 0 && metalPurchasePrice > 0 && (
                <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 flex items-center justify-between">
                  <span>Total Invested Amount:</span>
                  <span className="font-bold text-slate-900">
                    {formatINR(metalQuantity * metalPurchasePrice)}
                  </span>
                </div>
              )}

              {/* Modal Buttons */}
              <div className="pt-3 flex justify-end space-x-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddMetalModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={metalFormLoading}
                  className="px-5 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-sm disabled:opacity-50 transition active:scale-95"
                >
                  {metalFormLoading ? 'Saving...' : 'Save Metal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* 3. Edit Holding Modal (Supports Stocks & Metals)     */}
      {/* ---------------------------------------------------- */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-base">
                Edit {editingHolding?.company_name || editingHolding?.symbol} Holding
              </h3>
              <button onClick={() => setIsEditModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleEditHolding} className="p-6 space-y-4">
              {/* Purity selector for metals */}
              {(editingHolding?.asset_type === 'GOLD' || editingHolding?.asset_type === 'SILVER') && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Purity Grade</label>
                  <select
                    value={editPurity}
                    onChange={(e) => setEditPurity(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 font-semibold"
                  >
                    {editingHolding?.asset_type === 'GOLD' ? (
                      <>
                        <option value="24K">24K (99.9% Pure)</option>
                        <option value="22K">22K (Jewelry Standard)</option>
                        <option value="18K">18K (75% Pure)</option>
                      </>
                    ) : (
                      <>
                        <option value="999">999 (99.9% Fine Silver)</option>
                        <option value="925">925 (Sterling Silver)</option>
                      </>
                    )}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {editingHolding?.asset_type === 'GOLD' || editingHolding?.asset_type === 'SILVER'
                      ? 'Quantity (grams)'
                      : 'Quantity'}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={quantity}
                    onChange={(e) => setQuantity(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {editingHolding?.asset_type === 'GOLD' || editingHolding?.asset_type === 'SILVER'
                      ? 'Purchase Price (₹/g)'
                      : 'Purchase Price (₹)'}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={purchasePrice}
                    onChange={(e) => setPurchasePrice(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Stop-Loss Boundary</label>
                  <input
                    type="number"
                    step="0.01"
                    value={stopLoss || ''}
                    onChange={(e) => setStopLoss(e.target.value ? parseFloat(e.target.value) : undefined)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Profit Target</label>
                  <input
                    type="number"
                    step="0.01"
                    value={targetPrice || ''}
                    onChange={(e) => setTargetPrice(e.target.value ? parseFloat(e.target.value) : undefined)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                  />
                </div>
              </div>

              <div className="pt-3 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm disabled:opacity-50"
                >
                  {formLoading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
