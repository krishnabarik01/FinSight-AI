// FinSight AI Frontend API Client

const getApiBase = (): string => {
  const envUrl = (
    (typeof import.meta !== 'undefined' && import.meta.env && (
      import.meta.env.VITE_API_URL ||
      import.meta.env.VITE_BACKEND_URL ||
      import.meta.env.VITE_API_BASE
    )) ||
    (typeof window !== 'undefined' && (
      (window as any).__FINSIGHT_API_URL__ ||
      (window as any).VITE_API_URL ||
      (window as any).VITE_BACKEND_URL
    )) ||
    (typeof localStorage !== 'undefined' && localStorage.getItem('finsight_api_base')) ||
    ''
  ).trim();

  if (!envUrl) return '/api';
  const cleanUrl = envUrl.replace(/\/+$/, '');
  return cleanUrl.endsWith('/api') ? cleanUrl : `${cleanUrl}/api`;
};

const API_BASE = getApiBase();

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  created_at?: string;
}

export interface AuthResponse {
  access_token: string;
  token?: string;
  token_type?: string;
  user: User;
}

export function normalizeAuthResponse(res: any): AuthResponse {
  if (!res || typeof res !== 'object') {
    throw new Error('Authentication response was invalid or empty. Please verify backend availability.');
  }

  // Defensively extract token from all common representations:
  // res.access_token, res.token, res.accessToken, res.data?.access_token, res.data?.token
  const token =
    (typeof res.access_token === 'string' && res.access_token.trim()) ||
    (typeof res.token === 'string' && res.token.trim()) ||
    (typeof res.accessToken === 'string' && res.accessToken.trim()) ||
    (typeof res.data?.access_token === 'string' && res.data.access_token.trim()) ||
    (typeof res.data?.token === 'string' && res.data.token.trim()) ||
    '';

  if (!token) {
    throw new Error('Authentication response did not contain an access token. Please verify backend availability.');
  }

  // Defensively extract user
  const rawUser = (res.user && typeof res.user === 'object' ? res.user : null) ||
                  (res.data?.user && typeof res.data.user === 'object' ? res.data.user : null);
  const tokenType = res.token_type || res.tokenType || res.data?.token_type || 'bearer';

  return {
    access_token: token,
    token: token,
    token_type: tokenType,
    user: rawUser as User,
  };
}

// Token helper
export const getToken = (): string | null => {
  try {
    const token = localStorage.getItem('finsight_token');
    if (!token || token === 'undefined' || token === 'null' || token.trim() === '') {
      return null;
    }
    return token.trim();
  } catch {
    return null;
  }
};

export const setToken = (token?: string | null): void => {
  try {
    if (!token || typeof token !== 'string' || token === 'undefined' || token === 'null' || token.trim() === '') {
      removeToken();
      return;
    }
    localStorage.setItem('finsight_token', token.trim());
  } catch {
    // Ignore localStorage errors
  }
};

export const removeToken = (): void => {
  try {
    localStorage.removeItem('finsight_token');
  } catch {
    // Ignore localStorage errors
  }
};

export const getStoredUser = (): User | null => {
  try {
    const u = localStorage.getItem('finsight_user');
    if (!u || u === 'undefined' || u === 'null' || u.trim() === '') return null;
    return JSON.parse(u);
  } catch (err) {
    console.warn('[FinSight] Failed to parse stored user from localStorage, clearing invalid item:', err);
    try {
      localStorage.removeItem('finsight_user');
    } catch {
      // Ignore
    }
    return null;
  }
};

export const setStoredUser = (user?: User | null): void => {
  try {
    if (!user || typeof user !== 'object') {
      localStorage.removeItem('finsight_user');
      return;
    }
    localStorage.setItem('finsight_user', JSON.stringify(user));
  } catch {
    // Ignore localStorage errors
  }
};

async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token && token !== 'undefined' && token !== 'null' && token.trim() !== '') {
    headers['Authorization'] = `Bearer ${token.trim()}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);
  const signal = options.signal || controller.signal;

  // Normalize endpoint to prevent double /api/api
  const cleanEndpoint = endpoint.startsWith('/api/') ? endpoint.slice(4) : endpoint;
  const targetUrl = `${API_BASE}${cleanEndpoint.startsWith('/') ? cleanEndpoint : `/${cleanEndpoint}`}`;

  let response: Response;
  try {
    response = await fetch(targetUrl, {
      ...options,
      headers,
      signal,
    });
  } catch (fetchErr: any) {
    if (fetchErr.name === 'AbortError') {
      throw new Error(`Request timed out after 20s`);
    }
    throw new Error(fetchErr.message || 'Network connection failed');
  } finally {
    clearTimeout(timeoutId);
  }

  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  const text = await response.text();

  if (!response.ok) {
    if (response.status === 401) {
      removeToken();
      localStorage.removeItem('finsight_user');
      window.dispatchEvent(new Event('finsight:auth_logout'));
    }
    let errorDetail = `API request failed (${response.status})`;
    try {
      const errJson = JSON.parse(text);
      if (typeof errJson.detail === 'string') {
        errorDetail = errJson.detail;
      } else if (errJson.detail && typeof errJson.detail === 'object') {
        errorDetail = errJson.detail.detail || errJson.detail.error || JSON.stringify(errJson.detail);
      } else if (typeof errJson.error === 'string') {
        errorDetail = errJson.detail ? `${errJson.error}: ${errJson.detail}` : errJson.error;
      } else if (typeof errJson.message === 'string') {
        errorDetail = errJson.message;
      }
    } catch {
      if (text && text.trim().length > 0 && text.length < 200) {
        errorDetail = text.trim();
      }
    }
    console.error(`[FinSight API Error] ${options.method || 'GET'} ${cleanEndpoint} (${response.status}):`, errorDetail);
    throw new Error(errorDetail);
  }

  if (!text || text.trim() === '') {
    return {} as T;
  }

  // Detect HTML responses served by static SPA fallbacks
  if (contentType.includes('text/html') || text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
    throw new Error('API request returned HTML instead of JSON. The backend server may be offline or VITE_API_URL is misconfigured.');
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    console.error(`[FinSight JSON Parse Error] Failed to parse response from ${cleanEndpoint}:`, text.slice(0, 100));
    throw new Error('Invalid JSON response received from API server.');
  }
}

// Auth API
export const api = {
  auth: {
    login: async (credentials: { email: string; password: string }): Promise<AuthResponse> => {
      const rawRes = await apiFetch<any>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(credentials),
      });
      const authRes = normalizeAuthResponse(rawRes);
      if (!authRes.user) {
        try {
          setToken(authRes.access_token);
          authRes.user = await api.auth.me();
        } catch {
          // Keep whatever fallback is available
        }
      }
      return authRes;
    },
    register: async (data: { name: string; email: string; password: string; phone?: string }): Promise<AuthResponse> => {
      const rawRes = await apiFetch<any>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      const authRes = normalizeAuthResponse(rawRes);
      if (!authRes.user) {
        try {
          setToken(authRes.access_token);
          authRes.user = await api.auth.me();
        } catch {
          // Keep fallback
        }
      }
      return authRes;
    },
    me: async (): Promise<User> => {
      const token = getToken();
      if (!token) {
        throw new Error('No authentication token available.');
      }
      return apiFetch<User>('/auth/me');
    },
  },

  dashboard: {
    getSummary: () => apiFetch<any>('/dashboard/summary'),
  },

  stocks: {
    search: (q: string) => apiFetch<any[]>(`/stocks/search?q=${encodeURIComponent(q)}`),
    getIndices: () => apiFetch<any[]>('/stocks/indices'),
    getGrowwStatus: () => apiFetch<any>('/stocks/groww/status'),
    getDetail: (symbol: string, forceRefresh = false) =>
      apiFetch<any>(`/stocks/${symbol}${forceRefresh ? '?force_refresh=true' : ''}`),
    getHistory: (symbol: string, period = '1mo', interval = '1d') =>
      apiFetch<any[]>(`/stocks/${symbol}/history?period=${period}&interval=${interval}`),
    getRiskAnalysis: (symbol: string) => apiFetch<any>(`/stocks/${symbol}/risk-analysis`),
    getPredictions: (symbol: string) => apiFetch<any>(`/stocks/${symbol}/predictions`),
  },

  quotes: {
    getQuote: (symbol: string, forceRefresh = false) =>
      apiFetch<any>(`/quotes/${encodeURIComponent(symbol)}${forceRefresh ? '?force_refresh=true' : ''}`),
    getBatchQuotes: (symbols: string[], forceRefresh = false) =>
      apiFetch<any[]>(`/quotes?symbols=${encodeURIComponent(symbols.join(','))}${forceRefresh ? '&force_refresh=true' : ''}`),
  },

  gold: {
    getSnapshot: (forceRefresh = false, city?: string) => {
      const params = new URLSearchParams();
      if (forceRefresh) params.append('force_refresh', 'true');
      if (city) params.append('city', city);
      const qs = params.toString();
      return apiFetch<any>(`/gold/snapshot${qs ? `?${qs}` : ''}`);
    },
    getCities: () => apiFetch<any>('/gold/cities'),
    getHistory: (period = '1mo', city?: string, forceRefresh = false) => {
      const params = new URLSearchParams();
      params.append('period', period);
      if (city) params.append('city', city);
      if (forceRefresh) params.append('force_refresh', 'true');
      return apiFetch<any>(`/gold/history?${params.toString()}`);
    },
    getPredictions: () => apiFetch<any>('/gold/predictions'),
  },

  metals: {
    getSilverSnapshot: (forceRefresh = false, city?: string) => {
      const params = new URLSearchParams();
      if (forceRefresh) params.append('force_refresh', 'true');
      if (city) params.append('city', city);
      const qs = params.toString();
      return apiFetch<any>(`/metals/silver/snapshot${qs ? `?${qs}` : ''}`);
    },
    getSilverHistory: (period = '1mo', city?: string, forceRefresh = false) => {
      const params = new URLSearchParams();
      params.append('period', period);
      if (city) params.append('city', city);
      if (forceRefresh) params.append('force_refresh', 'true');
      return apiFetch<any>(`/metals/silver/history?${params.toString()}`);
    },
    getRiskAnalysis: (metal: 'gold' | 'silver') =>
      apiFetch<any>(`/metals/${metal}/risk-analysis`),
    getPredictions: (metal: 'gold' | 'silver') =>
      apiFetch<any>(`/metals/${metal}/prediction`),
  },

  portfolio: {
    getSummary: (portfolioId?: string) =>
      apiFetch<any>(portfolioId ? `/portfolio?portfolio_id=${portfolioId}` : '/portfolio'),
    addHolding: (holding: any) =>
      apiFetch<any>('/portfolio/holdings', {
        method: 'POST',
        body: JSON.stringify(holding),
      }),
    addHoldingsBatch: (holdings: any[]) =>
      apiFetch<any[]>('/portfolio/holdings/batch', {
        method: 'POST',
        body: JSON.stringify({ holdings }),
      }),
    addMetalHolding: (holding: {
      metal_type: string;
      purity: string;
      quantity: number;
      purchase_price: number;
      purchase_date?: string;
      stop_loss?: number;
      target_price?: number;
      notes?: string;
    }) =>
      apiFetch<any>('/portfolio/holdings/metal', {
        method: 'POST',
        body: JSON.stringify(holding),
      }),
    getMetalQuote: (metal: string, purity: string) =>
      apiFetch<any>(`/portfolio/metal-quote?metal=${encodeURIComponent(metal)}&purity=${encodeURIComponent(purity)}`),
    updateHolding: (holdingId: string, data: any) =>
      apiFetch<any>(`/portfolio/holdings/${holdingId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    deleteHolding: (holdingId: string) =>
      apiFetch<any>(`/portfolio/holdings/${holdingId}`, {
        method: 'DELETE',
      }),
    getPerformance: (range = '1M') => apiFetch<any>(`/portfolio/performance?range_filter=${range}`),
    getTransactions: () => apiFetch<any[]>('/portfolio/transactions'),
  },

  alerts: {
    getAlerts: () => apiFetch<any[]>('/alerts'),
    dismissAlert: (id: string) =>
      apiFetch<any>(`/alerts/${id}/dismiss`, { method: 'POST' }),
    getRules: () => apiFetch<any[]>('/alerts/rules'),
    createRule: (rule: any) =>
      apiFetch<any>('/alerts/rules', {
        method: 'POST',
        body: JSON.stringify(rule),
      }),
    deleteRule: (id: string) =>
      apiFetch<any>(`/alerts/rules/${id}`, { method: 'DELETE' }),
    getSellSignals: () => apiFetch<any[]>('/alerts/sell-signals'),
    evaluateNow: () => apiFetch<any>('/alerts/evaluate', { method: 'POST' }),
  },

  news: {
    getNews: (symbol?: string, category?: string) => {
      let url = '/news';
      const params = new URLSearchParams();
      if (symbol) params.append('symbol', symbol);
      if (category) params.append('category', category);
      if (params.toString()) url += `?${params.toString()}`;
      return apiFetch<any[]>(url);
    },
  },

  voice: {
    getLogs: () => apiFetch<any[]>('/voice/logs'),
    testCall: (data: { phone_number: string; symbol?: string; price?: number; alert_reason?: string }) =>
      apiFetch<any>('/voice/test-call', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },

  settings: {
    get: () => apiFetch<any>('/settings'),
    update: (data: any) =>
      apiFetch<any>('/settings', {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
  },

  currency: {
    getRates: (forceRefresh = false) =>
      apiFetch<any>(`/currency/rates?force_refresh=${forceRefresh}`),
  },

  watchlist: {
    get: () => apiFetch<any[]>('/watchlist'),
    add: (data: { symbol: string; target_price?: number; stop_loss?: number; notes?: string }) =>
      apiFetch<any>('/watchlist', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    addBatch: (items: { symbol: string; target_price?: number; stop_loss?: number; notes?: string }[]) =>
      apiFetch<any[]>('/watchlist/batch', {
        method: 'POST',
        body: JSON.stringify({ items }),
      }),
    update: (id: string, data: { target_price?: number; stop_loss?: number; notes?: string }) =>
      apiFetch<any>(`/watchlist/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    remove: (id: string) =>
      apiFetch<any>(`/watchlist/${id}`, {
        method: 'DELETE',
      }),
    removeBatch: (ids: string[]) =>
      apiFetch<any>('/watchlist/batch', {
        method: 'DELETE',
        body: JSON.stringify({ ids }),
      }),
  },

  onboarding: {
    getQuestions: () => apiFetch<any>('/onboarding/questions'),
    getProfile: () => apiFetch<any>('/onboarding/profile'),
    updateProfile: (profile: any) =>
      apiFetch<any>('/onboarding/profile', {
        method: 'POST',
        body: JSON.stringify(profile),
      }),
  },

  recommendations: {
    get: () => apiFetch<any>('/recommendations'),
  },

  education: {
    getModules: () => apiFetch<any>('/education/modules'),
    getGlossary: () => apiFetch<any>('/education/glossary'),
  },
};
