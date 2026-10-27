/**
 * FinSight AI - Indian Rupee (INR ₹) Formatting & Currency Utilities
 * Implements Indian numbering conventions (Lakhs, Crores, en-IN standard).
 */

export interface FormatOptions {
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  compact?: boolean; // Formats into K, L (Lakhs), Cr (Crores)
  showSymbol?: boolean;
}

/**
 * Formats a monetary number into Indian Rupees (INR ₹) using en-IN locale.
 * Example: 125000.5 -> "₹1,25,000.50"
 */
export function formatINR(val: number | null | undefined, options: FormatOptions = {}): string {
  if (val === null || val === undefined || isNaN(val)) {
    return '₹0.00';
  }

  const {
    minimumFractionDigits = 2,
    maximumFractionDigits = 2,
    compact = false,
    showSymbol = true
  } = options;

  const symbol = showSymbol ? '₹' : '';

  if (compact) {
    const absVal = Math.abs(val);
    const sign = val < 0 ? '-' : '';

    if (absVal >= 10000000) {
      // Crores (1 Cr = 1,00,00,000)
      const cr = absVal / 10000000;
      return `${sign}${symbol}${cr.toLocaleString('en-IN', {
        minimumFractionDigits: cr >= 100 ? 1 : 2,
        maximumFractionDigits: 2
      })} Cr`;
    } else if (absVal >= 100000) {
      // Lakhs (1 Lakh = 1,00,000)
      const l = absVal / 100000;
      return `${sign}${symbol}${l.toLocaleString('en-IN', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 2
      })} L`;
    } else if (absVal >= 1000) {
      // Thousands
      const k = absVal / 1000;
      return `${sign}${symbol}${k.toLocaleString('en-IN', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1
      })} K`;
    }
  }

  const formatted = val.toLocaleString('en-IN', {
    minimumFractionDigits,
    maximumFractionDigits
  });

  return `${symbol}${formatted}`;
}

/**
 * Formats a monetary number in USD ($) for comparison / secondary indicators.
 * Example: 235.4 -> "$235.40"
 */
export function formatUSD(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) {
    return '$0.00';
  }
  return `$${val.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

/**
 * Returns currency symbol based on currency code
 */
export function getCurrencySymbol(currency?: string): string {
  if (!currency) return '₹';
  const clean = currency.toUpperCase().trim();
  if (clean === 'INR') return '₹';
  if (clean === 'USD') return '$';
  if (clean === 'EUR') return '€';
  if (clean === 'GBP') return '£';
  return '₹';
}

/**
 * Coerces value to a finite number, or returns fallback.
 */
export function safeNum(val: any, fallback = 0): number {
  if (val === null || val === undefined || val === '') return fallback;
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Formats price safely. Returns '—' if null, undefined, or invalid.
 */
export function fmtPrice(
  val: number | string | null | undefined,
  digits = 2,
  currency = '₹'
): string {
  if (val === null || val === undefined || val === '') return '—';
  const n = Number(val);
  if (!Number.isFinite(n)) return '—';
  const formatted = n.toLocaleString('en-IN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return `${currency}${formatted}`;
}

/**
 * Formats percentage safely. Returns '—' if null, undefined, or invalid.
 */
export function fmtPct(
  val: number | string | null | undefined,
  digits = 2,
  showPlus = false
): string {
  if (val === null || val === undefined || val === '') return '—';
  const n = Number(val);
  if (!Number.isFinite(n)) return '—';
  const prefix = showPlus && n > 0 ? '+' : '';
  return `${prefix}${n.toFixed(digits)}%`;
}

/**
 * Formats regular number safely. Returns '—' if null, undefined, or invalid.
 */
export function fmtNum(
  val: number | string | null | undefined,
  digits = 2
): string {
  if (val === null || val === undefined || val === '') return '—';
  const n = Number(val);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}
