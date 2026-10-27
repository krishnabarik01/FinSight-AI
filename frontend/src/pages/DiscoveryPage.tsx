import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  TrendingUp,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Info,
  RefreshCw,
  Plus,
  Sliders,
  ChevronDown,
  ChevronUp,
  PieChart,
  Activity,
  Layers,
  Eye
} from 'lucide-react';
import { api } from '../services/api';
import { formatINR } from '../utils/currency';

interface DiscoveryPageProps {
  onSelectStock: (symbol: string) => void;
  onNavigateTab: (tab: string) => void;
  onOpenOnboarding: () => void;
  profileVersion?: number;
}

export const DiscoveryPage: React.FC<DiscoveryPageProps> = ({
  onSelectStock,
  onNavigateTab,
  onOpenOnboarding,
  profileVersion = 0,
}) => {
  const [data, setData] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const fetchRecommendations = () => {
    setLoading(true);
    setError(null);
    Promise.all([
      api.recommendations.get(),
      api.onboarding.getProfile().catch(() => null)
    ])
      .then(([recRes, profRes]) => {
        setData(recRes);
        if (profRes) setProfile(profRes);
      })
      .catch(err => setError(err.message || 'Failed to fetch recommendations'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchRecommendations();
  }, [profileVersion]);

  const handleAddToWatchlist = async (sym: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.watchlist.add({ symbol: sym });
      setActionSuccess(`Added ${sym} to your active watchlist!`);
      setTimeout(() => setActionSuccess(null), 3000);
    } catch (err: any) {
      setActionSuccess(`${sym} is already in your watchlist.`);
      setTimeout(() => setActionSuccess(null), 3000);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold mb-2">
            <Sparkles size={14} />
            Personalized Investor Intelligence
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            AI Investment Discovery
          </h1>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">
            Tailored Indian equities, index ETFs, and precious metals curated by FinSight AI matching your personal risk profile and investment horizon.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={onOpenOnboarding}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold shadow-xs transition"
          >
            <Sliders size={15} />
            Retake Questionnaire
          </button>
          <button
            onClick={fetchRecommendations}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-semibold shadow-xs transition"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {actionSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-bold text-emerald-800 flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} />
            {actionSuccess}
          </div>
          <button onClick={() => onNavigateTab('watchlist')} className="underline hover:text-emerald-950">
            View Watchlist
          </button>
        </div>
      )}

      {/* User Profile Baseline Banner */}
      {data && (
        <div className="bg-gradient-to-r from-blue-900 via-indigo-950 to-slate-900 rounded-2xl p-5 text-white shadow-md flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center text-blue-300 backdrop-blur-xs">
              <PieChart size={24} />
            </div>
            <div>
              <div className="text-xs text-blue-200 uppercase font-bold tracking-wider">
                Active Profile Mapping
              </div>
              <div className="text-lg font-extrabold text-white">
                {data.user_risk_profile} Risk · {data.investment_horizon} Horizon
              </div>
              <div className="text-xs text-slate-300">
                Primary Goal: <span className="font-semibold text-white">{data.financial_objective}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="px-3.5 py-1.5 rounded-xl bg-white/10 border border-white/15 text-xs text-slate-200">
              <span className="font-extrabold text-white">{data.total_candidates}</span> Curated Candidates
            </div>
            <div className="px-3.5 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-400/30 text-xs font-bold text-emerald-300">
              Grow Market Feed Active
            </div>
          </div>
        </div>
      )}

      {/* Profiling Answers Chips */}
      {profile && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-2.5">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Sliders size={13} className="text-blue-600" />
              Profiling Questionnaire Answers Used:
            </div>
            <button
              onClick={onOpenOnboarding}
              className="text-xs text-blue-600 hover:text-blue-800 font-semibold underline"
            >
              Edit Answers
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-800 text-xs font-bold">
              🛡️ {profile.risk_tolerance} Risk
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-800 text-xs font-bold">
              ⏳ {profile.investment_horizon}
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold">
              💰 Budget: {profile.approximate_budget}
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold">
              🎓 {profile.experience_level}
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-50 border border-purple-200 text-purple-800 text-xs font-bold">
              🎯 {profile.financial_objective}
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold">
              🛑 Stop-Loss: -{profile.max_loss_tolerance_pct}%
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-50 border border-cyan-200 text-cyan-800 text-xs font-bold">
              💧 Liquidity: {profile.liquidity_need}
            </span>
            {(profile.preferred_categories || []).map((cat: string) => (
              <span key={cat} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 border border-slate-300 text-slate-800 text-xs font-bold">
                ⭐ {cat}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Loading & Error States */}
      {loading && (
        <div className="py-20 text-center text-slate-400 text-sm">
          <RefreshCw size={24} className="animate-spin mx-auto mb-3 text-blue-600" />
          Analyzing market indicators and generating personalized candidate matches...
        </div>
      )}

      {error && !loading && (
        <div className="p-6 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 text-sm flex items-center gap-3">
          <AlertTriangle size={20} className="shrink-0" />
          <div>
            <div className="font-bold">Recommendation Engine Notice</div>
            <div className="text-xs text-rose-600 mt-0.5">{error}</div>
          </div>
        </div>
      )}

      {/* Candidate Cards Grid */}
      {!loading && data && (
        <div className="grid grid-cols-1 gap-5">
          {data.candidates?.map((c: any) => {
            const isExpanded = expandedSymbol === c.symbol;
            const isHighRisk = c.risk_level === 'High Risk';
            const isLowRisk = c.risk_level === 'Low Risk';

            return (
              <div
                key={c.symbol}
                className="bg-white rounded-2xl border border-slate-200 hover:border-blue-300 shadow-xs hover:shadow-md transition-all overflow-hidden"
              >
                {/* Main Card Summary Row */}
                <div className="p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="flex items-start space-x-4">
                    <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center font-black text-slate-800 text-sm border border-slate-200/80 shrink-0">
                      {c.symbol.slice(0, 4)}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-lg font-extrabold text-slate-900 tracking-tight">
                          {c.symbol}
                        </span>
                        <span className="text-xs font-semibold px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                          {c.category}
                        </span>
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${
                          isHighRisk
                            ? 'bg-rose-50 text-rose-700 border-rose-200'
                            : isLowRisk
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}>
                          {c.risk_level}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 font-medium mt-0.5">
                        {c.name}
                      </div>

                      {/* Suitability highlight */}
                      <div className="mt-2 text-xs font-semibold text-blue-700 flex items-center gap-1.5">
                        <CheckCircle2 size={14} className="text-blue-600 shrink-0" />
                        <span>{c.match_reasons[0]}</span>
                      </div>
                    </div>
                  </div>

                  {/* Financial Metrics & Actions */}
                  <div className="flex flex-wrap items-center justify-between lg:justify-end gap-6 border-t lg:border-t-0 pt-4 lg:pt-0 border-slate-100">
                    <div className="text-left lg:text-right">
                      <div className="text-xs text-slate-400 font-medium">LTP (Grow Feed)</div>
                      <div className="text-xl font-black text-slate-900">
                        {formatINR(c.current_price)}
                      </div>
                      <div className={`text-xs font-bold ${(c.change_pct ?? 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {(c.change_pct ?? 0) >= 0 ? '+' : ''}{typeof c.change_pct === 'number' ? c.change_pct.toFixed(2) : (c.change_pct || '0.00')}%
                      </div>
                    </div>

                    <div className="text-center px-4 py-2 bg-blue-50/70 border border-blue-100 rounded-xl">
                      <div className="text-[10px] text-blue-600 font-bold uppercase tracking-wider">
                        Profile Match
                      </div>
                      <div className="text-lg font-black text-blue-900">
                        {c.suitability_score}%
                      </div>
                    </div>

                    {c.suggested_allocation_pct != null && (
                      <div className="text-center px-4 py-2 bg-purple-50/80 border border-purple-100 rounded-xl">
                        <div className="text-[10px] text-purple-600 font-bold uppercase tracking-wider">
                          Target Alloc.
                        </div>
                        <div className="text-lg font-black text-purple-900">
                          {c.suggested_allocation_pct}%
                        </div>
                      </div>
                    )}

                    <div className="flex items-center space-x-2">
                      <button
                        onClick={(e) => handleAddToWatchlist(c.symbol, e)}
                        title="Add to Watchlist"
                        className="p-2.5 text-slate-600 hover:text-blue-600 border border-slate-200 hover:border-blue-300 rounded-xl transition bg-white"
                      >
                        <Eye size={17} />
                      </button>

                      <button
                        onClick={() => onSelectStock(c.symbol)}
                        className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition"
                      >
                        Deep Analysis
                        <ArrowRight size={14} />
                      </button>

                      <button
                        onClick={() => setExpandedSymbol(isExpanded ? null : c.symbol)}
                        className="p-2 text-slate-400 hover:text-slate-700 transition"
                      >
                        {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                      </button>
                    </div>
                  </div>
                </div>

                {c.ai_explanation && (
                  <div className="mx-5 mb-4 p-3.5 bg-gradient-to-r from-blue-50/70 via-indigo-50/50 to-slate-50 border border-blue-200/60 rounded-xl text-xs text-slate-700">
                    <div className="flex items-center gap-1.5 font-bold text-blue-900 mb-1">
                      <Sparkles size={14} className="text-blue-600 shrink-0" />
                      FinSight AI Match Intelligence:
                    </div>
                    <p className="leading-relaxed">{c.ai_explanation}</p>
                  </div>
                )}

                {/* Expanded Details Section */}
                {isExpanded && (
                  <div className="bg-slate-50/80 border-t border-slate-100 p-5 sm:p-6 space-y-5 animate-fadeIn">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Pros */}
                      <div className="p-4 bg-white rounded-xl border border-emerald-100">
                        <div className="text-xs font-bold text-emerald-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                          <CheckCircle2 size={14} className="text-emerald-600" />
                          Key Advantages & Growth Drivers
                        </div>
                        <ul className="space-y-1.5 text-xs text-slate-600">
                          {c.pros?.map((p: string, idx: number) => (
                            <li key={idx} className="flex items-start gap-1.5">
                              <span className="text-emerald-500 font-bold">•</span>
                              <span>{p}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Cons / Risk Factors */}
                      <div className="p-4 bg-white rounded-xl border border-amber-100">
                        <div className="text-xs font-bold text-amber-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                          <AlertTriangle size={14} className="text-amber-600" />
                          Risk Factors & Considerations
                        </div>
                        <ul className="space-y-1.5 text-xs text-slate-600">
                          {c.cons?.map((consItem: string, idx: number) => (
                            <li key={idx} className="flex items-start gap-1.5">
                              <span className="text-amber-500 font-bold">•</span>
                              <span>{consItem}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {/* Technical & Valuation Analysis */}
                    <div className="p-4 bg-white rounded-xl border border-slate-200 text-xs space-y-2">
                      <div className="font-bold text-slate-900 flex items-center gap-1.5">
                        <Activity size={14} className="text-blue-600" />
                        Technical & Valuation Breakdown
                      </div>
                      <div className="text-slate-600">
                        <span className="font-semibold text-slate-800">Technicals:</span> {c.technical_indicator_summary}
                      </div>
                      <div className="text-slate-600">
                        <span className="font-semibold text-slate-800">Valuation:</span> {c.valuation_summary}
                      </div>
                    </div>

                    {/* Probabilistic Forecast Scenarios */}
                    {c.forecast_scenarios && (
                      <div className="space-y-2">
                        <div className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                          1-Year Forecast Scenarios ({c.forecast_scenarios.forecast_horizon})
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="p-3 bg-white rounded-xl border border-slate-200">
                            <div className="text-[10px] text-slate-400 font-bold uppercase">Base Case</div>
                            <div className="text-base font-extrabold text-slate-900 mt-0.5">
                              {formatINR(c.forecast_scenarios.base_case?.target_price)}
                            </div>
                            <div className="text-xs font-bold text-blue-600">
                              +{c.forecast_scenarios.base_case?.expected_return_pct}%
                            </div>
                            <div className="text-[11px] text-slate-500 mt-1 leading-snug">
                              {c.forecast_scenarios.base_case?.assumption}
                            </div>
                          </div>

                          <div className="p-3 bg-white rounded-xl border border-emerald-200 bg-emerald-50/20">
                            <div className="text-[10px] text-emerald-700 font-bold uppercase">Bull Case</div>
                            <div className="text-base font-extrabold text-emerald-950 mt-0.5">
                              {formatINR(c.forecast_scenarios.bull_case?.target_price)}
                            </div>
                            <div className="text-xs font-bold text-emerald-600">
                              +{c.forecast_scenarios.bull_case?.expected_return_pct}%
                            </div>
                            <div className="text-[11px] text-slate-500 mt-1 leading-snug">
                              {c.forecast_scenarios.bull_case?.assumption}
                            </div>
                          </div>

                          <div className="p-3 bg-white rounded-xl border border-rose-200 bg-rose-50/20">
                            <div className="text-[10px] text-rose-700 font-bold uppercase">Bear Case</div>
                            <div className="text-base font-extrabold text-rose-950 mt-0.5">
                              {formatINR(c.forecast_scenarios.bear_case?.target_price)}
                            </div>
                            <div className="text-xs font-bold text-rose-600">
                              {c.forecast_scenarios.bear_case?.expected_return_pct}%
                            </div>
                            <div className="text-[11px] text-slate-500 mt-1 leading-snug">
                              {c.forecast_scenarios.bear_case?.assumption}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* SEBI Compliance & Educational Disclaimer Card */}
      <div className="p-4 bg-slate-100/80 rounded-2xl border border-slate-200 text-xs text-slate-600 flex items-start space-x-3">
        <ShieldCheck size={18} className="text-blue-600 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold text-slate-800">Regulatory Compliance Notice: </span>
          FinSight AI is an educational technology prototype built for analytical research and decision support. 
          The recommendations above are generated using mathematical suitability models matching your questionnaire inputs with Grow market data.
          Past performance does not guarantee future results. This platform is not a SEBI registered investment adviser.
        </div>
      </div>
    </div>
  );
};
