import React, { useState, useEffect } from 'react';
import {
  Settings as SettingsIcon,
  PhoneCall,
  Shield,
  Bell,
  Clock,
  Key,
  CheckCircle2,
  Save,
  Volume2,
  RefreshCw,
  ExternalLink
} from 'lucide-react';
import { api } from '../services/api';

interface SettingsPageProps {
  onOpenVoiceModal: () => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ onOpenVoiceModal }) => {
  const [settings, setSettings] = useState<any>({
    risk_tolerance: 'Moderate',
    default_stop_loss_pct: 7.0,
    default_target_pct: 15.0,
    voice_calls_enabled: true,
    phone_number: '+1 (415) 555-2671',
    voice_consent_given: true,
    quiet_hours_enabled: false,
    quiet_hours_start: '22:00',
    quiet_hours_end: '08:00',
    cooldown_period_minutes: 30,
    email_notifications_enabled: true,
    in_app_notifications_enabled: true,
    twilio_account_sid: '',
    twilio_auth_token: '',
    twilio_from_phone: '',
  });

  const [voiceLogs, setVoiceLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    Promise.all([
      api.settings.get(),
      api.voice.getLogs()
    ])
      .then(([sRes, vRes]) => {
        if (sRes) setSettings((prev: any) => ({ ...prev, ...sRes }));
        if (vRes) setVoiceLogs(vRes);
      })
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveSuccess(false);

    try {
      await api.settings.update(settings);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      alert(`Error saving preferences: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-bold mb-1 border border-blue-200">
            <SettingsIcon size={13} />
            Platform & Risk Configurations
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">System Settings</h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Configure risk tolerance parameters, quiet hours, alert notification channels, and Twilio voice credentials.
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition disabled:opacity-50"
        >
          <Save size={16} />
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>

      {saveSuccess && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-semibold text-emerald-800 flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 size={16} className="text-emerald-600" />
          Settings successfully updated and synchronized across risk engines.
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Risk Tolerance Profile */}
        <div className="fin-card p-6 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <Shield size={18} className="text-blue-600" />
            <h2 className="text-base font-bold text-slate-900">Investor Risk Appetite & Boundaries</h2>
          </div>

          <div className="grid md:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Risk Profile</label>
              <select
                value={settings.risk_tolerance}
                onChange={(e) => setSettings({ ...settings, risk_tolerance: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
              >
                <option value="Conservative">Conservative (Capital Preservation)</option>
                <option value="Moderate">Moderate (Balanced Core)</option>
                <option value="Aggressive">Aggressive (Maximum Alpha / Volatility Tolerant)</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Default Stop-Loss Buffer (%)</label>
              <input
                type="number"
                step="0.5"
                value={settings.default_stop_loss_pct}
                onChange={(e) => setSettings({ ...settings, default_stop_loss_pct: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Default Target Profit (%)</label>
              <input
                type="number"
                step="0.5"
                value={settings.default_target_pct}
                onChange={(e) => setSettings({ ...settings, default_target_pct: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
              />
            </div>
          </div>
        </div>

        {/* AI Voice-Call & Telephony Settings */}
        <div className="fin-card p-6 space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <PhoneCall size={18} className="text-blue-600" />
              <h2 className="text-base font-bold text-slate-900">AI Voice-Call Alert Center</h2>
            </div>
            <button
              type="button"
              onClick={onOpenVoiceModal}
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-700 font-bold text-xs rounded-lg hover:bg-blue-100 border border-blue-200 transition"
            >
              <Volume2 size={13} />
              Audition Voice Message
            </button>
          </div>

          <div className="space-y-4 text-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
              <div>
                <div className="font-bold text-slate-900">Enable Autonomous AI Voice-Call Alerts</div>
                <div className="text-slate-500 text-[11px]">
                  Initiate telephone calls to your verified phone number when critical stop-loss or volatility spikes are detected.
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={settings.voice_calls_enabled}
                  onChange={(e) => setSettings({ ...settings, voice_calls_enabled: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Recipient Verified Phone Number
                </label>
                <input
                  type="tel"
                  value={settings.phone_number || ''}
                  onChange={(e) => setSettings({ ...settings, phone_number: e.target.value })}
                  placeholder="+14155552671"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Alert Cooldown Window (Minutes)
                </label>
                <input
                  type="number"
                  value={settings.cooldown_period_minutes}
                  onChange={(e) => setSettings({ ...settings, cooldown_period_minutes: parseInt(e.target.value) || 30 })}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                />
              </div>
            </div>

            {/* Explicit User Voice Consent Checkbox */}
            <label className="flex items-start gap-2.5 p-3 bg-amber-50/60 border border-amber-200 rounded-lg cursor-pointer">
              <input
                type="checkbox"
                checked={settings.voice_consent_given}
                onChange={(e) => setSettings({ ...settings, voice_consent_given: e.target.checked })}
                className="mt-0.5 rounded text-blue-600 border-slate-300"
              />
              <span className="text-slate-700 leading-relaxed text-[11px]">
                <strong>Explicit Telephony Consent:</strong> I authorize FinSight AI to initiate automated voice notifications to my telephone number regarding urgent portfolio risk thresholds, stop-loss breaches, and AI Sell signals.
              </span>
            </label>
          </div>

          {/* Twilio Custom Credentials (Optional) */}
          <div className="mt-4 pt-4 border-t border-slate-100">
            <h3 className="font-bold text-slate-800 text-xs mb-1 flex items-center gap-1.5">
              <Key size={14} className="text-slate-500" />
              Twilio Telephony Credentials (Optional)
            </h3>
            <p className="text-[11px] text-slate-500 mb-3">
              If left blank, FinSight AI operates in verified sandbox simulation mode with high-fidelity speech synthesis.
            </p>

            <div className="grid md:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block text-slate-600 mb-1">Twilio Account SID</label>
                <input
                  type="text"
                  placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxx"
                  value={settings.twilio_account_sid || ''}
                  onChange={(e) => setSettings({ ...settings, twilio_account_sid: e.target.value })}
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                />
              </div>
              <div>
                <label className="block text-slate-600 mb-1">Twilio Auth Token</label>
                <input
                  type="password"
                  placeholder="••••••••••••••••"
                  value={settings.twilio_auth_token || ''}
                  onChange={(e) => setSettings({ ...settings, twilio_auth_token: e.target.value })}
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                />
              </div>
              <div>
                <label className="block text-slate-600 mb-1">Twilio From Phone Number</label>
                <input
                  type="text"
                  placeholder="+1234567890"
                  value={settings.twilio_from_phone || ''}
                  onChange={(e) => setSettings({ ...settings, twilio_from_phone: e.target.value })}
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Quiet Hours & Delivery Channels */}
        <div className="fin-card p-6 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <Clock size={18} className="text-slate-600" />
            <h2 className="text-base font-bold text-slate-900">Quiet Hours & Notification Channels</h2>
          </div>

          <div className="grid md:grid-cols-2 gap-4 text-xs">
            <div className="space-y-3">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.quiet_hours_enabled}
                  onChange={(e) => setSettings({ ...settings, quiet_hours_enabled: e.target.checked })}
                  className="rounded text-blue-600 border-slate-300"
                />
                <span className="font-semibold text-slate-800">Mute Voice Calls During Quiet Hours</span>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-500 mb-1">Quiet Hours Start</label>
                  <input
                    type="time"
                    value={settings.quiet_hours_start}
                    onChange={(e) => setSettings({ ...settings, quiet_hours_start: e.target.value })}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">Quiet Hours End</label>
                  <input
                    type="time"
                    value={settings.quiet_hours_end}
                    onChange={(e) => setSettings({ ...settings, quiet_hours_end: e.target.value })}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="font-semibold text-slate-800">Enabled Channels</div>
              <div className="space-y-2">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.in_app_notifications_enabled}
                    onChange={(e) => setSettings({ ...settings, in_app_notifications_enabled: e.target.checked })}
                    className="rounded text-blue-600 border-slate-300"
                  />
                  <span>In-App Dashboard Alerts</span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.email_notifications_enabled}
                    onChange={(e) => setSettings({ ...settings, email_notifications_enabled: e.target.checked })}
                    className="rounded text-blue-600 border-slate-300"
                  />
                  <span>Email Digest Notifications</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Voice Call History Log Table */}
        <div className="fin-card p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h2 className="text-base font-bold text-slate-900">Recent Voice Call Notification Logs</h2>
            <span className="text-xs text-slate-400">Verified telephony audit trail</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 font-semibold">
                  <th className="pb-2.5">Call ID</th>
                  <th className="pb-2.5">Stock</th>
                  <th className="pb-2.5">Recipient</th>
                  <th className="pb-2.5">Status</th>
                  <th className="pb-2.5">Spoken Summary</th>
                  <th className="pb-2.5 text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {voiceLogs.map((log) => (
                  <tr key={log._id || log.id || log.call_id} className="hover:bg-slate-50">
                    <td className="py-2.5 font-mono text-[11px] text-slate-700">{log.call_id}</td>
                    <td className="py-2.5 font-bold text-slate-900">{log.symbol}</td>
                    <td className="py-2.5 text-slate-600">{log.to_phone}</td>
                    <td className="py-2.5">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                        {log.status || 'completed'}
                      </span>
                    </td>
                    <td className="py-2.5 text-slate-600 truncate max-w-xs">{log.message}</td>
                    <td className="py-2.5 text-right text-slate-400 font-mono text-[10px]">{log.timestamp}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </form>
    </div>
  );
};
