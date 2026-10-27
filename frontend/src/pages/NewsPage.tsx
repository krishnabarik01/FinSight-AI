import React, { useState, useEffect } from 'react';
import {
  Newspaper,
  TrendingUp,
  TrendingDown,
  ExternalLink,
  Filter,
  RefreshCw,
  Info,
  Sparkles,
  Search
} from 'lucide-react';
import { api } from '../services/api';

interface NewsPageProps {
  onSelectStock: (symbol: string) => void;
}

export const NewsPage: React.FC<NewsPageProps> = ({ onSelectStock }) => {
  const [news, setNews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchNews = () => {
    setLoading(true);
    api.news.getNews()
      .then(res => setNews(res))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchNews();
  }, []);

  const filteredNews = news.filter((item) => {
    const matchesSearch =
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.related_tickers?.some((t: string) => t.toLowerCase().includes(searchQuery.toLowerCase()));

    if (selectedCategory === 'All') return matchesSearch;
    if (selectedCategory === 'Bullish') return matchesSearch && item.sentiment === 'Bullish';
    if (selectedCategory === 'Bearish') return matchesSearch && item.sentiment === 'Bearish';
    if (selectedCategory === 'Neutral') return matchesSearch && item.sentiment === 'Neutral';
    return matchesSearch;
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-bold mb-1 border border-blue-200">
            <Newspaper size={13} />
            Institutional News & Sentiment Intelligence
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Market News & Disclosures</h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Real-time financial press feeds enriched with AI sentiment and portfolio relevance mapping.
          </p>
        </div>

        <button
          onClick={fetchNews}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg shadow-xs transition"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Refresh Wire
        </button>
      </div>

      {/* Sentiment Methodology Disclaimer Notice */}
      <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl text-xs flex items-start gap-2.5 text-slate-700">
        <Info size={16} className="text-blue-600 shrink-0 mt-0.5" />
        <span>
          <strong>Analytical Guidance:</strong> FinSight AI performs sentiment tagging and contextual relevance scoring to identify catalyst velocity. However, market sentiment is <em>not a guaranteed predictor</em> of stock price movement. Always correlate news indicators with verifiable technical support levels and balance sheet fundamentals.
        </span>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Category filters */}
        <div className="flex items-center space-x-1.5 bg-slate-100 p-1 rounded-lg text-xs font-semibold">
          {['All', 'Bullish', 'Bearish', 'Neutral'].map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1 rounded-md transition ${
                selectedCategory === cat
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
          <input
            type="text"
            placeholder="Search news or tickers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
          />
        </div>
      </div>

      {/* News Cards Feed */}
      {loading && news.length === 0 ? (
        <div className="p-12 flex items-center justify-center">
          <RefreshCw className="animate-spin text-blue-600 mr-2" size={24} />
          <span className="text-sm font-semibold text-slate-500">Curating verified financial news feeds...</span>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredNews.map((item) => (
            <div
              key={item.id}
              className="fin-card p-5 hover:border-slate-300 transition text-xs space-y-3"
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                <div>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-base font-bold text-slate-900 hover:text-blue-600 transition flex items-center gap-1.5"
                  >
                    {item.title}
                    <ExternalLink size={13} className="text-slate-400 shrink-0" />
                  </a>
                  <div className="mt-1 flex items-center gap-2 text-slate-400 text-[11px]">
                    <span className="font-semibold text-slate-600">{item.source}</span>
                    <span>•</span>
                    <span>Published: {item.published_at}</span>
                  </div>
                </div>

                {/* Sentiment Badge */}
                <div className="shrink-0">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
                    item.sentiment === 'Bullish' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                    item.sentiment === 'Bearish' ? 'bg-rose-100 text-rose-800 border border-rose-200' :
                    'bg-slate-100 text-slate-800 border border-slate-200'
                  }`}>
                    {item.sentiment === 'Bullish' ? <TrendingUp size={13} /> : item.sentiment === 'Bearish' ? <TrendingDown size={13} /> : null}
                    {item.sentiment} ({item.sentiment_score > 0 ? '+' : ''}{item.sentiment_score})
                  </span>
                </div>
              </div>

              <p className="text-slate-700 text-xs sm:text-sm leading-relaxed">
                {item.summary}
              </p>

              {/* Portfolio Relevance & Ticker tags */}
              <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="text-[11px] text-slate-600">
                  <strong className="text-blue-700">Portfolio Relevance:</strong> {item.relevance_reason}
                </div>

                <div className="flex items-center space-x-1.5">
                  <span className="text-[11px] text-slate-400">Related:</span>
                  {(item.related_tickers || []).map((t: string) => (
                    <button
                      key={t}
                      onClick={() => onSelectStock(t)}
                      className="px-2 py-0.5 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 font-bold rounded text-[10px] transition border border-slate-200"
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
