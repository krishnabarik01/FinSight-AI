import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Search, ChevronDown, Check, RefreshCw, X, AlertCircle, CheckSquare, Square } from 'lucide-react';
import { api } from '../../services/api';

export interface StockOption {
  symbol: string;
  clean_symbol: string;
  name: string;
  sector?: string;
  asset_type?: string;
  exchange?: string;
}

export const INITIAL_STOCKS: StockOption[] = [
  { symbol: 'RELIANCE.NS', clean_symbol: 'RELIANCE', name: 'Reliance Industries Limited', sector: 'Energy & Telecom', asset_type: 'equity', exchange: 'NSE' },
  { symbol: 'TCS.NS', clean_symbol: 'TCS', name: 'Tata Consultancy Services Ltd', sector: 'Information Technology', asset_type: 'equity', exchange: 'NSE' },
  { symbol: 'HDFCBANK.NS', clean_symbol: 'HDFCBANK', name: 'HDFC Bank Limited', sector: 'Banking & Financial Services', asset_type: 'equity', exchange: 'NSE' },
  { symbol: 'INFY.NS', clean_symbol: 'INFY', name: 'Infosys Limited', sector: 'Information Technology', asset_type: 'equity', exchange: 'NSE' },
  { symbol: 'ICICIBANK.NS', clean_symbol: 'ICICIBANK', name: 'ICICI Bank Limited', sector: 'Banking & Financial Services', asset_type: 'equity', exchange: 'NSE' },
  { symbol: 'SBIN.NS', clean_symbol: 'SBIN', name: 'State Bank of India', sector: 'Banking & Financial Services', asset_type: 'equity', exchange: 'NSE' },
  { symbol: 'TATAMOTORS.NS', clean_symbol: 'TATAMOTORS', name: 'Tata Motors Limited', sector: 'Automobile', asset_type: 'equity', exchange: 'NSE' },
  { symbol: 'NIFTYBEES.NS', clean_symbol: 'NIFTYBEES', name: 'Nippon India ETF Nifty 50 BeES', sector: 'Index ETF', asset_type: 'etf', exchange: 'NSE' },
  { symbol: 'HINDUNILVR.NS', clean_symbol: 'HINDUNILVR', name: 'Hindustan Unilever Limited', sector: 'Consumer Goods', asset_type: 'equity', exchange: 'NSE' },
  { symbol: 'ITC.NS', clean_symbol: 'ITC', name: 'ITC Limited', sector: 'Consumer Goods', asset_type: 'equity', exchange: 'NSE' },
  { symbol: 'BHARTIARTL.NS', clean_symbol: 'BHARTIARTL', name: 'Bharti Airtel Limited', sector: 'Telecommunications', asset_type: 'equity', exchange: 'NSE' },
  { symbol: 'BANKBEES.NS', clean_symbol: 'BANKBEES', name: 'Nippon India ETF Bank BeES', sector: 'Banking ETF', asset_type: 'etf', exchange: 'NSE' },
];

export interface StockSelectorProps {
  mode?: 'single' | 'multi';
  value?: string | string[] | StockOption | StockOption[];
  onChange?: (val: any) => void;
  onSelect?: (stock: StockOption) => void;
  placeholder?: string;
  label?: string;
  excludeSymbols?: string[];
  disabled?: boolean;
  className?: string;
  id?: string;
}

const dedupeStocks = (list: StockOption[]): StockOption[] => {
  const seen = new Set<string>();
  return list.filter((item) => {
    const key = (item.symbol || item.clean_symbol || '').trim().toUpperCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const normalizeSymbolKey = (sym: string): string => {
  return sym.trim().toUpperCase().replace('.NS', '').replace('.BO', '');
};

export const StockSelector: React.FC<StockSelectorProps> = ({
  mode = 'single',
  value,
  onChange,
  onSelect,
  placeholder = 'Search stocks by name or ticker...',
  label,
  excludeSymbols = [],
  disabled = false,
  className = '',
  id = 'stock-selector',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [defaultStocks, setDefaultStocks] = useState<StockOption[]>(INITIAL_STOCKS);
  const [results, setResults] = useState<StockOption[]>(INITIAL_STOCKS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Normalize excluded symbols into clean uppercase set
  const excludedSet = useMemo(() => {
    return new Set(excludeSymbols.map(s => normalizeSymbolKey(s)));
  }, [excludeSymbols]);

  // Normalize current selected value into an array of clean symbols
  const selectedCleanSymbols: string[] = useMemo(() => {
    if (!value) return [];
    if (Array.isArray(value)) {
      return value.map(v => typeof v === 'string' ? normalizeSymbolKey(v) : normalizeSymbolKey(v.clean_symbol || v.symbol));
    }
    if (typeof value === 'string') {
      return [normalizeSymbolKey(value)];
    }
    return [normalizeSymbolKey(value.clean_symbol || value.symbol)];
  }, [value]);

  // Selected StockOption objects for chip display
  const [selectedStocksMap, setSelectedStocksMap] = useState<Record<string, StockOption>>({});

  // Helper to find matching stock option from existing results/defaults
  const findMatchingStock = useCallback((targetKey: string, lists: StockOption[][]): StockOption | null => {
    for (const list of lists) {
      const match = list.find(s => normalizeSymbolKey(s.clean_symbol || s.symbol) === targetKey);
      if (match) return match;
    }
    return null;
  }, []);

  // Sync selectedStockMap when selectedCleanSymbols or defaults change
  useEffect(() => {
    const newMap: Record<string, StockOption> = { ...selectedStocksMap };
    let missingKeys: string[] = [];

    for (const key of selectedCleanSymbols) {
      if (!newMap[key]) {
        const found = findMatchingStock(key, [results, defaultStocks, INITIAL_STOCKS]);
        if (found) {
          newMap[key] = found;
        } else {
          missingKeys.push(key);
        }
      }
    }

    if (missingKeys.length > 0) {
      // Fetch missing symbols from API
      Promise.all(
        missingKeys.map(k => api.stocks.search(k).catch(() => []))
      ).then(resArrays => {
        const updated = { ...newMap };
        resArrays.forEach((res, i) => {
          const k = missingKeys[i];
          if (Array.isArray(res) && res.length > 0) {
            const matched = res.find(s => normalizeSymbolKey(s.clean_symbol || s.symbol) === k) || res[0];
            updated[k] = matched;
          } else {
            updated[k] = {
              symbol: `${k}.NS`,
              clean_symbol: k,
              name: k,
              exchange: 'NSE',
              asset_type: 'equity'
            };
          }
        });
        setSelectedStocksMap(updated);
      });
    } else {
      setSelectedStocksMap(newMap);
    }
  }, [selectedCleanSymbols, defaultStocks, results, findMatchingStock]);

  // Fetch initial stocks catalog
  useEffect(() => {
    let isMounted = true;
    api.stocks.search('')
      .then((res) => {
        if (!isMounted || !Array.isArray(res) || res.length === 0) return;
        const deduped = dedupeStocks(res);
        setDefaultStocks(deduped);
        if (!searchQuery.trim()) {
          setResults(deduped);
        }
      })
      .catch((err) => {
        console.debug('Failed to fetch initial stocks list:', err);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Search stocks dynamically
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setResults(defaultStocks);
      setLoading(false);
      setError(null);
      setHighlightedIndex(0);
      return;
    }

    setLoading(true);
    setError(null);

    debounceTimerRef.current = setTimeout(() => {
      api.stocks.search(trimmed)
        .then((res) => {
          if (Array.isArray(res)) {
            setResults(dedupeStocks(res));
            setHighlightedIndex(0);
          } else {
            setResults([]);
          }
        })
        .catch((err) => {
          setError(err?.message || 'Failed to search market instruments');
          setResults([]);
        })
        .finally(() => {
          setLoading(false);
        });
    }, 200);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [searchQuery, defaultStocks]);

  // Close when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
      document.addEventListener('touchstart', handleOutsideClick);
    }

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, [isOpen]);

  // Focus search input on open
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Scroll active item into view
  useEffect(() => {
    if (isOpen && listRef.current && highlightedIndex >= 0) {
      const activeElement = listRef.current.children[highlightedIndex] as HTMLElement;
      if (activeElement && typeof activeElement.scrollIntoView === 'function') {
        activeElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, isOpen]);

  // Handle selecting an item
  const handleItemSelect = (stock: StockOption) => {
    const clean = normalizeSymbolKey(stock.clean_symbol || stock.symbol);
    if (excludedSet.has(clean)) {
      return; // Excluded/already added
    }

    if (mode === 'single') {
      setSelectedStocksMap(prev => ({ ...prev, [clean]: stock }));
      setIsOpen(false);
      setSearchQuery('');
      if (onSelect) {
        onSelect(stock);
      }
      if (onChange) {
        onChange(stock.clean_symbol || stock.symbol);
      }
    } else {
      // Multi mode: toggle
      const isCurrentlySelected = selectedCleanSymbols.includes(clean);
      let updatedClean: string[];
      if (isCurrentlySelected) {
        updatedClean = selectedCleanSymbols.filter(s => s !== clean);
      } else {
        updatedClean = [...selectedCleanSymbols, clean];
        setSelectedStocksMap(prev => ({ ...prev, [clean]: stock }));
      }

      if (onChange) {
        // Return array of StockOption objects or string symbols matching caller preference
        const optionsList = updatedClean.map(k => selectedStocksMap[k] || {
          symbol: `${k}.NS`,
          clean_symbol: k,
          name: k,
          exchange: 'NSE',
          asset_type: 'equity'
        });
        onChange(optionsList);
      }
    }
  };

  const handleRemoveChip = (cleanKey: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updatedClean = selectedCleanSymbols.filter(s => s !== cleanKey);
    if (onChange) {
      const optionsList = updatedClean.map(k => selectedStocksMap[k] || {
        symbol: `${k}.NS`,
        clean_symbol: k,
        name: k,
        exchange: 'NSE',
        asset_type: 'equity'
      });
      onChange(optionsList);
    }
  };

  const handleSelectAllVisible = (e: React.MouseEvent) => {
    e.stopPropagation();
    const availableVisible = results
      .map(r => normalizeSymbolKey(r.clean_symbol || r.symbol))
      .filter(k => !excludedSet.has(k));

    const combinedSet = new Set([...selectedCleanSymbols, ...availableVisible]);
    const updatedClean = Array.from(combinedSet);

    // Cache visible in map
    const newMap = { ...selectedStocksMap };
    results.forEach(r => {
      newMap[normalizeSymbolKey(r.clean_symbol || r.symbol)] = r;
    });
    setSelectedStocksMap(newMap);

    if (onChange) {
      const optionsList = updatedClean.map(k => newMap[k] || {
        symbol: `${k}.NS`,
        clean_symbol: k,
        name: k,
        exchange: 'NSE',
        asset_type: 'equity'
      });
      onChange(optionsList);
    }
  };

  const handleClearAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onChange) {
      onChange([]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((prev) => (results.length > 0 ? (prev + 1) % results.length : 0));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((prev) => (results.length > 0 ? (prev - 1 + results.length) % results.length : 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (results.length > 0 && highlightedIndex >= 0 && highlightedIndex < results.length) {
          handleItemSelect(results[highlightedIndex]);
        }
        break;
      case 'Escape':
      case 'Tab':
        setIsOpen(false);
        setSearchQuery('');
        break;
      default:
        break;
    }
  };

  // For single mode display
  const singleSelectedOption: StockOption | null = useMemo(() => {
    if (selectedCleanSymbols.length === 0) return null;
    const key = selectedCleanSymbols[0];
    return selectedStocksMap[key] || {
      symbol: `${key}.NS`,
      clean_symbol: key,
      name: key,
      exchange: 'NSE',
      asset_type: 'equity'
    };
  }, [selectedCleanSymbols, selectedStocksMap]);

  return (
    <div ref={containerRef} className={`relative flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label htmlFor={id} className="text-xs font-semibold text-slate-700 flex items-center justify-between">
          <span>{label}</span>
          {mode === 'multi' && selectedCleanSymbols.length > 0 && (
            <span className="text-[11px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
              {selectedCleanSymbols.length} selected
            </span>
          )}
        </label>
      )}

      {/* Selected Chips in Multi-Mode */}
      {mode === 'multi' && selectedCleanSymbols.length > 0 && (
        <div className="flex flex-wrap gap-1.5 p-2 bg-slate-50 border border-slate-200 rounded-lg max-h-28 overflow-y-auto">
          {selectedCleanSymbols.map(cleanKey => {
            const stock = selectedStocksMap[cleanKey] || {
              symbol: `${cleanKey}.NS`,
              clean_symbol: cleanKey,
              name: cleanKey,
              exchange: 'NSE'
            };
            return (
              <span
                key={cleanKey}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-white text-slate-800 border border-slate-300 shadow-2xs hover:border-slate-400 transition"
              >
                <span className="font-bold font-mono text-blue-700">{stock.clean_symbol || cleanKey}</span>
                {stock.name && stock.name !== cleanKey && (
                  <span className="text-[11px] text-slate-500 truncate max-w-[120px] hidden sm:inline">
                    {stock.name}
                  </span>
                )}
                {stock.asset_type === 'etf' && (
                  <span className="text-[9px] font-bold px-1 rounded bg-amber-100 text-amber-800">
                    ETF
                  </span>
                )}
                <button
                  type="button"
                  onClick={(e) => handleRemoveChip(cleanKey, e)}
                  className="text-slate-400 hover:text-rose-600 p-0.5 rounded transition"
                  aria-label={`Remove ${stock.clean_symbol || cleanKey}`}
                >
                  <X size={12} />
                </button>
              </span>
            );
          })}
          <button
            type="button"
            onClick={handleClearAll}
            className="text-[11px] text-slate-500 hover:text-rose-600 underline px-1 py-0.5 self-center"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Main Trigger Button */}
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={label || placeholder}
        className={`w-full min-w-[240px] flex items-center justify-between px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg shadow-2xs hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition text-left ${
          disabled ? 'opacity-50 cursor-not-allowed bg-slate-50' : 'cursor-pointer'
        } ${isOpen ? 'ring-2 ring-blue-500/20 border-blue-600' : ''}`}
      >
        <div className="flex items-center gap-2 truncate flex-1 min-w-0 pr-2">
          <Search size={14} className="text-slate-400 shrink-0" />
          {mode === 'single' && singleSelectedOption ? (
            <div className="flex items-center gap-1.5 truncate">
              <span className="font-bold text-slate-900 font-mono tracking-tight shrink-0">
                {singleSelectedOption.clean_symbol || singleSelectedOption.symbol.replace('.NS', '')}
              </span>
              <span className="text-slate-300 shrink-0">•</span>
              <span className="text-slate-600 truncate text-[11px] font-medium">
                {singleSelectedOption.name}
              </span>
            </div>
          ) : (
            <span className="text-slate-500 truncate">
              {mode === 'multi' && selectedCleanSymbols.length > 0
                ? `Click to add more stocks (${selectedCleanSymbols.length} selected)...`
                : placeholder}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0 ml-1">
          {mode === 'single' && singleSelectedOption?.asset_type === 'etf' && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
              ETF
            </span>
          )}
          {mode === 'single' && singleSelectedOption?.exchange && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
              {singleSelectedOption.exchange}
            </span>
          )}
          {mode === 'multi' && selectedCleanSymbols.length > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 border border-blue-200">
              {selectedCleanSymbols.length}
            </span>
          )}
          <ChevronDown
            size={15}
            className={`text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180 text-blue-600' : ''}`}
          />
        </div>
      </button>

      {/* Dropdown Results Box */}
      {isOpen && (
        <div
          role="listbox"
          aria-label="Stock Options"
          className="absolute z-50 left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden min-w-[280px] sm:min-w-[340px] max-w-lg animate-in fade-in zoom-in-95 duration-100"
        >
          {/* Search Header */}
          <div className="p-2 border-b border-slate-100 bg-slate-50/80 space-y-2">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search by company name or symbol..."
                className="w-full pl-8 pr-7 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Multi mode toolbar */}
            {mode === 'multi' && (
              <div className="flex items-center justify-between text-[11px] px-1 text-slate-600">
                <span>
                  {results.length} instrument{results.length === 1 ? '' : 's'} visible
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSelectAllVisible}
                    className="text-blue-600 hover:text-blue-700 font-semibold transition"
                  >
                    Select all visible
                  </button>
                  {selectedCleanSymbols.length > 0 && (
                    <>
                      <span className="text-slate-300">•</span>
                      <button
                        type="button"
                        onClick={handleClearAll}
                        className="text-rose-600 hover:text-rose-700 font-semibold transition"
                      >
                        Clear all
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* List options */}
          <div
            ref={listRef}
            className="max-h-64 overflow-y-auto divide-y divide-slate-100 scrollbar-thin overscroll-contain"
          >
            {loading ? (
              <div className="p-6 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                <RefreshCw size={14} className="animate-spin text-blue-600" />
                <span>Searching market instruments...</span>
              </div>
            ) : error ? (
              <div className="p-4 text-center text-xs text-rose-600 space-y-1">
                <div className="flex items-center justify-center gap-1.5 font-semibold">
                  <AlertCircle size={14} />
                  <span>Search failed</span>
                </div>
                <p className="text-[11px] text-slate-500">{error}</p>
              </div>
            ) : results.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">
                No stocks or ETFs found matching &ldquo;{searchQuery}&rdquo;
              </div>
            ) : (
              results.map((item, index) => {
                const cleanKey = normalizeSymbolKey(item.clean_symbol || item.symbol);
                const isSelected = selectedCleanSymbols.includes(cleanKey);
                const isExcluded = excludedSet.has(cleanKey);
                const isHighlighted = highlightedIndex === index;

                return (
                  <div
                    key={item.symbol}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => !isExcluded && handleItemSelect(item)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={`px-3 py-2.5 transition flex items-center justify-between text-xs select-none ${
                      isExcluded
                        ? 'bg-slate-50 opacity-60 cursor-not-allowed'
                        : isHighlighted
                        ? 'bg-blue-50/80 text-blue-900 cursor-pointer'
                        : isSelected
                        ? 'bg-blue-50/40 cursor-pointer'
                        : 'hover:bg-slate-50 cursor-pointer'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 pr-2">
                      {mode === 'multi' && (
                        <div className="shrink-0 text-slate-400">
                          {isSelected ? (
                            <CheckSquare size={16} className="text-blue-600 fill-blue-50" />
                          ) : (
                            <Square size={16} className="text-slate-300" />
                          )}
                        </div>
                      )}

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-900 font-mono">
                            {item.clean_symbol || item.symbol.replace('.NS', '')}
                          </span>
                          {item.asset_type === 'etf' && (
                            <span className="text-[9px] font-bold px-1 rounded bg-amber-50 text-amber-700 border border-amber-200">
                              ETF
                            </span>
                          )}
                          {isExcluded && (
                            <span className="text-[9px] font-semibold px-1 rounded bg-slate-200 text-slate-600">
                              Already Tracked
                            </span>
                          )}
                          {mode === 'single' && isSelected && (
                            <Check size={12} className="text-blue-600 font-bold ml-0.5" />
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate max-w-[200px] sm:max-w-[260px]">
                          {item.name}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0 flex flex-col items-end gap-0.5">
                      <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                        {item.exchange || 'NSE'}
                      </span>
                      {item.sector && (
                        <span className="text-[10px] text-slate-400 truncate max-w-[110px]">
                          {item.sector}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
