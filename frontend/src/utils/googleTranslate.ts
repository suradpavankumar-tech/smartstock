import {
  FMCG_PRODUCT_DICTIONARY,
  CATEGORY_DICTIONARY,
  UNIT_DICTIONARY,
  STATUS_DICTIONARY,
  EXPENSE_CATEGORY_DICTIONARY,
} from "../i18n/dataDictionary";

const CACHE_STORAGE_KEY = "smartstock_google_kn_cache_v1";

// In-memory cache for synchronous instant rendering
const memoryCache: Map<string, string> = new Map();

// Load persistent cache from localStorage
try {
  const stored = localStorage.getItem(CACHE_STORAGE_KEY);
  if (stored) {
    const parsed = JSON.parse(stored);
    Object.entries(parsed).forEach(([k, v]) => {
      if (typeof v === "string") memoryCache.set(k.toLowerCase().trim(), v);
    });
  }
} catch {
  // Ignore localStorage parsing error
}

// In-flight deduplication to avoid redundant HTTP requests
const inFlightRequests: Map<string, Promise<string>> = new Map();

// Kannada digits map
const KANNADA_DIGITS: Record<string, string> = {
  "0": "೦",
  "1": "೧",
  "2": "೨",
  "3": "೩",
  "4": "೪",
  "5": "೫",
  "6": "೬",
  "7": "೭",
  "8": "೮",
  "9": "೯",
};

/**
 * Checks if a string contains Kannada characters
 */
export function isKannada(text: string): boolean {
  return /[\u0C80-\u0CFF]/.test(text);
}

/**
 * Converts Western digits to Kannada numerals
 */
export function toKannadaNumerals(val: string | number): string {
  const str = String(val);
  return str.replace(/[0-9]/g, (digit) => KANNADA_DIGITS[digit] || digit);
}

/**
 * Fast lookup from pre-compiled Kirana dictionaries
 */
export function lookupDictionary(rawText: string): string | null {
  if (!rawText) return "";
  const key = rawText.toLowerCase().trim();

  if (FMCG_PRODUCT_DICTIONARY[key]) return FMCG_PRODUCT_DICTIONARY[key];
  if (CATEGORY_DICTIONARY[key]) return CATEGORY_DICTIONARY[key];
  if (UNIT_DICTIONARY[key]) return UNIT_DICTIONARY[key];
  if (STATUS_DICTIONARY[key]) return STATUS_DICTIONARY[key];
  if (EXPENSE_CATEGORY_DICTIONARY[key]) return EXPENSE_CATEGORY_DICTIONARY[key];

  return null;
}

/**
 * Synchronous translation lookup:
 * Returns translation if in Kirana dictionary or cache.
 * Otherwise returns the original text and enqueues Google Translate in the background.
 */
export function translateDataSync(rawText: string, onResolved?: (translated: string) => void): string {
  if (!rawText) return "";
  if (isKannada(rawText)) return rawText;

  const key = rawText.toLowerCase().trim();

  // 1. Check in-memory cache
  if (memoryCache.has(key)) {
    return memoryCache.get(key)!;
  }

  // 2. Check pre-compiled dictionaries
  const dictMatch = lookupDictionary(rawText);
  if (dictMatch) {
    memoryCache.set(key, dictMatch);
    return dictMatch;
  }

  // 3. Trigger Google Translate in background if callback or later re-render is desired
  translateWithGoogle(rawText).then((res) => {
    if (res && res !== rawText && onResolved) {
      onResolved(res);
    }
  });

  return rawText;
}

/**
 * Translates English text to Kannada using Google Translate API with caching
 */
export async function translateWithGoogle(rawText: string): Promise<string> {
  if (!rawText || !rawText.trim()) return rawText;
  if (isKannada(rawText)) return rawText;

  const trimmed = rawText.trim();
  const key = trimmed.toLowerCase();

  // 1. Check in-memory cache
  if (memoryCache.has(key)) {
    return memoryCache.get(key)!;
  }

  // 2. Check dictionary
  const dictMatch = lookupDictionary(trimmed);
  if (dictMatch) {
    saveToCache(key, dictMatch);
    return dictMatch;
  }

  // 3. Check in-flight requests to deduplicate simultaneous requests
  if (inFlightRequests.has(key)) {
    return inFlightRequests.get(key)!;
  }

  // 4. Call Google Translate API
  const requestPromise = (async () => {
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=kn&dt=t&q=${encodeURIComponent(trimmed)}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Google Translate HTTP error ${response.status}`);
      }
      const data = await response.json();
      
      // Structure: [[["ಸೂರ್ಯಕಾಂತಿ ಎಣ್ಣೆ", "Sunflower Oil", null, null, 3]], ...]
      if (Array.isArray(data) && Array.isArray(data[0])) {
        const translatedSegments = data[0]
          .map((segment: any) => (Array.isArray(segment) ? segment[0] : ""))
          .join("");

        if (translatedSegments && translatedSegments.trim()) {
          const finalResult = translatedSegments.trim();
          saveToCache(key, finalResult);
          return finalResult;
        }
      }
      return trimmed;
    } catch (err) {
      console.warn("SmartStock Google Translate fallback for:", trimmed, err);
      return trimmed;
    } finally {
      inFlightRequests.delete(key);
    }
  })();

  inFlightRequests.set(key, requestPromise);
  return requestPromise;
}

/**
 * Batch translate an array of texts with Google Translate
 */
export async function translateBatchWithGoogle(texts: string[]): Promise<Record<string, string>> {
  const results: Record<string, string> = {};
  const pending: string[] = [];

  for (const t of texts) {
    if (!t) continue;
    const key = t.toLowerCase().trim();
    if (memoryCache.has(key)) {
      results[t] = memoryCache.get(key)!;
    } else {
      const d = lookupDictionary(t);
      if (d) {
        results[t] = d;
        saveToCache(key, d);
      } else {
        pending.push(t);
      }
    }
  }

  if (pending.length > 0) {
    // Process unique pending texts
    const uniquePending = Array.from(new Set(pending));
    await Promise.all(
      uniquePending.map(async (text) => {
        const tr = await translateWithGoogle(text);
        results[text] = tr;
      })
    );
  }

  return results;
}

/**
 * Save to both in-memory and persistent localStorage cache
 */
function saveToCache(key: string, translated: string) {
  memoryCache.set(key, translated);
  try {
    const existing = localStorage.getItem(CACHE_STORAGE_KEY);
    const parsed = existing ? JSON.parse(existing) : {};
    parsed[key] = translated;
    localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    // Ignore storage quota errors
  }
}

/**
 * Formats currency in Indian Kannada format
 * e.g., ₹ 1,500.00 or ರೂ. 1,500.00 (with optional Kannada numerals)
 */
export function formatKannadaCurrency(
  amount: number,
  options?: {
    useKannadaNumerals?: boolean;
    useKannadaSymbol?: boolean; // 'ರೂ.' vs '₹'
    decimals?: number;
  }
): string {
  const {
    useKannadaNumerals = false,
    useKannadaSymbol = true,
    decimals = 2,
  } = options || {};

  const num = Number(amount) || 0;
  const formatted = num.toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  const symbol = useKannadaSymbol ? "ರೂ." : "₹";

  if (useKannadaNumerals) {
    return `${symbol} ${toKannadaNumerals(formatted)}`;
  }

  return `${symbol} ${formatted}`;
}

/**
 * Formats dates into localized Kannada format
 */
export const KANNADA_MONTHS = [
  "ಜನವರಿ",
  "ಫೆಬ್ರವರಿ",
  "ಮಾರ್ಚ್",
  "ಏಪ್ರಿಲ್",
  "ಮೇ",
  "ಜೂನ್",
  "ಜುಲೈ",
  "ಆಗಸ್ಟ್",
  "ಸೆಪ್ಟೆಂಬರ್",
  "ಅಕ್ಟೋಬರ್",
  "ನವೆಂಬರ್",
  "ಡಿಸೆಂಬರ್",
];

export function formatKannadaDate(
  dateInput: string | Date,
  options?: { useKannadaNumerals?: boolean }
): string {
  if (!dateInput) return "";
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);

  const day = d.getDate().toString().padStart(2, "0");
  const month = KANNADA_MONTHS[d.getMonth()];
  const year = d.getFullYear().toString();

  if (options?.useKannadaNumerals) {
    return `${toKannadaNumerals(day)} ${month} ${toKannadaNumerals(year)}`;
  }

  return `${day} ${month} ${year}`;
}
