import re
import time
from dataclasses import dataclass
from typing import Dict, List, Optional

try:
    from langdetect import detect as _langdetect_fn  # type: ignore
except Exception:
    _langdetect_fn = None

try:
    from deep_translator import GoogleTranslator  # type: ignore
except Exception:
    GoogleTranslator = None

KANNADA_SCRIPT_RE = re.compile(r"[\u0C80-\u0CFF]")
DEVANAGARI_SCRIPT_RE = re.compile(r"[\u0900-\u097F]")

# Fast in-memory caches & offline circuit breaker so offline / test runs never lag
_NLU_EN_CACHE: Dict[str, str] = {}
_TRANSLATE_CACHE: Dict[tuple, str] = {}
_TRANSLATOR_OFFLINE_UNTIL: float = 0.0

KANGLISH_MARKERS = {
    "eshtu", "estu", "illa", "beku", "yavudu", "yaavudu", "kodi", "haaku", "haaki",
    "labha", "laabha", "nasta", "nashta", "angadi", "kelasa", "nodona", "madu",
    "maadu", "maadi", "madi", "hege", "yaake", "yake", "saaku", "baki", "baaki",
    "bele", "kharchu", "tinglu", "tingalu", "ivattu", "evattu", "ninne", "nale",
    "nanna", "namma", "idya", "ideya", "torsi", "torisi", "solpa", "jasti", "jaasti",
    "namaskara", "hegidira", "hegiddira", "chennagide", "chennagidira", "dhanyavada",
    "dhanyavadagalu", "sari", "houdu", "vyapara", "grahaka", "grahakaru", "sarabaraju",
    "marata", "kharidi", "sarakugalu", "dastanu", "heli", "tilisi", "bandide",
    "hogide", "kalsi", "nodri", "yenu", "enu", "yelli", "yaaru", "yaavaga",
    "kannada", "kannadadalli", "munde", "hindina", "mundina", "kasta", "ulitaaya",
    "yav", "yaav", "agide", "aagide", "mugidideya", "mugidida", "saku", "saakaguttadeya",
    "hechhu", "hechu", "ninneyadu", "ivattina",
}

HINGLISH_MARKERS = {
    "kitna", "kitne", "kitni", "munafa", "nuksan", "fayda", "kharcha", "udhar", "bakaya",
    "dukaan", "dukan", "mangao", "mangwa", "khatam", "batao", "bataiye", "dikhao",
    "dikhaiye", "kyun", "kyon", "kam", "zyada", "jyada", "becho", "karo", "kaunsa",
    "kaunse", "sabse", "mahine", "mahina", "aaj", "kal", "hisab", "bhej", "becha",
    "kharida", "grahak", "maal", "dijiye", "chahiye", "mera", "hamara", "humara",
    "paisa", "paise", "bachat", "namaste", "shukriya", "dhanyawad", "kaise", "haal",
    "vyapar", "hindi", "samjhao", "banao", "bata", "kya", "hai", "hain", "hua",
}

# Comprehensive Kannada, Kanglish, Hindi, and Hinglish semantic normalization -> canonical intents
MULTILINGUAL_KEYWORD_EXPANSION: Dict[str, str] = {
    # --- Profit, Loss, Comparison & Finance (Kannada / Kanglish) ---
    "ಲಾಭ": "profit",
    "ನಿವ್ವಳ ಲಾಭ": "operating profit",
    "ಒಟ್ಟು ಲಾಭ": "gross profit",
    "ಆದಾಯ": "revenue sales income",
    "ಗಳಿಕೆ": "profit revenue",
    "ಮಾರ್ಜಿನ್": "margin",
    "ಲಭ": "profit",
    "ನಷ್ಟ": "loss profit decrease drop",
    "ಕಡಿಮೆಯಾಗಿದೆ": "decrease drop lower",
    "ಇಳಿಕೆ": "decrease drop fall",
    "ಹೆಚ್ಚಾಗಿದೆ": "increase",
    "ಹೋಲಿಸಿ": "compare previous month",
    "ಕಳೆದ ತಿಂಗಳು": "previous month last month",
    "ಹಿಂದಿನ ತಿಂಗಳು": "previous month last month",
    "ಈ ತಿಂಗಳ": "this month monthly",
    "ಈ ತಿಂಗಳು": "this month monthly",
    "ತಿಂಗಳ": "month monthly",
    "ಈ ವಾರ": "this week weekly",
    "ಇಂದಿನ": "today",
    "ಇಂದು": "today",
    "ಯಾಕೆ": "why",
    "ಏಕೆ": "why",
    "ಕಾರಣ": "why cause driver",
    "ಮಾರಾಟ": "sales revenue",
    "ಮಾರಾಟವಾಗಿದೆ": "sold most sales",
    "ವಹಿವಾಟು": "sales transactions",
    "ಸೇಲ್": "sales today",
    "ಸೇಲ್ಸ್": "sales today",
    "ಪ್ರಾಡಕ್ಟ್": "product",
    "ಯಾವ": "which",
    "ಹೆಚ್ಚು": "most top",
    "ಜಾಸ್ತಿ": "most top",
    "ಹೆಚ್ಚು ಮಾರಾಟ": "sold the most top selling",
    "ಜಾಸ್ತಿ ಮಾರಾಟ": "sold the most top selling",
    "ಇವತ್ತು": "today",
    "ಇವತ್ತಿನ": "today",
    "ನಿನ್ನೆ": "yesterday compare",
    "ನಿನ್ನೆಯ": "yesterday compare",
    "ಸಾಕಾಗುತ್ತದೆಯೇ": "enough for next week",
    "ಸಾಕು": "enough",
    "ಬಿಲ್": "invoice bill",
    "ಖರ್ಚು": "expenses opex",
    "ವೆಚ್ಚ": "expenses cost",
    "ಬಾಡಿಗೆ": "rent expenses",
    "ವಿದ್ಯುತ್": "electricity expenses",
    "ಸಂಬಳ": "salary expenses",
    # --- Stock, Low Stock, Ageing & Expiry (Kannada / Kanglish) ---
    "ಸ್ಟಾಕ್": "stock inventory",
    "ದಾಸ್ತಾನು": "inventory stock",
    "ಸರಕು": "stock product",
    "ಸರಕುಗಳು": "products inventory",
    "ಉತ್ಪನ್ನ": "product",
    "ಉತ್ಪನ್ನಗಳು": "products",
    "ಕಡಿಮೆ ಸ್ಟಾಕ್": "low stock reorder",
    "ಕಡಿಮೆ ಇರುವ": "low stock",
    "ಕಡಿಮೆ": "low decrease drop",
    "ಖಾಲಿ": "out of stock empty",
    "ಮುಗಿದಿದೆ": "out of stock",
    "ಮುಗಿಯುತ್ತಿದೆ": "running out low stock",
    "ಮರುಖರೀದಿ": "reorder replenish",
    "ಹಳೆಯ ಸ್ಟಾಕ್": "dead stock slow moving ageing",
    "ನಿಷ್ಕ್ರಿಯ": "dead stock slow moving",
    "ಅವಧಿ ಮುಗಿಯುವ": "expiring batch",
    "ಎಕ್ಸ್‌ಪೈರಿ": "expiry expiring",
    "ಎಕ್ಸ್ಪೈರಿ": "expiry expiring",
    "ಅವಧಿ": "expiry",
    "ಬ್ಯಾಚ್": "batch",
    "ಬಂಡವಾಳ": "working capital",
    "ದುಡಿಯುವ ಬಂಡವಾಳ": "working capital",
    "ಸರಿಪಡಿಸಿ": "adjust stock",
    "ಸ್ಟಾಕ್ ಬದಲಾಯಿಸಿ": "adjust stock",
    # --- Procurement, Suppliers, Quotes (Kannada / Kanglish) ---
    "ಖರೀದಿ ಆರ್ಡರ್": "prepare purchase draft create po",
    "ಪರ್ಚೇಸ್ ಆರ್ಡರ್": "prepare purchase draft create po",
    "ಖರೀದಿ ಡ್ರಾಫ್ಟ್": "prepare purchase draft",
    "ಆರ್ಡರ್ ಡ್ರಾಫ್ಟ್": "prepare purchase draft",
    "ಆರ್ಡರ್ ಮಾಡಿ": "create purchase order prepare purchase draft",
    "ಖರೀದಿ ಮಾಡಿ": "prepare purchase draft",
    "ಖರೀದಿ": "purchase order",
    "ಡ್ರಾಫ್ಟ್": "draft",
    "ಸಿದ್ಧಪಡಿಸಿ": "prepare draft",
    "ತಯಾರಿಸಿ": "prepare draft",
    "ಆರ್ಡರ್": "purchase order reorder",
    "ಸರಬರಾಜುದಾರ": "supplier vendor",
    "ಸರಬರಾಜುದಾರರು": "suppliers vendors",
    "ಸರಬರಾಜು": "supplier vendor",
    "ವ್ಯಾಪಾರಿ": "supplier vendor",
    "ಡೀಲರ್": "supplier vendor",
    "ಬೆಲೆ": "price cost",
    "ದರ": "price",
    "ಕಡಿಮೆ ಬೆಲೆ": "cheaper better purchasing price",
    "ಬೆಲೆ ಹೋಲಿಸಿ": "compare supplier price",
    "ಬೆಲೆ ಬದಲಾಯಿಸಿ": "update price",
    # --- Customers, Khata, Till, GST, Audit (Kannada / Kanglish) ---
    "ಖಾತಾ": "khata customer credit",
    "ಉದ್ರಿ": "khata credit pending",
    "ಸಾಲ": "khata credit pending",
    "ಗ್ರಾಹಕ": "customer",
    "ಗ್ರಾಹಕರು": "customers",
    "ಬಾಕಿ": "due pending khata balance",
    "ಪಾವತಿ": "khata payment",
    "ನಗದು": "cash till",
    "ಗಲ್ಲಾಪೆಟ್ಟಿಗೆ": "cash drawer till shift",
    "ಶಿಫ್ಟ್": "cash shift",
    "ಜಿಎಸ್‌ಟಿ": "gstr tax",
    "ತೆರಿಗೆ": "gst tax",
    "ಆಡಿಟ್": "audit anomaly",
    "ಅಸಹಜ": "anomaly audit",
    # --- Forecasting, What-If, Briefing, Memory, Workflows, Approvals (Kannada) ---
    "ಮುನ್ಸೂಚನೆ": "forecast predict",
    "ಭವಿಷ್ಯ": "forecast predict",
    "ಅಂದಾಜು": "forecast estimate",
    "ಮುಂದಿನ ವಾರ": "forecast 7 days",
    "ಮುಂದಿನ ತಿಂಗಳು": "forecast 30 days",
    "ಏನಾಗುತ್ತದೆ": "what if simulate",
    "ತಡವಾದರೆ": "what if supplier delay",
    "ಹೆಚ್ಚಿಸಿದರೆ": "what if raise price surge",
    "ದೈನಂದಿನ ವರದಿ": "daily briefing",
    "ಇಂದಿನ ವರದಿ": "daily briefing",
    "ವರದಿ": "briefing report summary",
    "ಸಾರಾಂಶ": "summary",
    "ಎಚ್ಚರಿಕೆ": "proactive alerts",
    "ಅಪಾಯ": "risk alerts",
    "ಅನುಮೋದನೆ": "pending approvals",
    "ಒಪ್ಪಿಗೆ": "approvals approve",
    "ನೆನಪಿಟ್ಟುಕೊ": "remember that save preference",
    "ನಿಯಮ": "saved rules memories",
    "ಆಟೋಮೇಷನ್": "workflow automation",
    "ಪ್ರತಿದಿನ": "workflow daily schedule",
    "ಬಿಲ್ ಫೋಟೋ": "document upload analyze document",
    "ಫೈಲ್": "document upload",
    "ದಾಖಲೆ": "document",
    "ಎಷ್ಟು": "how much summary",
    "ತೋರಿಸಿ": "show list",
    "ಹೇಳಿ": "tell explain",
    "ತಿಳಿಸಿ": "tell explain",
    "ವಿಶ್ಲೇಷಣೆ": "analysis analyze",
    "ಸಂಪೂರ್ಣ": "deep analysis comprehensive",
    # --- Kanglish transliterated tokens ---
    "labha": "profit",
    "laabha": "profit",
    "nasta": "loss profit decrease",
    "nashta": "loss profit decrease",
    "kharchu": "expenses",
    "marata": "sales",
    "kharidi": "purchase",
    "dastanu": "inventory stock",
    "sarakugalu": "products stock",
    "sarabaraju": "supplier",
    "grahaka": "customer",
    "grahakaru": "customers",
    "udri": "khata credit pending",
    "baki": "pending balance khata",
    "baaki": "pending balance khata",
    "bele": "price cost",
    "tinglu": "this month monthly",
    "tingalu": "this month monthly",
    "ivattu": "today",
    "evattu": "today",
    "kadime": "low decrease drop",
    "mugidide": "out of stock",
    "torsi": "show",
    "torisi": "show",
    "maadi": "prepare draft",
    "madu": "prepare",
    "yaake": "why",
    "yake": "why",
    "holisi": "compare",
    "vyapara": "business sales",
    "angadi": "store business",
    "anumaana": "anomaly",
    "anumodane": "approvals",
    "munsuchane": "forecast",
    "mugidideya": "out of stock",
    "mugidida": "out of stock",
    "idya": "stock available",
    "yav": "which",
    "yaav": "which",
    "agide": "happened today",
    "aagide": "happened today",
    "jasti": "most top",
    "hechhu": "most top",
    "hechu": "most top",
    "saakaguttadeya": "enough for next week",
    "saku": "enough",
    # --- Hindi / Hinglish ---
    "मुनाफा": "profit",
    "मुनाफ़ा": "profit",
    "नुकसान": "loss profit decrease",
    "बिक्री": "sales",
    "स्टॉक": "stock inventory",
    "खर्चा": "expenses",
    "उधार": "khata credit pending",
    "बकाया": "khata due balance",
    "ऑर्डर": "purchase order reorder",
    "सप्लायर": "supplier vendor",
    "कम स्टॉक": "low stock reorder",
    "खत्म": "out of stock low stock",
    "कम": "low decrease drop",
    "मंजूरी": "approvals",
    "चेतावनी": "proactive alerts",
    "रिपोर्ट": "briefing report summary",
    "नियम": "saved rules memories",
    "दस्तावेज": "document",
    "मुश्किल": "risk",
    "munafa": "profit",
    "fayda": "profit",
    "nuksan": "loss profit decrease",
    "kharcha": "expenses",
    "udhar": "khata credit pending",
    "bakaya": "khata due balance",
    "mahine": "month monthly",
    "mahina": "month monthly",
    "aaj": "today",
    "kam": "low decrease drop",
    "khatam": "out of stock low stock",
    "mangao": "create purchase order reorder",
    "order karo": "create purchase order",
    "maal": "inventory stock",
    "grahak": "customer",
}


@dataclass
class LanguageDetection:
    language: str  # en | kn | hi
    script: str    # latin | kannada | devanagari
    is_code_mixed: bool


def detect_language(text: str, requested_language: str = "auto") -> LanguageDetection:
    clean = (text or "").strip()
    if requested_language in ("en", "kn", "hi"):
        if requested_language == "kn":
            return LanguageDetection(language="kn", script="kannada", is_code_mixed=not bool(KANNADA_SCRIPT_RE.search(clean)))
        if requested_language == "hi":
            return LanguageDetection(language="hi", script="devanagari", is_code_mixed=not bool(DEVANAGARI_SCRIPT_RE.search(clean)))
        return LanguageDetection(language="en", script="latin", is_code_mixed=False)

    if KANNADA_SCRIPT_RE.search(clean):
        has_latin = bool(re.search(r"[A-Za-z]", clean))
        return LanguageDetection(language="kn", script="kannada", is_code_mixed=has_latin)

    if DEVANAGARI_SCRIPT_RE.search(clean):
        has_latin = bool(re.search(r"[A-Za-z]", clean))
        return LanguageDetection(language="hi", script="devanagari", is_code_mixed=has_latin)

    tokens = set(re.findall(r"[a-zA-Z]+", clean.lower()))
    kn_hits = len(tokens & KANGLISH_MARKERS)
    hi_hits = len(tokens & HINGLISH_MARKERS)

    if kn_hits > hi_hits and kn_hits >= 1:
        return LanguageDetection(language="kn", script="latin", is_code_mixed=True)
    if hi_hits >= 1:
        return LanguageDetection(language="hi", script="latin", is_code_mixed=True)

    # Optional statistical language detector fallback for longer non-English Latin phrases
    if _langdetect_fn is not None and len(clean) >= 24:
        try:
            detected = _langdetect_fn(clean)
            if detected == "kn":
                return LanguageDetection(language="kn", script="latin", is_code_mixed=True)
            if detected == "hi":
                return LanguageDetection(language="hi", script="latin", is_code_mixed=True)
        except Exception:
            pass

    return LanguageDetection(language="en", script="latin", is_code_mixed=False)


def _translator_available() -> bool:
    if GoogleTranslator is None:
        return False
    return time.time() >= _TRANSLATOR_OFFLINE_UNTIL


def translate_to_english_for_nlu(text: str, source_lang: str) -> Optional[str]:
    """
    Translates free-form Kannada/Hindi sentences to English using `deep-translator`
    for seamless NLU routing when lexical stems aren't exhaustive.
    Guarded by cache and offline circuit-breaker so tests/offline setups stay fast.
    """
    global _TRANSLATOR_OFFLINE_UNTIL
    clean = (text or "").strip()
    if not clean or source_lang == "en":
        return None
    if not KANNADA_SCRIPT_RE.search(clean) and not DEVANAGARI_SCRIPT_RE.search(clean):
        # Latin code-mixed text (Kanglish/Hinglish) isn't cleanly supported by GoogleTranslator 'kn'/'hi' source
        return None
    cache_key = f"{source_lang}:{clean}"
    if cache_key in _NLU_EN_CACHE:
        return _NLU_EN_CACHE[cache_key]
    if not _translator_available():
        return None
    try:
        src = "kn" if KANNADA_SCRIPT_RE.search(clean) else ("hi" if DEVANAGARI_SCRIPT_RE.search(clean) else source_lang)
        translated = GoogleTranslator(source=src, target="en").translate(clean[:1000])
        if translated and isinstance(translated, str):
            _NLU_EN_CACHE[cache_key] = translated.strip()
            return _NLU_EN_CACHE[cache_key]
    except Exception:
        # Disable external calls for 60s when sandboxed/offline
        _TRANSLATOR_OFFLINE_UNTIL = time.time() + 60.0
    return None


def translate_text(text: str, target_lang: str) -> str:
    """
    Translates an arbitrary English string into target_lang ('kn' or 'hi') via deep-translator
    if online, otherwise returns a clean offline localized string or original.
    """
    global _TRANSLATOR_OFFLINE_UNTIL
    if not text or target_lang not in ("kn", "hi"):
        return text
    key = (target_lang, text)
    if key in _TRANSLATE_CACHE:
        return _TRANSLATE_CACHE[key]

    offline = _offline_translate_driver(text, target_lang)
    if offline != text:
        _TRANSLATE_CACHE[key] = offline
        return offline

    if not _translator_available():
        return text
    try:
        translated = GoogleTranslator(source="en", target=target_lang).translate(text[:1500])
        if translated and isinstance(translated, str):
            _TRANSLATE_CACHE[key] = translated.strip()
            return _TRANSLATE_CACHE[key]
    except Exception:
        _TRANSLATOR_OFFLINE_UNTIL = time.time() + 60.0
    return text


def _offline_translate_driver(text: str, target_lang: str) -> str:
    """Fast deterministic translation of standard SmartStock driver/alert phrases without network."""
    t = text.strip()
    if target_lang == "kn":
        m = re.match(r"Net sales fell by (₹[\d,]+(?:\.\d+)?) \((\d+) vs (\d+) bills\)\.", t)
        if m:
            return f"ನಿವ್ವಳ ಮಾರಾಟ {m.group(1)} ರಷ್ಟು ಕಡಿಮೆಯಾಗಿದೆ ({m.group(2)} ಬಿಲ್‌ಗಳು vs ಹಿಂದೆ {m.group(3)} ಬಿಲ್‌ಗಳು)."
        m = re.match(r"Operating expenses rose by (₹[\d,]+(?:\.\d+)?)(.*)\.", t)
        if m:
            extra = m.group(2).replace("(led by", "(ಪ್ರಮುಖ ಕಾರಣ:")
            return f"ನಿರ್ವಹಣಾ ವೆಚ್ಚಗಳು {m.group(1)} ರಷ್ಟು ಹೆಚ್ಚಾಗಿವೆ{extra}."
        m = re.match(r"Gross margin compressed by ([\d.]+) pp \(([\d.]+%) vs ([\d.]+%)\)\.", t)
        if m:
            return f"ಒಟ್ಟು ಲಾಭದ ಪ್ರಮಾಣ {m.group(1)} ಶೇಕಡಾ ಪಾಯಿಂಟ್‌ಗಳಷ್ಟು ಕಡಿಮೆಯಾಗಿದೆ ({m.group(2)} vs ಹಿಂದೆ {m.group(3)})."
        m = re.match(r"Discounts increased by (₹[\d,]+(?:\.\d+)?)\.", t)
        if m:
            return f"ಗ್ರಾಹಕರಿಗೆ ನೀಡಿದ ರಿಯಾಯಿತಿ {m.group(1)} ರಷ್ಟು ಹೆಚ್ಚಾಗಿದೆ."
        m = re.match(r"Customer refunds/returns increased by (₹[\d,]+(?:\.\d+)?)\.", t)
        if m:
            return f"ಮಾರಾಟ ಹಿಂಪಡೆಯುವಿಕೆ / ಮರುಪಾವತಿ {m.group(1)} ರಷ್ಟು ಹೆಚ್ಚಾಗಿದೆ."
        if "No prior comparison period transactions exist yet" in t:
            return "ಹಿಂದಿನ ಅವಧಿಯ ವಹಿವಾಟು ದಾಖಲೆಗಳು ಇನ್ನೂ ಲಭ್ಯವಿಲ್ಲ; ಪ್ರಸ್ತುತ ಲಾಭದ ರಚನೆಯನ್ನು ತೋರಿಸಲಾಗುತ್ತಿದೆ."
        m = re.match(r"Operating profit improved by \+?(₹[\d,]+(?:\.\d+)?) across (.+)\.", t)
        if m:
            return f"ನಿರ್ವಹಣಾ ಲಾಭವು +{m.group(1)} ರಷ್ಟು ಹೆಚ್ಚಾಗಿದೆ ({m.group(2)})."
        # Proactive alert titles & actions
        m = re.match(r"(\d+) Product\(s\) Completely Out of Stock", t)
        if m:
            return f"{m.group(1)} ವಸ್ತು(ಗಳು) ಸಂಪೂರ್ಣವಾಗಿ ಖಾಲಿಯಾಗಿವೆ (Out of Stock)"
        m = re.match(r"(\d+) Product\(s\) May Stock Out Within (\d+) Days", t)
        if m:
            return f"{m.group(1)} ವಸ್ತುಗಳು {m.group(2)} ದಿನಗಳಲ್ಲಿ ಖಾಲಿಯಾಗಬಹುದು"
        m = re.match(r"7-Day Net Sales Dropped ([\d.]+%) vs Prior Week", t)
        if m:
            return f"ಕಳೆದ 7 ದಿನಗಳ ಮಾರಾಟ {m.group(1)} ರಷ್ಟು ಇಳಿಕೆಯಾಗಿದೆ"
        m = re.match(r"(₹[\d,]+(?:\.\d+)?) Tied Up in Dead Stock \(90\+ Days Inactive\)", t)
        if m:
            return f"90+ ದಿನಗಳಿಂದ ಮಾರಾಟವಾಗದ ಸ್ಟಾಕ್‌ನಲ್ಲಿ {m.group(1)} ಬಂಡವಾಳ ನಿಂತಿದೆ"
        m = re.match(r"(\d+) Product Batch\(es\) Expiring Within 30 Days", t)
        if m:
            return f"30 ದಿನಗಳಲ್ಲಿ ಅವಧಿ ಮುಗಿಯಲಿರುವ {m.group(1)} ಬ್ಯಾಚ್‌ಗಳಿವೆ"
        m = re.match(r"(\d+) Open Purchase Order\(s\) Past Expected Delivery Date", t)
        if m:
            return f"ನಿಗದಿತ ದಿನಾಂಕ ಮೀರಿದ {m.group(1)} ಖರೀದಿ ಆರ್ಡರ್‌ಗಳು ಬಾಕಿ ಇವೆ"
        if t == "Repeated Manual Stock Adjustments Detected":
            return "ಪದೇ ಪದೇ ಕೈಯಾರೆ ಸ್ಟಾಕ್ ತಿದ್ದುಪಡಿಗಳು ಕಂಡುಬಂದಿವೆ"
        m = re.match(r"(\d+) SKU\(s\) Selling At or Below Purchase Cost", t)
        if m:
            return f"ಖರೀದಿ ಬೆಲೆಗಿಂತ ಕಡಿಮೆ ಅಥವಾ ಸಮಾನ ದರದಲ್ಲಿ ಮಾರಾಟವಾಗುತ್ತಿರುವ {m.group(1)} ವಸ್ತುಗಳಿವೆ"
        if "Prepare an immediate Purchase Order draft" in t:
            return "ಖಾಲಿಯಾದ ವಸ್ತುಗಳಿಗೆ ತಕ್ಷಣ ಖರೀದಿ ಆರ್ಡರ್ (PO) ಡ್ರಾಫ್ಟ್ ಸಿದ್ಧಪಡಿಸಿ."
        if "Review reorder quantities and generate a grouped Purchase Order draft" in t:
            return "ಮರುಖರೀದಿ ಪ್ರಮಾಣವನ್ನು ಪರಿಶೀಲಿಸಿ PO ಡ್ರಾಫ್ಟ್ ತಯಾರಿಸಿ."
        if "Prioritize FEFO shelf rotation" in t:
            return "ಮೊದಲು ಅವಧಿ ಮುಗಿಯುವ ಬ್ಯಾಚ್‌ಗಳನ್ನು (FEFO) ಮುಂದೆ ಇಟ್ಟು ವಿಶೇಷ ಆಫರ್ ನೀಡಿ."
        if "Consider targeted clearance bundles" in t:
            return "ನಿಧಾನವಾಗಿ ಮಾರಾಟವಾಗುವ ವಸ್ತುಗಳಿಗೆ ಕಾಂಬೊ ಅಥವಾ ರಿಯಾಯಿತಿ ಆಫರ್ ನೀಡಿ."
        m = re.match(r"Prepared (\d+) Purchase Order approval draft\(s\) covering (\d+) low-stock SKU\(s\)\.", t)
        if m:
            return f"{m.group(2)} ಕಡಿಮೆ ಸ್ಟಾಕ್ ವಸ್ತುಗಳಿಗೆ {m.group(1)} ಖರೀದಿ ಆರ್ಡರ್ ಡ್ರಾಫ್ಟ್ ಸಿದ್ಧಪಡಿಸಲಾಗಿದೆ."
        if "no supplier-linked SKU currently requires replenishment" in t:
            return "ಪರಿಶೀಲನೆ ಪೂರ್ಣಗೊಂಡಿದೆ: ಸದ್ಯ ಯಾವುದೇ ವಸ್ತುಗಳಿಗೆ ತಕ್ಷಣದ ಮರುಖರೀದಿ ಅಗತ್ಯವಿಲ್ಲ."
        m = re.match(r"Completed proactive business health scan: (\d+) active alert\(s\) tracked\.", t)
        if m:
            return f"ಅಂಗಡಿ ಆರೋಗ್ಯ ತಪಾಸಣೆ ಪೂರ್ಣ: {m.group(1)} ಸಕ್ರಿಯ ಎಚ್ಚರಿಕೆಗಳಿವೆ."
    elif target_lang == "hi":
        m = re.match(r"Net sales fell by (₹[\d,]+(?:\.\d+)?) \((\d+) vs (\d+) bills\)\.", t)
        if m:
            return f"कुल बिक्री में {m.group(1)} की कमी आई ({m.group(2)} बिल vs पहले {m.group(3)} बिल)।"
        m = re.match(r"Operating expenses rose by (₹[\d,]+(?:\.\d+)?)(.*)\.", t)
        if m:
            return f"परिचालन खर्च {m.group(1)} बढ़ गया{m.group(2)}।"
        if "No prior comparison period transactions exist yet" in t:
            return "पिछली अवधि का डेटा अभी उपलब्ध नहीं है; वर्तमान अवधि के मुनाफे का विवरण दिखाया जा रहा है।"
        m = re.match(r"Operating profit improved by \+?(₹[\d,]+(?:\.\d+)?) across (.+)\.", t)
        if m:
            return f"शुद्ध मुनाफा +{m.group(1)} बढ़ा ({m.group(2)})।"
        m = re.match(r"(\d+) Product\(s\) Completely Out of Stock", t)
        if m:
            return f"{m.group(1)} प्रोडक्ट पूरी तरह खत्म (Out of Stock)"
        m = re.match(r"(\d+) Product Batch\(es\) Expiring Within 30 Days", t)
        if m:
            return f"30 दिनों में एक्सपायर होने वाले {m.group(1)} बैच"
    return text


def normalize_multilingual_query(text: str, detected_lang: Optional[str] = None) -> str:
    """
    Combines rich lexical Kannada/Kanglish/Hindi/Hinglish keyword expansion
    with optional live deep-translator EN semantic bridging for complex Kannada queries.
    """
    lower = (text or "").lower()
    expansions: List[str] = []
    for k, eng in MULTILINGUAL_KEYWORD_EXPANSION.items():
        if k in lower:
            expansions.append(eng)

    if detected_lang in ("kn", "hi") and (KANNADA_SCRIPT_RE.search(text or "") or DEVANAGARI_SCRIPT_RE.search(text or "")):
        translated_en = translate_to_english_for_nlu(text, detected_lang)
        if translated_en:
            expansions.append(translated_en)

    if not expansions:
        return text
    return f"{text} | {' '.join(expansions)}"


def localize_intro_header(language: str, is_code_mixed: bool, intent: str) -> str:
    """Kept for backwards compatibility; all handlers now produce full native kn/hi/en output."""
    return ""


def localize_restriction_notice(language: str, role: str, action_label: str) -> str:
    if language == "kn":
        return (
            f"ಪ್ರವೇಶ ನಿರ್ಬಂಧಿತವಾಗಿದೆ: ನಿಮ್ಮ ಪ್ರಸ್ತುತ ಪಾತ್ರ **{role}** ಆಗಿರುವುದರಿಂದ **{action_label}** "
            f"ಕಾರ್ಯಾಚರಣೆಗೆ ಅನುಮತಿ ಇಲ್ಲ. ದಯವಿಟ್ಟು Store OWNER ಅಥವಾ MANAGER ಅನ್ನು ಸಂಪರ್ಕಿಸಿ."
        )
    if language == "hi":
        return (
            f"अनुमति अस्वीकृत: आपकी वर्तमान भूमिका **{role}** है, इसलिए **{action_label}** की अनुमति नहीं है। "
            f"कृपया Store OWNER या MANAGER से संपर्क करें।"
        )
    return (
        f"Access Restricted: Your active role (**{role}**) is not permitted to perform **{action_label}**. "
        f"Please ask a Store **OWNER** or **MANAGER**."
    )


def localize_security_block(language: str, reason_code: Optional[str], default_en: str) -> str:
    if language == "kn":
        return (
            f"ಸುರಕ್ಷತಾ ನಿಯಂತ್ರಣ ({reason_code or 'GUARD'}): ಸ್ಮಾರ್ಟ್‌ಸ್ಟಾಕ್ ಎಐ ನೇರ SQL, ಪಾಸ್‌ವರ್ಡ್/ಕೀ ಮಾಹಿತಿ "
            "ಅಥವಾ ಇತರ ಅಂಗಡಿಗಳ ಡೇಟಾ ಪ್ರವೇಶವನ್ನು ಕಟ್ಟುನಿಟ್ಟಾಗಿ ನಿರ್ಬಂಧಿಸುತ್ತದೆ."
        )
    if language == "hi":
        return (
            f"सुरक्षा नियंत्रण ({reason_code or 'GUARD'}): SmartStock AI सीधे SQL, पासवर्ड/API कुंजी "
            "या किसी अन्य दुकान के डेटा तक पहुँच की अनुमति नहीं देता।"
        )
    return default_en
