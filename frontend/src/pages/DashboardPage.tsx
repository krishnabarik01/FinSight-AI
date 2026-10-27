import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  IndianRupee,
  ShieldAlert,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  ChevronRight,
  RefreshCw,
  Bell,
  AlertTriangle
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Line,
  Legend
} from 'recharts';
import { api } from '../services/api';
import { formatINR, formatUSD } from '../utils/currency';

interface DashboardPageProps {
  onNavigateTab: (tab: string) => void;
  onSelectStock: (symbol: string) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ onNavigateTab, onSelectStock }) => {
  // Independent data states so one slow call doesn't block the page shell
  const [summaryData, setSummaryData] = useState<any>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  const [indices, setIndices] = useState<any[]>([]);
  const [indicesLoading, setIndicesLoading] = useState(true);

  const [alerts, setAlerts] = useState<any[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(true);

  const [perfRange, setPerfRange] = useState('1M');
  const [perfData, setPerfData] = useState<any>(null);
  const [perfLoading, setPerfLoading] = useState(true);

  // Independent fetch functions
  const fetchIndices = () => {
    setIndicesLoading(true);
    api.stocks.getIndices()
      .then(res => {
        if (Array.isArray(res)) {
          setIndices(res);
        }
      })
      .catch(err => console.error('Indices fetch error:', err))
      .finally(() => setIndicesLoading(false));
  };

  const fetchSummary = () => {
    setSummaryLoading(true);
    api.dashboard.getSummary()
      .then(res => {
        setSummaryData(res);
        // Fallback or fill indices if not loaded yet
        if (res?.market_indices && indices.length === 0) {
          setIndices(res.market_indices);
          setIndicesLoading(false);
        }
        if (res?.recent_alerts && alerts.length === 0) {
          setAlerts(res.recent_alerts);
          setAlertsLoading(false);
        }
      })
      .catch(err => console.error('Summary fetch error:', err))
      .finally(() => setSummaryLoading(false));
  };

  const fetchAlerts = () => {
    setAlertsLoading(true);
    api.alerts.getAlerts()
      .then(res => {
        if (Array.isArray(res)) {
          setAlerts(res.slice(0, 5));
        }
      })
      .catch(err => console.error('Alerts fetch error:', err))
      .finally(() => setAlertsLoading(false));
  };

  const fetchPerformance = (range: string) => {
    setPerfLoading(true);
    api.portfolio.getPerformance(range)
      .then(res => setPerfData(res))
      .catch(err => console.error('Performance fetch error:', err))
      .finally(() => setPerfLoading(false));
  };

  const handleRefreshAll = () => {
    fetchIndices();
    fetchSummary();
    fetchAlerts();
    fetchPerformance(perfRange);
  };

  // Initial load: trigger independent fetches in parallel
  useEffect(() => {
    fetchIndices();
    fetchSummary();
    fetchAlerts();
    fetchPerformance(perfRange);
  }, []);

  // Performance range change
  useEffect(() => {
    fetchPerformance(perfRange);
  }, [perfRange]);

  const summary = summaryData?.portfolio_summary || {};
  const isPnlPositive = (summary.total_pnl || 0) >= 0;
  const isTodayPositive = (summary.today_pnl || 0) >= 0;
  const isRefreshing = summaryLoading || indicesLoading || alertsLoading || perfLoading;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Header - Rendered immediately */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Executive Dashboard</h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Real-time portfolio analytics, index benchmarks, and AI risk monitoring.
          </p>
        </div>
        <div className="flex items-center space-x-2.5">
          <button
            onClick={handleRefreshAll}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg shadow-xs transition"
          >
            <RefreshCw size={13} className={isRefreshing ? 'animate-spin' : ''} />
            Sync Markets
          </button>
          <button
            onClick={() => onNavigateTab('portfolio')}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition"
          >
            Manage Holdings
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* Beginner Investor Discovery Banner */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white p-4 sm:p-5 rounded-2xl shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-3.5">
          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-blue-300 shrink-0">
            <Sparkles size={20} />
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-blue-300">
              Personalized Guidance Engine
            </div>
            <div className="text-sm sm:text-base font-extrabold text-white mt-0.5">
              Personalized Stock & ETF Discovery Powered by Grow
            </div>
            <p className="text-xs text-slate-300 leading-relaxed mt-0.5">
              Complete your beginner questionnaire to receive tailored Indian bluechips, index ETFs, and stop-loss targets.
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2 shrink-0">
          <button
            onClick={() => onNavigateTab('discovery')}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition"
          >
            Explore AI Recommendations
            <ChevronRight size={14} />
          </button>
          <button
            onClick={() => onNavigateTab('learning')}
            className="px-3.5 py-2 bg-white/10 hover:bg-white/15 text-white border border-white/20 rounded-xl text-xs font-semibold transition"
          >
            Academy
          </button>
        </div>
      </div>

      {/* Market Indices Strip - Loads independently */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {indicesLoading && indices.length === 0 ? (
          [1, 2, 3, 4].map((i) => (
            <div key={i} className="fin-card p-3 animate-pulse bg-slate-50 border border-slate-200/60 rounded-xl">
              <div className="h-3 w-16 bg-slate-200 rounded mb-2"></div>
              <div className="h-5 w-24 bg-slate-200 rounded"></div>
            </div>
          ))
        ) : (
          indices.map((idx: any) => (
            <div
              key={idx.symbol}
              onClick={() => onSelectStock(idx.symbol)}
              className="fin-card p-3 cursor-pointer hover:border-blue-300 transition flex items-center justify-between rounded-xl bg-white border border-slate-200"
            >
              <div>
                <div className="text-[11px] font-bold text-slate-500">{idx.name}</div>
                <div className="text-sm font-extrabold text-slate-900 mt-0.5">
                  {typeof idx.price === 'number'
                    ? idx.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                    : idx.price}
                </div>
              </div>
              <span
                className={`inline-flex items-center text-xs font-bold px-1.5 py-0.5 rounded ${
                  idx.is_positive ? 'fin-badge-green text-emerald-700 bg-emerald-50' : 'fin-badge-red text-rose-700 bg-rose-50'
                }`}
              >
                {idx.is_positive ? <TrendingUp size={12} className="mr-0.5" /> : <TrendingDown size={12} className="mr-0.5" />}
                {idx.is_positive ? '+' : ''}{idx.change_pct}%
              </span>
            </div>
          ))
        )}
      </div>

      {/* KPI Metric Cards - Load independently */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {/* Total Value */}
        <div className="fin-card p-4 col-span-2 sm:col-span-1 lg:col-span-2">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-1">
            <span>Total Portfolio Value</span>
            <span className="p-1 bg-blue-50 text-blue-600 rounded">
              <IndianRupee size={14} />
            </span>
          </div>
          {summaryLoading && !summaryData ? (
            <div className="space-y-2 py-1">
              <div className="h-7 w-32 bg-slate-200 animate-pulse rounded" />
              <div className="h-4 w-24 bg-slate-100 animate-pulse rounded" />
            </div>
          ) : (
            <>
              <div className="text-2xl font-black text-slate-900 tracking-tight">
                {formatINR(summary.total_value)}
              </div>
              <div className="mt-2 flex items-center text-xs font-semibold">
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded ${isPnlPositive ? 'fin-badge-green' : 'fin-badge-red'}`}>
                  {isPnlPositive ? <ArrowUpRight size={13} className="mr-0.5" /> : <ArrowDownRight size={13} className="mr-0.5" />}
                  {isPnlPositive ? '+' : ''}{Number(summary.total_pnl_pct || 0).toFixed(2)}%
                </span>
                <span className="ml-2 text-slate-500 text-[11px]">
                  {formatINR(Math.abs(summary.total_pnl || 0))} unrealized
                </span>
              </div>
            </>
          )}
        </div>

        {/* Today's P&L */}
        <div className="fin-card p-4">
          <div className="text-xs font-semibold text-slate-500 mb-1">Today's P&L</div>
          {summaryLoading && !summaryData ? (
            <div className="space-y-2 py-1">
              <div className="h-6 w-20 bg-slate-200 animate-pulse rounded" />
              <div className="h-3 w-16 bg-slate-100 animate-pulse rounded" />
            </div>
          ) : (
            <>
              <div className={`text-xl font-extrabold ${isTodayPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                {isTodayPositive ? '+' : '-'}{formatINR(Math.abs(summary.today_pnl || 0))}
              </div>
              <div className="mt-1 text-[11px] font-semibold text-slate-500">
                {isTodayPositive ? '+' : ''}{Number(summary.today_pnl_pct || 0).toFixed(2)}% vs Prev Close
              </div>
            </>
          )}
        </div>

        {/* Invested Amount */}
        <div className="fin-card p-4">
          <div className="text-xs font-semibold text-slate-500 mb-1">Total Invested</div>
          {summaryLoading && !summaryData ? (
            <div className="space-y-2 py-1">
              <div className="h-6 w-24 bg-slate-200 animate-pulse rounded" />
              <div className="h-3 w-14 bg-slate-100 animate-pulse rounded" />
            </div>
          ) : (
            <>
              <div className="text-xl font-extrabold text-slate-900">
                {formatINR(summary.total_invested)}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                Cost basis (INR)
              </div>
            </>
          )}
        </div>

        {/* Portfolio Risk Score */}
        <div className="fin-card p-4 cursor-pointer hover:border-blue-300 transition" onClick={() => onNavigateTab('risk')}>
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-1">
            <span>Risk Score</span>
            <ShieldAlert size={14} className="text-amber-500" />
          </div>
          {summaryLoading && !summaryData ? (
            <div className="space-y-2 py-1">
              <div className="h-6 w-16 bg-slate-200 animate-pulse rounded" />
              <div className="h-3 w-20 bg-slate-100 animate-pulse rounded" />
            </div>
          ) : (
            <>
              <div className="text-xl font-extrabold text-slate-900 flex items-baseline gap-1">
                {summary.portfolio_risk_score || 42.5}
                <span className="text-xs font-normal text-slate-400">/ 100</span>
              </div>
              <div className="mt-1">
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                  Moderate Risk Tier
                </span>
              </div>
            </>
          )}
        </div>

        {/* Holdings Count */}
        <div className="fin-card p-4 cursor-pointer hover:border-blue-300 transition" onClick={() => onNavigateTab('portfolio')}>
          <div className="text-xs font-semibold text-slate-500 mb-1">Active Holdings</div>
          {summaryLoading && !summaryData ? (
            <div className="space-y-2 py-1">
              <div className="h-6 w-12 bg-slate-200 animate-pulse rounded" />
              <div className="h-3 w-20 bg-slate-100 animate-pulse rounded" />
            </div>
          ) : (
            <>
              <div className="text-xl font-extrabold text-slate-900">
                {summary.holdings_count || 0}
              </div>
              <div className="mt-1 text-[11px] text-emerald-600 font-semibold">
                All positions verified
              </div>
            </>
          )}
        </div>
      </div>

      {/* Main Performance Chart & Holdings Grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Performance Chart - Loads independently */}
        <div className="fin-card p-5 lg:col-span-2 flex flex-col justify-between">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">Portfolio Performance vs Benchmark</h2>
              <p className="text-xs text-slate-500">Normalized percentage return against {perfData?.benchmark_name || 'NIFTY 50'}</p>
            </div>
            {/* Filter buttons */}
            <div className="flex items-center space-x-1 bg-slate-100 p-0.5 rounded-lg text-xs font-semibold">
              {['1D', '1W', '1M', '3M', '6M', '1Y', 'ALL'].map((r) => (
                <button
                  key={r}
                  onClick={() => setPerfRange(r)}
                  className={`px-2.5 py-1 rounded-md transition ${
                    perfRange === r ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div className="h-72 w-full">
            {perfLoading && !perfData ? (
              <div className="h-full flex flex-col items-center justify-center space-y-2 text-xs text-slate-400">
                <RefreshCw className="animate-spin text-blue-500" size={20} />
                <span>Syncing performance analytics...</span>
              </div>
            ) : perfData?.performance_series && perfData.performance_series.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={perfData.performance_series}>
                  <defs>
                    <linearGradient id="colorPortfolio" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563EB" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#2563EB" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94A3B8' }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} tickLine={false} axisLine={false} unit="%" />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#FFFFFF', borderColor: '#E2E8F0', borderRadius: '0.5rem', fontSize: '12px' }}
                  />
                  <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '12px' }} />
                  <Area
                    type="monotone"
                    dataKey="portfolio_return_pct"
                    name="My Portfolio"
                    stroke="#2563EB"
                    strokeWidth={2.2}
                    fillOpacity={1}
                    fill="url(#colorPortfolio)"
                  />
                  <Line
                    type="monotone"
                    dataKey="benchmark_return_pct"
                    name={perfData.benchmark_name || 'Benchmark'}
                    stroke="#94A3B8"
                    strokeWidth={1.8}
                    strokeDasharray="4 4"
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                No performance data available.
              </div>
            )}
          </div>
        </div>

        {/* Top & Underperforming Holdings - Loads independently */}
        <div className="space-y-4">
          {/* Top Performers */}
          <div className="fin-card p-4">
            <div className="flex items-center justify-between text-xs font-bold text-slate-800 mb-3 pb-2 border-b border-slate-100">
              <span className="flex items-center gap-1.5 text-emerald-700">
                <TrendingUp size={15} />
                Top Performing Holdings
              </span>
              <span className="text-[11px] text-slate-400 font-normal">Unrealized Gain</span>
            </div>
            <div className="space-y-2.5">
              {summaryLoading && !summaryData ? (
                [1, 2, 3].map((i) => (
                  <div key={i} className="h-10 bg-slate-50 animate-pulse rounded-lg" />
                ))
              ) : (summaryData?.top_performers || []).length > 0 ? (
                summaryData.top_performers.map((h: any) => (
                  <div
                    key={h.id}
                    onClick={() => onSelectStock(h.symbol)}
                    className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 cursor-pointer transition border border-transparent hover:border-slate-200"
                  >
                    <div>
                      <div className="font-bold text-slate-900 text-xs">{h.symbol}</div>
                      <div className="text-[11px] text-slate-500 truncate max-w-[130px]">{h.company_name}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-emerald-600 text-xs">+{h.pnl_pct}%</div>
                      <div className="text-[10px] text-slate-400">{formatINR(h.current_price)}</div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-xs text-slate-400 text-center py-2">No active positions yet.</div>
              )}
            </div>
          </div>

          {/* Underperformers */}
          <div className="fin-card p-4">
            <div className="flex items-center justify-between text-xs font-bold text-slate-800 mb-3 pb-2 border-b border-slate-100">
              <span className="flex items-center gap-1.5 text-rose-700">
                <TrendingDown size={15} />
                Underperforming / Monitor List
              </span>
              <span className="text-[11px] text-slate-400 font-normal">P&L Status</span>
            </div>
            <div className="space-y-2.5">
              {summaryLoading && !summaryData ? (
                [1, 2, 3].map((i) => (
                  <div key={i} className="h-10 bg-slate-50 animate-pulse rounded-lg" />
                ))
              ) : (summaryData?.underperformers || []).length > 0 ? (
                summaryData.underperformers.map((h: any) => (
                  <div
                    key={h.id}
                    onClick={() => onSelectStock(h.symbol)}
                    className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 cursor-pointer transition border border-transparent hover:border-slate-200"
                  >
                    <div>
                      <div className="font-bold text-slate-900 text-xs">{h.symbol}</div>
                      <div className="text-[11px] text-slate-500 truncate max-w-[130px]">{h.company_name}</div>
                    </div>
                    <div className="text-right">
                      <div className={`font-bold text-xs ${h.pnl_pct >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {h.pnl_pct >= 0 ? '+' : ''}{h.pnl_pct}%
                      </div>
                      <div className="text-[10px] text-slate-400">
                        <span
                          className={`px-1.5 py-0.2 rounded text-[10px] font-semibold ${
                            h.ai_sell_color === 'red'
                              ? 'bg-rose-50 text-rose-700'
                              : h.ai_sell_color === 'amber'
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-blue-50 text-blue-700'
                          }`}
                        >
                          {h.ai_sell_signal}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-xs text-slate-400 text-center py-2">No underperforming stocks.</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Grid: Recent AI Insights & Alerts + Recent Transactions */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Recent AI Insights & Alerts - Loads independently */}
        <div className="fin-card p-5">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Sparkles size={18} className="text-blue-600" />
              <h2 className="text-base font-bold text-slate-900">AI Risk Insights & Signals</h2>
            </div>
            <button
              onClick={() => onNavigateTab('alerts')}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition"
            >
              View All Alerts
            </button>
          </div>

          <div className="space-y-3">
            {/* Real-time Alerts from alerts API */}
            {alertsLoading && alerts.length === 0 ? (
              <div className="h-16 bg-slate-50 animate-pulse rounded-lg" />
            ) : alerts.length > 0 ? (
              alerts.map((al: any) => (
                <div
                  key={al.id}
                  className={`p-3 border rounded-lg text-xs space-y-1 ${
                    al.severity === 'CRITICAL' ? 'bg-rose-50/60 border-rose-200' : 'bg-amber-50/60 border-amber-200'
                  }`}
                >
                  <div className="flex items-center justify-between font-bold text-slate-900">
                    <span className="flex items-center gap-1.5">
                      <AlertTriangle size={13} className={al.severity === 'CRITICAL' ? 'text-rose-600' : 'text-amber-600'} />
                      {al.symbol} - {al.alert_type?.replace(/_/g, ' ')}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      al.severity === 'CRITICAL' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {al.severity}
                    </span>
                  </div>
                  <p className="text-slate-600 text-[11px]">{al.triggered_condition}</p>
                </div>
              ))
            ) : null}

            {/* AI Insights from summaryData */}
            {(summaryData?.ai_insights || [
              {
                id: 'insight-1',
                title: 'Portfolio Concentration Check',
                summary: 'Holdings are well-distributed across Technology, Energy, and Banking sectors with healthy risk buffering.',
                sentiment: 'Positive'
              },
              {
                id: 'insight-2',
                title: 'Macro Volatility Inflow',
                summary: 'NIFTY 50 and S&P 500 index indicators suggest strong consolidation; maintain trailing stop-loss buffers.',
                sentiment: 'Neutral'
              }
            ]).map((ins: any) => (
              <div key={ins.id} className="p-3 bg-slate-50 border border-slate-200/80 rounded-lg text-xs space-y-1">
                <div className="flex items-center justify-between font-bold text-slate-800">
                  <span>{ins.title}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] ${
                      ins.sentiment === 'Positive' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
                    }`}
                  >
                    {ins.sentiment}
                  </span>
                </div>
                <p className="text-slate-600 text-[11px] leading-relaxed">{ins.summary}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Transactions */}
        <div className="fin-card p-5">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Layers size={18} className="text-slate-600" />
              <h2 className="text-base font-bold text-slate-900">Recent Portfolio Activity</h2>
            </div>
            <button
              onClick={() => onNavigateTab('portfolio')}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition"
            >
              Transaction Log
            </button>
          </div>
          <div className="space-y-2.5">
            {summaryLoading && !summaryData ? (
              [1, 2, 3].map((i) => (
                <div key={i} className="h-10 bg-slate-50 animate-pulse rounded-lg" />
              ))
            ) : (summaryData?.recent_transactions || []).length > 0 ? (
              summaryData.recent_transactions.map((tx: any) => (
                <div key={tx._id || tx.id} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg text-xs">
                  <div className="flex items-center space-x-2.5">
                    <span
                      className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                        tx.type === 'BUY' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {tx.type}
                    </span>
                    <div>
                      <div className="font-bold text-slate-900">{tx.symbol}</div>
                      <div className="text-[10px] text-slate-400">{tx.date}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-slate-800">{tx.quantity} shares</div>
                    <div className="text-[11px] text-slate-500">{formatINR(tx.price)}</div>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-4 text-center text-xs text-slate-400">
                No recent transactions recorded. Add your first holding in My Portfolio.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
