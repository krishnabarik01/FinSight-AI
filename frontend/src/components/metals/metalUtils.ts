export const TARGET_CITY = 'Visakhapatnam';
export const TARGET_CITY_LABEL = 'Visakhapatnam, Andhra Pradesh';

export const formatTime = (isoString?: string | null) => {
  if (!isoString) return 'N/A';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return isoString;
  }
};

export const formatDate = (isoString?: string | null) => {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
};

export interface NormalizedMetalObservation {
  timestamp: string;
  date: string;
  price: number;
  metal: 'gold' | 'silver';
  unit: string;
  price_24k_10g?: number;
  price_silver_1kg?: number;
  price_per_kg?: number;
  price_per_10g?: number;
  price_silver_10g?: number;
  base_price_24k_1g?: number;
  gst_amount_24k_1g?: number;
  gst_amount_24k_10g?: number;
  final_price_24k_1g?: number;
  final_price_1g?: number;
  price_silver_1g?: number;
  base_price_1g?: number;
  gst_amount_1g?: number;
  gst_amount_1kg?: number;
  change: number;
  change_pct: number;
  city: string;
  source: string;
}

export const MIN_EXPECTED_POINTS_BY_RANGE: Record<string, number> = {
  '5d': 3,
  '1mo': 15,
  '3mo': 40,
  '6mo': 80,
  '1y': 160,
  '2y': 300,
};

export function validateAndNormalizeObservations(
  records: any[],
  metal: 'gold' | 'silver'
): NormalizedMetalObservation[] {
  if (!Array.isArray(records)) {
    console.warn(`[${metal.toUpperCase()} Bullion] Expected array of observations, received:`, typeof records);
    return [];
  }

  const validMap = new Map<string, NormalizedMetalObservation>();

  for (const raw of records) {
    if (!raw || typeof raw !== 'object') continue;

    // 1. Validate date / timestamp
    const rawDateStr = raw.date || raw.timestamp || raw.source_timestamp;
    if (!rawDateStr || typeof rawDateStr !== 'string') {
      continue;
    }
    const cleanDateStr = String(rawDateStr).slice(0, 10);
    const parsed = new Date(rawDateStr);
    if (isNaN(parsed.getTime())) {
      continue;
    }

    // 2. Validate price
    let rawPrice: any;
    if (metal === 'gold') {
      rawPrice = raw.price_24k_10g ?? raw.price;
    } else {
      rawPrice = raw.price_silver_1kg ?? raw.price_per_kg ?? raw.price;
    }

    const numPrice = Number(rawPrice);
    if (!isFinite(numPrice) || numPrice <= 0) {
      continue;
    }

    // 3. Construct Normalized Observation
    const obs: NormalizedMetalObservation = {
      timestamp: String(raw.timestamp || raw.date || `${cleanDateStr}T00:00:00Z`),
      date: cleanDateStr,
      price: numPrice,
      metal,
      unit: metal === 'gold' ? 'INR per 10g (24K, 3% GST Included)' : 'INR per kg (Silver 999, 3% GST Included)',
      change: typeof raw.change === 'number' && isFinite(raw.change) ? raw.change : 0,
      change_pct: typeof raw.change_pct === 'number' && isFinite(raw.change_pct) ? raw.change_pct : 0,
      city: raw.city || 'Visakhapatnam',
      source: raw.source || (metal === 'gold' ? 'Nebula Metals Domestic Gold Rates' : 'Nebula Metals Domestic Silver Rates'),
    };

    if (metal === 'gold') {
      obs.price_24k_10g = numPrice;
      obs.base_price_24k_1g = Number(raw.base_price_24k_1g) || undefined;
      obs.gst_amount_24k_1g = Number(raw.gst_amount_24k_1g) || undefined;
      obs.gst_amount_24k_10g = Number(raw.gst_amount_24k_10g) || (obs.gst_amount_24k_1g ? +(obs.gst_amount_24k_1g * 10).toFixed(2) : undefined);
      obs.final_price_24k_1g = Number(raw.final_price_24k_1g) || undefined;
    } else {
      obs.price_silver_1kg = numPrice;
      obs.price_per_kg = numPrice;
      obs.price_per_10g = Number(raw.price_per_10g ?? raw.price_silver_10g) || +(numPrice / 100).toFixed(2);
      obs.price_silver_10g = obs.price_per_10g;
      obs.final_price_1g = Number(raw.final_price_1g ?? raw.price_silver_1g) || +(numPrice / 1000).toFixed(2);
      obs.price_silver_1g = obs.final_price_1g;
      obs.base_price_1g = Number(raw.base_price_1g) || undefined;
      obs.gst_amount_1g = Number(raw.gst_amount_1g) || undefined;
      obs.gst_amount_1kg = Number(raw.gst_amount_1kg) || (obs.gst_amount_1g ? +(obs.gst_amount_1g * 1000).toFixed(2) : undefined);
    }

    // Deduplicate by cleanDateStr
    validMap.set(cleanDateStr, obs);
  }

  // Sort chronologically ascending
  return Array.from(validMap.values()).sort((a, b) => a.date.localeCompare(b.date));
}
