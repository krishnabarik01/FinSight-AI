import React from 'react';
import {
  ShieldCheck,
  TrendingUp,
  BrainCircuit,
  PhoneCall,
  BellRing,
  PieChart,
  ArrowRight,
  ChevronRight,
  Lock,
  Activity,
  Layers,
  Sparkles,
  BarChart3
} from 'lucide-react';

interface LandingPageProps {
  onGetStarted: () => void;
  onExploreDemo: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onGetStarted, onExploreDemo }) => {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col text-slate-900">
      {/* Top Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
              <ShieldCheck size={24} className="stroke-[2.2]" />
            </div>
            <div>
              <span className="font-extrabold text-xl tracking-tight text-slate-900">
                FinSight <span className="text-blue-600">AI</span>
              </span>
              <span className="hidden sm:inline-block ml-2 text-xs font-semibold px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md border border-blue-200">
                SaaS Risk Platform
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <button
              onClick={onExploreDemo}
              className="text-sm font-semibold text-slate-700 hover:text-blue-600 transition px-3 py-1.5"
            >
              Instant Demo
            </button>
            <button
              onClick={onGetStarted}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition"
            >
              Sign In / Register
              <ArrowRight size={15} />
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-12 pb-20 lg:pt-20 lg:pb-28 bg-gradient-to-b from-white to-slate-50 border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold mb-6">
            <Sparkles size={14} />
            Institutional AI Stock Market Risk Intelligence
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-slate-950 tracking-tight max-w-4xl mx-auto leading-[1.15]">
            Protect Capital with <span className="text-blue-600">Three-Level Risk</span> & Explainable AI Sell Signals
          </h1>

          <p className="mt-6 text-lg sm:text-xl text-slate-600 max-w-2xl mx-auto leading-relaxed">
            FinSight AI delivers high-precision stock intelligence, multi-tier risk decomposition, automated portfolio monitoring, and autonomous voice-call alerts.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={onExploreDemo}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 text-base font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md shadow-blue-500/20 transition"
            >
              Launch Live Platform
              <ArrowRight size={18} />
            </button>
            <button
              onClick={onGetStarted}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 text-base font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl transition"
            >
              Create Account
            </button>
          </div>

          {/* Quick Metrics Bar */}
          <div className="mt-14 max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-white rounded-2xl border border-slate-200 shadow-sm text-left">
            <div className="p-3 border-r border-slate-100 last:border-r-0">
              <div className="text-xs font-medium text-slate-500">Risk Assessment</div>
              <div className="text-lg font-bold text-slate-900 mt-0.5">3-Tier Decomposition</div>
              <div className="text-[11px] text-blue-600 font-medium">High, Moderate & Low Risk</div>
            </div>
            <div className="p-3 border-r border-slate-100 last:border-r-0">
              <div className="text-xs font-medium text-slate-500">Live Coverage</div>
              <div className="text-lg font-bold text-slate-900 mt-0.5">NSE, BSE & NASDAQ</div>
              <div className="text-[11px] text-emerald-600 font-medium">Real-time Verified Feeds</div>
            </div>
            <div className="p-3 border-r border-slate-100 last:border-r-0">
              <div className="text-xs font-medium text-slate-500">AI Sell Alerts</div>
              <div className="text-lg font-bold text-slate-900 mt-0.5">Explainable Signals</div>
              <div className="text-[11px] text-slate-600 font-medium">Transparent Reason Codes</div>
            </div>
            <div className="p-3">
              <div className="text-xs font-medium text-slate-500">Voice Telephony</div>
              <div className="text-lg font-bold text-slate-900 mt-0.5">Twilio Voice Call</div>
              <div className="text-[11px] text-indigo-600 font-medium">Spoken Alert Dispatch</div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Showcase Grid */}
      <section className="py-20 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">
              Engineered for Serious Investors & Wealth Managers
            </h2>
            <p className="mt-4 text-base text-slate-600">
              Unlike generic charting tools that flood you with noisy indicators, FinSight AI categorizes risks, calculates downside thresholds, and guards your portfolio 24/7.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Card 1 */}
            <div className="fin-card p-6 flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-5">
                  <ShieldCheck size={26} />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">Three-Level Risk Engine</h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Evaluates stocks across High-Risk (short-term volatility & momentum), Moderate-Risk (hybrid technical & peer valuation), and Low-Risk (fundamental solvency & moat).
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-100 text-xs font-semibold text-blue-600 flex items-center gap-1">
                Explore risk metrics <ChevronRight size={14} />
              </div>
            </div>

            {/* Card 2 */}
            <div className="fin-card p-6 flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-5">
                  <BrainCircuit size={26} />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">Machine Learning Forecasts</h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Out-of-sample backtested gradient boosting models project 1-Day, 1-Week, and 1-Month confidence price bands with explicit directional accuracy metrics.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-100 text-xs font-semibold text-emerald-600 flex items-center gap-1">
                View model validation <ChevronRight size={14} />
              </div>
            </div>

            {/* Card 3 */}
            <div className="fin-card p-6 flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-5">
                  <PhoneCall size={26} />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">Automated Voice-Call Alerts</h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  When a stop-loss is breached or abnormal turbulence erupts, FinSight AI directly calls your verified phone number with a spoken situational briefing.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-100 text-xs font-semibold text-indigo-600 flex items-center gap-1">
                Audition spoken preview <ChevronRight size={14} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto bg-slate-900 text-slate-400 py-10 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between text-xs space-y-4 sm:space-y-0">
          <div className="flex items-center space-x-2">
            <span className="font-bold text-white text-sm">FinSight AI</span>
            <span>— Institutional Financial Platform</span>
          </div>
          <p className="text-slate-400 text-center">
            Designed for transparent risk management. Not financial advice. Verified market data sourced from yfinance.
          </p>
          <div className="flex items-center space-x-4">
            <button onClick={onExploreDemo} className="text-blue-400 hover:underline">
              Enter Demo
            </button>
            <button onClick={onGetStarted} className="text-white hover:underline">
              Sign In
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
