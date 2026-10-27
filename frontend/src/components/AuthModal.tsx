import React, { useState } from 'react';
import { X, Lock, Mail, User, Phone, ArrowRight, ShieldCheck, Sparkles } from 'lucide-react';
import { api, setToken, setStoredUser } from '../services/api';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: any) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('demo@finsight.ai');
  const [password, setPassword] = useState('password123');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      let res;
      if (isLogin) {
        res = await api.auth.login({ email, password });
      } else {
        res = await api.auth.register({ name, email, password, phone });
      }

      if (!res?.access_token || !res?.user) {
        throw new Error('Authentication response did not return a valid user profile or token.');
      }

      setToken(res.access_token);
      setStoredUser(res.user);
      onSuccess(res.user);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.auth.login({ email: 'demo@finsight.ai', password: 'password123' });
      if (!res?.access_token || !res?.user) {
        throw new Error('Demo login returned an incomplete response.');
      }
      setToken(res.access_token);
      setStoredUser(res.user);
      onSuccess(res.user);
      onClose();
    } catch {
      // If demo user wasn't registered yet, register it directly
      try {
        const regRes = await api.auth.register({
          name: 'Alex Mercer',
          email: 'demo@finsight.ai',
          password: 'password123',
          phone: '+1 (415) 555-2671',
        });
        if (!regRes?.access_token || !regRes?.user) {
          throw new Error('Demo registration returned an incomplete response.');
        }
        setToken(regRes.access_token);
        setStoredUser(regRes.user);
        onSuccess(regRes.user);
        onClose();
      } catch (regErr: any) {
        setError(regErr.message || 'Demo login failed. Please verify backend availability.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-sm">
              <ShieldCheck size={20} />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-lg leading-tight">
                {isLogin ? 'Sign In to FinSight AI' : 'Create FinSight AI Account'}
              </h3>
              <p className="text-xs text-slate-500">Secure Institutional Financial Platform</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1 rounded-md">
            <X size={20} />
          </button>
        </div>

        {/* Tab switch */}
        <div className="flex border-b border-slate-100">
          <button
            onClick={() => { setIsLogin(true); setError(null); }}
            className={`flex-1 py-3 text-xs font-bold transition text-center border-b-2 ${
              isLogin ? 'border-blue-600 text-blue-600 bg-blue-50/50' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => { setIsLogin(false); setError(null); }}
            className={`flex-1 py-3 text-xs font-bold transition text-center border-b-2 ${
              !isLogin ? 'border-blue-600 text-blue-600 bg-blue-50/50' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Create New Account
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Quick Demo Button */}
          <button
            type="button"
            onClick={handleDemoLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-lg transition"
          >
            <Sparkles size={15} className="text-emerald-600" />
            1-Click Demo Login (Alex Mercer)
          </button>

          <div className="relative flex items-center justify-center">
            <div className="border-t border-slate-200 w-full"></div>
            <span className="bg-white px-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider absolute">
              or continue with credentials
            </span>
          </div>

          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5">
            {!isLogin && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Alex Mercer"
                    className="w-full pl-9 pr-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full pl-9 pr-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                />
              </div>
            </div>

            {!isLogin && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Phone Number (for AI Voice Alerts)
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+1 (415) 555-2671"
                    className="w-full pl-9 pr-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition disabled:opacity-50"
            >
              {loading ? 'Authenticating...' : isLogin ? 'Sign In' : 'Create Account'}
              <ArrowRight size={16} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
