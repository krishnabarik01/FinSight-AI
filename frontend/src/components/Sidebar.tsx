import React from 'react';
import {
  LayoutDashboard,
  Search,
  ShieldAlert,
  PieChart,
  Eye,
  BrainCircuit,
  Newspaper,
  BellRing,
  Settings,
  ShieldCheck,
  ChevronRight,
  Coins,
  Sparkles,
  GraduationCap
} from 'lucide-react';

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  alertCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentTab, setCurrentTab, alertCount = 0 }) => {
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'discovery', label: 'AI Discovery', icon: Sparkles, badge: 'Tailored' },
    { id: 'stocks', label: 'Stock Analysis', icon: Search },
    { id: 'metals', label: 'Metals Bullion', icon: Coins, badge: 'Gold & Silver' },
    { id: 'risk', label: 'Risk Assessment', icon: ShieldAlert, badge: '3-Tier' },
    { id: 'portfolio', label: 'My Portfolio', icon: PieChart },
    { id: 'watchlist', label: 'Watchlist', icon: Eye },
    { id: 'predictions', label: 'AI Predictions', icon: BrainCircuit, badge: 'ML' },
    { id: 'learning', label: 'Learning Center', icon: GraduationCap },
    { id: 'news', label: 'Market News', icon: Newspaper },
    { id: 'alerts', label: 'Alerts & Monitoring', icon: BellRing, count: alertCount },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <aside className="w-64 bg-white border-r border-slate-200 flex flex-col shrink-0 h-screen sticky top-0">
      {/* Brand Logo Header */}
      <div className="h-16 px-6 flex items-center border-b border-slate-100">
        <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setCurrentTab('dashboard')}>
          <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
            <ShieldCheck size={22} className="stroke-[2.2]" />
          </div>
          <div>
            <div className="font-extrabold text-slate-900 tracking-tight text-lg leading-tight flex items-center gap-1">
              FinSight <span className="text-blue-600">AI</span>
            </div>
            <div className="text-[10px] text-slate-400 font-medium tracking-wide uppercase">
              Risk Intelligence
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Menu */}
      <nav className="p-3 space-y-1 flex-1 overflow-y-auto">
        <div className="px-3 py-2 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
          Platform Menu
        </div>
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id || (item.id === 'metals' && currentTab === 'gold');
          return (
            <button
              key={item.id}
              onClick={() => setCurrentTab(item.id)}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-blue-50 text-blue-700 font-semibold border border-blue-200/60 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center space-x-3">
                <Icon size={18} className={isActive ? 'text-blue-600' : 'text-slate-400'} />
                <span>{item.label}</span>
              </div>
              <div className="flex items-center space-x-1.5">
                {item.badge && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    isActive ? 'bg-blue-200 text-blue-800' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {item.badge}
                  </span>
                )}
                {item.count && item.count > 0 ? (
                  <span className="text-[10px] font-bold px-1.5 py-0.2 bg-rose-500 text-white rounded-full">
                    {item.count}
                  </span>
                ) : null}
              </div>
            </button>
          );
        })}
      </nav>

      {/* Bottom Risk Guard Status Widget */}
      <div className="p-4 border-t border-slate-100">
        <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-3 text-xs">
          <div className="flex items-center justify-between font-semibold text-slate-800 mb-1">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              Portfolio Risk Guard
            </span>
            <span className="text-emerald-600">Active</span>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Continuous background evaluation of stop-loss, volatility & AI Sell Signals.
          </p>
        </div>
      </div>
    </aside>
  );
};
