import React, { useState, useEffect } from 'react';
import {
  BellRing,
  AlertTriangle,
  ShieldAlert,
  PhoneCall,
  CheckCircle2,
  Trash2,
  Plus,
  RefreshCw,
  ExternalLink,
  Sliders,
  Sparkles,
  X,
  Volume2
} from 'lucide-react';
import { api } from '../services/api';
import { formatINR } from '../utils/currency';

interface AlertsPageProps {
  onSelectStock: (symbol: string) => void;
  onOpenVoiceModal: () => void;
}

export const AlertsPage: React.FC<AlertsPageProps> = ({ onSelectStock, onOpenVoiceModal }) => {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [sellSignals, setSellSignals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);

  // New rule form
  const [symbol, setSymbol] = useState('RELIANCE.NS');
  const [ruleType, setRuleType] = useState('STOP_LOSS');
  const [threshold, setThreshold] = useState<number>(2750.0);
  const [condition, setCondition] = useState('LESS_THAN');
  const [enableVoice, setEnableVoice] = useState(true);
  const [enableEmail, setEnableEmail] = useState(true);
  const [ruleSubmitting, setRuleSubmitting] = useState(false);
  const [evaluating, setEvaluating] = useState(false);

  const fetchAlertsData = () => {
    setLoading(true);
    Promise.all([
      api.alerts.getAlerts(),
      api.alerts.getRules(),
      api.alerts.getSellSignals()
    ])
      .then(([aRes, rRes, sRes]) => {
        setAlerts(aRes);
        setRules(rRes);
        setSellSignals(sRes);
      })
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchAlertsData();
  }, []);

  const handleDismissAlert = async (id: string) => {
    try {
      await api.alerts.dismissAlert(id);
      setAlerts(alerts.filter(a => (a._id || a.id) !== id));
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    setRuleSubmitting(true);
    try {
      await api.alerts.createRule({
        symbol: symbol.toUpperCase().trim(),
        rule_type: ruleType,
        threshold: Number(threshold),
        condition,
        enable_voice_call: enableVoice,
        enable_email: enableEmail,
      });
      setIsRuleModalOpen(false);
      fetchAlertsData();
    } catch (err: any) {
      alert(`Error creating rule: ${err.message}`);
    } finally {
      setRuleSubmitting(false);
    }
  };

  const handleDeleteRule = async (id: string) => {
    if (window.confirm('Delete this monitoring alert rule?')) {
      try {
        await api.alerts.deleteRule(id);
        fetchAlertsData();
      } catch (err: any) {
        alert(err.message);
      }
    }
  };

  const handleRunEvaluation = async () => {
    setEvaluating(true);
    try {
      const res = await api.alerts.evaluateNow();
      alert(`Monitoring Cycle Completed: Processed ${res.processed} holdings. Alerts generated: ${res.alerts_generated}`);
      fetchAlertsData();
    } catch (err: any) {
      alert(`Evaluation error: ${err.message}`);
    } finally {
      setEvaluating(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 text-xs font-bold mb-1 border border-rose-200">
            <BellRing size={13} />
            Automated Portfolio Risk Monitoring
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Alerts & Explainable Sell Signals
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Real-time rule evaluation, stop-loss breaches, volatility alerts, and AI voice-call dispatches.
          </p>
        </div>

        <div className="flex items-center space-x-2.5">
          <button
            onClick={handleRunEvaluation}
            disabled={evaluating}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg shadow-xs transition disabled:opacity-50"
          >
            <RefreshCw size={13} className={evaluating ? 'animate-spin' : ''} />
            {evaluating ? 'Evaluating...' : 'Run Monitor Check Now'}
          </button>
          <button
            onClick={() => setIsRuleModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition"
          >
            <Plus size={15} />
            Configure Alert Rule
          </button>
        </div>
      </div>

      {/* AI Sell Signal Cards */}
      <div className="fin-card p-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-blue-600" />
            <h2 className="text-base font-bold text-slate-900">Explainable AI Sell Signals</h2>
          </div>
          <span className="text-xs text-slate-400">Synthesized across current portfolio holdings</span>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          {sellSignals.length > 0 ? (
            sellSignals.map((sig) => (
              <div
                key={sig.holding_id}
                className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 hover:border-slate-300 transition text-xs space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div
                    className="font-black text-slate-900 text-sm cursor-pointer hover:text-blue-600"
                    onClick={() => onSelectStock(sig.symbol)}
                  >
                    {sig.symbol}
                  </div>
                  <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                    sig.color_tag === 'red' ? 'bg-rose-100 text-rose-800 border border-rose-200' :
                    sig.color_tag === 'amber' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                    sig.color_tag === 'blue' ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                    'bg-emerald-100 text-emerald-800 border border-emerald-200'
                  }`}>
                    {sig.signal}
                  </span>
                </div>

                <div className="text-[11px] text-slate-500 flex justify-between">
                  <span>Price: ${sig.current_price}</span>
                  <span className={`font-semibold ${sig.pnl_pct >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {sig.pnl_pct >= 0 ? '+' : ''}{sig.pnl_pct}% return
                  </span>
                </div>

                <p className="text-slate-700 text-[11px] leading-relaxed pt-1 border-t border-slate-200/60">
                  {sig.rationale}
                </p>

                <div className="text-[10px] text-slate-400 font-medium">
                  Confidence Score: {sig.confidence_pct}%
                </div>
              </div>
            ))
          ) : (
            <div className="col-span-3 p-4 text-center text-xs text-slate-400">
              No holdings to analyze. Add a stock in My Portfolio to generate AI Sell Signals.
            </div>
          )}
        </div>
      </div>

      {/* Triggered Alert Events Feed */}
      <div className="fin-card p-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
          <div className="flex items-center gap-2">
            <AlertTriangle size={18} className="text-amber-500" />
            <h2 className="text-base font-bold text-slate-900">Triggered Risk Events & Notification History</h2>
          </div>
          <span className="text-xs text-slate-400">Active cooldown prevents duplicated pings</span>
        </div>

        <div className="space-y-3">
          {alerts.length > 0 ? (
            alerts.map((al) => {
              const id = al._id || al.id;
              return (
                <div
                  key={id}
                  className="p-4 bg-white border border-slate-200 rounded-xl hover:shadow-xs transition text-xs space-y-2"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center space-x-2.5">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        al.severity === 'CRITICAL' ? 'bg-rose-100 text-rose-800' :
                        al.severity === 'HIGH' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                      }`}>
                        {al.severity}
                      </span>
                      <span className="font-extrabold text-slate-900 text-sm">{al.symbol}</span>
                      <span className="text-slate-500 text-xs">({al.company_name})</span>
                    </div>

                    <div className="flex items-center space-x-2 text-[11px] text-slate-400">
                      <span>{al.timestamp}</span>
                      {al.voice_notified && (
                        <span className="flex items-center gap-1 text-blue-700 bg-blue-50 px-2 py-0.5 rounded font-semibold border border-blue-200">
                          <PhoneCall size={12} />
                          Voice Call Sent
                        </span>
                      )}
                      <button
                        onClick={() => handleDismissAlert(id)}
                        className="text-slate-400 hover:text-slate-700 px-2 py-0.5 rounded border border-slate-200"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>

                  <div className="text-slate-800 font-semibold">{al.triggered_condition}</div>
                  <div className="text-slate-600 text-[11px] leading-relaxed">
                    <strong>Evidence:</strong> {al.supporting_evidence}
                  </div>
                  <div className="p-2.5 bg-slate-50 rounded-lg text-slate-700 text-[11px] flex items-center justify-between">
                    <div>
                      <strong>Recommended Action:</strong> {al.suggested_action}
                    </div>
                    <button
                      onClick={() => onSelectStock(al.symbol)}
                      className="text-blue-600 font-bold hover:underline shrink-0 ml-3"
                    >
                      Inspect Stock Analysis
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-6 text-center text-xs text-slate-400">
              No active alert triggers. Portfolio health is within normal variance thresholds.
            </div>
          )}
        </div>
      </div>

      {/* Configured Alert Rules */}
      <div className="fin-card p-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
          <div className="flex items-center gap-2">
            <Sliders size={18} className="text-slate-600" />
            <h2 className="text-base font-bold text-slate-900">Custom Alert Rule Thresholds</h2>
          </div>
          <span className="text-xs text-slate-400">{rules.length} Active Rules</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-400 font-semibold">
                <th className="pb-2.5">Stock</th>
                <th className="pb-2.5">Rule Type</th>
                <th className="pb-2.5">Condition</th>
                <th className="pb-2.5">Trigger Threshold</th>
                <th className="pb-2.5">Channels</th>
                <th className="pb-2.5">Status</th>
                <th className="pb-2.5 text-right">Delete</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rules.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="py-2.5 font-bold text-slate-900">{r.symbol}</td>
                  <td className="py-2.5 font-semibold text-slate-700">{r.rule_type.replace('_', ' ')}</td>
                  <td className="py-2.5 text-slate-600">{r.condition}</td>
                  <td className="py-2.5 font-mono font-bold text-slate-800">
                    {r.rule_type === 'STOP_LOSS' || r.rule_type === 'TARGET_PRICE'
                      ? formatINR(r.threshold)
                      : r.rule_type === 'VOLATILITY_SPIKE'
                      ? `${r.threshold}%`
                      : r.threshold}
                  </td>
                  <td className="py-2.5">
                    <span className="flex items-center gap-1.5 text-slate-600">
                      {r.enable_voice_call && <span className="p-1 bg-blue-50 text-blue-600 rounded" title="Voice Call"><PhoneCall size={12} /></span>}
                      {r.enable_email && <span className="p-1 bg-slate-100 text-slate-600 rounded" title="Email Alert">@</span>}
                    </span>
                  </td>
                  <td className="py-2.5">
                    <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded text-[10px] font-bold">
                      Active
                    </span>
                  </td>
                  <td className="py-2.5 text-right">
                    <button
                      onClick={() => handleDeleteRule(r.id)}
                      className="p-1 text-slate-400 hover:text-rose-600 rounded"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Rule Modal */}
      {isRuleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-base">New Portfolio Alert Rule</h3>
              <button onClick={() => setIsRuleModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateRule} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Target Stock Ticker</label>
                <input
                  type="text"
                  required
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Rule Type</label>
                  <select
                    value={ruleType}
                    onChange={(e) => setRuleType(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                  >
                    <option value="STOP_LOSS">Stop-Loss Breach</option>
                    <option value="TARGET_PRICE">Target Price Reached</option>
                    <option value="VOLATILITY_SPIKE">Volatility Surge (&gt;35%)</option>
                    <option value="RSI_OVERBOUGHT">RSI Overbought (&gt;75)</option>
                    <option value="RSI_OVERSOLD">RSI Oversold (&lt;30)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Threshold Value {ruleType === 'STOP_LOSS' || ruleType === 'TARGET_PRICE' ? '(₹ INR)' : ''}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={threshold}
                    onChange={(e) => setThreshold(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                  />
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-100">
                <label className="block text-xs font-semibold text-slate-700">Notification Channels</label>
                <div className="flex items-center space-x-4 text-xs text-slate-700">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enableVoice}
                      onChange={(e) => setEnableVoice(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600"
                    />
                    <span>AI Voice-Call Alert</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enableEmail}
                      onChange={(e) => setEnableEmail(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600"
                    />
                    <span>Email & In-App Ping</span>
                  </label>
                </div>
              </div>

              <div className="pt-3 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsRuleModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={ruleSubmitting}
                  className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm disabled:opacity-50"
                >
                  {ruleSubmitting ? 'Saving Rule...' : 'Activate Alert Rule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
