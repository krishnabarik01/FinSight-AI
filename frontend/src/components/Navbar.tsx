import React, { useState, useEffect } from 'react';
import { Search, Bell, Shield, TrendingUp, TrendingDown, User, LogOut, CheckCircle2, PhoneCall } from 'lucide-react';
import { api } from '../services/api';

interface NavbarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  user: any;
  onLogout: () => void;
  onSelectStock: (symbol: string) => void;
  unreadAlertCount: number;
  onOpenVoiceModal: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  setCurrentTab,
  user,
  onLogout,
  onSelectStock,
  unreadAlertCount,
  onOpenVoiceModal,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [indices, setIndices] = useState<any[]>([]);

  useEffect(() => {
    // Fetch indices for the top ticker tape
    api.stocks.getIndices()
      .then((res: any) => {
        if (Array.isArray(res)) {
          setIndices(res);
        } else if (res && typeof res === 'object') {
          const list: any[] = [];
          if (res.nifty50) {
            list.push({
              name: 'NIFTY 50',
              symbol: '^NSEI',
              price: res.nifty50.value ?? 0,
              change: res.nifty50.change ?? 0,
              change_pct: res.nifty50.change_pct ?? 0
            });
          }
          if (res.sensex) {
            list.push({
              name: 'SENSEX',
              symbol: '^BSESN',
              price: res.sensex.value ?? 0,
              change: res.sensex.change ?? 0,
              change_pct: res.sensex.change_pct ?? 0
            });
          }
          if (res.india_vix) {
            list.push({
              name: 'INDIA VIX',
              symbol: '^INDIAVIX',
              price: typeof res.india_vix === 'object' ? (res.india_vix.value ?? 0) : res.india_vix,
              change: 0,
              change_pct: 0
            });
          }
          setIndices(list);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (searchQuery.trim().length >= 1) {
      const delay = setTimeout(() => {
        api.stocks.search(searchQuery)
          .then(res => {
            setSearchResults(res);
            setShowResults(true);
          })
          .catch(() => {});
      }, 200);
      return () => clearTimeout(delay);
    } else {
      setSearchResults([]);
      setShowResults(false);
    }
  }, [searchQuery]);

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200">
      {/* Top Indices Ticker Bar */}
      <div className="bg-slate-50 border-b border-slate-200/80 px-4 py-1.5 overflow-x-auto scrollbar-none flex items-center justify-between text-xs">
        <div className="flex items-center space-x-6 min-w-max">
          <span className="font-semibold text-slate-500 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Markets Live
          </span>
          {Array.isArray(indices) && indices.map(idx => {
            const isPos = (idx.change_pct ?? 0) >= 0;
            return (
              <div key={idx.symbol} className="flex items-center space-x-1.5 cursor-pointer hover:opacity-80 transition" onClick={() => onSelectStock(idx.symbol)}>
                <span className="font-medium text-slate-700">{idx.name}</span>
                <span className="font-semibold text-slate-900">{typeof idx.price === 'number' ? idx.price.toLocaleString('en-IN') : (idx.price || '—')}</span>
                <span className={`flex items-center font-medium ${isPos ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {isPos ? <TrendingUp size={12} className="mr-0.5" /> : <TrendingDown size={12} className="mr-0.5" />}
                  {isPos ? '+' : ''}{typeof idx.change_pct === 'number' ? idx.change_pct.toFixed(2) : (idx.change_pct || '0.00')}%
                </span>
              </div>
            );
          })}
        </div>
        <div className="hidden lg:flex items-center space-x-2 text-slate-500 text-[11px] pl-4">
          <span className="flex items-center gap-1 text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 font-semibold">
            <CheckCircle2 size={12} />
            Grow API Feed Active
          </span>
          <span className="flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
            <CheckCircle2 size={12} />
            AI Risk Guard
          </span>
        </div>
      </div>

      {/* Main Navbar */}
      <div className="px-4 lg:px-6 py-2.5 flex items-center justify-between gap-4">
        {/* Left: Mobile Brand & Search */}
        <div className="flex items-center flex-1 max-w-xl relative">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
            <input
              type="text"
              placeholder="Search Indian stocks & ETFs (e.g. SBIN, RELIANCE, TCS, NIFTYBEES)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => searchQuery.length >= 1 && setShowResults(true)}
              className="w-full pl-9 pr-4 py-1.5 text-sm bg-slate-50 border border-slate-300 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition"
            />
            {showResults && searchResults.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-lg shadow-lg z-50 max-h-72 overflow-y-auto">
                <div className="p-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-3">
                  Matching Equities
                </div>
                {searchResults.map((item) => (
                  <div
                    key={item.symbol}
                    onClick={() => {
                      onSelectStock(item.symbol);
                      setShowResults(false);
                      setSearchQuery('');
                    }}
                    className="flex items-center justify-between px-3.5 py-2 hover:bg-slate-50 cursor-pointer transition border-b border-slate-100 last:border-b-0"
                  >
                    <div>
                      <div className="font-semibold text-slate-900 text-sm">{item.symbol}</div>
                      <div className="text-xs text-slate-500 truncate max-w-xs">{item.name}</div>
                    </div>
                    <div className="text-right">
                      <span className="text-[11px] font-medium bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                        {item.exchange || 'STOCK'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Action Icons & User profile */}
        <div className="flex items-center space-x-3">
          {/* Test Voice Call Button */}
          <button
            onClick={onOpenVoiceModal}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-lg transition"
            title="Preview AI Voice-Call alert synthesizer"
          >
            <PhoneCall size={14} className="text-blue-600 animate-pulse" />
            AI Voice Alerts
          </button>

          {/* Notifications Bell */}
          <button
            onClick={() => setCurrentTab('alerts')}
            className="relative p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition"
            title="Portfolio Alerts & Notifications"
          >
            <Bell size={19} />
            {unreadAlertCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-rose-600 text-white rounded-full text-[10px] font-bold flex items-center justify-center">
                {unreadAlertCount}
              </span>
            )}
          </button>

          {/* User Profile Pill */}
          <div className="flex items-center pl-2 border-l border-slate-200 space-x-2.5">
            <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs shadow-sm">
              {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
            </div>
            <div className="hidden md:block text-left">
              <div className="text-xs font-semibold text-slate-900 leading-tight">{user?.name || 'Investor'}</div>
              <div className="text-[11px] text-slate-500 leading-tight">{user?.email || 'demo@finsight.ai'}</div>
            </div>
            <button
              onClick={onLogout}
              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition"
              title="Sign Out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
