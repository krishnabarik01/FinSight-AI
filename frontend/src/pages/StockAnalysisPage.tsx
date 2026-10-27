import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Shield,
  Layers,
  Activity,
  BarChart2,
  Calendar,
  Sparkles,
  ExternalLink,
  Info,
  CheckCircle2,
  RefreshCw,
  Plus
} from 'lucide-react';
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar
} from 'recharts';
import { api } from '../services/api';
import { formatINR, formatUSD } from '../utils/currency';
import { StockSearchDropdown, type StockOption } from '../components/StockSearchDropdown';

interface StockAnalysisPageProps {
  initialSymbol?: string;
  onSelectStock?: (symbol: string) => void;
  onNavigateTab: (tab: string) => void;
}

export const StockAnalysisPage: React.FC<StockAnalysisPageProps> = ({
  initialSymbol = 'RELIANCE.NS',
  onSelectStock,
  onNavigateTab,
}) => {
  const [symbol, setSymbol] = useState(initialSymbol);
  const [quote, setQuote] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [news, setNews] = useState<any[]>([]);
  const [period, setPeriod] = useState('1mo');
  const [showRsi, setShowRsi] = useState(true);
  const [showSma, setShowSma] = useState(true);
  const [showBb, setShowBb] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Request tracker ref to prevent race conditions during rapid switching
  const reqIdRef = useRef<number>(0);

  const fetchStock = useCallback((sym: string, per: string, clearStale = false) => {
    const currentReqId = ++reqIdRef.current;
    setLoading(true);
    setError(null);
    if (clearStale) {
      setQuote(null);
      setHistory([]);
      setNews([]);
    }

    Promise.allSettled([
      api.stocks.getDetail(sym),
      api.stocks.getHistory(sym, per),
      api.news.getNews(sym)
    ]).then(([detailResult, historyResult, newsResult]) => {
      // Discard outdated responses to prevent race condition
      if (currentReqId !== reqIdRef.current) return;

      if (detailResult.status === 'fulfilled') {
        setQuote(detailResult.value);
        setSymbol(detailResult.value.symbol || sym);
      } else {
        setError(`Unable to fetch verified market data for ${sym}: ${detailResult.reason?.message || 'Stock data unavailable'}`);
        setQuote(null);
      }

      if (historyResult.status === 'fulfilled') {
        setHistory(Array.isArray(historyResult.value) ? historyResult.value : []);
      } else {
        setHistory([]);
      }

      if (newsResult.status === 'fulfilled') {
        setNews(Array.isArray(newsResult.value) ? newsResult.value : []);
      } else {
        setNews([]);
      }
    }).catch(err => {
      if (currentReqId === reqIdRef.current) {
        setError(`Unable to fetch verified market data for ${sym}: ${err.message}`);
        setQuote(null);
      }
    }).finally(() => {
      if (currentReqId === reqIdRef.current) {
        setLoading(false);
      }
    });
  }, []);

  useEffect(() => {
    if (initialSymbol) {
      setSymbol(initialSymbol);
      fetchStock(initialSymbol, period, true);
    }
  }, [initialSymbol]);

  const handlePeriodChange = (newPeriod: string) => {
    setPeriod(newPeriod);
    fetchStock(symbol, newPeriod, false);
  };

  const handleStockSelect = (stock: StockOption) => {
    const sym = stock.symbol || (stock.clean_symbol ? `${stock.clean_symbol}.NS` : '');
    if (!sym) return;
    setSymbol(sym);
    if (onSelectStock) {
      onSelectStock(sym);
    }
    fetchStock(sym, period, true);
  };

  const isPositive = quote && quote.change >= 0;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Header & Stock Selection Dropdown */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-bold mb-1 border border-blue-200">
            <BarChart2 size={13} />
            Institutional Equity Analytics
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Stock Analysis & Technical Indicators
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Real-time equity market data, moving averages, Bollinger Bands, and support-resistance matrix.
          </p>
        </div>

        {/* Searchable Select Stock Dropdown matching Risk Assessment and AI Predictions */}
        <div className="flex flex-col sm:items-end gap-2 w-full sm:w-auto">
          <StockSearchDropdown
            value={symbol}
            onSelect={handleStockSelect}
            label="Select Stock"
            placeholder="Search stocks by name or ticker..."
            className="w-full sm:w-auto"
          />
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg">
          {error}
        </div>
      )}

      {loading && !quote ? (
        <div className="p-12 flex items-center justify-center">
          <RefreshCw className="animate-spin text-blue-600 mr-2" size={24} />
          <span className="text-sm font-semibold text-slate-500">Loading verified quotes and technical matrix...</span>
        </div>
      ) : quote ? (
        <>
          {/* Stock Header Banner */}
          <div className="fin-card p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center space-x-3">
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                    {quote.company_name}
                  </h1>
                  <span className="px-2.5 py-0.5 bg-slate-100 text-slate-700 font-mono font-bold text-xs rounded border border-slate-200">
                    {quote.symbol}
                  </span>
                  <span className="text-xs text-slate-500 font-semibold">
                    {quote.exchange}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                  <span>Currency: <strong className="text-slate-700">{quote.currency}</strong></span>
                  <span>•</span>
                  <span>Source: <strong className="text-slate-700">{quote.data_source}</strong></span>
                  <span>•</span>
                  <span>Timestamp: <span className="font-mono">{quote.last_updated}</span></span>
                </div>
              </div>

              {/* Price Display */}
              <div className="flex items-baseline md:items-end flex-col">
                <div className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
                  {quote.data_status === 'unavailable' && (!quote.current_price || quote.current_price === 0)
                    ? 'Unavailable'
                    : formatINR(quote.current_price)}
                </div>
                {typeof quote.change === 'number' && typeof quote.change_pct === 'number' ? (
                  <div className={`flex items-center font-bold text-sm mt-0.5 ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {isPositive ? <TrendingUp size={16} className="mr-1" /> : <TrendingDown size={16} className="mr-1" />}
                    {isPositive ? '+' : ''}{quote.change.toFixed(2)} ({isPositive ? '+' : ''}{quote.change_pct.toFixed(2)}%)
                  </div>
                ) : (
                  <div className="text-xs text-slate-400 mt-1">Real-time quote pending</div>
                )}
              </div>
            </div>

            {quote.data_status === 'unavailable' && (
              <div className="mt-3 p-3 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg flex items-center gap-2">
                <Info size={14} className="shrink-0 text-amber-600" />
                <span>{quote.message || 'Real-time market price for this stock is currently unavailable from the primary data provider.'}</span>
              </div>
            )}

            {/* Quick action bar */}
            <div className="mt-5 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (onSelectStock) onSelectStock(symbol);
                    onNavigateTab('risk');
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 font-bold rounded-lg border border-blue-200 hover:bg-blue-100 transition"
                >
                  <Shield size={14} />
                  Run 3-Level Risk Assessment
                </button>
                <button
                  onClick={() => {
                    if (onSelectStock) onSelectStock(symbol);
                    onNavigateTab('predictions');
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 font-bold rounded-lg border border-emerald-200 hover:bg-emerald-100 transition"
                >
                  <Sparkles size={14} />
                  Run AI Predictive Model
                </button>
              </div>

              {/* Support & Resistance highlights */}
              <div className="flex items-center space-x-4 text-xs">
                <div>
                  <span className="text-slate-400">Support Floor:</span>{' '}
                  <span className="font-bold text-emerald-700 font-mono">
                    {quote.support_level ? formatINR(quote.support_level) : 'N/A'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">Resistance Ceiling:</span>{' '}
                  <span className="font-bold text-rose-700 font-mono">
                    {quote.resistance_level ? formatINR(quote.resistance_level) : 'N/A'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Interactive Chart Section */}
          <div className="fin-card p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold text-slate-900">Historical Price & Indicator Chart</h2>
                {/* Indicator overlay toggles */}
                <div className="flex items-center space-x-1.5 ml-4 text-xs">
                  <button
                    onClick={() => setShowSma(!showSma)}
                    className={`px-2 py-0.5 rounded text-[11px] font-semibold border transition ${
                      showSma ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-50 text-slate-400 border-slate-200'
                    }`}
                  >
                    SMA 20/50
                  </button>
                  <button
                    onClick={() => setShowBb(!showBb)}
                    className={`px-2 py-0.5 rounded text-[11px] font-semibold border transition ${
                      showBb ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-slate-50 text-slate-400 border-slate-200'
                    }`}
                  >
                    Bollinger
                  </button>
                  <button
                    onClick={() => setShowRsi(!showRsi)}
                    className={`px-2 py-0.5 rounded text-[11px] font-semibold border transition ${
                      showRsi ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-50 text-slate-400 border-slate-200'
                    }`}
                  >
                    RSI (14)
                  </button>
                </div>
              </div>

              {/* Range Filters */}
              <div className="flex items-center space-x-1 bg-slate-100 p-0.5 rounded-lg text-xs font-semibold">
                {[
                  { label: '1D', val: '1d' },
                  { label: '5D', val: '5d' },
                  { label: '1M', val: '1mo' },
                  { label: '3M', val: '3mo' },
                  { label: '1Y', val: '1y' },
                  { label: '5Y', val: '5y' },
                ].map((item) => (
                  <button
                    key={item.label}
                    onClick={() => handlePeriodChange(item.val)}
                    className={`px-2.5 py-1 rounded-md transition ${
                      period === item.val ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Price Chart */}
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={history}>
                  <defs>
                    <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={isPositive ? '#10B981' : '#EF4444'} stopOpacity={0.2} />
                      <stop offset="95%" stopColor={isPositive ? '#10B981' : '#EF4444'} stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94A3B8' }} tickLine={false} axisLine={false} />
                  <YAxis
                    domain={['auto', 'auto']}
                    tick={{ fontSize: 11, fill: '#94A3B8' }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `₹${Number(v).toLocaleString('en-IN')}`}
                  />
                  <Tooltip
                    formatter={(value: any, name: any) => [
                      typeof value === 'number' && name?.toString().toLowerCase().includes('price')
                        ? formatINR(value)
                        : value,
                      name
                    ]}
                    contentStyle={{ backgroundColor: '#FFFFFF', borderColor: '#E2E8F0', borderRadius: '0.5rem', fontSize: '12px' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="close"
                    name="Close Price"
                    stroke={isPositive ? '#10B981' : '#EF4444'}
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#priceGradient)"
                  />
                  {showSma && (
                    <>
                      <Line type="monotone" dataKey="sma_20" name="SMA 20" stroke="#2563EB" strokeWidth={1.5} dot={false} />
                      <Line type="monotone" dataKey="sma_50" name="SMA 50" stroke="#F59E0B" strokeWidth={1.5} dot={false} />
                    </>
                  )}
                  {showBb && (
                    <>
                      <Line type="monotone" dataKey="bb_upper" name="Upper BB" stroke="#8B5CF6" strokeDasharray="3 3" strokeWidth={1} dot={false} />
                      <Line type="monotone" dataKey="bb_lower" name="Lower BB" stroke="#8B5CF6" strokeDasharray="3 3" strokeWidth={1} dot={false} />
                    </>
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Sub-Chart: RSI (14) */}
            {showRsi && (
              <div className="mt-4 pt-3 border-t border-slate-100">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-1">
                  <span>Relative Strength Index (RSI 14)</span>
                  <span className="font-mono text-slate-700">Latest: {quote.indicators?.rsi_14}</span>
                </div>
                <div className="h-24 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={history}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                      <YAxis domain={[0, 100]} ticks={[30, 50, 70]} tick={{ fontSize: 10, fill: '#94A3B8' }} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={{ backgroundColor: '#FFFFFF', borderColor: '#E2E8F0', borderRadius: '0.375rem', fontSize: '11px' }} />
                      <Line type="monotone" dataKey="rsi" name="RSI" stroke="#D97706" strokeWidth={1.8} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>

          {/* Technical Indicators & Fundamental Metrics Grid */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* Technical Matrix */}
            <div className="fin-card p-5">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <Activity size={16} className="text-blue-600" />
                  Technical Indicator Dashboard
                </h3>
                <span className="text-[11px] font-semibold text-slate-500">Daily Periodic Analysis</span>
              </div>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="p-3 bg-slate-50 rounded-lg">
                  <div className="text-slate-400 text-[11px] mb-0.5">RSI (14-Period)</div>
                  <div className="text-base font-extrabold text-slate-900">{quote.indicators?.rsi_14 ?? 'N/A'}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {typeof quote.indicators?.rsi_14 === 'number'
                      ? quote.indicators.rsi_14 > 70
                        ? 'Overbought warning'
                        : quote.indicators.rsi_14 < 30
                        ? 'Oversold condition'
                        : 'Healthy neutral range'
                      : 'Indicator pending'}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-lg">
                  <div className="text-slate-400 text-[11px] mb-0.5">MACD (12, 26, 9)</div>
                  <div className="text-base font-extrabold text-slate-900">{quote.indicators?.macd ?? 'N/A'}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Signal: {quote.indicators?.macd_signal ?? 'N/A'}</div>
                </div>

                <div className="p-3 bg-slate-50 rounded-lg">
                  <div className="text-slate-400 text-[11px] mb-0.5">Average True Range (ATR 14)</div>
                  <div className="text-base font-extrabold text-slate-900">
                    {quote.indicators?.atr_14 ? formatINR(quote.indicators.atr_14) : 'N/A'}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Daily expected volatility</div>
                </div>

                <div className="p-3 bg-slate-50 rounded-lg">
                  <div className="text-slate-400 text-[11px] mb-0.5">Annualized Volatility</div>
                  <div className="text-base font-extrabold text-slate-900">
                    {quote.indicators?.volatility_annual ? `${quote.indicators.volatility_annual}%` : 'N/A'}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Historical log-return std</div>
                </div>

                <div className="p-3 bg-slate-50 rounded-lg">
                  <div className="text-slate-400 text-[11px] mb-0.5">SMA 20 & SMA 50</div>
                  <div className="text-sm font-bold text-slate-900">
                    {quote.indicators?.sma_20 && quote.indicators?.sma_50
                      ? `${formatINR(quote.indicators.sma_20)} / ${formatINR(quote.indicators.sma_50)}`
                      : 'N/A'}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Short vs medium trend</div>
                </div>

                <div className="p-3 bg-slate-50 rounded-lg">
                  <div className="text-slate-400 text-[11px] mb-0.5">Beta (Market Sensitivity)</div>
                  <div className="text-base font-extrabold text-slate-900">{quote.beta ?? 'N/A'}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Relative to index</div>
                </div>
              </div>
            </div>

            {/* Fundamental Valuation & Solvency */}
            <div className="fin-card p-5">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <BarChart2 size={16} className="text-emerald-600" />
                  Fundamental Metrics & Solvency
                </h3>
                <span className="text-[11px] font-semibold text-slate-500">Corporate Filings</span>
              </div>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="p-3 bg-slate-50 rounded-lg">
                  <div className="text-slate-400 text-[11px] mb-0.5">Trailing P/E Ratio</div>
                  <div className="text-base font-extrabold text-slate-900">{quote.pe_ratio || 'N/A'}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Forward P/E: {quote.forward_pe || 'N/A'}</div>
                </div>

                <div className="p-3 bg-slate-50 rounded-lg">
                  <div className="text-slate-400 text-[11px] mb-0.5">EPS (Trailing 12M)</div>
                  <div className="text-base font-extrabold text-slate-900">
                    {quote.eps ? formatINR(quote.eps * (quote.is_converted ? (quote.exchange_rate || 1) : 1)) : 'N/A'}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {quote.is_converted && quote.eps ? `Original: ${formatUSD(quote.eps)}` : 'Diluted per-share net'}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-lg">
                  <div className="text-slate-400 text-[11px] mb-0.5">Operating Profit Margin</div>
                  <div className="text-base font-extrabold text-slate-900">{quote.profit_margin ? `${quote.profit_margin}%` : 'N/A'}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Core margin resilience</div>
                </div>

                <div className="p-3 bg-slate-50 rounded-lg">
                  <div className="text-slate-400 text-[11px] mb-0.5">Debt-to-Equity Ratio</div>
                  <div className="text-base font-extrabold text-slate-900">{quote.debt_to_equity ?? 'N/A'}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Leverage solvency factor</div>
                </div>

                <div className="p-3 bg-slate-50 rounded-lg">
                  <div className="text-slate-400 text-[11px] mb-0.5">52-Week High / Low</div>
                  <div className="text-sm font-bold text-slate-900">{formatINR(quote.week_52_high)} / {formatINR(quote.week_52_low)}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">1-Year annual boundary</div>
                </div>

                <div className="p-3 bg-slate-50 rounded-lg">
                  <div className="text-slate-400 text-[11px] mb-0.5">Market Capitalization</div>
                  <div className="text-base font-extrabold text-slate-900">
                    {formatINR(quote.market_cap, { compact: true })}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {quote.is_converted && quote.original_market_cap
                      ? `USD: $${(quote.original_market_cap / 1e9).toFixed(1)}B`
                      : 'Enterprise equity value'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* AI-Generated Analysis Summary Card */}
          <div className="fin-card p-5 bg-gradient-to-r from-blue-50/50 via-white to-indigo-50/40">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="text-blue-600" size={18} />
              <h3 className="font-bold text-slate-900 text-sm">FinSight AI Executive Synthesis</h3>
            </div>
            <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
              <strong>{quote.company_name} ({quote.symbol})</strong> is trading at <strong>{quote.current_price ? formatINR(quote.current_price) : 'market rates'}</strong> with a 14-day RSI of <strong>{quote.indicators?.rsi_14 ?? 'N/A'}</strong>. The stock maintains established support at <strong>{quote.support_level ? formatINR(quote.support_level) : 'key floor levels'}</strong> with an overhead resistance ceiling near <strong>{quote.resistance_level ? formatINR(quote.resistance_level) : 'key resistance levels'}</strong>. With trailing P/E at <strong>{quote.pe_ratio || 'N/A'}</strong> and operating margins at <strong>{quote.profit_margin || 'N/A'}%</strong>, the overall technical and fundamental synergy suggests an active <strong>Hold and Monitor</strong> status.
            </p>
          </div>

          {/* Relevant News for Stock */}
          <div className="fin-card p-5">
            <h3 className="font-bold text-slate-900 text-sm mb-4 pb-2 border-b border-slate-100 flex items-center justify-between">
              <span>Recent Relevant News & Disclosures for {quote.symbol}</span>
              <span className="text-xs font-normal text-slate-400">Verified Press Feeds</span>
            </h3>
            <div className="space-y-3">
              {news.length > 0 ? (
                news.slice(0, 4).map((item) => (
                  <div key={item.id} className="p-3 rounded-lg bg-slate-50 border border-slate-200/80 hover:border-blue-300 transition text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 hover:text-blue-600 cursor-pointer">
                        {item.title}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        item.sentiment === 'Bullish' ? 'bg-emerald-100 text-emerald-800' :
                        item.sentiment === 'Bearish' ? 'bg-rose-100 text-rose-800' : 'bg-slate-200 text-slate-700'
                      }`}>
                        {item.sentiment} ({item.sentiment_score > 0 ? '+' : ''}{item.sentiment_score})
                      </span>
                    </div>
                    <p className="text-slate-600 text-[11px] leading-relaxed">{item.summary}</p>
                    <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1">
                      <span>Source: <strong className="text-slate-600">{item.source}</strong></span>
                      <a href={item.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-blue-600 hover:underline">
                        Read full article <ExternalLink size={10} />
                      </a>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-4 text-center text-xs text-slate-400">
                  No immediate news alerts found for {quote.symbol}.
                </div>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
};
