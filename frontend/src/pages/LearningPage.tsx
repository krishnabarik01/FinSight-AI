import React, { useState, useEffect } from 'react';
import {
  GraduationCap,
  BookOpen,
  Search,
  CheckCircle2,
  HelpCircle,
  ShieldCheck,
  TrendingUp,
  BarChart3,
  Layers,
  PieChart,
  ShieldAlert,
  ChevronRight,
  Sparkles,
  ExternalLink
} from 'lucide-react';
import { api } from '../services/api';

export const LearningPage: React.FC = () => {
  const [modules, setModules] = useState<any[]>([]);
  const [glossary, setGlossary] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedModule, setSelectedModule] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.education.getModules(),
      api.education.getGlossary()
    ])
      .then(([mRes, gRes]) => {
        if (mRes?.modules) {
          setModules(mRes.modules);
          setSelectedModule(mRes.modules[0]);
        }
        if (gRes?.terms) {
          setGlossary(gRes.terms);
        }
      })
      .catch(err => console.error('Education API error:', err))
      .finally(() => setLoading(false));
  }, []);

  const filteredGlossary = glossary.filter(
    g => g.term.toLowerCase().includes(searchTerm.toLowerCase()) ||
         g.definition.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold mb-2">
          <GraduationCap size={14} />
          Beginner Investor Academy
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          Stock Market Learning Center
        </h1>
        <p className="text-sm text-slate-500 mt-1 max-w-2xl">
          Clear, jargon-free guides to master Indian equities, ETFs, candlestick charts, risk management, and SEBI regulatory protections.
        </p>
      </div>

      {/* Main Educational Split: Lessons & Active Lesson Reader */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left: Module List */}
        <div className="space-y-3 lg:col-span-1">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">
            Essential Lessons ({modules.length})
          </div>

          <div className="space-y-2">
            {modules.map((m) => {
              const isActive = selectedModule?.id === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setSelectedModule(m)}
                  className={`w-full text-left p-4 rounded-2xl border transition flex items-center justify-between ${
                    isActive
                      ? 'border-blue-600 bg-blue-50/70 shadow-xs'
                      : 'border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="pr-2">
                    <div className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">
                      {m.category} · {m.reading_time_mins} min
                    </div>
                    <div className={`text-sm font-bold mt-0.5 ${isActive ? 'text-blue-950' : 'text-slate-800'}`}>
                      {m.title}
                    </div>
                  </div>
                  <ChevronRight size={18} className={isActive ? 'text-blue-600' : 'text-slate-300'} />
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Selected Lesson Detail View */}
        <div className="lg:col-span-2">
          {selectedModule ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 sm:p-8 space-y-6">
              <div className="border-b border-slate-100 pb-5">
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200">
                  {selectedModule.category}
                </span>
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-2.5">
                  {selectedModule.title}
                </h2>
                <p className="text-sm text-slate-600 mt-2 leading-relaxed">
                  {selectedModule.summary}
                </p>
              </div>

              {/* Key Takeaways */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Core Principles & Explanations
                </h3>
                <div className="space-y-2.5">
                  {selectedModule.key_takeaways?.map((item: string, idx: number) => (
                    <div key={idx} className="p-3.5 bg-slate-50 rounded-xl border border-slate-100 text-xs text-slate-700 leading-relaxed flex items-start gap-2.5">
                      <CheckCircle2 size={16} className="text-blue-600 shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Beginner Tip Highlight Box */}
              {selectedModule.beginner_tip && (
                <div className="p-4 bg-emerald-50/70 border border-emerald-200/80 rounded-2xl flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white shrink-0 mt-0.5">
                    <Sparkles size={16} />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-emerald-900 uppercase tracking-wide">
                      FinSight Beginner Actionable Tip
                    </div>
                    <div className="text-xs text-emerald-800 mt-0.5 leading-relaxed font-medium">
                      {selectedModule.beginner_tip}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-12 text-center text-slate-400 text-sm bg-white rounded-2xl border border-slate-200">
              Select a lesson from the left to read.
            </div>
          )}
        </div>
      </div>

      {/* Financial Glossary Section */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div>
            <div className="text-xs font-bold text-blue-600 uppercase tracking-wider">Quick Reference</div>
            <h2 className="text-xl font-extrabold text-slate-900 tracking-tight mt-0.5">
              Indian Stock Market Glossary
            </h2>
          </div>

          <div className="relative w-full sm:w-72">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search terms (e.g. Beta, P/E)..."
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-hidden focus:border-blue-500 transition"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredGlossary.map((g, idx) => (
            <div key={idx} className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 hover:border-slate-300 transition">
              <div className="text-sm font-bold text-slate-900 tracking-tight">
                {g.term}
              </div>
              <div className="text-xs text-slate-600 mt-1 leading-relaxed">
                {g.definition}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* SEBI Investor Protection Notice */}
      <div className="p-5 bg-gradient-to-r from-blue-900 to-indigo-950 text-white rounded-2xl shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-3.5">
          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-blue-300 shrink-0">
            <ShieldCheck size={22} />
          </div>
          <div>
            <div className="text-sm font-bold text-white">
              SEBI Investor Awareness & Education Principles
            </div>
            <div className="text-xs text-blue-200 mt-0.5 max-w-2xl leading-relaxed">
              Always invest through SEBI registered intermediaries. Beware of fraudulent promises of guaranteed daily returns or unregistered tip schemes.
            </div>
          </div>
        </div>
        <a
          href="https://investor.sebi.gov.in"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl text-xs font-bold text-white transition shrink-0"
        >
          SEBI Portal
          <ExternalLink size={13} />
        </a>
      </div>
    </div>
  );
};
