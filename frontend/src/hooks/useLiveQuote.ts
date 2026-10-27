import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../services/api';

export interface LiveQuote {
  symbol: string;
  clean_symbol?: string;
  name: string;
  company_name?: string;
  price: number;
  current_price?: number;
  change: number;
  change_percent: number;
  change_pct?: number;
  currency: string;
  source: string;
  data_source?: string;
  timestamp: string;
  last_updated?: string;
  data_status: 'live' | 'stale' | 'unavailable' | 'cached';
  is_stale?: boolean;
  stale_timestamp?: string;
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
  avg_volume?: number;
  support_level?: number;
  resistance_level?: number;
  week_52_high?: number;
  week_52_low?: number;
  indicators?: any;
}

interface UseLiveQuoteOptions {
  refreshIntervalMs?: number;
  enabled?: boolean;
}

/**
 * Standardize quote response properties so both unified keys and legacy keys work identically.
 */
export function normalizeLiveQuote(raw: any): LiveQuote {
  if (!raw) {
    return {
      symbol: '',
      name: '',
      price: 0,
      change: 0,
      change_percent: 0,
      currency: 'INR',
      source: 'yfinance (fallback)',
      timestamp: new Date().toISOString(),
      data_status: 'unavailable',
      is_stale: false,
    };
  }

  const p = Number(raw.price ?? raw.current_price ?? 0);
  const chg = Number(raw.change ?? 0);
  const chgPct = Number(raw.change_percent ?? raw.change_pct ?? 0);
  const src = raw.source || raw.data_source || 'yfinance (fallback)';
  const ts = raw.timestamp || raw.last_updated || new Date().toISOString();
  const name = raw.name || raw.company_name || raw.symbol || '';
  const status = raw.data_status || (raw.is_stale ? 'stale' : 'live');

  return {
    ...raw,
    symbol: raw.symbol || '',
    clean_symbol: raw.clean_symbol || raw.ticker || (raw.symbol ? raw.symbol.replace('.NS', '').replace('.BO', '') : ''),
    name,
    company_name: name,
    price: p,
    current_price: p,
    change: chg,
    change_percent: chgPct,
    change_pct: chgPct,
    currency: raw.currency || 'INR',
    source: src,
    data_source: src,
    timestamp: ts,
    last_updated: ts,
    data_status: status,
    is_stale: Boolean(raw.is_stale || status === 'stale'),
    stale_timestamp: raw.stale_timestamp,
  };
}

/**
 * Hook to fetch and auto-refresh a single live stock quote.
 */
export function useLiveQuote(
  symbol?: string,
  options: UseLiveQuoteOptions = {}
) {
  const { refreshIntervalMs = 20000, enabled = true } = options;
  const [quote, setQuote] = useState<LiveQuote | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const reqIdRef = useRef<number>(0);
  const inFlightRef = useRef<boolean>(false);

  const fetchQuote = useCallback(
    async (forceRefresh = false) => {
      if (!symbol || !enabled) {
        setLoading(false);
        return null;
      }
      if (inFlightRef.current) {
        return null;
      }

      inFlightRef.current = true;
      const reqId = ++reqIdRef.current;
      setError(null);

      try {
        const raw = await api.quotes.getQuote(symbol, forceRefresh);
        if (reqId === reqIdRef.current) {
          const normalized = normalizeLiveQuote(raw);
          setQuote(normalized);
          setLoading(false);
          return normalized;
        }
      } catch (err: any) {
        if (reqId === reqIdRef.current) {
          setError(err.message || 'Failed to fetch quote');
          setLoading(false);
        }
      } finally {
        inFlightRef.current = false;
      }
      return null;
    },
    [symbol, enabled]
  );

  useEffect(() => {
    if (!symbol || !enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchQuote(false);

    if (refreshIntervalMs > 0) {
      const interval = setInterval(() => {
        if (document.visibilityState === 'visible') {
          fetchQuote(false);
        }
      }, refreshIntervalMs);

      const handleVisibility = () => {
        if (document.visibilityState === 'visible') {
          fetchQuote(false);
        }
      };
      document.addEventListener('visibilitychange', handleVisibility);

      return () => {
        clearInterval(interval);
        document.removeEventListener('visibilitychange', handleVisibility);
      };
    }
  }, [symbol, enabled, refreshIntervalMs, fetchQuote]);

  return {
    quote,
    loading,
    error,
    isStale: Boolean(quote?.is_stale),
    refetch: (force = true) => fetchQuote(force),
  };
}

/**
 * Hook to fetch and auto-refresh multiple live quotes in a single batch request.
 */
export function useLiveQuotes(
  symbols: string[],
  options: UseLiveQuoteOptions = {}
) {
  const { refreshIntervalMs = 20000, enabled = true } = options;
  const [quotesMap, setQuotesMap] = useState<Record<string, LiveQuote>>({});
  const [quotesList, setQuotesList] = useState<LiveQuote[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const reqIdRef = useRef<number>(0);
  const inFlightRef = useRef<boolean>(false);

  const serializedSymbols = symbols.filter(Boolean).sort().join(',');

  const fetchBatch = useCallback(
    async (forceRefresh = false) => {
      if (!symbols || symbols.length === 0 || !enabled) {
        setLoading(false);
        return [];
      }
      if (inFlightRef.current) {
        return [];
      }

      inFlightRef.current = true;
      const reqId = ++reqIdRef.current;
      setError(null);

      try {
        const rawList = await api.quotes.getBatchQuotes(symbols, forceRefresh);
        if (reqId === reqIdRef.current) {
          const map: Record<string, LiveQuote> = {};
          const list: LiveQuote[] = [];

          if (Array.isArray(rawList)) {
            for (const item of rawList) {
              const norm = normalizeLiveQuote(item);
              list.push(norm);
              if (norm.clean_symbol) {
                map[norm.clean_symbol.toUpperCase()] = norm;
              }
              if (norm.symbol) {
                map[norm.symbol.toUpperCase()] = norm;
              }
            }
          }

          setQuotesMap(map);
          setQuotesList(list);
          setLoading(false);
          return list;
        }
      } catch (err: any) {
        if (reqId === reqIdRef.current) {
          setError(err.message || 'Failed to fetch batch quotes');
          setLoading(false);
        }
      } finally {
        inFlightRef.current = false;
      }
      return [];
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [serializedSymbols, enabled]
  );

  useEffect(() => {
    if (!symbols || symbols.length === 0 || !enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchBatch(false);

    if (refreshIntervalMs > 0) {
      const interval = setInterval(() => {
        if (document.visibilityState === 'visible') {
          fetchBatch(false);
        }
      }, refreshIntervalMs);

      const handleVisibility = () => {
        if (document.visibilityState === 'visible') {
          fetchBatch(false);
        }
      };
      document.addEventListener('visibilitychange', handleVisibility);

      return () => {
        clearInterval(interval);
        document.removeEventListener('visibilitychange', handleVisibility);
      };
    }
  }, [serializedSymbols, enabled, refreshIntervalMs, fetchBatch]);

  return {
    quotesMap,
    quotesList,
    loading,
    error,
    refetch: (force = true) => fetchBatch(force),
  };
}
